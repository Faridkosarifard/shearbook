// bot/sessions.js
/**
 * Session helper for the WhatsApp bot.
 * - Talks to backend /session/<chatId> endpoints.
 * - Uses a central axios client with BACKEND_URL and X-Bot-Token header.
 * - Returns `null` when the session is effectively empty (so `if (!session)` works).
 */

const axios = require("axios");
const logger = require("./utils/logger");

// Environment-driven backend URL and bot token
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN || "change-me";

// Central axios client that always sends the Bot header
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { "X-Bot-Token": BOT_TOKEN },
});

const BASE = "/session";

/**
 * Fetch a session from backend.
 * Returns a flattened object: { step, code, ...data } or `null` if empty.
 */
async function get(chatId) {
  try {
    const res = await api.get(`${BASE}/${encodeURIComponent(chatId)}`);
    const { step = null, code = null, data = {} } = res.data || {};

    // If session is effectively empty (no step/code and no data), return null
    if (
      (step === null || step === undefined) &&
      (code === null || code === undefined) &&
      data &&
      Object.keys(data).length === 0
    ) {
      return null;
    }

    // Flatten: { data: {...} } -> { ...data }
    return { step, code, ...(data || {}) };
  } catch (err) {
    logger.error(
      `Session GET ${chatId} failed:`,
      err?.response?.data || err.message
    );
    // On failure, behave as "no session"
    return null;
  }
}

/**
 * Save a session.
 * Splits out `step` and `code`; the rest goes into `data`.
 */
async function set(chatId, session) {
  try {
    const { step = null, code = null, ...data } = session || {};
    await api.post(`${BASE}/${encodeURIComponent(chatId)}`, {
      step,
      code,
      data, // remaining fields are stored inside "data"
    });
  } catch (err) {
    logger.error(
      `Session SET ${chatId} failed:`,
      err?.response?.data || err.message
    );
  }
}

/**
 * Clear a session on the server.
 */
async function clear(chatId) {
  try {
    await api.delete(`${BASE}/${encodeURIComponent(chatId)}`);
  } catch (err) {
    logger.error(
      `Session CLEAR ${chatId} failed:`,
      err?.response?.data || err.message
    );
  }
}

module.exports = { get, set, clear };
