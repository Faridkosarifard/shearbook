const axios = require("axios");
const BASE = "http://localhost:5000/session";

/**
 * Holt eine Session vom Backend.
 * Gibt ein flaches Objekt zurück: { step, code, ...data }
 */
async function get(chatId) {
  try {
    const res = await axios.get(`${BASE}/${chatId}`);
    const { step, code, data = {} } = res.data;

    return {
      step,
      code,
      ...data, // 🔄 macht aus {data: {...}} ein flaches Objekt
    };
  } catch (err) {
    console.error(`❌ Fehler beim GET Session ${chatId}:`, err.message);
    return {};
  }
}

/**
 * Speichert eine Session.
 * Trennt "step" und "code" raus, Rest kommt in "data"
 */
async function set(chatId, session) {
  try {
    const { step, code, ...data } = session;

    await axios.post(`${BASE}/${chatId}`, {
      step: step || null,
      code: code || null,
      data, // 🔄 Restliche Felder kommen hier rein
    });
  } catch (err) {
    console.error(`❌ Fehler beim SET Session ${chatId}:`, err.message);
  }
}

/**
 * Löscht die Session vom Server
 */
async function clear(chatId) {
  try {
    await axios.delete(`${BASE}/${chatId}`);
  } catch (err) {
    console.error(`❌ Fehler beim CLEAR Session ${chatId}:`, err.message);
  }
}

module.exports = { get, set, clear };
