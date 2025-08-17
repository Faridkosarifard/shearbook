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
  const slots = await getFreeTimes({
    date: dateISO,
    duration,
    friseur_id: session.friseur_id,
  });

  if (!Array.isArray(slots) || slots.length === 0) return false;

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
    // Edge case: suggested date no longer has slots (concurrent booking)
    await client.sendMessage(
      chatId,
      "Für dieses Datum sind keine freien Zeiten mehr verfügbar. Bitte ein anderes Datum (YYYY-MM-DD) senden.",
    );
    session.step = "enter_date";
    session.suggested_dates = null;
    await sessions.set(chatId, session);
  }
}

module.exports = {
  formatDateDE,
  getFreeTimes,
  suggestNextDatesOnly,
  promptDatesOnly,
  showSlotsForDate,
  handleSuggestedDateSelection,
};
