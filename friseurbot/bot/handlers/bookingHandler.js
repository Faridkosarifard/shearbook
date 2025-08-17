// bot/handlers/bookingHandler.js
/**
 * Booking flow handlers for the WhatsApp bot.
 * Uses a central axios client (BACKEND_URL + X-Bot-Token) to call shared backend APIs.
 * Steps: choose service → choose friseur → enter date → choose time → enter name → create event.
 */

const sessions = require("../sessions");
const dayjs = require("dayjs");
const logger = require("../utils/logger");
const { getSetting } = require("../utils/settingsHelper");
const api = require("../utils/backend");
const {
  showSlotsForDate,
  handleSuggestedDateSelection,
  suggestNextDatesOnly,
  promptDatesOnly,
} = require("./availabilityHandler");

function getPhoneFromChatId(chatId) {
  return chatId.split("@")[0];
}

/**
 * Step: user picks a service by sending its number.
 */
async function handleChooseService(client, chatId, message, services) {
  const session = (await sessions.get(chatId)) || {};

  if (!services[message]) {
    logger.warn(`Invalid service selection from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Auswahl. Bitte antworten Sie mit einer gültigen Zahl.",
    );
    return;
  }

  session.service = services[message];
  session.step = "enter_date";
  await sessions.set(chatId, session);

  logger.info(`Service selected by ${chatId}: ${session.service.name}`);

  try {
    const res = await api.get("/friseure");
    const friseure = res.data || [];

    if (!friseure.length) {
      logger.warn(`No friseure available for ${chatId}`);
      await client.sendMessage(
        chatId,
        "❌ Keine Friseure verfügbar. Bitte kontaktiere den Administrator.",
      );
      return;
    }

    let msg = "💇 Bitte wähle einen Friseur:\n";
    friseure.forEach((f, i) => {
      msg += `${i + 1}. ${f.name}\n`;
    });

    await client.sendMessage(chatId, msg);
    session.step = "choose_friseur";
    await sessions.set(chatId, session);
  } catch (err) {
    logger.error(`Error loading friseure for ${chatId}:`, err?.response?.data || err.message);
    await client.sendMessage(
      chatId,
      "❌ Es gab ein Problem beim Laden der Friseure. Bitte versuch es später erneut.",
    );
  }
}

/**
 * Step: user enters the friseur index.
 */
async function handleEnterFriseur(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};

  try {
    const res = await api.get("/friseure");
    const friseure = res.data || [];

    const index = parseInt(message, 10) - 1;
    if (Number.isNaN(index) || index < 0 || index >= friseure.length) {
      logger.warn(`Invalid friseur selection from ${chatId}: ${message}`);
      await client.sendMessage(
        chatId,
        `❌ Ungültige Eingabe. Bitte gib eine Zahl zwischen 1 und ${friseure.length} ein.`,
      );
      return;
    }

    const selected = friseure[index];
    logger.info(`Friseur selected by ${chatId}: ${selected.name}`);

    session.friseur_id = selected.id;
    session.friseur_name = selected.name;
    session.calendar_id = selected.calendar_id;
    sessions.resetDateTime(session);
    session.step = "enter_date";
    await sessions.set(chatId, session);

    // Build up to 3 suggested dates that actually have free slots for this stylist
    const duration = session?.service?.duration || 30;
    const suggestions = await suggestNextDatesOnly(
      dayjs().format("YYYY-MM-DD"),
      duration,
      session.friseur_id,
      { maxDaysToCheck: 30, maxSuggestions: 3 },
    );

    // If suggestions exist, show them; otherwise fall back to manual date entry
    const sent = await promptDatesOnly(client, chatId, session, selected.name, suggestions);
    if (!sent) {
      await client.sendMessage(
        chatId,
        `✅ Friseur *${selected.name}* was selected.\n\nPlease enter a date (YYYY-MM-DD).`,
      );
    }
  } catch (err) {
    logger.error(`Error retrieving friseure for ${chatId}:`, err?.response?.data || err.message);
    logger.error(e);
    await client.sendMessage(
      chatId,
      "❌ Es gab ein Problem beim Laden der Friseure. Bitte versuch es später erneut.",
    );
    session.step = "choose_friseur";
    session.friseur_id = null;
    session.friseur_name = null;
    await sessions.set(chatId, session);
  }
}

/**
 * Step: user enters a date (YYYY-MM-DD) or picks one of the suggested dates.
 * Uses slotHandler to fetch/suggest available times.
 */
async function handleEnterDate(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};

  const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(message);
  const isIndex = /^[1-9]\d*$/.test(message);

  // If user picked one of the suggested dates by index, delegate and exit
  if (isIndex && Array.isArray(session.suggested_dates) && session.suggested_dates.length) {
    await handleSuggestedDateSelection(client, chatId, message);
    return;
  }

  // If user typed a concrete date, try to show slots for that date
  if (isDateFormat) {
    session.date = message;
    await sessions.set(chatId, session);

    // showSlotsForDate sends the message itself and returns true/false
    const ok = await showSlotsForDate(client, chatId, session, session.date);
    if (ok) return;

    // No slots on that date → propose next available dates (dates only, no time preview)
    const duration = session?.service?.duration || 30;
    const suggestions = await suggestNextDatesOnly(session.date, duration, session.friseur_id, {
      maxDaysToCheck: 30,
      maxSuggestions: 3,
    });

    const sent = await promptDatesOnly(
      client,
      chatId,
      session,
      session.friseur_name || "ausgewählter Friseur",
      suggestions,
    );

    if (!sent) {
      // Still nothing to suggest
      await client.sendMessage(
        chatId,
        "Leider gibt es keine freien Zeiten 😔. Bitte gib ein anderes Datum (YYYY-MM-DD) ein.",
      );
      session.step = "enter_date";
      session.suggested_dates = null;
      await sessions.set(chatId, session);
    }
    return;
  }

  // Invalid input
  await client.sendMessage(
    chatId,
    "❗️ Ungültige Eingabe. Bitte gib eine Zahl (1..N) oder ein gültiges Datum (YYYY-MM-DD) ein.",
  );
}

/**
 * Step: user picks a time by sending its number.
 */
async function handleChooseTime(client, chatId, message) {
  const session = (await sessions.get(chatId)) || {};
  const idx = parseInt(message, 10);
  const slots = session.available_slots || [];

  if (Number.isNaN(idx) || idx < 1 || idx > slots.length) {
    logger.warn(`Invalid time selection from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Auswahl. Bitte antworten Sie mit einer gültigen Zahl.",
    );
    return;
  }

  session.time = slots[idx - 1];
  logger.info(`Time selected by ${chatId}: ${session.time}`);
  session.step = "enter_name";
  await sessions.set(chatId, session);
  await client.sendMessage(chatId, "Wie ist Ihr vollständiger Name?");
}

