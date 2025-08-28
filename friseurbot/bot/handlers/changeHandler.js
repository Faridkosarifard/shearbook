// bot/handlers/changeHandler.js
/**
 * Change (update) reservation flow handlers for the WhatsApp bot.
 * Uses a central axios client (BACKEND_URL + X-Bot-Token) to call shared backend APIs.
 *
 * Steps:
 *   1) handleChangeCommand  -> collect/validate code (if missing ask for it), try to cache duration/friseur_id, set step=confirm_update
 *   2) handleConfirmUpdate  -> if code missing, treat current message as code (+ validate). On "ja" -> step=enter_new_date
 *   3) handleNewDate        -> normalize date, ensure duration/friseur_id (fallback fetch), fetch free slots (step=enter_new_time)
 *   4) handleNewTime        -> PUT /update-reservation/<code> and clear session
 */

const api = require("../utils/backend");
const sessions = require("../sessions");
const logger = require("../utils/logger");
const { suggestNextDatesOnly, getFreeTimesWithReason } = require("./availabilityHandler");

// ------------------------- Helpers -----------------------------------------

// Example: KR-0415-1234
function isValidReservationCode(code) {
  return /^KR-\d{4}-\d{4}$/.test(code);
}

function getPhoneFromChatId(chatId) {
  return String(chatId || "").split("@")[0];
}

const isYes = (s = "") => ["ja", "yes", "y"].includes((s || "").trim().toLowerCase());
const isNo  = (s = "") => ["nein", "no", "n"].includes((s || "").trim().toLowerCase());

