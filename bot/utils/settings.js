function createSettingsHelper(api, ttlMs = Number(process.env.SETTINGS_TTL_MS || 60000)) {
  let cache = null;
  let cacheTime = 0;

  async function fetchAll() {
    const now = Date.now();
    if (cache && now - cacheTime < ttlMs) return cache;
    const res = await api.get("/api/settings");
    if (res.status === 200 && res.data && typeof res.data === "object") {
      cache = res.data;
      cacheTime = now;
      return cache;
    }
    return cache || {};
  }

  async function get(key, fallback = null) {
    const all = await fetchAll();
    return Object.prototype.hasOwnProperty.call(all, key) ? all[key] : fallback;
  }

  function clear() {
    cache = null;
    cacheTime = 0;
  }

  return { fetchAll, get, clear };
}

module.exports = { createSettingsHelper };
