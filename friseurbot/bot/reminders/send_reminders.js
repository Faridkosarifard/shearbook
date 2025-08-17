const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");
const cron = require("node-cron");
const qrcode = require("qrcode-terminal");
const express = require("express");
const logger = require("../utils/logger");
const app = express();

app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth(),
});

client.on("qr", (qr) => {
  qrcode.generate(qr, { small: true });
});

client.on("ready", async () => {
  logger.info("Reminder-Bot ist bereit!");

  try {
    const resSettings = await axios.get("http://localhost:5000/settings");
    const settings = resSettings.data;

    const reminderTime = settings.reminder_time || "09:00";
    const [hour, minute] = reminderTime.split(":").map((str) => parseInt(str));
    const cronExpr = `${minute} ${hour} * * *`;

    const reminderTemplate =
      settings.reminder_text ||
      "📅 Erinnerung: Sie haben morgen um {time} einen Termin für {service}.";
    const adminNumber = settings.admin_phone || "49000000000@c.us";

    // ✅ Kundenerinnerungen (dynamische Zeit)
    cron.schedule(cronExpr, async () => {
      logger.info(`⏰ Reminder-Cron-Job ausgeführt (${reminderTime})...`);
      try {
        const resAppointments = await axios.get("http://localhost:5000/appointments/tomorrow/list");
        const appointments = resAppointments.data;

        for (const a of appointments) {
          const msg = reminderTemplate
            .replace("{time}", a.time)
            .replace("{service}", a.service)
            .replace("{name}", a.name);
          await client.sendMessage(`${a.phone}@c.us`, msg);
          logger.info(`Erinnerung gesendet an ${a.name} (${a.phone})`);
        }
      } catch (err) {
        logger.error("Fehler bei individueller Erinnerung:", err.message);
      }
    });

    // ✅ Admin-Übersicht fix 5 Minuten später
    cron.schedule(`${(minute + 5) % 60} ${hour} * * *`, async () => {
      logger.info("⏰ Admin-Erinnerung...");
      try {
        const resMsg = await axios.get("http://localhost:5000/appointments/tomorrow/message");
        const message = resMsg.data.message;
        if (message) {
          await client.sendMessage(adminNumber, message);
          logger.info("Admin-Nachricht gesendet.");
        }
      } catch (err) {
        logger.error("Fehler bei Admin-Erinnerung:", err.message);
      }
    });
  } catch (err) {
    logger.error("Fehler beim Initialisieren des Cron-Jobs:", err.message);
  }
});

client.initialize();

// REST API zum manuellen Senden
app.post("/send-message", async (req, res) => {
  const { number, message } = req.body;
  if (!number || !message) {
    return res.status(400).json({ status: "error", message: "Nummer oder Nachricht fehlt" });
  }

  try {
    await client.sendMessage(number, message);
    res.json({ status: "ok", message: "Nachricht gesendet" });
  } catch (err) {
    logger.error("Fehler beim Senden:", err);
    res.status(500).json({ status: "error", message: "Senden fehlgeschlagen" });
  }
});

app.listen(3000, () => {
  logger.info("Bot API läuft auf Port 3000");
});
