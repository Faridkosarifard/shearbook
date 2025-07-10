const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const axios = require("axios");

const cancelHandler = require("./handlers/cancelHandler");
const changeHandler = require("./handlers/changeHandler");
const bookingHandler = require("./handlers/bookingHandler");
const friseurHandler = require("./handlers/friseurHandler");
const sessions = require("./sessions");

const client = new Client({
  authStrategy: new LocalAuth(),
});

let services = {};

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  try {
    const res = await axios.get("http://localhost:5000/services");
    res.data.forEach((service) => {
      services[service.id] = {
        id: service.id,
        name: service.name,
        duration: service.duration,
      };
    });
    console.log("📋 Services loaded:", Object.values(services));
  } catch (e) {
    console.error("❌ Fehler beim Laden der Services:", e.message);
  }
  console.log("✅ WhatsApp Bot is ready!");
});

client.on("message", async (msg) => {
  const chatId = msg.from;
  const phone = chatId.split("@")[0];

  try {
    const res = await axios.get(`http://localhost:5000/blacklist/${phone}`);
    if (res.data.blacklisted) {
      console.log(`🚫 Nachricht von geblockter Nummer ignoriert: ${phone}`);
      return; // stop processing
    }
  } catch (err) {
    console.error("⚠️ Fehler beim Blacklist-Check:", err.message);
  }

  const message = msg.body.trim().toLowerCase();

  // === GLOBAL COMMANDS ===
  if (["cancel", "stop", "exit", "abbrechen", "ende", "beenden"].includes(message)) {
    await sessions.clear(chatId);
    await client.sendMessage(
      chatId,
      '❌ Sitzung wurde beendet. Schreiben Sie "neu", um neu zu starten.',
    );
    return;
  }

  if (["neu", "neustart", "neustarten"].includes(message)) {
    await sessions.clear(chatId);

    if (Object.keys(services).length === 0) {
      await client.sendMessage(
        chatId,
        "⚠️ Services sind noch nicht geladen. Bitte versuchen Sie es später erneut.",
      );
      return;
    }

    let antwort = "🔄 Neue Sitzung gestartet.\n\nBitte wählen Sie eine Dienstleistung:\n";
    Object.entries(services).forEach(([id, s]) => {
      antwort += `${id}. ${s.name}\n`;
    });

    await client.sendMessage(chatId, antwort + "\nAntworten Sie mit der Nummer.");
    await sessions.set(chatId, { step: "choose_service" });
    return;
  }

  // === CANCEL COMMAND ===
  if (message.startsWith("stornieren ")) {
    await cancelHandler.handleCancelCommand(client, chatId, msg.body);
    return;
  }

  // === CHANGE COMMAND ===
  if (message.startsWith("ändern ")) {
    await changeHandler.handleChangeCommand(client, chatId, msg.body);
    return;
  }

  // === STEP BASED FLOW ===
  const session = await sessions.get(chatId);

  if (!session) {
    // Falls der Nutzer einfach "Hallo"
    await client.sendMessage(chatId, '✋ Bitte starten Sie mit "neu", um einen Termin zu buchen.');
    return;
  }

  switch (session.step) {
    case "confirm_cancel":
      await cancelHandler.confirmCancel(client, chatId, message);
      break;

    case "confirm_update":
      await changeHandler.handleConfirmUpdate(client, chatId, message);
      break;

    case "enter_new_date":
      await changeHandler.handleNewDate(client, chatId, msg.body);
      break;

    case "enter_new_time":
      await changeHandler.handleNewTime(client, chatId, msg.body);
      break;

    case "choose_service":
      await bookingHandler.handleChooseService(client, chatId, msg.body, services);
      break;

    case "choose_friseur":
      await bookingHandler.handleEnterFriseur(client, chatId, msg.body);
      break;

    case "enter_date":
      await bookingHandler.handleEnterDate(client, chatId, msg.body);
      break;

    case "choose_time":
      await bookingHandler.handleChooseTime(client, chatId, msg.body);
      break;

    case "enter_name":
      await bookingHandler.handleEnterName(client, chatId, msg.body);
      break;

    default:
      const { getHelpMessage } = require("./utils/messages");
      await client.sendMessage(chatId, getHelpMessage());
      break;
  }
});
client.initialize();
