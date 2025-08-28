// bot/handlers/availabilityHandler.js
// Reusable availability utilities for suggesting dates (no time preview) and showing time slots.
// All comments are in English to keep the codebase consistent.

const dayjs = require("dayjs");
const api = require("../utils/backend");
const sessions = require("../sessions");

/** Format a YYYY-MM-DD date into a user-friendly German string (e.g., "Mittwoch, 20.08.2025"). */
function formatDateDE(iso) {
  return dayjs(iso).format("dddd, DD.MM.YYYY");
}

// ---map server reason -> user-facing message (German) ---
function reasonText(reason) {
  switch (reason) {
    case "public_holiday":
      return "🎉 Feiertag in Baden-Württemberg – der Salon ist geschlossen.";
    case "stylist_off":
      return "🛌 Der ausgewählte Friseur ist an diesem Tag nicht im Dienst.";
    case "global_day_off":
      return "🏝️ Der Salon ist an diesem Tag geschlossen.";
    case "closed_weekly":
      return "🚫 Der Friseur arbeitet an diesem Wochentag nicht.";
    case "no_calendar":
      return "⚠️ Für diesen Friseur ist kein Kalender hinterlegt.";
    case "fully_booked":
      return "😕 An diesem Tag sind bereits alle Zeiten belegt.";
    case "no_windows":
      return "⚠️ Für diesen Tag gibt es keine buchbaren Arbeitsfenster.";
    case "invalid":
      return "❗️ Ungültiges Datum/Anfrage.";
    default:
      return "Keine freien Zeiten an diesem Datum.";
  }
}

/**
 * Fetch free slots for a stylist on a given date.
 * Backend applies:
 *  - global days_off,
 *  - stylist weekly template / exceptions (OFF, CUSTOM),
 *  - Google Calendar busy events,
 *  - current-day "past time" filtering.
 */
async function getFreeTimes({ date, duration, friseur_id }) {
  const res = await api.post("/free-times", {
    date,
    duration,
    friseur_id,
    // calendar_id is optional; backend infers it from friseur_id if needed
  });
  return (res.data && res.data.slots) || [];
}

/**
 * Suggest up to `maxSuggestions` unique future dates (starting tomorrow, relative to startDateISO)
 * that actually have at least one free slot for the given stylist.
 * Returns only dates, no time preview: [{ date: "YYYY-MM-DD" }, ...]
 */
async function suggestNextDatesOnly(
  startDateISO,
  duration,
  friseur_id,
  { maxDaysToCheck = 30, maxSuggestions = 3 } = {},
) {
  const out = [];
  const seen = new Set();

  // strictly scan from "tomorrow" relative to the given start date
  for (let offset = 1; offset <= maxDaysToCheck; offset++) {
    const d = dayjs(startDateISO).add(offset, "day").format("YYYY-MM-DD");
    if (seen.has(d)) continue;

    try {
      const slots = await getFreeTimes({ date: d, duration, friseur_id });
      if (Array.isArray(slots) && slots.length > 0) {
        out.push({ date: d });
        seen.add(d);
        if (out.length >= maxSuggestions) break;
      }
    } catch {
      // ignore HTTP/logic errors and keep scanning forward
    }
  }

  return out;
}

/**
 * Render only dates (no time preview) to the user.
 * Stores the list in `session.suggested_dates` to be resolved by index later.
 * Returns true if something was sent, false if list is empty.
 */
async function promptDatesOnly(client, chatId, session, stylistName, dateItems /* [{date}] */) {
  if (!Array.isArray(dateItems) || dateItems.length === 0) return false;

  session.suggested_dates = dateItems.map((d) => d.date);
  await sessions.set(chatId, session);

  let msg =
    `✅ Friseur *${stylistName}* wurde ausgewählt.\n\n` +
    `Bitte wähle ein Datum oder gib ein eigenes ein (YYYY-MM-DD):\n`;

  dateItems.forEach((d, i) => {
    msg += `${i + 1}. ${d.date}\n`;
  });

  await client.sendMessage(chatId, msg);
  return true;
}

/**
 * Show time slots for the given date and stylist.
 * Sets session.available_slots and moves to "choose_time".
 * Returns true if slots were shown; false if no slots available.
 */
async function showSlotsForDate(client, chatId, session, dateISO) {
  const duration = session?.service?.duration || 30;

  const { slots, reason } = await getFreeTimesWithReason({
    date: dateISO,
    duration,
    friseur_id: session.friseur_id,
  });

  if (!Array.isArray(slots) || slots.length === 0) {
    // Remember last reason so bookingHandler can craft a specific message
    session.last_no_slots_reason = reason || null;
    await sessions.set(chatId, session);
    return false;
  }

  // Clear any old reason when we do have slots
  session.last_no_slots_reason = null;
  session.available_slots = slots;
  session.step = "choose_time";
  await sessions.set(chatId, session);

  let msg = `Verfügbare Zeiten am ${formatDateDE(dateISO)}:\n`;
  slots.forEach((t, i) => {
    msg += `${i + 1}. ${t}\n`;
  });
  await client.sendMessage(chatId, msg + "Antworte mit der Nummer.");
  return true;
}

/**
 * Handle user picking one of the suggested days (1..N).
 * - Resolves the index to a concrete date from session.suggested_dates
 * - Shows slots for that date (or asks for another date if none left)
 */
async function handleSuggestedDateSelection(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const list = Array.isArray(session.suggested_dates) ? session.suggested_dates : [];
  const idx = parseInt((message || "").trim(), 10);

  if (Number.isNaN(idx) || idx < 1 || idx > list.length) {
    await client.sendMessage(
      chatId,
      `❗️ Ungültige Eingabe. Bitte eine Zahl zwischen 1 und ${list.length} senden.`,
    );
    return;
  }

  const chosenDate = list[idx - 1];
  session.date = chosenDate;
  await sessions.set(chatId, session);

  const ok = await showSlotsForDate(client, chatId, session, chosenDate);
  if (!ok) {
    const reason = (await sessions.get(chatId))?.last_no_slots_reason || null;
    const header = reasonText(reason);
    await client.sendMessage(
      chatId,
      `${header} Bitte ein anderes Datum (YYYY-MM-DD) senden.`,
    );
    session.step = "enter_date";
    session.suggested_dates = null;
    await sessions.set(chatId, session);
  }
}


async function getFreeTimesWithReason({ date, duration, friseur_id }) {
  const res = await api.post("/free-times", { date, duration, friseur_id });
  const data = res?.data || {};
  const slots = Array.isArray(data.slots) ? data.slots : [];
  const reason = typeof data.reason === "string" ? data.reason : null;
  return { slots, reason };
}

module.exports = {
  formatDateDE,
  getFreeTimes,
  suggestNextDatesOnly,
  getFreeTimesWithReason,
  promptDatesOnly,
  showSlotsForDate,
  handleSuggestedDateSelection,
  reasonText,
};
