const FALLBACK_OPEN = "08:00";
const SCROLL_LEAD_MINUTES = 30;

export function parseHhmm(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function earliestOpenMinutes(settings = {}, weeklyStarts = []) {
  const candidates = [];
  const fromSettings = parseHhmm(settings.business_hours_start);
  if (fromSettings != null) candidates.push(fromSettings);
  for (const start of weeklyStarts) {
    const minutes = parseHhmm(start);
    if (minutes != null) candidates.push(minutes);
  }
  if (!candidates.length) {
    return parseHhmm(FALLBACK_OPEN);
  }
  return Math.min(...candidates);
}

export function scrollToDate(settings = {}, weeklyStarts = [], referenceDate = new Date()) {
  const open = earliestOpenMinutes(settings, weeklyStarts) ?? 8 * 60;
  const scroll = Math.max(0, open - SCROLL_LEAD_MINUTES);
  const date = new Date(referenceDate.getTime());
  date.setHours(Math.floor(scroll / 60), scroll % 60, 0, 0);
  return date;
}

export function appointmentTooltip(event) {
  const row = event?.resource || {};
  const duration = row.duration ? `${row.duration} min` : null;
  const when = [row.time, duration].filter(Boolean).join(" · ");
  return [row.name || event?.title, row.service, row.stylist_name, when].filter(Boolean).join("\n");
}
