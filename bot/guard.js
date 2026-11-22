const BOOT_EPOCH = Math.floor(Date.now() / 1000);
const seen = new Set();
const lastTsByChat = new Map();

function isSystemOrStatus(msg) {
  if (msg.fromMe) return true;
  if (!msg.from) return true;
  if (msg.from === "status@broadcast") return true;
  const type = String(msg.type || "").toLowerCase();
  if (["e2e_notification", "ciphertext", "protocol_message"].includes(type)) return true;
  return false;
}

function isHistorical(msg) {
  if (msg._data && msg._data.isNewMsg === false) return true;
  const ts = Number(msg.timestamp || 0);
  return Boolean(ts && ts < BOOT_EPOCH - 5);
}

function dedupe(msg) {
  const key = msg.id?._serialized || `${msg.from}:${msg.timestamp}:${msg.body}`;
  if (!key || seen.has(key)) return false;
  seen.add(key);
  const timer = setTimeout(() => seen.delete(key), 60 * 60 * 1000);
  if (typeof timer.unref === "function") timer.unref();
  return true;
}

async function shouldHandleMessage(msg) {
  if (isSystemOrStatus(msg)) return false;
  if (msg.getChat) {
    const chat = await msg.getChat().catch(() => null);
    if (chat?.isGroup) return false;
  }
  if (isHistorical(msg)) return false;
  if (!dedupe(msg)) return false;
  const ts = Number(msg.timestamp || 0);
  const last = lastTsByChat.get(msg.from) || 0;
  if (ts && ts <= last) return false;
  if (ts) lastTsByChat.set(msg.from, ts);
  if (String(msg.type || "chat").toLowerCase() !== "chat") return false;
  if (!String(msg.body || "").trim()) return false;
  return true;
}

module.exports = { shouldHandleMessage, isSystemOrStatus, isHistorical };
