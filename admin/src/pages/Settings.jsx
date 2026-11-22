import { useEffect, useState } from "react";
import api from "../api";

const TEXT = [
  ["salon_name", "Salon name"],
  ["location_address", "Address"],
  ["email_contact", "Public email"],
  ["instagram_link", "Instagram URL"],
  ["google_review_link", "Google review URL"],
  ["whatsapp_support_link", "Support WhatsApp link"],
  ["business_hours_start", "Default open time"],
  ["business_hours_end", "Default close time"],
  ["days_off", "Closed weekdays (e.g. Sunday or Sunday,Monday)"],
  ["welcome_text", "Welcome message"],
  ["booking_text", "Booking confirmation (use {service}, {date}, {time}, {name}, {code})"],
  ["cancel_text", "Cancellation message"],
  ["help_message", "Help message"],
  ["reminder_text", "Reminder text (use {time}, {service})"],
  ["reminder_time", "Reminder send time"],
  ["reminder_lead_days", "Reminder lead days"],
];

const FLAGS = [
  ["enable_auto_reminder", "Send automatic reminders"],
  ["select_stylist_enabled", "Let customers pick a stylist"],
  ["send_address_enabled", "Include the address in replies"],
  ["send_instagram_google_enabled", "Include Instagram and review links"],
];

const TEXT_AREAS = new Set(["welcome_text", "booking_text", "cancel_text", "help_message", "reminder_text"]);

export default function SettingsPage() {
  const [values, setValues] = useState({});
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api.get("/settings").then((res) => setValues(res.data)).catch(() => setError("Could not load settings."));
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    setOk("");
    try {
      await api.put("/settings", values);
      setOk("Settings saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save settings.");
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 max-w-2xl">
      <h1 className="text-3xl font-semibold">Settings</h1>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      {ok ? <p className="text-green-800 text-sm">{ok}</p> : null}
      {TEXT.map(([key, label]) => (
        <label key={key} className="block text-sm">
          {label}
          {TEXT_AREAS.has(key) ? (
            <textarea className="mt-1 w-full border border-mist rounded-lg px-3 py-2 h-24" value={values[key] || ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          ) : (
            <input className="mt-1 w-full border border-mist rounded-lg px-3 py-2" value={values[key] || ""} onChange={(e) => setValues({ ...values, [key]: e.target.value })} />
          )}
        </label>
      ))}
      <div className="space-y-2 pt-2">
        {FLAGS.map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={String(values[key] || "").toLowerCase() === "true"}
              onChange={(e) => setValues({ ...values, [key]: e.target.checked ? "true" : "false" })}
            />
            {label}
          </label>
        ))}
      </div>
      <button className="bg-ink text-cream rounded-lg px-4 py-2">Save settings</button>
    </form>
  );
}
