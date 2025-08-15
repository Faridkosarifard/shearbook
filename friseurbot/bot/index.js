// bot/index.js
/**
 * WhatsApp bot entrypoint.
 * - Uses a central axios client with BACKEND_URL and X-Bot-Token header.
 * - Reads shared APIs (services, blacklist) secured by Bot header.
 * - Keeps session flow as-is; session endpoints should also use the same axios client.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

const cancelHandler = require("./handlers/cancelHandler");
const changeHandler = require("./handlers/changeHandler");
const bookingHandler = require("./handlers/bookingHandler");
const friseurHandler = require("./handlers/friseurHandler");
const logger = require("./utils/logger");
const sessions = require("./sessions");

// ---- Axios client for Backend (shared with Admin via same API) ----
// IMPORTANT: Set these in your environment (e.g., .env or systemd)
//   BACKEND_URL=http://192.0.2.10      (or http://127.0.0.1:8000 behind nginx)
//   BOT_TOKEN=very-long-random-secret
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN || "change-me";

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { "X-Bot-Token": BOT_TOKEN },
});

// ---- WhatsApp Client init ----
const client = new Client({
  authStrategy: new LocalAuth(),
});

let services = {};

// Render QR code in terminal
client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

// Load services from backend (used by booking flow)
async function loadServices() {
  try {
    const res = await api.get("/services");
    const next = {};
    res.data.forEach((service) => {
      next[service.id] = {
        id: service.id,
        name: service.name,
        duration: service.duration,
      };
    });
    services = next;
    logger.info(
      `Services loaded: ${Object.values(services)
        .map((s) => s.name)
        .join(", ")}`
    );
  } catch (e) {
    logger.error("Error loading services:", e?.response?.data || e.message);
  }
}

client.on("ready", async () => {
  await loadServices();
  logger.info("WhatsApp Bot is ready!");
});

client.on("message", async (msg) => {
  const chatId = msg.from;
  const phone = chatId.split("@")[0];

  // --- Blacklist check (shared API; requires Bot header) ---
  try {
    const res = await api.get(`/blacklist/${encodeURIComponent(phone)}`);
    if (res.data && res.data.blacklisted) {
      logger.warn(`Ignoring message from blacklisted number: ${phone}`);
      return; // stop processing
    } else {
      logger.debug(`Blacklist check for ${phone}: allowed`);
    }
  } catch (err) {
    logger.error(
      `Blacklist check failed (${phone}):`,
      err?.response?.data || err.stack || err.message
    );
    // continue flow even if blacklist check failed
  }

  const messageRaw = msg.body || "";
  const message = messageRaw.trim().toLowerCase();

  // === GLOBAL COMMANDS ===
  if (["cancel", "stop", "exit", "abbrechen", "ende", "beenden"].includes(message)) {
    await sessions.clear(chatId);
    await client.sendMessage(
      chatId,
      '❌ Sitzung wurde beendet. Schreiben Sie "neu", um neu zu starten.'
    );
    return;
  }

  // Accept "termin" as start keyword (message is lowercased already)
  if (["termin"].includes(message)) {
    await sessions.clear(chatId);

    if (Object.keys(services).length === 0) {
      // Services not loaded yet or failed: try once more
      await loadServices();
    }
    if (Object.keys(services).length === 0) {
      await client.sendMessage(
        chatId,
        "⚠️ Services sind noch nicht geladen. Bitte versuchen Sie es später erneut."
      );
      return;
    }

    let reply =
      "🔄 Neue Sitzung gestartet.\n\nBitte wählen Sie eine Dienstleistung:\n";
    Object.entries(services).forEach(([id, s]) => {
      reply += `${id}. ${s.name}\n`;
    });

    await client.sendMessage(chatId, reply + "\nAntworten Sie mit der Nummer.");
    await sessions.set(chatId, { step: "choose_service" });
    return;
  }

  // === CANCEL COMMAND ===
  if (message.startsWith("stornieren ")) {
    await cancelHandler.handleCancelCommand(client, chatId, messageRaw);
    return;
  }

  // === CHANGE COMMAND ===
  if (message.startsWith("ändern ")) {
    await changeHandler.handleChangeCommand(client, chatId, messageRaw);
    return;
  }

  // === STEP-BASED FLOW ===
  const session = await sessions.get(chatId);

  if (!session) {
    // If the user says something without starting a flow
    const { getHelpMessage } = require("./utils/messages");
    await client.sendMessage(chatId, getHelpMessage());
    return;
  }

  try {
    switch (session.step) {
      case "confirm_cancel":
        await cancelHandler.confirmCancel(client, chatId, message);
        break;

      case "confirm_update":
        await changeHandler.handleConfirmUpdate(client, chatId, message);
        break;

      case "enter_new_date":
        await changeHandler.handleNewDate(client, chatId, messageRaw);
        break;

      case "enter_new_time":
        await changeHandler.handleNewTime(client, chatId, messageRaw);
        break;

      case "choose_service":
        await bookingHandler.handleChooseService(client, chatId, messageRaw, services);
        break;

      case "choose_friseur":
        await bookingHandler.handleEnterFriseur(client, chatId, messageRaw);
        break;

      case "enter_date":
        await bookingHandler.handleEnterDate(client, chatId, messageRaw);
        break;

      case "choose_time":
        await bookingHandler.handleChooseTime(client, chatId, messageRaw);
        break;

      case "enter_name":
        await bookingHandler.handleEnterName(client, chatId, messageRaw);
        break;

      default:
        const { getHelpMessage } = require("./utils/messages");
        await client.sendMessage(chatId, getHelpMessage());
        break;
    }
  } catch (err) {
    logger.error("Handler error:", err?.response?.data || err.stack || err.message);
    await client.sendMessage(
      chatId,
      "⚠️ Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut."
    );
  }
});

client.initialize();
