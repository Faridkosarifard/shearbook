// bot/index.js
/**
 * WhatsApp bot entrypoint.
 * - Uses a central axios client with BACKEND_URL and X-Bot-Token header.
 * - Reads shared APIs (services, blacklist) secured by Bot header.
 * - Keeps session flow as-is; session endpoints should also use the same axios client.
 * - Adds admin HTTP server so QR/status are visible in the UI.
 */

const { Client, LocalAuth } = require("whatsapp-web.js");
const { getHelpMessage } = require("./utils/messages");
const api = require("./utils/backend");

const cancelHandler = require("./handlers/cancelHandler");
const changeHandler = require("./handlers/changeHandler");
const bookingHandler = require("./handlers/bookingHandler");
const friseurHandler = require("./handlers/friseurHandler");
const logger = require("./utils/logger");
const sessions = require("./sessions");
const { startAdminServer } = require("./adminServer");

// ---- WhatsApp Client init (same as before; only 2 stable options added) ----
const client = new Client({
  authStrategy: new LocalAuth(),
  restartOnAuthFail: true, // self-recover on auth hiccups
  webVersionCache: {
    type: "remote",
    remotePath: "https://raw.githubusercontent.com/wwebjs/wa-version/main/html/latest.html",
  },
});

// ---- Admin server for UI (QR/status/SSE/restart/logout) ----
startAdminServer(client, logger, {
  port: process.env.ADMIN_PORT || 5001,
  token: process.env.ADMIN_TOKEN || "",
  cors: process.env.ADMIN_CORS || "*",
});

let services = {};
let servicesById   = {};   // id -> service
let servicesSorted = [];   // array sorted by position, then name
let posToId        = {};

// Load services from backend (used by booking flow)
async function loadServices() {
  try {
    const { data } = await api.get("/services");

    // 1) Normalize
    const normalized = (data || []).map(s => ({
      id: String(s.id),
      name: String(s.name ?? ""),
      duration: Number(s.duration) || 0,
      position: Number(s.position) // may be NaN if missing
    }));

    // 2) Split by valid/invalid position
    const withPos    = normalized.filter(s => Number.isFinite(s.position));
    const withoutPos = normalized.filter(s => !Number.isFinite(s.position));

    // 3) Sort: by position, then name (natural)
    withPos.sort((a, b) =>
      a.position - b.position ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );

    // 4) Merge: valid positions first, then the rest (unsorted or name-sorted if you prefer)
    servicesSorted = [...withPos, ...withoutPos];

    // 5) Build maps
    servicesById = Object.fromEntries(servicesSorted.map(s => [s.id, s]));
    services     = servicesById; // keep your original variable for compatibility

    posToId = {};
    for (const s of withPos) {
      if (posToId[s.position]) {
        logger.warn(`Duplicate service.position detected: ${s.position} (overwriting ${posToId[s.position]} with ${s.id})`);
      }
      posToId[s.position] = s.id;
    }

    // 6) Helpful logs
    const byPosLabel = withPos.map(s => `${s.position}:${s.name}`).join(", ");
    const noPosLabel = withoutPos.map(s => s.name).join(", ");
    logger.info(
      `Services loaded. Ordered: [${byPosLabel}]` +
      (withoutPos.length ? ` | No position: [${noPosLabel}]` : "")
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
      err?.response?.data || err.stack || err.message,
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
      '❌ Sitzung wurde beendet. Schreiben Sie "neu", um neu zu starten.',
    );
    return;
  }

  // Accept "termin" as start keyword (message is lowercased already)
  if (["termin"].includes(message)) {
    await sessions.clear(chatId);

    if (Object.keys(services).length === 0) await loadServices();
    if (Object.keys(services).length === 0) {
      await client.sendMessage(
        chatId,
        "⚠️ Services sind noch nicht geladen. Bitte versuchen Sie es später erneut.",
      );
      return;
    }

    let reply = "🔄 Neue Sitzung gestartet.\n\nBitte wählen Sie eine Dienstleistung:\n";
    const servicesByPosition = Object.fromEntries(
      servicesSorted.map(s => [s.position, s])
    );
    
    Object.entries(servicesByPosition)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([position, s]) => {
        reply += `${position}. ${s.name}\n`;
      });

    await client.sendMessage(chatId, reply + "\nAntworten Sie mit der Nummer.");
    await sessions.set(chatId, { step: "choose_service" });
    return;
  }

  // === CANCEL COMMAND ===
  if (message === "absagen" || message.startsWith("absagen ")) {
    await cancelHandler.handleCancelCommand(client, chatId, messageRaw);
    return;
  }

  // === CHANGE COMMAND ===
  if (message === "ändern" || message.startsWith("ändern ")) {
    await changeHandler.handleChangeCommand(client, chatId, messageRaw);
    return;
  }

  // === STEP-BASED FLOW ===
  const session = await sessions.get(chatId);

  if (!session) {
    const help = await getHelpMessage();
    await client.sendMessage(chatId, help);
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
        await bookingHandler.handleChooseService(client, chatId, messageRaw, servicesById);
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
        const help = await getHelpMessage();
        await client.sendMessage(chatId, help);
        break;
    }
  } catch (err) {
    logger.error("Handler error:", err?.response?.data || err.stack || err.message);
    await client.sendMessage(
      chatId,
      "⚠️ Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    );
  }
});

client.initialize();
