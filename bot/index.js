require("dotenv").config();

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const logger = require("./utils/logger");
const { createClient } = require("./utils/backend");
const { createSettingsHelper } = require("./utils/settings");
const { createSessionStore } = require("./sessions");
const { shouldHandleMessage } = require("./guard");
const { loadLocale } = require("./utils/i18n");
const { START_COMMANDS, CANCEL_COMMANDS, CHANGE_COMMANDS, STOP_COMMANDS, firstWord } = require("./utils/dates");
const { createFlows } = require("./handlers/flows");
const { startAdminServer } = require("./adminServer");

const api = createClient();
const settings = createSettingsHelper(api);
const sessions = createSessionStore(api);
const localeName = (process.env.CUSTOMER_LOCALE || "de").toLowerCase();
const locale = loadLocale(localeName);
const flows = createFlows({ api, sessions, locale, localeName, settings });

const allowed = (process.env.ALLOWED_NUMBERS || "")
  .split(",")
  .map((item) => item.trim())
  .filter(Boolean);

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: process.env.WHATSAPP_SESSION_PATH || ".wwebjs_auth" }),
  puppeteer: { headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] },
});

startAdminServer(client, logger);
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => logger.info("WhatsApp bot is ready"));

let services = [];

async function loadServices() {
  try {
    const { data } = await api.get("/api/services");
    services = (data || []).map((item) => ({
      id: item.id,
      name: item.name,
      duration: Number(item.duration) || 0,
      position: Number(item.position),
    }));
    logger.info(`Loaded ${services.length} services`);
  } catch (err) {
    logger.error(`Failed to load services: ${err.message}`);
  }
}

client.on("ready", loadServices);

async function send(chatId, text) {
  await client.sendMessage(chatId, text);
}

client.on("message", async (msg) => {
  if (!(await shouldHandleMessage(msg))) return;
  const chatId = msg.from;
  const phone = chatId.split("@")[0];
  if (allowed.length && !allowed.includes(phone)) return;

  try {
    const blocked = await api.get(`/api/blacklist/${encodeURIComponent(phone)}`);
    if (blocked.data?.blacklisted) return;
  } catch (err) {
    logger.warn(`Block-list check failed: ${err.message}`);
  }

  const raw = msg.body || "";
  const command = firstWord(raw);
  const session = await sessions.get(chatId);

  try {
    if (STOP_COMMANDS.has(command) && !["confirm_cancel", "confirm_change"].includes(session?.step)) {
      await sessions.clear(chatId);
      await send(chatId, locale.sessionEnded);
      return;
    }
    if (START_COMMANDS.has(command)) {
      if (!services.length) await loadServices();
      await flows.startBooking(chatId, services, (text) => send(chatId, text));
      return;
    }
    if (CANCEL_COMMANDS.has(command)) {
      await flows.startCancel(chatId, raw, (text) => send(chatId, text));
      return;
    }
    if (CHANGE_COMMANDS.has(command)) {
      await flows.startChange(chatId, raw, (text) => send(chatId, text));
      return;
    }
    if (!session) {
      const help = (await settings.get("help_message")) || locale.help;
      await send(chatId, help);
      return;
    }
    const reply = (text) => send(chatId, text);
    switch (session.step) {
      case "choose_service":
        await flows.handleChooseService(chatId, raw, services, reply);
        break;
      case "choose_stylist":
        await flows.handleChooseStylist(chatId, raw, reply);
        break;
      case "enter_date":
        await flows.handleEnterDate(chatId, raw, reply);
        break;
      case "choose_time":
        await flows.handleChooseTime(chatId, raw, reply);
        break;
      case "enter_name":
        await flows.handleEnterName(chatId, raw, reply);
        break;
      case "enter_cancel_code":
        await flows.handleCancelCode(chatId, raw, reply);
        break;
      case "confirm_cancel":
        await flows.handleConfirmCancel(chatId, raw, reply);
        break;
      case "enter_change_code":
        await flows.handleChangeCode(chatId, raw, reply);
        break;
      case "change_date":
        await flows.handleChangeDate(chatId, raw, reply);
        break;
      case "change_time":
        await flows.handleChangeTime(chatId, raw, reply);
        break;
      default:
        await send(chatId, locale.help);
    }
  } catch (err) {
    logger.error(`Handler error: ${err.message}`);
    await send(chatId, locale.error);
  }
});

if (require.main === module) {
  client.initialize();
}

module.exports = { client, loadServices };
