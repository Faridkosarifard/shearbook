import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import de from "date-fns/locale/de";
import api from "./api";
import axios from "axios";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import AddAppointmentModal from "./AddAppointmentModal";

const locales = { de };
const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { weekStartsOn: 1 }),
  getDay,
  locales,
});

// stable color map per friseur
const palette = [
  "#60a5fa", "#f59e0b", "#10b981", "#ef4444", "#a78bfa",
  "#f97316", "#14b8a6", "#eab308", "#8b5cf6", "#fb7185"
];
const friseurColor = (id) => {
  if (!id && id !== 0) return "#94a3b8";
  const idx = Math.abs(parseInt(id, 10)) % palette.length;
  return palette[idx];
};

function getColorForService(serviceName) {
  const s = (serviceName || "").toLowerCase();
  if (s.includes("damen")) return "#fbbf24";
  if (s.includes("herren")) return "#60a5fa";
  return "#a78bfa";
}

// Custom toolbar with modern buttons
function Toolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-3">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onNavigate("TODAY")}
          className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          Heute
        </button>
        <button
          onClick={() => onNavigate("PREV")}
          className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          ⟵
        </button>
        <button
          onClick={() => onNavigate("NEXT")}
          className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm"
        >
          ⟶
        </button>
        <span className="ml-2 text-lg font-semibold text-gray-800">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {[
          { key: Views.DAY, label: "Tag" },
          { key: Views.WEEK, label: "Woche" },
          { key: Views.MONTH, label: "Monat" },
        ].map((v) => (
          <button
            key={v.key}
            onClick={() => onView(v.key)}
            className={`px-3 py-1.5 rounded-full border shadow-sm ${
              view === v.key
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function TerminListe() {
  const [events, setEvents] = useState([]);
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState(new Date());
  const [editTime, setEditTime] = useState("09:00");
  const [freeTimes, setFreeTimes] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);

  // NEW: friseure list + filter
  const [friseure, setFriseure] = useState([]);
  const [selectedFriseur, setSelectedFriseur] = useState("all"); // "all" or friseur_id

  const calendarRef = useRef(null);

  // Load friseure for filter dropdown
  const loadFriseure = async () => {
    try {
      const res = await api.get("/friseure");
      setFriseure(res.data || []);
    } catch (err) {
      console.error("Fehler beim Laden der Friseure:", err);
    }
  };

  const mapAppointments = (rows = []) =>
    rows.map((appt) => {
      const start = new Date(`${appt.date}T${appt.time}`);
      const end = new Date(start.getTime() + (appt.duration || 60) * 60000);
      return {
        id: appt.id,
        title: `${appt.name} – ${appt.service}`,
        start,
        end,
        service: appt.service,
        name: appt.name,
        reservation_code: appt.reservation_code,
        duration: appt.duration || 60,
        friseur_id: appt.friseur_id,        // <-- needed for filtering
        friseur_name: appt.friseur_name || "", // optional, nice for legend
      };
    });

  // Load appointments (optionally server-side filtered)
  const loadAppointments = async (friseurId = "all") => {
    try {
      let res;
      if (friseurId !== "all") {
        // If backend supports query param filtering:
        // res = await api.get("/appointments", { params: { friseur_id: friseurId } });
        // If not supported, just fetch all and filter client-side:
        res = await api.get("/appointments");
        const all = mapAppointments(res.data);
        const filtered = all.filter((e) => `${e.friseur_id}` === `${friseurId}`);
        setEvents(filtered);
        setFilteredEvents(applySearch(filtered, searchTerm));
        return;
      } else {
        res = await api.get("/appointments");
      }
      const items = mapAppointments(res.data);
      setEvents(items);
      setFilteredEvents(applySearch(items, searchTerm));
    } catch (err) {
      console.error("Fehler beim Laden der Termine:", err);
    }
  };

  // Search helper
  const applySearch = (list, term) => {
    const t = (term || "").toLowerCase();
    if (!t) return list;
    return list.filter(
      (ev) =>
        (ev.name || "").toLowerCase().includes(t) ||
        (ev.service || "").toLowerCase().includes(t) ||
        format(ev.start, "yyyy-MM-dd").includes(t) ||
        (ev.friseur_name || "").toLowerCase().includes(t)
    );
  };

  useEffect(() => {
    loadFriseure();
    loadAppointments("all");
  }, []);

  // Re-apply search when term or base events change
  useEffect(() => {
    setFilteredEvents(applySearch(events, searchTerm));
  }, [searchTerm, events]);

  // Refetch appointments when friseur filter changes
  useEffect(() => {
    loadAppointments(selectedFriseur);
  }, [selectedFriseur]);

  // Event styling: combine service color hue with stylist accent ring
  const eventStyleGetter = (event) => {
    const bg = getColorForService(event.service || "");
    const ring = friseurColor(event.friseur_id);
    return {
      style: {
        backgroundColor: bg,
        borderRadius: "9999px",
        border: `2px solid ${ring}`,
        color: "#fff",
        padding: "4px 12px",
        fontSize: "0.85rem",
        fontWeight: 700,
        boxShadow: "0 4px 10px rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "transform 0.2s ease",
      },
    };
  };

  const handleDelete = async () => {
    if (!selectedEvent?.reservation_code) return;
    if (!confirm("Diesen Termin wirklich löschen?")) return;
    try {
      await api.delete(`/cancel-reservation/${selectedEvent.reservation_code}`);
      setEvents((prev) =>
        prev.filter((e) => e.reservation_code !== selectedEvent.reservation_code)
      );
      setSelectedEvent(null);
    } catch (err) {
      console.error("Fehler beim Löschen:", err);
      alert("Löschen fehlgeschlagen.");
    }
  };

  const fetchFreeTimes = async (date, duration, friseur_id) => {
    const dateStr = format(date, "yyyy-MM-dd");
    try {
      const res = await api.post("/free-times", {
        date: dateStr,
        duration,
        friseur_id, // so backend uses stylist’s personal schedule
      });
      setFreeTimes(res.data.slots || []);
    } catch (err) {
      console.error("Fehler beim Abrufen der freien Zeiten:", err);
    }
  };

  const handleEditStart = async () => {
    setEditDate(selectedEvent.start);
    setEditTime(format(selectedEvent.start, "HH:mm"));
    setEditMode(true);
    await fetchFreeTimes(selectedEvent.start, selectedEvent.duration, selectedEvent.friseur_id);
  };

  const handleDateChange = async (date) => {
    setEditDate(date);
    await fetchFreeTimes(date, selectedEvent.duration, selectedEvent.friseur_id);
  };

  const handleEditSubmit = async () => {
    try {
      const dateStr = format(editDate, "yyyy-MM-dd");
      await api.put(`/update-reservation/${selectedEvent.reservation_code}`, {
        new_date: dateStr,
        new_time: editTime,
      });
      setSelectedEvent(null);
      setEditMode(false);
      loadAppointments(selectedFriseur);
    } catch (err) {
      console.error("Fehler beim Aktualisieren:", err);
      alert("Aktualisierung fehlgeschlagen.");
    }
  };

  // Legend for stylists
  const legend = useMemo(() => {
    const list = selectedFriseur === "all"
      ? friseure
      : friseure.filter((f) => `${f.id}` === `${selectedFriseur}`);
    return list.map((f) => ({
      id: f.id,
      name: f.name,
      color: friseurColor(f.id),
    }));
  }, [friseure, selectedFriseur]);

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 rounded-xl shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3 w-full">
        <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-100">
          📆 Termin-Kalender
        </h2>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          {/* Stylist filter */}
          <select
            className="border px-3 py-2 rounded shadow focus:ring-2 focus:ring-blue-400 w-full md:w-56"
            value={selectedFriseur}
            onChange={(e) => setSelectedFriseur(e.target.value)}
          >
            <option value="all">👥 Alle Friseure</option>
            {friseure.map((f) => (
              <option key={f.id} value={f.id}>
                💇 {f.name}
              </option>
            ))}
          </select>

          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Suche (Name, Service, Datum)"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-3 py-2 rounded w-full md:w-64 shadow focus:ring-2 focus:ring-blue-400"
          />

          {/* Add appointment */}
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-full shadow hover:from-green-600 hover:to-green-700 transition w-full md:w-auto"
          >
            ➕ Termin hinzufügen
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {legend.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm"
          >
            <span
              className="inline-block w-3 h-3 rounded-full"
              style={{ backgroundColor: l.color }}
              title={l.name}
            />
            <span className="text-sm text-gray-700">{l.name}</span>
          </span>
        ))}
      </div>

      <div className="w-full overflow-x-auto">
        <Calendar
          ref={calendarRef}
          localizer={localizer}
          events={filteredEvents}
          startAccessor="start"
          endAccessor="end"
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY, Views.MONTH]}
          style={{ height: 650, width: "100%" }}
          className="rounded border border-gray-200 dark:border-gray-700 bg-white"
          eventPropGetter={eventStyleGetter}
          popup
          components={{ toolbar: Toolbar }}
          messages={{
            week: "Woche",
            day: "Tag",
            month: "Monat",
            today: "Heute",
            previous: "Zurück",
            next: "Weiter",
            noEventsInRange: "Keine Termine im gewählten Zeitraum.",
          }}
          onSelectEvent={(event) => setSelectedEvent(event)}
          // nicer times
          step={15}
          timeslots={2}
          min={new Date(1970, 0, 1, 8, 0, 0)}
          max={new Date(1970, 0, 1, 20, 0, 0)}
        />
      </div>

      {showAddModal && (
        <AddAppointmentModal onClose={() => setShowAddModal(false)} onAdd={() => loadAppointments(selectedFriseur)} />
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 text-blue-700 dark:text-blue-300">
              🔎 Termin-Details
            </h3>

            {!editMode ? (
              <>
                <p className="mb-1"><span className="font-semibold">Name:</span> {selectedEvent.name}</p>
                <p className="mb-1"><span className="font-semibold">Service:</span> {selectedEvent.service}</p>
                <p className="mb-1"><span className="font-semibold">Friseur:</span> {selectedEvent.friseur_name || selectedEvent.friseur_id}</p>
                <p className="mb-4">
                  <span className="font-semibold">Zeit:</span>{" "}
                  {format(selectedEvent.start, "HH:mm")} – {format(selectedEvent.end, "HH:mm")}
                </p>
                <div className="flex justify-end flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
                  >
                    Schließen
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                  >
                    ❌ Löschen
                  </button>
                  <button
                    onClick={handleEditStart}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600 transition"
                  >
                    📝 Bearbeiten
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm mb-1 font-semibold">📅 Neuer Termin</label>
                  <DatePicker
                    selected={editDate}
                    onChange={handleDateChange}
                    dateFormat="yyyy-MM-dd"
                    minDate={new Date()}
                    className="w-full border px-3 py-2 rounded"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm mb-1 font-semibold">🕒 Neue Uhrzeit</label>
                  <select
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="w-full border px-3 py-2 rounded"
                  >
                    {freeTimes.map((slot) => (
                      <option key={slot} value={slot}>{slot}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end flex-wrap gap-2">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                  >
                    Speichern
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
