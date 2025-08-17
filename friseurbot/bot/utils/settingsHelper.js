const api = require("../utils/backend");

const SETTINGS_TTL = parseInt(process.env.FR_SETTINGS_TTL_MS || "60000", 10); // 60s

api.interceptors.request.use((config) => {
  if (BOT_TOKEN) {
    config.headers["X-Bot-Token"] = BOT_TOKEN;
  }
  return config;
});

let cache = null;
let cacheTime = 0;

async function fetchAllSettings() {
  const now = Date.now();
  if (cache && now - cacheTime < SETTINGS_TTL) {
    return cache;
  }

  const res = await api.get("/settings");
  if (res.status === 200 && res.data && typeof res.data === "object") {
    cache = res.data;
    cacheTime = now;
    return cache;
  }

  if (cache) return cache;
  return {};
}

async function getSetting(key, fallback = null) {
  const all = await fetchAllSettings();
  if (Object.prototype.hasOwnProperty.call(all, key)) {
    return all[key];
  }
  return fallback;
}

module.exports = { fetchAllSettings, getSetting };
