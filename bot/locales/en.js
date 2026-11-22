module.exports = {
  locale: "en",
  dateFormat: "dddd, D MMMM YYYY",
  help:
    "Welcome. Here is how you can use this chat:\n\n" +
    '• "book" – start a new appointment\n' +
    '• "cancel" – cancel an appointment with your reservation code\n' +
    '• "change" – move an appointment with your reservation code\n\n' +
    'Send "stop" to end the current flow.',
  sessionEnded: 'Session ended. Send "book" to start again.',
  servicesUnavailable: "Services are not loaded yet. Please try again later.",
  chooseService: "Please choose a service by sending its number:\n",
  invalidService: "No service with that number was found. Please check the list.",
  invalidNumber: "That is not a valid choice. Please reply with a number.",
  noStylists: "Nobody is available for that service right now. Please contact the salon.",
  chooseStylist: "Please choose a stylist:\n",
  stylistSelected: (name) => `${name} was selected.`,
  enterDate: "Please send a date (YYYY-MM-DD or DD.MM.YYYY), or pick a number.",
  noSuggestions: "Please send a date as YYYY-MM-DD.",
  suggestedDates: (name) => (name ? `Suggested days with ${name}:\n` : "Suggested days:\n"),
  chooseTime: "Please choose a time (number or HH:MM):\n",
  enterName: "What is your name?",
  booked: (text) => text,
  cancelled: "Your appointment has been cancelled.",
  askCodeCancel: "Please send your reservation code to cancel the appointment.",
  askCodeChange: "Please send your reservation code to change the appointment.",
  confirmCancel: (summary) => `${summary}\n\nReply "yes" to confirm, or "no" to abort.`,
  confirmChange: (summary) => `${summary}\n\nReply "yes" to confirm, or "no" to abort.`,
  notFound: "That reservation code was not found, or it does not belong to this number.",
  error: "Something went wrong. Please try again.",
  reasons: {
    public_holiday: "The salon is closed for a public holiday on that day.",
    stylist_off: "The selected stylist is not working on that day.",
    global_day_off: "The salon is closed on that day.",
    closed_weekly: "The stylist does not work on that weekday.",
    no_calendar: "This stylist has no calendar configured.",
    fully_booked: "Every slot on that day is already booked.",
    no_windows: "There are no bookable hours on that day.",
    invalid: "That date is not valid.",
    default: "There are no free times on that date.",
  },
};
