const axios = require("axios");
const sessions = require("../sessions");

function isValidReservationCode(code) {
  return /^KR-\d{4}-\d{4}$/.test(code);
}

function getPhoneFromChatId(chatId) {
  return chatId.split("@")[0];
}

async function handleChangeCommand(client, chatId, message) {
  const parts = message.trim().split(/\s+/);
  const code = parts[1]
    ?.replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
  const phone = getPhoneFromChatId(chatId);

  if (!isValidReservationCode(code)) {
    await client.sendMessage(
      chatId,
      "❗️ Ungültiger Reservierungscode. Beispiel: ändern KR-0415-1234",
    );
    return;
  }

  try {
    const check = await axios.get(
      `http://localhost:5000/appointment/change/${code}?phone=${phone}`,
    );
    if (check.data.status === "not_found") {
      await client.sendMessage(chatId, `❌ Kein Termin mit Code ${code} gefunden.`);
      return;
    }
    if (check.data.status === "unauthorized") {
      await client.sendMessage(chatId, "❌ Dieser Code gehört nicht zu Ihrer Nummer.");
      return;
    }
  } catch (err) {
    console.error("❌ Fehler bei /appointment/:", err.message);
    await client.sendMessage(
      chatId,
      "❌ Fehler beim Überprüfen des Codes. Bitte später erneut versuchen.",
    );
    return;
  }

  await sessions.set(chatId, {
    step: "confirm_update",
    code: code,
  });

  await client.sendMessage(
    chatId,
    `⚠️ Möchten Sie den Termin mit Code ${code} ändern?\nAntworten Sie mit:\n👉 ja`,
  );
}

async function handleConfirmUpdate(client, chatId, message) {
  const session = await sessions.get(chatId);
  if (session?.step === "confirm_update" && message.toLowerCase() === "ja") {
    session.step = "enter_new_date";
    await sessions.set(chatId, session);
    await client.sendMessage(chatId, "📅 Bitte geben Sie das neue Datum ein (Format: YYYY-MM-DD):");
  } else {
    await client.sendMessage(chatId, "❗️ Bestätigung unklar. Bitte erneut schreiben: ja");
  }
}

async function handleNewDate(client, chatId, message) {
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(message)) {
    await client.sendMessage(chatId, "❗️ Ungültiges Datum. Bitte im Format YYYY-MM-DD eingeben.");
    return;
  }

  const session = await sessions.get(chatId);
  session.new_date = message;

  try {
    const res = await axios.get(`http://localhost:5000/appointment/${session.code}`);
    const duration = res.data.duration;
    const calendar_id = res.data.calendar_id;

    const res2 = await axios.post("http://localhost:5000/free-times", {
      date: message,
      duration: duration,
      calendar_id: calendar_id,
    });

    const slots = res2.data.slots;
    if (!slots.length) {
      await client.sendMessage(
        chatId,
        "❌ Keine freien Zeiten an diesem Tag. Bitte anderes Datum eingeben.",
      );
      return;
    }

    session.available_slots = slots;
    session.step = "enter_new_time";
    await sessions.set(chatId, session);

    let antwort = "🕒 Verfügbare Zeiten:\n";
    slots.forEach((t, i) => {
      antwort += `${i + 1}. ${t}\n`;
    });

    await client.sendMessage(chatId, antwort + "Bitte antworten Sie mit der Nummer.");
  } catch (e) {
    console.error("Fehler beim Laden der freien Zeiten:", e.message);
    await client.sendMessage(chatId, "❌ Fehler beim Laden der Zeiten.");
  }
}

async function handleNewTime(client, chatId, message) {
  const session = await sessions.get(chatId);
  const idx = parseInt(message);
  const slots = session?.available_slots || [];

  if (isNaN(idx) || idx < 1 || idx > slots.length) {
    await client.sendMessage(chatId, "❗️ Ungültige Auswahl. Bitte eine gültige Zahl senden.");
    return;
  }

  const new_time = slots[idx - 1];

  try {
    const res = await axios.put(`http://localhost:5000/update-reservation/${session.code}`, {
      new_date: session.new_date,
      new_time: new_time,
    });

    if (res.data.status === "ok") {
      await client.sendMessage(
        chatId,
        `✅ Termin wurde erfolgreich aktualisiert:\n📅 ${session.new_date} um ${new_time}`,
      );
    } else {
      await client.sendMessage(
        chatId,
        `❌ Termin mit Code ${session.code} konnte nicht gefunden werden.`,
      );
    }
  } catch (err) {
    console.error("❌ Fehler bei Änderung:", err.message);
    await client.sendMessage(chatId, "❌ Fehler beim Aktualisieren des Termins.");
  }

  await sessions.clear(chatId);
}

module.exports = {
  handleChangeCommand,
  handleConfirmUpdate,
  handleNewDate,
  handleNewTime,
};
