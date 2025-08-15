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

const axios = require("axios");
const sessions = require("../sessions");
const logger = require("../utils/logger");

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN || "change-me";

// Central axios client configured for Bot auth
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { "X-Bot-Token": BOT_TOKEN },
});

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
      "❗️ Ungültiger Reservierungscode. Beispiel: ändern KR-0415-1234"
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
      await client.sendMessage(
        chatId,
        `❌ Kein Termin mit Code ${code} gefunden.`
      );
      return;
    }
    if (check.data?.status === "unauthorized") {
      logger.warn(`Unauthorized change attempt: ${code} from ${chatId}`);
      await client.sendMessage(
        chatId,
        "❌ Dieser Code gehört nicht zu Ihrer Nummer."
      );
      return;
    }

    await sessions.set(chatId, { step: "confirm_update", code });
    logger.info(`Awaiting change confirmation from ${chatId}, code: ${code}`);

    await client.sendMessage(
      chatId,
      `⚠️ Möchtest du den Termin mit Code *${code}* ändern?\nAntworte mit: 👉 ja`
    );
  } catch (err) {
    logger.error(
      `Error on /appointment/change for ${chatId}, code ${code}:`,
      err?.response?.data || err.stack || err.message
    );
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Überprüfen des Codes. Bitte später erneut versuchen."
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
    await client.sendMessage(
      chatId,
      "📅 Bitte geben Sie das neue Datum ein (Format: YYYY-MM-DD):"
    );
  } else {
    logger.warn(`Invalid confirmation from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Bestätigung unklar. Bitte erneut schreiben: ja"
    );
  }
}

/**
 * Collect new date and fetch available slots.
 */
async function handleNewDate(client, chatId, message) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(message)) {
    logger.warn(`Invalid date from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Ungültiges Datum. Bitte im Format YYYY-MM-DD eingeben."
    );
    return;
  }

  const session = (await sessions.get(chatId)) || {};
  session.new_date = message;

  logger.info(`New date received from ${chatId}: ${message}`);

  try {
    // Get current appointment details (duration, calendar_id) by code
    const apptRes = await api.get(`/appointment/${encodeURIComponent(session.code)}`);
    const duration = apptRes.data?.duration;
    const calendar_id = apptRes.data?.calendar_id;

    if (!duration || !calendar_id) {
      throw new Error("Missing duration or calendar_id");
    }

    // Fetch free slots for the chosen date
    const slotsRes = await api.post("/free-times", {
      date: message,
      duration,
      calendar_id,
    });

    const slots = slotsRes.data?.slots || [];
    if (!slots.length) {
      logger.warn(`No free slots for ${chatId} on ${message}`);
      await client.sendMessage(
        chatId,
        "❌ Keine freien Zeiten an diesem Tag. Bitte anderes Datum eingeben."
      );
      return;
    }

    session.available_slots = slots;
    session.step = "enter_new_time";
    await sessions.set(chatId, session);

    logger.info(`Free slots for change (${chatId}): ${slots.length} items`);

    let antwort = "🕒 Verfügbare Zeiten:\n";
    slots.forEach((t, i) => {
      antwort += `${i + 1}. ${t}\n`;
    });
    await client.sendMessage(
      chatId,
      antwort + "Bitte antworten Sie mit der Nummer."
    );
  } catch (e) {
    logger.error(
      `Error loading free slots for ${chatId}, code ${session.code}:`,
      e?.response?.data || e.stack || e.message
    );
    await client.sendMessage(chatId, "❌ Fehler beim Laden der Zeiten.");
  }
}

/**
 * User picks a new time; we update the reservation.
 */
async function handleNewTime(client, chatId, message) {
  const session = await sessions.get(chatId);
  const idx = parseInt(message, 10);
  const slots = session?.available_slots || [];

  if (Number.isNaN(idx) || idx < 1 || idx > slots.length) {
    logger.warn(`Invalid time selection from ${chatId}: ${message}`);
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Auswahl. Bitte eine gültige Zahl senden."
    );
    return;
  }

  const new_time = slots[idx - 1];
  logger.info(
    `New time requested by ${chatId}: ${session.new_date} at ${new_time}`
  );

  try {
    const res = await api.put(
      `/update-reservation/${encodeURIComponent(session.code)}`,
      {
        new_date: session.new_date,
        new_time,
      }
    );

    if (res.data?.status === "ok") {
      logger.info(`Reservation updated: ${session.code} (${chatId})`);
      await client.sendMessage(
        chatId,
        `✅ Termin wurde erfolgreich aktualisiert:\n📅 ${session.new_date} um ${new_time}`
      );
    } else {
      logger.warn(`Update failed: ${session.code} (${chatId})`);
      await client.sendMessage(
        chatId,
        `❌ Termin mit Code ${session.code} konnte nicht gefunden werden.`
      );
    }
  } catch (err) {
    logger.error(
      `Error updating ${session.code} (${chatId}):`,
      err?.response?.data || err.stack || err.message
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
