const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createFlows } = require("../handlers/flows");
const { createSessionStore } = require("../sessions");
const { loadLocale } = require("../utils/i18n");

function memorySessions() {
  const data = new Map();
  return {
    async get(id) { return data.get(id) || null; },
    async set(id, session) { data.set(id, { ...session }); },
    async clear(id) { data.delete(id); },
    resetDateTime(session) {
      session.date = null;
      session.time = null;
      session.available_slots = null;
      session.suggested_dates = null;
      return session;
    },
  };
}

function fakeApi({ stylists, slots, code }) {
  return {
    async get(url) {
      if (url.includes("/stylists")) return { data: stylists };
      if (url.includes("/appointments/")) return { data: { service: "Cut", date: "2026-03-03", time: "10:00", reservation_code: "SB-0303-1111", duration: 30, stylist_id: 1, stylist_name: "Alex" } };
      return { data: {} };
    },
    async post(url, body) {
      if (url === "/api/slots") return { data: { slots, reason: slots.length ? "ok" : "fully_booked" } };
      if (url === "/api/appointments") return { data: { reservation_code: code } };
      return { data: {} };
    },
    async put() { return { data: { status: "ok" } }; },
    async delete() { return { data: { status: "ok" } }; },
  };
}

test("booking flow collects service, stylist, date, time and name", async () => {
  const messages = [];
  const send = async (text) => messages.push(text);
  const api = fakeApi({
    stylists: [{ id: 1, name: "Alex", calendar_id: "local-1" }],
    slots: ["09:00", "09:30", "10:00"],
    code: "SB-0303-4242",
  });
  const flows = createFlows({
    api,
    sessions: memorySessions(),
    locale: loadLocale("en"),
    localeName: "en",
    settings: { get: async () => null },
  });
  const services = [{ id: 1, name: "Cut", duration: 30, position: 1 }];
  await flows.startBooking("49170@c.us", services, send);
  await flows.handleChooseService("49170@c.us", "1", services, send);
  await flows.handleChooseStylist("49170@c.us", "1", send);
  await flows.handleEnterDate("49170@c.us", "2026-03-03", send);
  await flows.handleChooseTime("49170@c.us", "1", send);
  await flows.handleEnterName("49170@c.us", "Jamie", send);
  assert.ok(messages.some((item) => item.includes("SB-0303-4242")));
});

test("unknown service number is rejected", async () => {
  const messages = [];
  const flows = createFlows({
    api: fakeApi({ stylists: [], slots: [], code: "" }),
    sessions: memorySessions(),
    locale: loadLocale("de"),
    localeName: "de",
    settings: { get: async () => null },
  });
  await flows.handleChooseService("x", "99", [{ id: 1, name: "Cut", duration: 30, position: 1 }], async (t) => messages.push(t));
  assert.match(messages[0], /Keine Leistung/);
});
