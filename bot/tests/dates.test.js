const { test } = require("node:test");
const assert = require("node:assert/strict");
const { normalizeDateInput, firstWord, START_COMMANDS, phoneFromChatId } = require("../utils/dates");
const { loadLocale, reasonText } = require("../utils/i18n");

test("normalizes German and ISO dates", () => {
  assert.equal(normalizeDateInput("2026-03-03"), "2026-03-03");
  assert.equal(normalizeDateInput("3.3.2026"), "2026-03-03");
  assert.equal(normalizeDateInput("03/03/2026"), "2026-03-03");
  assert.equal(normalizeDateInput("nope"), null);
});

test("start commands include German and English", () => {
  assert.equal(START_COMMANDS.has("termin"), true);
  assert.equal(START_COMMANDS.has(firstWord("Book please")), true);
});

test("phone is taken from a WhatsApp chat id", () => {
  assert.equal(phoneFromChatId("491701234567@c.us"), "491701234567");
});

test("locale reasons stay in the configured language", () => {
  const de = loadLocale("de");
  const en = loadLocale("en");
  assert.match(reasonText(de, "public_holiday"), /Feiertag/);
  assert.match(reasonText(en, "public_holiday"), /public holiday/);
  assert.equal(reasonText(en, "unknown"), en.reasons.default);
});
