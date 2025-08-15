// bot/handlers/cancelHandler.js
/**
 * Cancel flow handlers for the WhatsApp bot.
 * - Uses a central axios client with BACKEND_URL and X-Bot-Token header.
 * - Two steps:
 *   1) handleCancelCommand => parse/collect reservation code and ask for confirmation
 *   2) confirmCancel       => on "ja" do DELETE /cancel-reservation/<code>, on "nein" abort
 */

const axios = require("axios");
const sessions = require("../sessions");
const logger = require("../utils/logger");

// Central axios client configured for Bot auth
const BACKEND_URL = process.env.BACKEND_URL || "http://127.0.0.1:8000";
const BOT_TOKEN = process.env.BOT_TOKEN || "change-me";
const api = axios.create({
  baseURL: BACKEND_URL,
  timeout: 10000,
  headers: { "X-Bot-Token": BOT_TOKEN },
});

/**
 * Extract reservation code from a free-form message like:
 *   "stornieren ABC123"  -> "ABC123"
 *   "stornieren: abc-123"-> "abc-123"
 */
function extractCodeFromMessage(messageRaw = "") {
  const msg = messageRaw.trim();
  const parts = msg.split(/\s+/);
  if (parts.length >= 2) {
    // take everything after the first token (e.g., "stornieren")
    return parts.slice(1).join(" ").trim();
  }
  return "";
}

/**
 * Entry point when user types the cancel command (e.g., "stornieren <code>").
 * If code is missing, asks the user to provide it.
 * Then stores it in session and moves to confirm_cancel step.
 */
async function handleCancelCommand(client, chatId, messageRaw) {
  const session = (await sessions.get(chatId)) || {};

  // Try to extract code from the same message
  let code = extractCodeFromMessage(messageRaw);

  // If no code along with the command, ask the user for it
  if (!code) {
    session.step = "confirm_cancel";
    session.cancel_code = null;
    await sessions.set(chatId, session);
    await client.sendMessage(
      chatId,
      "Bitte sende deinen Reservierungscode zum Stornieren (z. B. ABC123)."
    );
    return;
  }

  // Save code and ask for confirmation
  session.step = "confirm_cancel";
  session.cancel_code = code;
  await sessions.set(chatId, session);

  await client.sendMessage(
    chatId,
    `Möchtest du die Reservierung mit Code *${code}* wirklich stornieren? (antworte mit "ja" oder "nein")`
  );
}

/**
 * Confirmation step. Expects "ja" or "nein".
 * On "ja": calls DELETE /cancel-reservation/<code> and clears session.
 * On "nein": aborts and clears session.
 */
async function confirmCancel(client, chatId, message) {
  const reply = (message || "").trim().toLowerCase();
  const session = (await sessions.get(chatId)) || {};
  const code = session.cancel_code;

  if (!code) {
    // No code yet; ask the user to provide one.
    await client.sendMessage(
      chatId,
      "Kein Reservierungscode gefunden. Bitte sende deinen Code (z. B. ABC123)."
    );
    // Keep step as confirm_cancel until we have a code
    return;
  }

  if (["nein", "no", "n"].includes(reply)) {
    await client.sendMessage(chatId, "Stornierung abgebrochen.");
    await sessions.clear(chatId);
    return;
  }

  if (!["ja", "yes", "y"].includes(reply)) {
    await client.sendMessage(
      chatId,
      'Bitte antworte mit "ja" zum Bestätigen oder "nein" zum Abbrechen.'
    );
    return;
  }

  // Proceed to cancel
  try {
    const res = await api.delete(`/cancel-reservation/${encodeURIComponent(code)}`);
    if (res.data && res.data.status === "ok") {
      await client.sendMessage(
        chatId,
        `✅ Deine Reservierung mit dem Code *${code}* wurde storniert.`
      );
      logger.info(`Reservation cancelled for ${chatId} (code: ${code})`);
    } else if (res.status === 404 || res.data?.status === "not_found") {
      await client.sendMessage(
        chatId,
        "❌ Reservierung nicht gefunden. Bitte überprüfe deinen Code."
      );
      logger.warn(`Cancel failed (not found) for ${chatId} (code: ${code})`);
    } else {
      await client.sendMessage(
        chatId,
        "⚠️ Es gab ein Problem beim Stornieren. Bitte versuche es später erneut."
      );
      logger.error(
        `Cancel failed for ${chatId} (code: ${code}):`,
        res.data || res.status
      );
    }
  } catch (err) {
    logger.error(
      `Error cancelling reservation for ${chatId} (code: ${code}):`,
      err?.response?.data || err.message
    );
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Stornieren. Bitte versuche es später erneut."
    );
  }

  await sessions.clear(chatId);
}

module.exports = {
  handleCancelCommand,
  confirmCancel,
};
