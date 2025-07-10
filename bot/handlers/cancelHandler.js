const sessions = require("../sessions");
const axios = require("axios");

function getPhoneFromChatId(chatId) {
  return chatId.split("@")[0];
}

function isValidReservationCode(code) {
  return /^KR-\d{4}-\d{4}$/.test(code);
}

async function handleCancelCommand(client, chatId, message) {
  const parts = message.trim().split(/\s+/);
  const code = parts[1]
    ?.replace(/[^\x20-\x7E]/g, "")
    .trim()
    .toUpperCase();
  const phone = getPhoneFromChatId(chatId);

  if (!isValidReservationCode(code)) {
    await client.sendMessage(
      chatId,
      "❗️ Ungültiger Reservierungscode. Beispiel: stornieren KR-0415-1234",
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
    await client.sendMessage(chatId, "❌ Fehler beim Überprüfen des Codes.");
    return;
  }

  await sessions.set(chatId, { step: "confirm_cancel", code });
  await client.sendMessage(
    chatId,
    `⚠️ Bist du sicher, dass du den Termin mit Code *${code}* stornieren möchtest?\nAntworten Sie mit:\n👉 *ja*`,
  );
}

async function confirmCancel(client, chatId, message) {
  const session = await sessions.get(chatId);

  if (session?.step === "confirm_cancel" && message.toLowerCase() === "ja") {
    try {
      const res = await axios.delete(`http://localhost:5000/cancel-reservation/${session.code}`);

      if (res.data.status === "ok") {
        await client.sendMessage(
          chatId,
          `✅ Termin mit Code *${session.code}* wurde erfolgreich storniert.`,
        );
      } else {
        await client.sendMessage(
          chatId,
          `❌ Kein Termin mit Code *${session.code}* gefunden oder nicht erlaubt.`,
        );
      }
    } catch (err) {
      console.error("error with cancelation:", err.message);
      await client.sendMessage(chatId, "❌ Fehler beim Stornieren. Bitte später erneut versuchen.");
    } finally {
      await sessions.clear(chatId);
    }
  } else {
    await client.sendMessage(chatId, "❗️ Bestätigung unklar. Bitte erneut schreiben: ja");
  }
}

module.exports = {
  handleCancelCommand,
  confirmCancel,
};
