// ✅ Bewertungs-Link nach Termin (Zeit und Text aus Settings)
const logger = require("../utils/logger")
try {
  const resSettings = await axios.get("http://localhost:5000/settings");
  const feedbackTime = resSettings.data.feedback_time || "18:00"; // z.B. 18:00 Uhr
  const [fbHour, fbMinute] = feedbackTime.split(":").map((str) => parseInt(str));
  const feedbackCronExpr = `${fbMinute} ${fbHour} * * *`;

  cron.schedule(feedbackCronExpr, async () => {
    logger.info(`Feedback-Cron läuft (${feedbackTime})...`);

    try {
      const feedbackText =
        resSettings.data.feedback_text ||
        "🙏 Vielen Dank für Ihren Besuch, {name}!\nBitte bewerten Sie uns:\n{link}";
      const feedbackLink = resSettings.data.feedback_link || "https://example.com/review";

      const resAppointments = await axios.get("http://localhost:5000/appointments/feedback-due");
      const appointments = resAppointments.data;

      if (!appointments.length) {
        logger.info("Keine Kunden für Feedback.");
        return;
      }

      for (const appt of appointments) {
        const msg = feedbackText.replace("{name}", appt.name).replace("{link}", feedbackLink);

        await client.sendMessage(`${appt.phone}@c.us`, msg);
        await axios.post(`http://localhost:5000/appointments/mark-feedback/${appt.id}`);

        logger.info(`Bewertungs-Link an ${appt.name} (${appt.phone}) gesendet.`);
      }
    } catch (err) {
      logger.error("Fehler beim Feedback-Versand:", err.message);
    }
  });
} catch (err) {
  logger.error("Fehler beim Laden von Feedback-Einstellungen:", err.message);
}
