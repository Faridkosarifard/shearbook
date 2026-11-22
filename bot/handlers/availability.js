const dayjs = require("dayjs");
const { reasonText } = require("../utils/i18n");
const { formatDate } = require("../utils/dates");

async function getFreeTimes(api, { date, duration, stylistId }) {
  const res = await api.post("/api/slots", { date, duration, stylist_id: stylistId });
  return { slots: res.data?.slots || [], reason: res.data?.reason || "default" };
}

async function suggestNextDates(api, startDateISO, duration, stylistId, { maxDays = 30, maxSuggestions = 3 } = {}) {
  const out = [];
  const base = dayjs(startDateISO || undefined);
  for (let offset = 0; offset <= maxDays && out.length < maxSuggestions; offset += 1) {
    const day = base.add(offset, "day").format("YYYY-MM-DD");
    const { slots } = await getFreeTimes(api, { date: day, duration, stylistId });
    if (slots.length) out.push({ date: day, slots });
  }
  return out;
}

async function promptDates(send, locale, localeName, stylistName, suggestions) {
  if (!suggestions.length) {
    await send(locale.noSuggestions);
    return false;
  }
  let text = locale.suggestedDates(stylistName);
  suggestions.forEach((item, index) => {
    text += `${index + 1}. ${formatDate(item.date, localeName)}\n`;
  });
  text += `\n${locale.enterDate}`;
  await send(text);
  return true;
}

async function showSlots(send, locale, date, slots, reason) {
  if (!slots.length) {
    await send(reasonText(locale, reason));
    return false;
  }
  let text = `${locale.chooseTime}`;
  slots.forEach((slot, index) => {
    text += `${index + 1}. ${slot}\n`;
  });
  await send(text);
  return true;
}

module.exports = { getFreeTimes, suggestNextDates, promptDates, showSlots };
