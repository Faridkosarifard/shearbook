// bot/handlers/friseurHandler.js
/**
 * Friseur selection handler for the WhatsApp bot.
 * - Uses a central axios client (BACKEND_URL + X-Bot-Token) to read /friseure
 * - Stores selected friseur (id, name, calendar_id) into the session
 * - Suggests the next 3 available dates (skipping Sundays)
 */

const api = require("../utils/backend");
const sessions = require("../sessions");
const logger = require("../utils/logger");

/**
 * Handle friseur index selection.
 * - `message` must be a number within the list range.
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

    session.friseur_id = selected.id;
    session.friseur_name = selected.name;
    session.calendar_id = selected.calendar_id;
    session.step = "enter_date";
    await sessions.set(chatId, session);

    logger.info(`Friseur selected by ${chatId}: ${selected.name} (ID: ${selected.id})`);

    // Build next 3 dates (skip Sundays)
    const today = new Date();
    const dates = [];
    let current = new Date(today);
    while (dates.length < 3) {
      current.setDate(current.getDate() + 1);
      if (current.getDay() !== 0) dates.push(new Date(current));
    }

    session.suggested_dates = dates.map((d) => d.toISOString().split("T")[0]);
    await sessions.set(chatId, session);

    logger.debug(`Suggested dates for ${chatId}: ${session.suggested_dates.join(", ")}`);

    let antwort = `🔴 *Bitte gib ein eigenes Datum ein (DD.MM.YYYY)* 🔴:
  oder wähle ein Datum: 

  ✅ Friseur *${selected.name}* wurde ausgewählt.\n`;

    session.suggested_dates.forEach((d, i) => {
      antwort += `${i + 1}. ${d}\n`;
    });
    await client.sendMessage(chatId, antwort);
  } catch (err) {
    logger.error(
      `Error fetching friseure for ${chatId}:`,
      err?.response?.data || err.stack || err.message,
    );
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

module.exports = { handleEnterFriseur };
