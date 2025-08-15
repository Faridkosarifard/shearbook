// bot/utils/messages.js
/**
 * Help message provider with in-memory cache + Settings fallback.
 * - Tries GET /settings/help_message via Bot header (X-Bot-Token)
 * - Caches value for HELP_MSG_TTL_MS (default 5 minutes)
 * - Falls back to DEFAULT_HELP_MESSAGE on miss/error
 */

const axios = require("axios");
const logger = require("./logger");

const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN || "change-me";
// Customize cache TTL (ms) via env, default 5 minutes
const HELP_MSG_TTL_MS = parseInt(process.env.HELP_MSG_TTL_MS || "", 10) || 5 * 60 * 1000;

const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { "X-Bot-Token": BOT_TOKEN },
});

// Default German help message
const DEFAULT_HELP_MESSAGE =
  `❓ Ich habe Ihre Nachricht nicht verstanden.\n\n` +
  `Sie können folgende Befehle verwenden:\n\n` +
  `✅ *neu* – Neues Termin starten\n` +
  `🛑 *abbrechen*, *stop*, *beenden* – Sitzung beenden\n` +
  `❌ *stornieren <Reservierungsnummer>* – Termin absagen\n` +
  `🔁 *ändern <Reservierungsnummer>* – Termin ändern\n`;

// In-memory cache
let _cache = {
  value: null,        // string | null
  expiresAt: 0,       // number (epoch ms)
};

/**
 * Force refresh the cached help message from backend (ignores cache).
 * Returns the fetched string, or DEFAULT on error.
 */
async function refreshHelpMessage() {
  try {
    const res = await api.get("/settings/help_message");
    const val = res?.data?.value;
    if (typeof val === "string" && val.trim().length > 0) {
      _cache.value = val;
      _cache.expiresAt = Date.now() + HELP_MSG_TTL_MS;
      logger.debug("help_message loaded and cached");
      return val;
    }
    // No value set → cache DEFAULT but with a short TTL to recheck soon
    _cache.value = DEFAULT_HELP_MESSAGE;
    _cache.expiresAt = Date.now() + HELP_MSG_TTL_MS;
    logger.warn("help_message missing in settings; caching default for now");
    return DEFAULT_HELP_MESSAGE;
  } catch (err) {
    logger.error("Fetching help_message failed:", err?.response?.data || err.message);
    // On error, if we already have a cached value (even expired), serve it; else default
    if (_cache.value) return _cache.value;
    return DEFAULT_HELP_MESSAGE;
  }
}

/**
 * Get the help message with cache.
 * - If cache is valid, return it.
 * - Otherwise refresh from backend.
 */
async function getHelpMessage() {
  const now = Date.now();
  if (_cache.value && now < _cache.expiresAt) {
    return _cache.value;
  }
  return await refreshHelpMessage();
}

/**
 * Manually invalidate the cache (e.g., after admin updates settings).
 */
function invalidateHelpMessageCache() {
  _cache.expiresAt = 0;
}

module.exports = {
  getHelpMessage,          // async → string
  refreshHelpMessage,      // async → string (forces backend read)
  invalidateHelpMessageCache,
  DEFAULT_HELP_MESSAGE,
};
