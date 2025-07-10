function getHelpMessage() {
  return (
    `❓ Ich habe Ihre Nachricht nicht verstanden.\n\n` +
    `Sie können folgende Befehle verwenden:\n\n` +
    `✅ *neu* – Neues Termin starten\n` +
    `🛑 *abbrechen*, *stop*, *beenden* – Sitzung beenden\n` +
    `❌ *stornieren <Reservierungsnummer>* – Termin absagen\n` +
    `🔁 *ändern <Reservierungsnummer>* – Termin ändern\n`
  );
}

module.exports = { getHelpMessage };
