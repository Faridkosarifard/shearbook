const logger = require("./logger");
const { getSetting, fetchAllSettings } = require("../utils/settingsHelper");

const DEFAULT_HELP_MESSAGE =
  `👋 Willkommen bei Your Salon! So können Sie mich nutzen:\n\n` +
  `• Schreib "termin", um eine neue Buchung zu starten.\n` +
  `• Schreib "absagen", um mit einem Code einen Termin zu stornieren.\n` +
  `• Schreib "ändern", um mit einem Code einen Termin zu verschieben.\n\n` +
  `Du kannst jederzeit "abbrechen" schreiben, um den Vorgang zu beenden.`;

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
    await fetchAllSettings();
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