/**
 * Step: user enters their name, and we create the calendar event + save the customer.
 */
async function handleEnterName(client, chatId, message) {
  const name = (message || "").trim();

  // Unicode-friendly name validation: letters in any language + space + apostrophe + hyphen
  if (!/^[\p{L}\s'-]+$/u.test(name)) {
    logger.warn(`Invalid name from ${chatId}: ${name}`);
    await client.sendMessage(chatId, "❗️ Ungültiger Name. Bitte nur Buchstaben verwenden.");
    return;
  }

  const session = (await sessions.get(chatId)) || {};
  session.name = name;
  session.phone = getPhoneFromChatId(chatId);
  session.step = "done";
  await sessions.set(chatId, session);

  const startDateTime = `${session.date}T${session.time}:00`;
  logger.info(`Creating booking for ${chatId} (${session.name}) at ${startDateTime}`);

  try {
    // Create event
    const res = await api.post("/create-event", {
      name: session.name,
      phone: session.phone,
      service_id: session.service.id,
      start: startDateTime,
      friseur_id: session.friseur_id,
      calendar_id: session.calendar_id,
    });

    const code = res.data?.reservation_code;

    // Save customer (best-effort; non-fatal if fails)
    try {
      await api.post("/save-customer", {
        name: session.name,
        phone: session.phone,
      });
    } catch (e) {
      logger.warn(`save-customer failed for ${chatId}:`, e?.response?.data || e.message);
    }

    // Fetch settings to render booking confirmation text
    const DEFAULT_BOOKING_TEMPLATE = `✅ Termin gebucht!\n
        🧾 {service}\n
        📅 {date} um {time}\n
        👤 {name}\n\n
        🔐 Ihre Reservierungsnummer:\n{code}`;

    const bookingText = await getSetting("booking_text", DEFAULT_BOOKING_TEMPLATE);

    const antwort = bookingText
      .replace("{service}", session.service.name)
      .replace("{date}", session.date)
      .replace("{time}", session.time)
      .replace("{name}", session.name)
      .replace("{code}", code || "—");

    await client.sendMessage(chatId, antwort);
  } catch (err) {
    logger.error("Error in /create-event:", err?.response?.data || err.stack || err.message);
    await client.sendMessage(chatId, "❌ Fehler beim Speichern im Kalender.");
  }

  await sessions.clear(chatId);
}

module.exports = {
  handleChooseService,
  handleEnterDate,
  handleChooseTime,
  handleEnterName,
  handleEnterFriseur,
};
