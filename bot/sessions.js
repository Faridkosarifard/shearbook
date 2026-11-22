function createSessionStore(api) {
  const BASE = "/api/session";

  async function get(chatId) {
    try {
      const res = await api.get(`${BASE}/${encodeURIComponent(chatId)}`);
      const { step = null, code = null, data = {} } = res.data || {};
      if (!step && !code && data && Object.keys(data).length === 0) return null;
      return { step, code, ...(data || {}) };
    } catch {
      return null;
    }
  }

  async function set(chatId, session) {
    const { step = null, code = null, ...data } = session || {};
    await api.post(`${BASE}/${encodeURIComponent(chatId)}`, { step, code, data });
  }

  async function clear(chatId) {
    try {
      await api.delete(`${BASE}/${encodeURIComponent(chatId)}`);
    } catch {
      // ignore
    }
  }

  function resetDateTime(session) {
    session.date = null;
    session.time = null;
    session.available_slots = null;
    session.suggested_dates = null;
    return session;
  }

  return { get, set, clear, resetDateTime };
}

module.exports = { createSessionStore };
