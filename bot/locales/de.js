module.exports = {
  locale: "de",
  dateFormat: "dddd, DD.MM.YYYY",
  help:
    "Willkommen. So können Sie mich nutzen:\n\n" +
    '• "termin" – neue Buchung starten\n' +
    '• "absagen" – Termin mit Reservierungscode stornieren\n' +
    '• "ändern" – Termin mit Reservierungscode verschieben\n\n' +
    'Schreiben Sie "abbrechen", um einen Vorgang zu beenden.',
  sessionEnded: 'Sitzung beendet. Schreiben Sie "termin", um neu zu starten.',
  servicesUnavailable: "Leistungen sind noch nicht geladen. Bitte versuchen Sie es später erneut.",
  chooseService: "Bitte wählen Sie eine Leistung und antworten Sie mit der Nummer:\n",
  invalidService: "Keine Leistung mit dieser Nummer gefunden. Bitte prüfen Sie die Liste.",
  invalidNumber: "Ungültige Auswahl. Bitte antworten Sie mit einer Zahl.",
  noStylists: "Für diese Leistung ist derzeit niemand verfügbar. Bitte kontaktieren Sie den Salon.",
  chooseStylist: "Bitte wählen Sie eine Fachkraft:\n",
  stylistSelected: (name) => `${name} wurde ausgewählt.`,
  enterDate: "Bitte senden Sie ein Datum (TT.MM.JJJJ oder JJJJ-MM-TT) oder wählen Sie eine Nummer.",
  noSuggestions: "Bitte senden Sie ein Datum im Format TT.MM.JJJJ.",
  suggestedDates: (name) =>
    name ? `Mögliche Tage bei ${name}:\n` : "Mögliche Tage:\n",
  chooseTime: "Bitte wählen Sie eine Uhrzeit (Nummer oder HH:MM):\n",
  enterName: "Wie ist Ihr Name?",
  booked: (text) => text,
  cancelled: "Ihr Termin wurde storniert.",
  askCodeCancel: "Bitte senden Sie Ihren Reservierungscode, um den Termin zu stornieren.",
  askCodeChange: "Bitte senden Sie Ihren Reservierungscode, um den Termin zu ändern.",
  confirmCancel: (summary) => `${summary}\n\nZum Bestätigen "ja" schreiben, sonst "nein".`,
  confirmChange: (summary) => `${summary}\n\nZum Bestätigen "ja" schreiben, sonst "nein".`,
  notFound: "Reservierungscode nicht gefunden oder gehört nicht zu dieser Nummer.",
  error: "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
  reasons: {
    public_holiday: "An diesem Tag ist gesetzlicher Feiertag – der Salon ist geschlossen.",
    stylist_off: "Die gewählte Fachkraft ist an diesem Tag nicht im Dienst.",
    global_day_off: "Der Salon ist an diesem Tag geschlossen.",
    closed_weekly: "An diesem Wochentag wird nicht gearbeitet.",
    no_calendar: "Für diese Fachkraft ist kein Kalender hinterlegt.",
    fully_booked: "An diesem Tag sind alle Zeiten belegt.",
    no_windows: "Für diesen Tag gibt es keine buchbaren Zeiten.",
    invalid: "Ungültiges Datum.",
    default: "Keine freien Zeiten an diesem Datum.",
  },
};