// Accepts "ändern KR-0415-1234"
function extractCode(messageRaw = "") {
  const parts = (messageRaw || "").trim().split(/\s+/);
  if (parts.length < 2) return "";
  return parts
    .slice(1)
    .join(" ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
}

function toIntOrUndef(x) {
  const n = Number.parseInt(x, 10);
  return Number.isFinite(n) ? n : undefined;
}
function isFiniteNumber(x) {
  return typeof x === "number" && Number.isFinite(x);
}

/** Normalize appointment-like payload into { duration, friseur_id, calendar_id }.
 *  ⚠️ Only numeric friseur_id is accepted. calendar_id is a string used only for mapping. */
function normalizeAppointmentPayload(data) {
  if (!data || typeof data !== "object") return {};
  const duration = toIntOrUndef(
    data.duration ??
    data?.service?.duration ??
    data.service_duration ??
    data.duration_minutes ??
    data.length ??
    data.minutes ??
    data?.service?.length
  );

  // Only numeric person/staff IDs; DO NOT fall back to calendar_id as ID
  const rawFriseurId =
    data.friseur_id ??
    data?.friseur?.id ??
    data.barber_id ??
    data.staff_id ??
    data.employee_id;

  const friseur_id = toIntOrUndef(rawFriseurId);
  const calendar_id = typeof data.calendar_id === "string" ? data.calendar_id : undefined;

  return { duration, friseur_id, calendar_id };
}

/** Normalize date input: "YYYY-MM-DD" or "DD.MM.YYYY" or "DD/MM/YYYY" -> "YYYY-MM-DD" */
function normalizeDateInput(s = "") {
  const raw = String(s || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  // DD.MM.YYYY
  let m = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  // DD/MM/YYYY
  m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const dd = m[1];
    const mm = m[2];
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/**
 * Validate a reservation code against backend and (optionally) ownership.
 * Returns { ok: boolean, status: 'ok'|'not_found'|'unauthorized'|'invalid'|'error', data?: any, error?: any }
 */
async function validateCodeWithBackend(code, phone) {
  if (!isValidReservationCode(code)) {
    return { ok: false, status: "invalid" };
  }
  try {
    const check = await api.get(`/appointment/change/${encodeURIComponent(code)}`, {
      params: { phone }, // harmless for Bot; may be used for public clients
    });
    if (check.data?.status === "not_found") return { ok: false, status: "not_found" };
    if (check.data?.status === "unauthorized") return { ok: false, status: "unauthorized" };
    return { ok: true, status: "ok", data: check.data };
  } catch (err) {
    return {
      ok: false,
      status: err?.response?.data?.status || "error",
      error: {
        status: err?.response?.status,
        data: err?.response?.data,
        message: err?.message,
      },
    };
  }
}

/** Fetch /friseure and map a calendar_id to numeric friseur_id (+name). */
async function mapCalendarToFriseur(calendar_id) {
  if (!calendar_id) return {};
  try {
    const res = await api.get("/friseure");
    const list = Array.isArray(res.data) ? res.data : [];
    const found = list.find((f) => String(f.calendar_id) === String(calendar_id));
    if (found && isFiniteNumber(toIntOrUndef(found.id))) {
      return { friseur_id: toIntOrUndef(found.id), friseur_name: found.name };
    }
  } catch (e) {
    // ignore; caller will handle missing mapping
  }
  return {};
}

/** Try to enrich session with duration/friseur_id by calling /appointment/<code> (Bot authorized),
 *   and if only calendar_id is present, map it to friseur_id using /friseure. */
async function enrichFromAppointment(client, chatId, session) {
  try {
    const res = await api.get(`/appointment/${encodeURIComponent(session.code)}`);
    const { duration, friseur_id, calendar_id } = normalizeAppointmentPayload(res.data);

    if (isFiniteNumber(duration)) session.duration = duration;
    if (isFiniteNumber(friseur_id)) {
      session.friseur_id = friseur_id;
    } else if (calendar_id) {
      const mapped = await mapCalendarToFriseur(calendar_id);
      if (isFiniteNumber(mapped.friseur_id)) {
        session.friseur_id = mapped.friseur_id;
        session.friseur_name = mapped.friseur_name || session.friseur_name;
      }
      session.calendar_id = calendar_id; // for reference
    }
    await sessions.set(chatId, session);
  } catch (e) {
    logger.warn("enrichFromAppointment failed", e?.response?.data || e?.message);
  }
}

// ------------------------- Handlers ----------------------------------------

/**
 * Entry point for change command.
 * - If code is present, validate immediately, cache any duration/friseur_id from the response.
 * - If code is missing, ask the user for it and set step=confirm_update.
 */
async function handleChangeCommand(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const codeFromMessage = extractCode(message);
  const phone = getPhoneFromChatId(chatId);

  if (!codeFromMessage) {
    session.step = "confirm_update";
    session.code = null;
    await sessions.set(chatId, session);
    await client.sendMessage(
      chatId,
      "Bitte senden Sie Ihren Reservierungscode (z. B. KR-0415-1234)."
    );
    return;
  }

  const code = codeFromMessage.toUpperCase();
  const result = await validateCodeWithBackend(code, phone);

  if (!result.ok) {
    if (result.status === "invalid") {
      logger.warn(`Invalid reservation code from ${chatId}: ${code}`);
      await client.sendMessage(chatId, "❗️ Ungültiger Reservierungscode. Beispiel: KR-0415-1234");
      return;
    }
    if (result.status === "not_found") {
      logger.warn(`No appointment found for code ${code} (${chatId})`);
      await client.sendMessage(chatId, `❌ Kein Termin mit Code ${code} gefunden.`);
      return;
    }
    if (result.status === "unauthorized") {
      logger.warn(`Unauthorized change attempt: ${code} from ${chatId}`);
      await client.sendMessage(chatId, "❌ Dieser Code gehört nicht zu Ihrer Nummer.");
      return;
    }
    logger.error(`Error validating code ${code} for ${chatId}:`, result.error || result.status);
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Überprüfen des Codes. Bitte später erneut versuchen."
    );
    return;
  }

  // Cache normalized details from /appointment/change (if present)
  const { duration, friseur_id } = normalizeAppointmentPayload(result.data);
  session.step = "confirm_update";
  session.code = code;
  if (isFiniteNumber(duration)) session.duration = duration;
  if (isFiniteNumber(friseur_id)) session.friseur_id = friseur_id;
  await sessions.set(chatId, session);

  // Enrich from /appointment/<code> and possibly map calendar_id -> friseur_id
  if (!isFiniteNumber(session.friseur_id)) {
    await enrichFromAppointment(client, chatId, session);
  }

  logger.info(
    `Change request received from ${chatId}, code: ${session.code}, cached: dur=${session.duration}, friseur_id=${session.friseur_id}`
  );
  await client.sendMessage(
    chatId,
    `⚠️ Möchtest du den Termin mit Code *${session.code}* ändern?\nAntworte mit: 👉 ja`
  );
}

/**
 * Confirmation step:
 * - If no code in session yet and message is NOT ja/nein, treat message as the code,
 *   validate it, save it (plus cache duration/friseur_id), and ask for confirmation.
 * - If "ja": proceed to date entry
 * - If "nein": abort and clear session
 */
async function handleConfirmUpdate(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const replyRaw = (message || "").trim();
  const phone = getPhoneFromChatId(chatId);

  if (!session.code) {
    if (!isYes(replyRaw) && !isNo(replyRaw) && replyRaw) {
      const maybeCode = replyRaw.toUpperCase();
      const result = await validateCodeWithBackend(maybeCode, phone);

      if (!result.ok) {
        if (result.status === "invalid") {
          await client.sendMessage(chatId, "❗️ Ungültiger Reservierungscode. Beispiel: KR-0415-1234");
          return;
        }
        if (result.status === "not_found") {
          await client.sendMessage(chatId, `❌ Kein Termin mit Code ${maybeCode} gefunden.`);
          return;
        }
        if (result.status === "unauthorized") {
          await client.sendMessage(chatId, "❌ Dieser Code gehört nicht zu Ihrer Nummer.");
          return;
        }
        logger.error(`Error validating code ${maybeCode} for ${chatId}:`, result.error || result.status);
        await client.sendMessage(
          chatId,
          "❌ Fehler beim Überprüfen des Codes. Bitte später erneut versuchen."
        );
        return;
      }

      const { duration, friseur_id } = normalizeAppointmentPayload(result.data);
      session.code = maybeCode;
      if (isFiniteNumber(duration)) session.duration = duration;
      if (isFiniteNumber(friseur_id)) session.friseur_id = friseur_id;
      await sessions.set(chatId, session);

      if (!isFiniteNumber(session.friseur_id)) {
        await enrichFromAppointment(client, chatId, session);
      }

      await client.sendMessage(
        chatId,
        `⚠️ Möchtest du den Termin mit Code *${maybeCode}* ändern?\nAntworte mit: 👉 ja`
      );
      return;
    }

    await client.sendMessage(
      chatId,
      "Kein Reservierungscode gefunden. Bitte senden Sie Ihren Code (z. B. KR-0415-1234)."
    );
    return;
  }

  if (isNo(replyRaw)) {
    await client.sendMessage(chatId, "Änderung abgebrochen.");
    await sessions.clear(chatId);
    return;
  }

  if (!isYes(replyRaw)) {
    await client.sendMessage(
      chatId,
      '❗️ Bestätigung unklar. Bitte antworte mit "ja" zum Bestätigen oder "nein" zum Abbrechen.'
    );
    return;
  }

  session.step = "enter_new_date";
  await sessions.set(chatId, session);

  logger.info(`Change confirmed by ${chatId}, code: ${session.code}`);
  await client.sendMessage(
    chatId,
    "📅 Bitte geben Sie das neue Datum ein (Format: YYYY-MM-DD oder DD.MM.YYYY):"
  );
}

/**
 * Collect new date and fetch available slots.
 * - Accepts either a date (YYYY-MM-DD | DD.MM.YYYY | DD/MM/YYYY) or a suggestion index (1..N).
 * - Ensures we have duration + friseur_id; fetches via /appointment/<code> if needed (with normalization + calendar mapping).
 * - If no slots, suggests up to 3 upcoming days that actually have free slots.
 */
async function handleNewDate(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const normalized = normalizeDateInput(message || "");
  const isIndex = /^[1-9]\d*$/.test((message || "").trim());

  try {
    // Ensure appointment context (duration + friseur_id)
    if (!isFiniteNumber(session.duration) || !isFiniteNumber(session.friseur_id)) {
      await enrichFromAppointment(client, chatId, session);
    }

    if (!isFiniteNumber(session.duration) || !isFiniteNumber(session.friseur_id)) {
      logger.error("Missing duration or friseur_id before fetching slots", {
        code: session.code,
        duration: session.duration,
        friseur_id: session.friseur_id,
      });
      await client.sendMessage(
        chatId,
        "⚠️ Für diesen Termin fehlt eine korrekte Personalzuordnung. Bitte versuchen Sie es erneut oder kontaktieren Sie uns."
      );
      session.step = "enter_new_date";
      await sessions.set(chatId, session);
      return;
    }

    // Resolve date from suggestions or direct input
    if (isIndex && Array.isArray(session.suggested_dates) && session.suggested_dates.length) {
      const idx = parseInt(message, 10);
      if (idx < 1 || idx > session.suggested_dates.length) {
        await client.sendMessage(
          chatId,
          `❗️ Ungültige Eingabe. Bitte eine Zahl zwischen 1 und ${session.suggested_dates.length} senden.`
        );
        return;
      }
      session.new_date = session.suggested_dates[idx - 1];
    } else if (normalized) {
      session.new_date = normalized;
    } else {
      await client.sendMessage(
        chatId,
        "❗️ Ungültiges Datum. Bitte im Format YYYY-MM-DD oder DD.MM.YYYY eingeben oder eine Vorschlagszahl senden."
      );
      return;
    }

    // Fetch free slots for the chosen date using personal schedule (friseur_id)
    const { slots, reason } = await getFreeTimesWithReason({
      date: session.new_date,
      duration: session.duration,
      friseur_id: session.friseur_id,
    });

    if (!Array.isArray(slots) || !slots.length) {
      let headerMsg = "Keine freien Zeiten an diesem Datum.";
      switch (reason) {
        case "public_holiday":
          headerMsg = "🎉 Feiertag in Baden-Württemberg – der Salon ist geschlossen.";
          break;
        case "stylist_off":
          headerMsg = "🛌 Der ausgewählte Friseur ist an diesem Tag nicht im Dienst.";
          break;
        case "global_day_off":
          headerMsg = "🏝️ Der Salon ist an diesem Tag geschlossen.";
          break;
        case "closed_weekly":
          headerMsg = "🚫 Der Friseur arbeitet an diesem Wochentag nicht.";
          break;
        case "no_calendar":
          headerMsg = "⚠️ Für diesen Friseur ist kein Kalender hinterlegt.";
          break;
        case "fully_booked":
          headerMsg = "😕 An diesem Tag sind bereits alle Zeiten belegt.";
          break;
        case "no_windows":
          headerMsg = "⚠️ Für diesen Tag gibt es keine buchbaren Arbeitsfenster.";
          break;
        case "invalid":
          headerMsg = "❗️ Ungültiges Datum/Anfrage.";
          break;
      }

      const suggestions = await suggestNextDatesOnly(
        session.new_date,
        session.duration,
        session.friseur_id,
        { maxDaysToCheck: 30, maxSuggestions: 3, takeSlotsPerDay: 5 }
      );

      if (!suggestions.length) {
        await client.sendMessage(chatId, `${headerMsg} Bitte ein anderes Datum eingeben.`);
        session.step = "enter_new_date";
        session.suggested_dates = null;
        await sessions.set(chatId, session);
        return;
      }

      let msg = `${headerMsg}\n\nNächste verfügbare Tage:\n`;
      suggestions.forEach((s, i) => {
        const prev = Array.isArray(s.slots) ? s.slots.join(", ") : "";
        msg += `${i + 1}. ${s.date}${prev ? " – " + prev : ""}\n`;
      });
      msg += "Bitte antworte mit der Zahl, um das Datum auszuwählen.";

      session.step = "enter_new_date";
      session.suggested_dates = suggestions.map((s) => s.date);
      await sessions.set(chatId, session);
      await client.sendMessage(chatId, msg);
      return;
    }

    // Slots available → show them and move to time selection
    session.available_slots = slots;
    session.step = "enter_new_time";
    await sessions.set(chatId, session);

    let antwort = "🕒 Verfügbare Zeiten:\n";
    slots.forEach((t, i) => {
      antwort += `${i + 1}. ${t}\n`;
    });
    await client.sendMessage(chatId, antwort + "Bitte antworte mit der Nummer.");
  } catch (e) {
    const status = e?.response?.status;
    const data = e?.response?.data;
    logger.error(
      `Error in handleNewDate for ${chatId}, code ${session.code}:`,
      status ? { status, data } : (e?.stack || e?.message || e)
    );
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Laden der Zeiten. Bitte erneut versuchen oder ein anderes Datum senden."
    );
    session.step = "enter_new_date";
    await sessions.set(chatId, session);
  }
}

/**
 * User picks a new time; we update the reservation.
 * Assumes `session.new_date` and `session.available_slots` are already set.
 */
async function handleNewTime(client, chatId, message) {
  const session = await sessions.get(chatId);
  const idx = parseInt((message || "").trim(), 10);
  const slots = Array.isArray(session?.available_slots) ? session.available_slots : [];

  if (Number.isNaN(idx) || idx < 1 || idx > slots.length) {
    logger.warn(`Invalid time selection from ${chatId}: ${message}`);
    await client.sendMessage(chatId, "❗️ Ungültige Auswahl. Bitte eine gültige Zahl senden.");
    return;
  }

  const new_time = slots[idx - 1];
  logger.info(`New time requested by ${chatId}: ${session.new_date} at ${new_time}`);

  try {
    const res = await api.put(`/update-reservation/${encodeURIComponent(session.code)}`, {
      new_date: session.new_date,
      new_time,
    });

    if (res.data?.status === "ok") {
      logger.info(`Reservation updated: ${session.code} (${chatId})`);
      await client.sendMessage(
        chatId,
        `✅ Termin wurde erfolgreich aktualisiert:\n📅 ${session.new_date} um ${new_time}`
      );
    } else {
      logger.warn(`Update failed: ${session.code} (${chatId})`, res?.status, res?.data);
      await client.sendMessage(
        chatId,
        `❌ Termin mit Code ${session.code} konnte nicht gefunden werden.`
      );
    }
  } catch (err) {
    logger.error(
      `Error updating ${session.code} (${chatId}):`,
      err?.response?.status ? { status: err.response.status, data: err.response.data } : (err?.stack || err?.message || err)
    );
    await client.sendMessage(chatId, "❌ Fehler beim Aktualisieren des Termins.");
  }

  await sessions.clear(chatId);
  logger.debug(`Session cleared for ${chatId}`);
}

// ------------------------- Exports -----------------------------------------

module.exports = {
  handleChangeCommand,
  handleConfirmUpdate,
  handleNewDate,
  handleNewTime,
};
