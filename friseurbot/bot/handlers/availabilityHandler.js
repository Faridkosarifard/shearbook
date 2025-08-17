// bot/handlers/availabilityHandler.js
// Reusable availability utilities for suggesting dates and showing time slots.
// All comments are in English to keep the codebase consistent.

const dayjs = require("dayjs");
const api = require("../utils/backend");
const sessions = require("../sessions");

/** Format a YYYY-MM-DD date into a user-friendly German string (e.g., "Mittwoch, 20.08.2025"). */
function formatDateDE(iso) {
  return dayjs(iso).format("dddd, DD.MM.YYYY");
}

/** Fetch free slots for a stylist on a given date. */
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
 * Find up to `maxDaysToCheck` future days (starting tomorrow) that have at least one slot.
 * Returns an array of objects: [{ date: "YYYY-MM-DD", slots: ["HH:MM", ...] }, ...]
 */
async function suggestNextDatesWithSlots(
  startDateISO,
  duration,
  friseur_id,
  { maxDaysToCheck = 30, maxSuggestions = 3, takeSlotsPerDay = 5 } = {},
) {
  const suggestions = [];
  let cursor = dayjs(startDateISO);

  for (let i = 1; i <= maxDaysToCheck; i++) {
    const d = cursor.add(1, "day").format("YYYY-MM-DD");
    try {
      const slots = await getFreeTimes({ date: d, duration, friseur_id });
      if (slots.length) {
        suggestions.push({ date: d, slots: slots.slice(0, takeSlotsPerDay) });
        if (suggestions.length >= maxSuggestions) break;
      }
    } catch {
      // ignore and keep scanning
    }
  }
  return suggestions;
}

/**
 * Render and send suggested dates to the user. Stores suggested_dates in session as array of strings.
 * Returns true if suggestions were sent; false if none found.
 */
async function promptSuggestedDates(client, chatId, session, stylistName, suggestions) {
  if (!suggestions.length) return false;

  // Store only the list of dates for the next step
  session.suggested_dates = suggestions.map((s) => s.date);
  await sessions.set(chatId, session);

  let msg =
    `✅ Friseur *${stylistName}* was selected.\n\n` +
    `Please choose a date or enter your own (YYYY-MM-DD):\n`;

  suggestions.forEach((s, i) => {
    const preview = s.slots.join(", ");
    msg += `${i + 1}. ${s.date}${preview ? " – " + preview : ""}\n`;
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

  if (!slots.length) return false;

  session.available_slots = slots;
  session.step = "choose_time";
  await sessions.set(chatId, session);

  let msg = `Available times on ${formatDateDE(dateISO)}:\n`;
  slots.forEach((t, i) => {
    msg += `${i + 1}. ${t}\n`;
  });
  await client.sendMessage(chatId, msg + "Reply with the number.");
  return true;
}

/**
 * Handle user picking one of the suggested days (1..N).
 * If valid, sets session.date and shows its slots.
 */
async function handleSuggestedDateSelection(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const list = session.suggested_dates || [];
  const idx = parseInt((message || "").trim(), 10);

  if (Number.isNaN(idx) || idx < 1 || idx > list.length) {
    await client.sendMessage(
      chatId,
      `❗️ Invalid input. Please send a number between 1 and ${list.length}.`,
    );
    return;
  }

  const chosenDate = list[idx - 1];
  session.date = chosenDate;
  await sessions.set(chatId, session);

  const ok = await showSlotsForDate(client, chatId, session, chosenDate);
  if (!ok) {
    // No slots for the chosen suggested date (rare, but handle gracefully)
    await client.sendMessage(
      chatId,
      "No free times on that date anymore. Please choose another date (YYYY-MM-DD).",
    );
    session.step = "enter_date";
    session.suggested_dates = null;
    await sessions.set(chatId, session);
  }
}

module.exports = {
  formatDateDE,
  getFreeTimes,
  suggestNextDatesWithSlots,
  promptSuggestedDates,
  showSlotsForDate,
  handleSuggestedDateSelection,
};
