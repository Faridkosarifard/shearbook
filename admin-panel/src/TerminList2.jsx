import { useEffect, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { format, parse, startOfWeek, getDay } from "date-fns";
import de from "date-fns/locale/de";
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

function getColorForService(serviceName) {
  if (serviceName.toLowerCase().includes("damen")) return "#fbbf24";
  if (serviceName.toLowerCase().includes("herren")) return "#60a5fa";
  return "#a78bfa";
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

  const loadAppointments = () => {
    axios
      .get("http://localhost:5000/appointments")
      .then((res) => {
        const kalenderEvents = res.data.map((appt) => {
          const start = new Date(`${appt.date}T${appt.time}`);
          const end = new Date(start.getTime() + appt.duration * 60 * 1000);
          return {
            title: `${appt.name} – ${appt.service}`,
            start,
            end,
            service: appt.service,
            name: appt.name,
            reservation_code: appt.reservation_code,
            duration: appt.duration || 60,
          };
        });
        setEvents(kalenderEvents);
        setFilteredEvents(kalenderEvents);
      })
      .catch((err) => console.error("Fehler beim Laden der Termine:", err));
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  useEffect(() => {
    const term = searchTerm.toLowerCase();
    const filtered = events.filter(
      (ev) =>
        ev.name?.toLowerCase().includes(term) ||
        ev.service?.toLowerCase().includes(term) ||
        format(ev.start, "yyyy-MM-dd").includes(term),
    );
    setFilteredEvents(filtered);
  }, [searchTerm, events]);

  const eventStyleGetter = (event) => {
    const backgroundColor = getColorForService(event.service || "");
    return {
      style: {
        backgroundColor,
        borderRadius: "12px",
        border: "1px solid #e2e8f0",
        color: "#ffffff",
        padding: "6px 12px",
        fontSize: "0.95rem",
        boxShadow: "0 1px 4px rgba(0, 0, 0, 0.15)",
        cursor: "pointer",
        transition: "all 0.2s ease-in-out",
      },
    };
  };

  const handleDelete = async () => {
    if (!selectedEvent?.reservation_code) return;
    if (!confirm("Diesen Termin wirklich löschen?")) return;
    try {
      await axios.delete(
        `http://localhost:5000/cancel-reservation/${selectedEvent.reservation_code}`,
      );
      setEvents(events.filter((e) => e.reservation_code !== selectedEvent.reservation_code));
      setSelectedEvent(null);
    } catch (err) {
      console.error("Fehler beim Löschen:", err);
      alert("Löschen fehlgeschlagen.");
    }
  };

  const handleEditStart = async () => {
    setEditDate(selectedEvent.start);
    setEditTime(format(selectedEvent.start, "HH:mm"));
    setEditMode(true);
    await fetchFreeTimes(selectedEvent.start, selectedEvent.duration);
  };

  const fetchFreeTimes = async (date, duration) => {
    const dateStr = format(date, "yyyy-MM-dd");
    try {
      const res = await axios.post("http://localhost:5000/free-times", { date: dateStr, duration });
      setFreeTimes(res.data.slots || []);
    } catch (err) {
      console.error("Fehler beim Abrufen der freien Zeiten:", err);
    }
  };

  const handleDateChange = async (date) => {
    setEditDate(date);
    await fetchFreeTimes(date, selectedEvent.duration);
  };

  const handleEditSubmit = async () => {
    try {
      const dateStr = format(editDate, "yyyy-MM-dd");
      await axios.put(
        `http://localhost:5000/update-reservation/${selectedEvent.reservation_code}`,
        {
          new_date: dateStr,
          new_time: editTime,
        },
      );
      setSelectedEvent(null);
      setEditMode(false);
      loadAppointments();
    } catch (err) {
      console.error("Fehler beim Aktualisieren:", err);
      alert("Aktualisierung fehlgeschlagen.");
    }
  };

  return (
    <div className="w-full p-4 bg-white dark:bg-gray-800 rounded shadow">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3 w-full">
        <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-100">
          📆 Wochenansicht der Termine
        </h2>
        <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
          <input
            type="text"
            placeholder="🔍 Suche nach Name, Service oder Datum"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="border px-3 py-2 rounded w-full sm:w-64"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 w-full sm:w-auto"
          >
            ➕ Termin hinzufügen
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <Calendar
          localizer={localizer}
          events={filteredEvents}
          startAccessor="start"
          endAccessor="end"
          defaultView={Views.WEEK}
          views={[Views.WEEK, Views.DAY, Views.MONTH]}
          style={{ height: 600, width: "100%" }}
          className="rounded border border-gray-200 dark:border-gray-700"
          eventPropGetter={eventStyleGetter}
          popup
          messages={{
            week: "Woche",
            day: "Tag",
            month: "Monat",
            today: "Heute",
            previous: "Zurück",
            next: "Weiter",
          }}
          onSelectEvent={(event) => setSelectedEvent(event)}
        />
      </div>

      {showAddModal && (
        <AddAppointmentModal onClose={() => setShowAddModal(false)} onAdd={loadAppointments} />
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-900 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-bold mb-2 text-blue-700 dark:text-blue-300">
              🔎 Termin-Details
            </h3>

            {!editMode ? (
              <>
                <p className="mb-1">
                  <span className="font-semibold">Name:</span> {selectedEvent.name}
                </p>
                <p className="mb-1">
                  <span className="font-semibold">Service:</span> {selectedEvent.service}
                </p>
                <p className="mb-4">
                  <span className="font-semibold">Zeit:</span>{" "}
                  {format(selectedEvent.start, "HH:mm")} – {format(selectedEvent.end, "HH:mm")}
                </p>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setSelectedEvent(null)}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                  >
                    Schließen
                  </button>
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                  >
                    ❌ Löschen
                  </button>
                  <button
                    onClick={handleEditStart}
                    className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
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
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end space-x-3">
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2 bg-gray-300 text-gray-800 rounded hover:bg-gray-400"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleEditSubmit}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
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
