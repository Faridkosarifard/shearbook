// bot/handlers/changeHandler.js
/**
 * Change (update) reservation flow handlers for the WhatsApp bot.
 * Uses a central axios client (BACKEND_URL + X-Bot-Token) to call shared backend APIs.
 *
 * Steps:
 *   1) handleChangeCommand  -> validate code, verify ownership, set step=confirm_update
 *   2) handleConfirmUpdate  -> on "ja" ask for new date (step=enter_new_date)
 *   3) handleNewDate        -> fetch free slots for the new date (step=enter_new_time)
 *   4) handleNewTime        -> PUT /update-reservation/<code> and clear session
 */

const api = require("../utils/backend");
const sessions = require("../sessions");
const logger = require("../utils/logger");
const { suggestNextDatesWithSlots, getFreeTimes } = require("./availabilityHandler");

// Example: KR-0415-1234
function isValidReservationCode(code) {
  return /^KR-\d{4}-\d{4}$/.test(code);
}

function getPhoneFromChatId(chatId) {
  return chatId.split("@")[0];
}

/**
 * Parse change command like:
 *   "ändern KR-0415-1234"
 * Extracts the code token after the command word.
 */
function extractCode(messageRaw = "") {
  const parts = messageRaw.trim().split(/\s+/);
  if (parts.length < 2) return "";
  return parts
    .slice(1)
    .join(" ")
    .replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
}

/**
 * Entry point for change command. Verifies code and ownership.
 */
