// AddAppointmentModal.jsx
import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { format, isValid as isValidDate } from "date-fns";
import api from "./api";

/** Map backend reason -> user-facing German text */
function reasonText(reason) {
  switch (reason) {
    case "public_holiday":
      return "🎉 Feiertag in Baden-Württemberg – der Salon ist geschlossen.";
    case "stylist_off":
      return "🛌 Der ausgewählte Friseur ist an diesem Tag nicht im Dienst.";
    case "global_day_off":
      return "🏝️ Der Salon ist an diesem Tag geschlossen.";
    case "closed_weekly":
      return "🚫 Der Friseur arbeitet an diesem Wochentag nicht.";
    case "no_calendar":
      return "⚠️ Für diesen Friseur ist kein Kalender hinterlegt.";
    case "no_windows":
      return "⚠️ Für diesen Tag gibt es keine buchbaren Arbeitsfenster.";
    case "fully_booked":
      return "😕 An diesem Tag sind bereits alle Zeiten belegt.";
    case "invalid":
      return "❗️ Ungültiges Datum/Anfrage.";
    default:
      return "Keine freien Zeiten an diesem Datum.";
  }
}

/** Normalize service shape to ensure we always have a duration in minutes */
function getServiceDurationMin(s) {
  if (!s) return null;
  const candidates = [
    s.duration_min, // backend DB naming
    s.duration,     // some APIs use 'duration'
    s.length,       // fallback
  ];
  for (const v of candidates) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

export default function AddAppointmentModal({
  onClose,
  onAdd,
  friseure = [],
  defaultFriseurId = null,
}) {
  // Form state
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [services, setServices] = useState([]);
  const [serviceId, setServiceId] = useState("");
  const selectedService = useMemo(
    () => services.find((s) => `${s.id}` === `${serviceId}`),
    [services, serviceId]
  );

  const [friseurId, setFriseurId] = useState(defaultFriseurId || "");
  const selectedFriseur = useMemo(
    () => friseure.find((f) => `${f.id}` === `${friseurId}`),
    [friseure, friseurId]
  );
  const [calendarId, setCalendarId] = useState(selectedFriseur?.calendar_id || "");

  const [date, setDate] = useState(new Date());
  const [time, setTime] = useState("");
  const [freeTimes, setFreeTimes] = useState([]);
  const [slotsReason, setSlotsReason] = useState(null);

  const [loadingSlots, setLoadingSlots] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  // Load services once
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get("/services");
        // Expecting array of { id, name, duration_min? }
        setServices(res.data || []);
      } catch (e) {
        console.error("Error loading services:", e);
      }
    })();
  }, []);

  // Keep calendarId in sync with selected friseur
  useEffect(() => {
    setCalendarId(selectedFriseur?.calendar_id || "");
  }, [selectedFriseur]);

  // Auto-prefill friseurId from default if provided
  useEffect(() => {
    if (defaultFriseurId && !friseurId) {
      setFriseurId(defaultFriseurId);
    }
  }, [defaultFriseurId, friseurId]);

  // Fetch free times when date/service/friseur changes (and all required inputs are ready)
  useEffect(() => {
    const canFetch =
      friseurId &&
      isValidDate(date) &&
      selectedService &&
      getServiceDurationMin(selectedService);

    if (!canFetch) {
      setFreeTimes([]);
      setSlotsReason(null);
      return;
    }

    (async () => {
      setLoadingSlots(true);
      setFormError("");
      try {
        const dateStr = format(date, "yyyy-MM-dd");
        const duration = getServiceDurationMin(selectedService);
        const res = await api.post("/free-times", {
          date: dateStr,
          duration,
          friseur_id: friseurId,
        });
        const data = res?.data || {};
        setFreeTimes(Array.isArray(data.slots) ? data.slots : []);
        setSlotsReason(typeof data.reason === "string" ? data.reason : null);
        // If we got slots, default-select the first
        if (Array.isArray(data.slots) && data.slots.length > 0) {
          setTime((prev) => prev || data.slots[0]);
        } else {
          setTime("");
        }
      } catch (e) {
        console.error("Error fetching free times:", e);
        setFreeTimes([]);
        setSlotsReason(null);
      } finally {
        setLoadingSlots(false);
      }
    })();
  }, [date, friseurId, selectedService]);

  async function handleSubmit() {
    setFormError("");

    // Basic validations
    if (!name.trim()) return setFormError("Bitte geben Sie den Namen ein.");
    if (!/^\+?\d[\d\s\-()]{5,}$/.test(phone.trim()))
      return setFormError("Bitte eine gültige Telefonnummer eingeben.");
    if (!serviceId) return setFormError("Bitte wählen Sie einen Service.");
    if (!friseurId) return setFormError("Bitte wählen Sie einen Friseur.");
    if (!calendarId) return setFormError("Kalender-ID des Friseurs fehlt.");
    if (!isValidDate(date)) return setFormError("Bitte ein gültiges Datum wählen.");
    if (!time) return setFormError("Bitte eine Uhrzeit wählen.");

    const duration = getServiceDurationMin(selectedService) || 30; // backend also derives from service_id, but free-times used this
    const startStr = `${format(date, "yyyy-MM-dd")}T${time}:00`;

    try {
      setSubmitting(true);
      const res = await api.post("/create-event", {
        name: name.trim(),
        phone: phone.trim(),
        service_id: serviceId,
        start: startStr,
        friseur_id: friseurId,
        calendar_id: calendarId,
      });
      if (res.data?.status === "ok") {
        onAdd?.();
        onClose?.();
      } else {
        setFormError("Erstellen des Termins fehlgeschlagen.");
      }
    } catch (e) {
      console.error("Error creating event:", e?.response?.data || e.message);
      setFormError("Erstellen des Termins fehlgeschlagen.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-2xl max-w-lg w-full border border-gray-200 dark:border-gray-700">
        <h3 className="text-xl font-bold mb-4 text-green-700 dark:text-green-300">➕ Neuen Termin erstellen</h3>

        {/* Name */}
        <div className="mb-3">
          <label className="block text-sm mb-1 font-semibold">👤 Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="Vollständiger Name"
          />
        </div>

        {/* Phone */}
        <div className="mb-3">
          <label className="block text-sm mb-1 font-semibold">📞 Telefon</label>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full border px-3 py-2 rounded"
            placeholder="+49 ..."
          />
        </div>

        {/* Service */}
        <div className="mb-3">
          <label className="block text-sm mb-1 font-semibold">🧾 Service</label>
          <select
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Service wählen…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {selectedService && (
            <p className="text-xs text-gray-500 mt-1">
              Dauer: {getServiceDurationMin(selectedService) || "—"} min
            </p>
          )}
        </div>

        {/* Friseur */}
        <div className="mb-3">
          <label className="block text-sm mb-1 font-semibold">💇 Friseur</label>
          <select
            value={friseurId || ""}
            onChange={(e) => setFriseurId(e.target.value)}
            className="w-full border px-3 py-2 rounded"
          >
            <option value="">Friseur wählen…</option>
            {friseure.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {!!calendarId && (
            <p className="text-xs text-gray-500 mt-1">Kalender-ID: {calendarId}</p>
          )}
        </div>

        {/* Date */}
        <div className="mb-3">
          <label className="block text-sm mb-1 font-semibold">📅 Datum</label>
          <DatePicker
            selected={date}
            onChange={(d) => setDate(d)}
            dateFormat="yyyy-MM-dd"
            minDate={new Date()}
            className="w-full border px-3 py-2 rounded"
          />
        </div>

        {/* Time (from free-times) */}
        <div className="mb-4">
          <label className="block text-sm mb-1 font-semibold">🕒 Uhrzeit</label>
          {loadingSlots ? (
            <div className="text-sm text-gray-500">Freie Zeiten werden geladen…</div>
          ) : freeTimes.length > 0 ? (
            <select
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="w-full border px-3 py-2 rounded"
            >
              {freeTimes.map((slot) => (
                <option key={slot} value={slot}>
                  {slot}
                </option>
              ))}
            </select>
          ) : (
            <div className="text-sm text-red-600">
              {slotsReason ? reasonText(slotsReason) : "Keine freien Zeiten gefunden."}
            </div>
          )}
        </div>

        {/* Error */}
        {formError && (
          <div className="mb-3 text-sm text-red-600">{formError}</div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
            disabled={submitting}
          >
            Abbrechen
          </button>
          <button
            onClick={handleSubmit}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
}
