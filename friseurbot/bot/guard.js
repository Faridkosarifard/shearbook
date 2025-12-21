const BOOT_EPOCH = Math.floor(Date.now() / 1000);
const seenMsg = new Set();
const lastTsByChat = new Map();

function isSystemOrStatus(msg) {
  if (msg.fromMe) return true;
  if (!msg.from) return true;
  if (msg.from === 'status@broadcast') return true;
  const t = String(msg.type || '').toLowerCase();
  if (t === 'e2e_notification' || t === 'ciphertext' || t === 'protocol_message') return true;
  return false;
}

function isHistorical(msg) {
  if (msg._data && msg._data.isNewMsg === false) return true;
  const ts = Number(msg.timestamp || 0);
  if (ts && ts < (BOOT_EPOCH - 5)) return true;
  return false;
}

function dedupe(msg) {
  const key = msg.id?._serialized || `${msg.from}:${msg.timestamp}:${msg.body}`;
  if (!key) return false;
  if (seenMsg.has(key)) return false;
  seenMsg.add(key);
  setTimeout(() => seenMsg.delete(key), 60 * 60 * 1000);
  return true;
}

async function shouldHandleMessage(msg, client) {
  if (isSystemOrStatus(msg)) return false;
  const chat = await msg.getChat().catch(() => null);
  if (chat?.isGroup) return false;
  if (isHistorical(msg)) return false;
  if (!dedupe(msg)) return false;

  const ts = Number(msg.timestamp || 0);
  const last = lastTsByChat.get(msg.from) || 0;
  if (ts && ts <= last) return false;
  if (ts) lastTsByChat.set(msg.from, ts);

  if (String(msg.type || '').toLowerCase() !== 'chat') return false;
  if (!String(msg.body || '').trim()) return false;

  return true;
}

module.exports = { shouldHandleMessage };