async function handleChangeCommand(client, chatId, message) {
  const code = extractCode(message);
  const phone = getPhoneFromChatId(chatId);

  if (!isValidReservationCode(code)) {
    logger.warn(`Invalid reservation code from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Ungültiger Reservierungscode. Beispiel: ändern KR-0415-1234",
    );
    return;
  }

  logger.info(`Change request received from ${chatId}, code: ${code}`);

  try {
    // Backend allows Bot without phone, but passing phone keeps compatibility
    const check = await api.get(`/appointment/change/${encodeURIComponent(code)}`, {
      params: { phone },
    });

    if (check.data?.status === "not_found") {
      logger.warn(`No appointment found for code ${code} (${chatId})`);
      await client.sendMessage(chatId, `❌ Kein Termin mit Code ${code} gefunden.`);
      return;
    }
    if (check.data?.status === "unauthorized") {
      logger.warn(`Unauthorized change attempt: ${code} from ${chatId}`);
      await client.sendMessage(chatId, "❌ Dieser Code gehört nicht zu Ihrer Nummer.");
      return;
    }

    await sessions.set(chatId, { step: "confirm_update", code });
    logger.info(`Awaiting change confirmation from ${chatId}, code: ${code}`);

    await client.sendMessage(
      chatId,
      `⚠️ Möchtest du den Termin mit Code *${code}* ändern?\nAntworte mit: 👉 ja`,
    );
  } catch (err) {
    logger.error(
      `Error on /appointment/change for ${chatId}, code ${code}:`,
      err?.response?.data || err.stack || err.message,
    );
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Überprüfen des Codes. Bitte später erneut versuchen.",
    );
    return;
  }
}

/**
 * Confirmation step: expects "ja".
 */
async function handleConfirmUpdate(client, chatId, message) {
  const session = await sessions.get(chatId);

  if (session?.step === "confirm_update" && message.trim().toLowerCase() === "ja") {
    session.step = "enter_new_date";
    await sessions.set(chatId, session);

    logger.info(`Change confirmed by ${chatId}, code: ${session.code}`);
    await client.sendMessage(chatId, "📅 Bitte geben Sie das neue Datum ein (Format: YYYY-MM-DD):");
  } else {
    logger.warn(`Invalid confirmation from ${chatId}: ${message}`);
    await client.sendMessage(chatId, "❗️ Bestätigung unklar. Bitte erneut schreiben: ja");
  }
}

/**
 * Collect new date and fetch available slots.
 * - Accepts either a date (YYYY-MM-DD) or a suggestion index (1..N) if suggestions are present.
 * - Uses friseur_id from the existing appointment (not calendar_id).
 * - If no slots on the chosen date, suggests up to 3 upcoming days that actually have free slots.
 */
async function handleNewDate(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const isDate = /^\d{4}-\d{2}-\d{2}$/.test(message);
  const isIndex = /^[1-9]\d*$/.test(message);

  try {
    // Ensure we have appointment context (duration + friseur_id) from backend
    if (!session.duration || !session.friseur_id) {
      const apptRes = await api.get(`/appointment/${encodeURIComponent(session.code)}`);
      session.duration = apptRes.data?.duration || session.duration;
      session.friseur_id = apptRes.data?.friseur_id || session.friseur_id;
      // Fallback if your backend exposes `friseur.id` differently:
      if (!session.friseur_id && apptRes.data?.friseur?.id) {
        session.friseur_id = apptRes.data.friseur.id;
      }
      if (!session.duration || !session.friseur_id) {
        throw new Error("Missing duration or friseur_id for the appointment.");
      }
      await sessions.set(chatId, session);
    }

    // Resolve date from suggestions or direct input
    if (isIndex && Array.isArray(session.suggested_dates) && session.suggested_dates.length) {
      const idx = parseInt(message, 10);
      if (idx < 1 || idx > session.suggested_dates.length) {
        await client.sendMessage(
          chatId,
          `❗️ Ungültige Eingabe. Bitte eine Zahl zwischen 1 und ${session.suggested_dates.length} senden.`,
        );
        return;
      }
      session.new_date = session.suggested_dates[idx - 1];
    } else if (isDate) {
      session.new_date = message;
    } else {
      await client.sendMessage(
        chatId,
        "❗️ Ungültiges Datum. Bitte im Format YYYY-MM-DD eingeben oder eine Vorschlagszahl senden.",
      );
      return;
    }

    // Fetch free slots for the chosen date using personal schedule (friseur_id)
    const slots = await getFreeTimes({
      date: session.new_date,
      duration: session.duration,
      friseur_id: session.friseur_id,
    });

    if (!slots.length) {
      // Propose next available days that actually have free slots
      const suggestions = await suggestNextDatesWithSlots(
        session.new_date,
        session.duration,
        session.friseur_id,
        { maxDaysToCheck: 30, maxSuggestions: 3, takeSlotsPerDay: 5 },
      );

      if (!suggestions.length) {
        await client.sendMessage(
          chatId,
          "❌ Keine freien Zeiten an diesem Tag. Bitte ein anderes Datum eingeben.",
        );
        // Keep step on enter_new_date so the user can try again
        session.step = "enter_new_date";
        session.suggested_dates = null;
        await sessions.set(chatId, session);
        return;
      }

      // Show suggestions (dates + short slot preview)
      let msg = "Keine freien Zeiten an diesem Datum. Nächste verfügbare Tage:\n";
      suggestions.forEach((s, i) => {
        const prev = s.slots.join(", ");
        msg += `${i + 1}. ${s.date}${prev ? " – " + prev : ""}\n`;
      });
      msg += "Bitte antworte mit der Zahl, um das Datum auszuwählen.";

      session.step = "enter_new_date"; // stay in the same step
      session.suggested_dates = suggestions.map((s) => s.date); // store only dates
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
    logger.error(
      `Error in handleNewDate for ${chatId}, code ${session.code}:`,
      e?.response?.data || e.stack || e.message,
    );
    await client.sendMessage(chatId, "❌ Fehler beim Laden der Zeiten.");
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
        `✅ Termin wurde erfolgreich aktualisiert:\n📅 ${session.new_date} um ${new_time}`,
      );
    } else {
      logger.warn(`Update failed: ${session.code} (${chatId})`);
      await client.sendMessage(
        chatId,
        `❌ Termin mit Code ${session.code} konnte nicht gefunden werden.`,
      );
    }
  } catch (err) {
    logger.error(
      `Error updating ${session.code} (${chatId}):`,
      err?.response?.data || err.stack || err.message,
    );
    await client.sendMessage(chatId, "❌ Fehler beim Aktualisieren des Termins.");
  }

  await sessions.clear(chatId);
  logger.debug(`Session cleared for ${chatId}`);
}

module.exports = {
  handleChangeCommand,
  handleConfirmUpdate,
  handleNewDate,
  handleNewTime,
};
