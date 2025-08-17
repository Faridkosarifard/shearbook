import { useEffect, useState } from "react";
import api from "./api";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const weekDays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function SettingsPage() {
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    api
      .get("/settings")
      .then((res) => {
        setForm(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Fehler beim Laden der Einstellungen:", err);
        setLoading(false);
      });
  }, []);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? (checked ? "true" : "false") : value;
    setForm({ ...form, [name]: newValue });
  };

  const handleTimeChange = (e, name) => {
    setForm({ ...form, [name]: e.target.value });
  };

  const handleDaysOffChange = (day) => {
    const current = (form.days_off || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const updated = current.includes(day) ? current.filter((d) => d !== day) : [...current, day];
    setForm({ ...form, days_off: updated.join(",") });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSuccess(false);
    try {
      await api.put("/settings", form);
      setSuccess(true);
    } catch (err) {
      console.error("Fehler beim Speichern:", err);
    }
  };

  if (loading) return <p className="text-gray-500 dark:text-gray-300">⏳ Lade Einstellungen...</p>;

  const group1 = [
    "admin_name",
    "admin_phone",
    "email_contact",
    "whatsapp_support_link",
    "instagram_link",
    "google_review_link",
    "location_address",
  ];
  const group2 = [
    "default_greeting",
    "welcome_text",
    "booking_text",
    "cancel_text",
    "reminder_text",
  ];
  const group3 = [
    "business_hours_start",
    "business_hours_end",
    "reminder_time",
    "reminder_lead_days",
    "enable_auto_reminder",
    "theme_color",
    "logo_url",
    "send_address_enabled",
    "show_instagram_links",
    "select_friseur_enabled",
    "show_google_links",
  ];

  const renderField = (key) => {
    const label = key.replace(/_/g, " ");
    const value = form[key] || "";

    if (
      [
        "enable_auto_reminder",
        "send_address_enabled",
        "show_instagram_links",
        "show_google_links",
        "select_friseur_enabled",
      ].includes(key)
    ) {
      return (
        <div key={key} className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
          <button
            type="button"
            onClick={() => setForm({ ...form, [key]: form[key] === "true" ? "false" : "true" })}
            className={`w-16 h-8 rounded-full transition-all duration-200 ${
              form[key] === "true" ? "bg-green-500" : "bg-gray-300"
            } flex items-center px-1`}
          >
            <div
              className={`w-6 h-6 bg-white rounded-full shadow transform transition ${
                form[key] === "true" ? "translate-x-8" : ""
              }`}
            />
          </button>
        </div>
      );
    }

    if (key.includes("text") || key.includes("message")) {
      return (
        <div key={key} className="mb-4">
          <label className="block text-sm font-medium dark:text-gray-200 text-gray-700 mb-1">
            {label}
          </label>
          <textarea
            name={key}
            value={value}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded min-h-[80px] dark:bg-gray-800 dark:text-white"
          />
        </div>
      );
    }

    if (key === "theme_color") {
      return (
        <div key={key} className="mb-4">
          <label className="block text-sm font-medium dark:text-gray-200 text-gray-700 mb-1">
            {label}
          </label>
          <input
            type="color"
            name={key}
            value={value}
            onChange={handleChange}
            className="h-10 w-20 border rounded"
          />
        </div>
      );
    }

    if (key === "reminder_time" || key === "business_hours_start" || key === "business_hours_end") {
      return (
        <div key={key} className="mb-4">
          <label className="block text-sm font-medium dark:text-gray-200 text-gray-700 mb-1">
            {label}
          </label>
          <input
            type="time"
            name={key}
            value={value}
            onChange={(e) => handleTimeChange(e, key)}
            className="w-full border px-3 py-2 rounded dark:bg-gray-800 dark:text-white"
          />
        </div>
      );
    }

    if (key === "reminder_lead_days") {
      return (
        <div key={key} className="mb-4">
          <label className="block text-sm font-medium dark:text-gray-200 text-gray-700 mb-1">
            {label}
          </label>
          <select
            name={key}
            value={value}
            onChange={handleChange}
            className="w-full border px-3 py-2 rounded dark:bg-gray-800 dark:text-white"
          >
            {[0, 1, 2, 3].map((d) => (
              <option key={d} value={d}>
                {d} Tag(e)
              </option>
            ))}
          </select>
        </div>
      );
    }

    return (
      <div key={key} className="mb-4">
        <label className="block text-sm font-medium dark:text-gray-200 text-gray-700 mb-1">
          {label}
        </label>
        <input
          type="text"
          name={key}
          value={value}
          onChange={handleChange}
          className="w-full border px-3 py-2 rounded dark:bg-gray-800 dark:text-white"
        />
      </div>
    );
  };

  const renderFields = (keys) => keys.map(renderField);

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full p-6 bg-white dark:bg-gray-900 text-gray-800 dark:text-white rounded shadow"
    >
      <h2 className="text-2xl font-bold mb-6 text-blue-700 dark:text-blue-300">⚙️ Einstellungen</h2>
      {success && <p className="text-green-600 text-sm mb-4">✅ Erfolgreich gespeichert.</p>}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>{renderFields(group1)}</div>
        <div>{renderFields(group2)}</div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {renderFields(group3)}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">
            Tage ohne Betrieb
          </label>
          <div className="grid grid-cols-2 gap-2">
            {weekDays.map((day) => (
              <label key={day} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={(form.days_off || "").split(",").includes(day)}
                  onChange={() => handleDaysOffChange(day)}
                />
                <span className="text-sm text-gray-700 dark:text-gray-200">{day}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="pt-6 text-right">
        <button
          type="submit"
          className="bg-blue-600 text-white px-5 py-2 rounded hover:bg-blue-700"
        >
          💾 Speichern
        </button>
      </div>
    </form>
  );
}
