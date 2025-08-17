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
  suggestNextDatesOnly,
  promptDatesOnly,
  suggestNextDatesWithSlots,
  promptSuggestedDates,
  showSlotsForDate,
  handleSuggestedDateSelection,
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
    const sent = await promptDatesOnly(client, chatId, session, selected.name, datesOnly);
    if (!sent) {
      await client.sendMessage(
        chatId,
        `✅ Friseur *${selected.name}* was selected.\n\nPlease enter a date (YYYY-MM-DD).`,
      );
    }
  } catch (err) {
    logger.error(`Error retrieving friseure for ${chatId}:`, err?.response?.data || err.message);
    logger.error(e)
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
  const isNumber = /^[1-9]\d*$/.test(message);

  if (isNumber && Array.isArray(session.suggested_dates)) {
    const idx = parseInt(message, 10);
    if (idx < 1 || idx > session.suggested_dates.length) {
      await client.sendMessage(chatId, "❗️ Ungültige Eingabe. Bitte gib eine gültige Zahl ein.");
      return;
    }
    session.date = session.suggested_dates[idx - 1];
  } else if (isDateFormat) {
    session.date = message;
  } else {
    await client.sendMessage(chatId, "❗️ Ungültige Eingabe. Bitte gib ein gültiges Datum ein.");
    return;
  }

  try {
    // use slotHandler instead of direct API call
    const slots = await getFreeTimesForDate(
      session.friseur_id,
      session.date,
      session.service.duration,
    );

    if (!slots.length) {
      const suggestions = await suggestNextAvailableDates(
        session.friseur_id,
        session.date,
        session.service.duration,
      );

      if (!suggestions.length) {
        await client.sendMessage(
          chatId,
          "Leider gibt es keine freien Zeiten 😔. Bitte versuche ein anderes Datum.",
        );
        session.step = "enter_date";
        session.suggested_dates = null;
        await sessions.set(chatId, session);
        return;
      }

      let msg = "Keine freien Zeiten an diesem Datum.\nNächste verfügbare Tage:\n";
      suggestions.forEach((s, i) => {
        msg += `${i + 1}. ${s.date} – ${s.slots.join(", ")}\n`;
      });
      session.suggested_dates = suggestions.map((s) => s.date);
      session.step = "enter_date";
      await sessions.set(chatId, session);
      await client.sendMessage(chatId, msg);
      return;
    }

    // normal case: slots exist
    let antwort = "Bitte wählen Sie eine verfügbare Uhrzeit:\n";
    slots.forEach((slot, index) => {
      antwort += `${index + 1}. ${slot}\n`;
    });

    session.available_slots = slots;
    session.step = "choose_time";
    await sessions.set(chatId, session);
    await client.sendMessage(chatId, antwort + "Antworten Sie mit der Nummer.");
  } catch (e) {
    logger.error(`Error in handleEnterDate for ${chatId}:`, e.message);
    await client.sendMessage(chatId, "❌ Fehler beim Abrufen der freien Zeiten.");
  }
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
