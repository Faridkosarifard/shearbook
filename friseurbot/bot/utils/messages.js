const logger = require("./logger");
const { getSetting, fetchAllSettings } = require("../utils/settingsHelper");

const DEFAULT_HELP_MESSAGE =
  `❓ Ich habe Ihre Nachricht nicht verstanden.\n\n` +
  `Sie können folgende Befehle verwenden:\n\n` +
  `✅ *neu* – Neues Termin starten\n` +
  `🛑 *abbrechen*, *stop*, *beenden* – Sitzung beenden\n` +
  `❌ *stornieren <Reservierungsnummer>* – Termin absagen\n` +
  `🔁 *ändern <Reservierungsnummer>* – Termin ändern\n`;

async function getHelpMessage() {
  try {
    return await getSetting("help_message", DEFAULT_HELP_MESSAGE);
  } catch (e) {
    logger.warn("getHelpMessage failed:", e?.message || e);
    return DEFAULT_HELP_MESSAGE;
  }
}

async function refreshHelpMessage() {
  try {
    await fetchAllSettings(); // کش را تازه کن
  } catch (e) {
    logger.warn("refreshHelpMessage: fetchAllSettings failed:", e?.message || e);
  }
  const val = await getSetting("help_message", DEFAULT_HELP_MESSAGE);
  if (val === DEFAULT_HELP_MESSAGE) {
    logger.warn("help_message missing; using DEFAULT");
  } else {
    logger.debug("help_message loaded (refreshed)");
  }
  return val;
}

async function invalidateHelpMessageCache() {
  try {
    await fetchAllSettings();
  } catch (e) {
    logger.warn("invalidateHelpMessageCache failed:", e?.message || e);
  }
}

module.exports = {
  getHelpMessage,
  refreshHelpMessage,
  invalidateHelpMessageCache,
  DEFAULT_HELP_MESSAGE,
};
