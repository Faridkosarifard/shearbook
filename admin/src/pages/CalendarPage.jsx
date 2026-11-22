import { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, Views } from "react-big-calendar";
import { format, parse, startOfWeek, getDay, startOfDay, endOfDay } from "date-fns";
import { enUS } from "date-fns/locale";
import "react-big-calendar/lib/css/react-big-calendar.css";
import api from "../api";

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { "en-US": enUS },
});

export default function CalendarPage() {
  const [events, setEvents] = useState([]);
  const [stylists, setStylists] = useState([]);
  const [filter, setFilter] = useState("all");
  const [range, setRange] = useState({ start: startOfWeek(new Date(), { weekStartsOn: 1 }), end: endOfDay(new Date()) });
  const [form, setForm] = useState(null);
  const [services, setServices] = useState([]);
  const [error, setError] = useState("");

  async function load(start, end) {
    const from = format(start, "yyyy-MM-dd");
    const to = format(end, "yyyy-MM-dd");
    const [appts, st, sv] = await Promise.all([
      api.get("/appointments", { params: { from, to } }),
      api.get("/stylists"),
      api.get("/services"),
    ]);
    setStylists(st.data);
    setServices(sv.data);
    setEvents(
      appts.data.map((row) => {
        const startAt = new Date(`${row.date}T${row.time}`);
        const endAt = new Date(startAt.getTime() + (row.duration || 30) * 60000);
        return { title: `${row.name} · ${row.service}`, start: startAt, end: endAt, resource: row };
      }),
    );
  }

  useEffect(() => {
    load(range.start, range.end).catch(() => setError("Could not load appointments."));
  }, [range.start, range.end]);

  const visible = useMemo(
    () => (filter === "all" ? events : events.filter((e) => String(e.resource.stylist_id) === filter)),
    [events, filter],
  );

  async function create(event) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/appointments", {
        name: form.name,
        phone: form.phone,
        service_id: Number(form.service_id),
        stylist_id: Number(form.stylist_id),
        start: form.start,
      });
      setForm(null);
      await load(range.start, range.end);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create the appointment.");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold">Calendar</h1>
          <p className="text-ink/60 mt-1">Week, day and month views of the book.</p>
        </div>
        <div className="flex gap-3">
          <select className="rounded-lg border border-mist px-3 py-2 bg-white" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All stylists</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
          <button className="bg-ink text-cream rounded-lg px-4 py-2" onClick={() => setForm({ name: "", phone: "", service_id: services[0]?.id || "", stylist_id: stylists[0]?.id || "", start: "" })}>
            New appointment
          </button>
        </div>
      </div>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <div className="bg-white rounded-2xl p-4 shadow-sm" style={{ height: 720 }}>
        <Calendar
          localizer={localizer}
          events={visible}
          startAccessor="start"
          endAccessor="end"
          views={[Views.MONTH, Views.WEEK, Views.DAY]}
          defaultView={Views.WEEK}
          onRangeChange={(value) => {
            if (Array.isArray(value)) {
              setRange({ start: startOfDay(value[0]), end: endOfDay(value[value.length - 1]) });
            } else if (value.start && value.end) {
              setRange({ start: startOfDay(value.start), end: endOfDay(value.end) });
            }
          }}
        />
      </div>
      {form ? (
        <form onSubmit={create} className="bg-white rounded-2xl p-6 shadow-sm grid grid-cols-2 gap-4">
          <h2 className="col-span-2 font-medium">New appointment</h2>
          <input required placeholder="Customer name" className="border border-mist rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input required placeholder="Phone" className="border border-mist rounded-lg px-3 py-2" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <select className="border border-mist rounded-lg px-3 py-2" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration} min)</option>)}
          </select>
          <select className="border border-mist rounded-lg px-3 py-2" value={form.stylist_id} onChange={(e) => setForm({ ...form, stylist_id: e.target.value })}>
            {stylists.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <input required type="datetime-local" className="border border-mist rounded-lg px-3 py-2 col-span-2" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          <div className="col-span-2 flex gap-3">
            <button className="bg-ink text-cream rounded-lg px-4 py-2">Save</button>
            <button type="button" className="px-4 py-2" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
