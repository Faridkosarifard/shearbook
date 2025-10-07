// TerminListe.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay, isValid as isValidDate } from "date-fns";
import de from "date-fns/locale/de";
import api from "./api";
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

// Color helpers
const palette = ["#60a5fa","#f59e0b","#10b981","#ef4444","#a78bfa","#f97316","#14b8a6","#eab308","#8b5cf6","#fb7185"];
const friseurColor = (id) => {
  if (id === null || id === undefined) return "#94a3b8";
  const idx = Math.abs(parseInt(id, 10)) % palette.length;
  return palette[idx];
};
function getColorForService(serviceName) {
  const s = (serviceName || "").toLowerCase();
  if (s.includes("damen")) return "#fbbf24";
  if (s.includes("herren")) return "#60a5fa";
  return "#a78bfa";
}

// Fancy toolbar
function Toolbar({ label, onNavigate, onView, view }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
      <div className="flex items-center gap-2">
        <button onClick={() => onNavigate("TODAY")} className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm">Heute</button>
        <button onClick={() => onNavigate("PREV")} className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm">⟵</button>
        <button onClick={() => onNavigate("NEXT")} className="px-3 py-1.5 rounded-full bg-white border text-gray-700 hover:bg-gray-50 shadow-sm">⟶</button>
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
              view === v.key ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-700 hover:bg-gray-50"
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

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editDate, setEditDate] = useState(new Date());
  const [editTime, setEditTime] = useState("09:00");
  const [freeTimes, setFreeTimes] = useState([]);
  const [deleting, setDeleting] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);

  // Stylists & filters
  const [friseure, setFriseure] = useState([]);
  const [selectedFriseur, setSelectedFriseur] = useState("all"); // "all" | id
  const [resourceView, setResourceView] = useState(false);       // toggle column view

  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  const calendarRef = useRef(null);

  // ESC to close modal / edit
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        if (editMode) setEditMode(false);
        else if (selectedEvent) setSelectedEvent(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editMode, selectedEvent]);

  const loadFriseure = async () => {
    try {
      const res = await api.get("/friseure");
      setFriseure(res.data || []);
    } catch (err) {
      console.error("Fehler beim Laden der Friseure:", err);
    }
  };

  const mapAppointments = (rows = []) => {
    const out = [];
    rows.forEach((appt, i) => {
      const dateStr = appt.date;
      const timeStr = appt.time;     // "HH:MM"
      const dur = Number(appt.duration) || 60;

      // Build start date
      const startIso = `${dateStr}T${timeStr}:00`;
      const start = new Date(startIso);

      if (!(start instanceof Date) || !isValidDate(start)) {
        console.warn("[UI] Skipping invalid appointment start:", appt);
        return;
      }

      const end = new Date(start.getTime() + dur * 60000);
      if (!(end instanceof Date) || !isValidDate(end) || end <= start) {
        console.warn("[UI] Fixing invalid end; using +60m fallback:", appt);
      }

      out.push({
        id: appt.id ?? i,
        title: `${appt.name} – ${appt.service}`,
        start,
        end: ((end instanceof Date) && isValidDate(end) && end > start) ? end : new Date(start.getTime() + 60 * 60000),
        service: appt.service,
        name: appt.name,
        reservation_code: appt.reservation_code,
        phone: appt.phone,
        duration: dur,
        friseur_id: appt.friseur_id ?? null,
        friseur_name: appt.friseur_name ?? "",
        resourceId: appt.friseur_id ?? undefined, // for resource view
      });
    });
    return out;
  };

  const loadAppointments = async (friseurId = "all") => {
    setLoading(true);
    setLoadError("");
    try {
      let res = await api.get("/appointments");
      const all = mapAppointments(res.data);
      // filter client-side by friseur
      let base = all;
      if (friseurId !== "all") {
        base = all.filter((e) => `${e.friseur_id}` === `${friseurId}`);
      }
      setEvents(base);
      setFilteredEvents(applySearch(base, searchTerm));
    } catch (err) {
      console.error("Fehler beim Laden der Termine:", err);
      setLoadError("Termine konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

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

  useEffect(() => {
    setFilteredEvents(applySearch(events, searchTerm));
  }, [searchTerm, events]);

  useEffect(() => {
    loadAppointments(selectedFriseur);
  }, [selectedFriseur]);

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
        boxShadow: "0 8px 20px rgba(0,0,0,0.08)",
        cursor: "pointer",
        transition: "transform 0.2s ease",
        zIndex: 1,
      },
    };
  };

  const fetchFreeTimes = async (date, duration, friseur_id) => {
    const dateStr = format(date, "yyyy-MM-dd");
    try {
      const res = await api.post("/free-times", { date: dateStr, duration, friseur_id });
      setFreeTimes(res.data.slots || []);
    } catch (err) {
      console.error("Fehler beim Abrufen der freien Zeiten:", err);
    }
  };

  const handleEditStart = async () => {
    if (!selectedEvent) return;
    setEditDate(selectedEvent.start);
    setEditTime(format(selectedEvent.start, "HH:mm"));
    setEditMode(true);
    await fetchFreeTimes(selectedEvent.start, selectedEvent.duration, selectedEvent.friseur_id);
  };

  const handleDateChange = async (date) => {
    setEditDate(date);
    if (!selectedEvent) return;
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

  const handleDelete = async () => {
    if (!selectedEvent) return;
    const code = selectedEvent.reservation_code;
    if (!code) {
      alert("Für diese Veranstaltung wurde kein Reservierungscode gefunden.");
      return;
    }
    const ok = window.confirm(
      `Sollte ${selectedEvent.name}'s Termin(«${selectedEvent.service}») abgesagt werden?`
    );
    if (!ok) return;

    try {
      setDeleting(true);
      const res = await api.delete(`/cancel-reservation/${code}`);
      const msg = res?.data?.message || "Erledigt.";
      alert(msg);
      setSelectedEvent(null);
      await loadAppointments(selectedFriseur);
    } catch (err) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        (err?.response?.status === 404
          ? "Reservierung nicht gefunden (404)."
          : "Das Löschen ist fehlgeschlagen.");
      alert(msg);
      console.error("Fehler beim Löschen:", err);
    } finally {
      setDeleting(false);
    }
  };

  // Legend for stylists
  const legend = useMemo(() => {
    const list = selectedFriseur === "all" ? friseure : friseure.filter((f) => `${f.id}` === `${selectedFriseur}`);
    return list.map((f) => ({ id: f.id, name: f.name, color: friseurColor(f.id) }));
  }, [friseure, selectedFriseur]);

  // Resources (for column view)
  const resources = useMemo(() => {
    if (!resourceView) return [];
    const list = selectedFriseur === "all" ? friseure : friseure.filter((f) => `${f.id}` === `${selectedFriseur}`);
    return list.map((f) => ({ resourceId: f.id, resourceTitle: f.name }));
  }, [friseure, selectedFriseur, resourceView]);

  return (
    <div className="w-full p-4 bg-gradient-to-br from-white via-gray-50 to-gray-100 dark:from-gray-800 dark:via-gray-900 dark:to-gray-800 rounded-2xl shadow-xl">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 gap-3 w-full">
        <h2 className="text-2xl font-bold text-gray-700 dark:text-gray-100">📆 Termin-Kalender</h2>

        <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
          {/* Stylist filter */}
          <select
            className="border px-3 py-2 rounded shadow focus:ring-2 focus:ring-blue-400 w-full md:w-56"
            value={selectedFriseur}
            onChange={(e) => setSelectedFriseur(e.target.value)}
          >
            <option value="all">👥 Alle Friseure</option>
            {friseure.map((f) => (
              <option key={f.id} value={f.id}>💇 {f.name}</option>
            ))}
          </select>

          {/* Resource view toggle */}
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={resourceView}
              onChange={(e) => setResourceView(e.target.checked)}
              className="rounded"
            />
            Spalten nach Friseur
          </label>

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
          <span key={l.id} className="inline-flex items-center gap-2 px-3 py-1 rounded-full border bg-white shadow-sm">
            <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: l.color }} title={l.name} />
            <span className="text-sm text-gray-700">{l.name}</span>
          </span>
        ))}
      </div>

      {/* Loading / error states */}
      {loading && <div className="p-3 text-sm text-gray-600">⏳ Termine werden geladen…</div>}
      {loadError && <div className="p-3 text-sm text-red-600">{loadError}</div>}

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
          resources={resourceView ? resources : undefined}
          resourceIdAccessor="resourceId"
          resourceTitleAccessor="resourceTitle"
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
          onDoubleClickEvent={(event) => {
            setSelectedEvent(event);
            setTimeout(() => handleEditStart(), 0);
          }}
          step={15}
          timeslots={2}
          min={new Date(1970, 0, 1, 8, 0, 0)}
          max={new Date(1970, 0, 1, 20, 0, 0)}
        />
      </div>

      {showAddModal && (
        <AddAppointmentModal
          friseure={friseure}
          defaultFriseurId={selectedFriseur === "all" ? null : selectedFriseur}
          onClose={() => setShowAddModal(false)}
          onAdd={() => loadAppointments(selectedFriseur)}
        />
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-2xl shadow-2xl max-w-md w-full border border-gray-200 dark:border-gray-700">
            <h3 className="text-xl font-bold mb-2 text-blue-700 dark:text-blue-300">🔎 Termin-Details</h3>

            {!editMode ? (
              <>
                <p className="mb-1"><span className="font-semibold">Name:</span> {selectedEvent.name}</p>
                <p className="mb-1"><span className="font-semibold">mobile:</span> {selectedEvent.phone}</p>
                <p className="mb-1"><span className="font-semibold">Service:</span> {selectedEvent.service}</p>
                <p className="mb-1"><span className="font-semibold">Friseur:</span> {selectedEvent.friseur_name || selectedEvent.friseur_id}</p>
                <p className="mb-2"><span className="font-semibold">Zeit:</span> {format(selectedEvent.start, "HH:mm")} – {format(selectedEvent.end, "HH:mm")}</p>
                <p className="mb-4 text-xs text-gray-500">Code: {selectedEvent.reservation_code}</p>

                <div className="flex justify-end flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400 transition"
                  >
                    Schließen
                  </button>

                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className={`px-4 py-2 text-white rounded transition ${
                      deleting ? "bg-red-400 cursor-not-allowed" : "bg-red-600 hover:bg-red-700"
                    }`}
                  >
                    {deleting ? "Löschen…" : "❌ Löschen"}
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
