// bookingHandler.js
const axios = require("axios");
const sessions = require("../sessions");

function getPhoneFromChatId(chatId) {
  return chatId.split("@")[0];
}

async function handleChooseService(client, chatId, message, services) {
  const session = await sessions.get(chatId);

  if (!services[message]) {
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Auswahl. Bitte antworten Sie mit einer gültigen Zahl.",
    );
    return;
  }

  session.service = services[message];
  session.step = "enter_date";
  await sessions.set(chatId, session);

  const res = await axios.get("http://localhost:5000/friseure");
  const friseure = res.data;

  if (!friseure.length) {
    return "❌ Keine Friseure verfügbar. Bitte kontaktiere den Administrator.";
  }

  let msg = "💇 Bitte wähle einen Friseur:\n";
  friseure.forEach((f, i) => {
    msg += `${i + 1}. ${f.name}\n`;
  });
  await client.sendMessage(chatId, msg);
  session.step = "choose_friseur";
  await sessions.set(chatId, session);
}

async function handleEnterFriseur(client, chatId, message) {
  const session = await sessions.get(chatId);

  try {
    const res = await axios.get("http://localhost:5000/friseure");
    const friseure = res.data;

    const index = parseInt(message) - 1;
    if (isNaN(index) || index < 0 || index >= friseure.length) {
      return `❌ Ungültige Eingabe. Bitte gib eine Zahl zwischen 1 und ${friseure.length} ein.`;
    }

    const selected = friseure[index];

    session.friseur_id = selected.id;
    session.friseur_name = selected.name;
    session.calendar_id = selected.calendar_id;
    session.step = "enter_date";
    await sessions.set(chatId, session);

    const today = new Date();
    const dates = [];
    let current = new Date(today);
    while (dates.length < 3) {
      current.setDate(current.getDate() + 1);
      if (current.getDay() !== 0) dates.push(new Date(current));
    }

    session.suggested_dates = dates.map((d) => d.toISOString().split("T")[0]);
    await sessions.set(chatId, session);

    let antwort = `✅ Friseur *${selected.name}* wurde ausgewählt.\n\nBitte wählen Sie ein Datum oder geben Sie ein eigenes ein (YYYY-MM-DD):\n`;
    session.suggested_dates.forEach((d, i) => {
      antwort += `${i + 1}. ${d}\n`;
    });
    await client.sendMessage(chatId, antwort);
  } catch (err) {
    console.error(`❌ Fehler beim Abrufen der Friseure:`, err.message);
    await client.sendMessage(
      "❌ Es gab ein Problem beim Laden der Friseure. Bitte versuch es später erneut.",
    );
    session.step = "choose_friseur";
    session.friseur_id = null;
    session.friseur_name = null;
    await sessions.set(chatId, session);
  }
}

async function handleEnterDate(client, chatId, message) {
  const session = await sessions.get(chatId);

  const isDateFormat = /^\d{4}-\d{2}-\d{2}$/.test(message);
  const isNumber = /^[1-3]$/.test(message);

  if (isNumber) {
    session.date = session.suggested_dates[parseInt(message) - 1];
  } else if (isDateFormat) {
    session.date = message;
  } else {
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Eingabe. Bitte geben Sie eine Zahl (1-3) oder ein gültiges Datum ein.",
    );
    return;
  }

  session.step = "choose_time";
  await sessions.set(chatId, session);

  try {
    console.error(session.calendar_id);
    const res = await axios.post("http://localhost:5000/free-times", {
      date: session.date,
      duration: session.service.duration,
      calendar_id: session.calendar_id,
    });

    const slots = res.data.slots;

    if (!slots.length) {
      await client.sendMessage(
        chatId,
        "Leider gibt es keine freien Zeiten an diesem Tag 😔. Bitte versuchen Sie ein anderes Datum.",
      );
      session.step = "enter_date";
      session.suggested_dates = null;
      await sessions.set(chatId, session);
      return;
    }

    let antwort = "Bitte wählen Sie eine verfügbare Uhrzeit:\n";
    slots.forEach((slot, index) => {
      antwort += `${index + 1}. ${slot}\n`;
    });

    session.available_slots = slots;
    await sessions.set(chatId, session);
    await client.sendMessage(chatId, antwort + "Antworten Sie mit der Nummer.");
  } catch (e) {
    console.error(e);
    await client.sendMessage(chatId, "❌ Fehler beim Abrufen der freien Zeiten.");
    session.step = "enter_date";
    session.suggested_dates = null;
    await sessions.set(chatId, session);
  }
}

async function handleChooseTime(client, chatId, message) {
  const session = await sessions.get(chatId);
  const idx = parseInt(message);
  const slots = session.available_slots || [];

  if (isNaN(idx) || idx < 1 || idx > slots.length) {
    await client.sendMessage(
      chatId,
      "❗️ Ungültige Auswahl. Bitte antworten Sie mit einer gültigen Zahl.",
    );
    return;
  }

  session.time = slots[idx - 1];
  session.step = "enter_name";
  await sessions.set(chatId, session);
  await client.sendMessage(chatId, "Wie ist Ihr vollständiger Name?");
}

async function handleEnterName(client, chatId, message) {
  const name = message.trim();

  if (!/^[a-zA-ZäöüßÄÖÜ\s]+$/.test(name)) {
    await client.sendMessage(chatId, "❗️ Ungültiger Name. Bitte nur Buchstaben verwenden.");
    return;
  }

  const session = await sessions.get(chatId);
  session.name = name;
  session.phone = chatId.split("@")[0];
  session.step = "done";
  await sessions.set(chatId, session);

  const startDateTime = `${session.date}T${session.time}:00`;

  try {
    console.log("📤 Sending to /create-event:", {
      name: session.name,
      phone: session.phone,
      service_id: session.service.id,
      start: startDateTime,
    });

    const res = await axios.post("http://localhost:5000/create-event", {
      name: session.name,
      phone: session.phone,
      service_id: session.service.id,
      start: startDateTime,
      friseur_id: session.friseur_id,
      calendar_id: session.calendar_id,
    });

    const code = res.data.reservation_code;

    await axios.post("http://localhost:5000/save-customer", {
      name: session.name,
      phone: session.phone,
    });

    const settings = await axios.get("http://localhost:5000/settings").then((res) => res.data);
    const bookingText =
      settings.booking_text ||
      `✅ Termin gebucht!\n
        🧾 {service}\n
        📅 {date} um {time}\n
        👤 {name}\n\n
        🔐 Ihre Reservierungsnummer:\n{code}`;

    const antwort = bookingText
      .replace("{service}", session.service.name)
      .replace("{date}", session.date)
      .replace("{time}", session.time)
      .replace("{name}", session.name)
      .replace("{code}", code);

    await client.sendMessage(chatId, antwort);
  } catch (err) {
    console.error("❌ Fehler bei /create-event:", err);
    await client.sendMessage(chatId, "❌ Fehler beim Speichern im Kalender.");
  }

  await sessions.clear(chatId);
}

module.exports = {
  handleChooseService,
  handleEnterDate,
  handleChooseTime,
  handleEnterName,
  handleEnterFriseur,
};
