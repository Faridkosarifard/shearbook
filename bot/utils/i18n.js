const de = require("../locales/de");
const en = require("../locales/en");

function loadLocale(name) {
  return name === "en" ? en : de;
}

function reasonText(locale, reason) {
  return locale.reasons[reason] || locale.reasons.default;
}

module.exports = { loadLocale, reasonText };
