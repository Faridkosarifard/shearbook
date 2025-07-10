const axios = require("axios");
const sessions = require("../sessions");

async function handleEnterFriseur(client, chatId, message) {
  const session = await sessions.get(chatId);

  try {
    const res = await axios.get("http://localhost:5000/friseure");
    const friseure = res.data;

    const index = parseInt(message) - 1;
    if (isNaN(index) || index < 0 || index >= friseure.length) {
      return `❌ Ungültige Eingabe. Bitte gib eine Zahl zwischen 1 und ${friseure.length} ein.`;
    }

    const selected = friseure[index];

    session.friseur_id = selected.id;
    session.friseur_name = selected.name;
    session.calendar_id = selected.calendar_id;
    session.step = "enter_date";
    await sessions.set(chatId, session);

    const today = new Date();
    const dates = [];
    let current = new Date(today);
    while (dates.length < 3) {
      current.setDate(current.getDate() + 1);
      if (current.getDay() !== 0) dates.push(new Date(current));
    }

    session.suggested_dates = dates.map((d) => d.toISOString().split("T")[0]);
    await sessions.set(chatId, session);

    let antwort = `✅ Friseur *${selected.name}* wurde ausgewählt.\n\nBitte wählen Sie ein Datum oder geben Sie ein eigenes ein (YYYY-MM-DD):\n`;
    session.suggested_dates.forEach((d, i) => {
      antwort += `${i + 1}. ${d}\n`;
    });
    await client.sendMessage(chatId, antwort);
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen der Friseure:`, err.message);
    await client.sendMessage(
      "❌ Es gab ein Problem beim Laden der Friseure. Bitte versuch es später erneut.",
    );
    session.step = "choose_friseur";
    session.friseur_id = null;
    session.friseur_name = null;
    await sessions.set(chatId, session);
  }
}

module.exports = { handleEnterFriseur };
