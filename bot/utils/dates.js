const dayjs = require("dayjs");
require("dayjs/locale/de");

function normalizeDateInput(raw = "") {
  const text = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  let match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return null;
}

function formatDate(iso, localeName = "de") {
  const loc = localeName === "en" ? "en" : "de";
  const fmt = loc === "en" ? "dddd, D MMMM YYYY" : "dddd, DD.MM.YYYY";
  return dayjs(iso).locale(loc).format(fmt);
}

function phoneFromChatId(chatId) {
  return String(chatId || "").split("@")[0];
}

const START_COMMANDS = new Set(["termin", "book", "neu", "new"]);
const CANCEL_COMMANDS = new Set(["absagen", "stornieren", "cancel"]);
const CHANGE_COMMANDS = new Set(["ändern", "aendern", "change"]);
const STOP_COMMANDS = new Set(["cancel", "stop", "exit", "abbrechen", "ende", "beenden", "stoppen"]);
const YES = new Set(["ja", "yes", "y", "j"]);
const NO = new Set(["nein", "no", "n"]);

function firstWord(message) {
  return String(message || "").trim().toLowerCase().split(/\s+/)[0] || "";
}

module.exports = {
  normalizeDateInput,
  formatDate,
  phoneFromChatId,
  START_COMMANDS,
  CANCEL_COMMANDS,
  CHANGE_COMMANDS,
  STOP_COMMANDS,
  YES,
  NO,
  firstWord,
};
