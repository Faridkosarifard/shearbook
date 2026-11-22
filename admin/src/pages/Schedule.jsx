import { useEffect, useState } from "react";
import api from "../api";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function defaultWeek() {
  return DAYS.map((_, i) => ({ weekday: i, start: "09:00", end: "18:00", closed: i === 6 }));
}

export default function Schedule() {
  const [stylists, setStylists] = useState([]);
  const [stylistId, setStylistId] = useState("");
  const [week, setWeek] = useState(defaultWeek());
  const [exceptions, setExceptions] = useState([]);
  const [exForm, setExForm] = useState({ date: "", type: "OFF", start: "09:00", end: "18:00" });
  const [bulkFrom, setBulkFrom] = useState("");
  const [bulkTo, setBulkTo] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    api.get("/stylists").then((res) => {
      setStylists(res.data);
      if (res.data[0]) setStylistId(String(res.data[0].id));
    }).catch(() => setError("Could not load stylists."));
  }, []);

  useEffect(() => {
    if (!stylistId) return;
    api.get(`/stylists/${stylistId}/schedule`).then((res) => {
      const next = defaultWeek().map((row) => {
        const found = (res.data.weekly || []).find((w) => w.weekday === row.weekday);
        return found ? { weekday: row.weekday, start: found.start, end: found.end, closed: false } : { ...row, closed: true };
      });
      setWeek(next);
      setExceptions(res.data.exceptions || []);
    }).catch(() => setError("Could not load the schedule."));
  }, [stylistId]);

  async function saveWeek(event) {
    event.preventDefault();
    setError("");
    setOk("");
    try {
      await api.put(`/stylists/${stylistId}/schedule`, {
        weekly: week.filter((row) => !row.closed).map(({ weekday, start, end }) => ({ weekday, start, end })),
      });
      setOk("Weekly hours saved.");
    } catch (err) {
      setError(err.response?.data?.message || "Could not save hours.");
    }
  }

  async function reloadExceptions() {
    const res = await api.get(`/stylists/${stylistId}/schedule`);
    setExceptions(res.data.exceptions || []);
  }

  async function addException(event) {
    event.preventDefault();
    try {
      const payload = { date: exForm.date, type: exForm.type };
      if (exForm.type === "CUSTOM") {
        payload.start = exForm.start;
        payload.end = exForm.end;
      }
      await api.post(`/stylists/${stylistId}/exceptions`, payload);
      await reloadExceptions();
    } catch (err) {
      setError(err.response?.data?.message || "Could not add the exception.");
    }
  }

  async function bulkOff(event) {
    event.preventDefault();
    try {
      await api.post(`/stylists/${stylistId}/exceptions/bulk-off`, { start_date: bulkFrom, end_date: bulkTo });
      await reloadExceptions();
    } catch (err) {
      setError(err.response?.data?.message || "Could not mark the dates off.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Schedules</h1>
      <select className="bg-white border border-mist rounded-lg px-3 py-2" value={stylistId} onChange={(e) => setStylistId(e.target.value)}>
        {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      {ok ? <p className="text-green-800 text-sm">{ok}</p> : null}
      <form onSubmit={saveWeek} className="bg-white rounded-2xl p-6 shadow-sm space-y-3">
        <h2 className="font-medium">Weekly hours</h2>
        {week.map((row, i) => (
          <div key={row.weekday} className="flex items-center gap-3 text-sm">
            <span className="w-28">{DAYS[i]}</span>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={row.closed} onChange={(e) => {
                const next = [...week];
                next[i] = { ...row, closed: e.target.checked };
                setWeek(next);
              }} />
              Closed
            </label>
            <input type="time" disabled={row.closed} value={row.start} onChange={(e) => {
              const next = [...week];
              next[i] = { ...row, start: e.target.value };
              setWeek(next);
            }} className="border border-mist rounded-lg px-2 py-1" />
            <span>to</span>
            <input type="time" disabled={row.closed} value={row.end} onChange={(e) => {
              const next = [...week];
              next[i] = { ...row, end: e.target.value };
              setWeek(next);
            }} className="border border-mist rounded-lg px-2 py-1" />
          </div>
        ))}
        <button className="bg-ink text-cream rounded-lg px-4 py-2">Save hours</button>
      </form>
      <form onSubmit={addException} className="bg-white rounded-2xl p-6 shadow-sm flex flex-wrap gap-3 items-end">
        <h2 className="w-full font-medium">Day exception</h2>
        <input type="date" required className="border border-mist rounded-lg px-3 py-2" value={exForm.date} onChange={(e) => setExForm({ ...exForm, date: e.target.value })} />
        <select className="border border-mist rounded-lg px-3 py-2" value={exForm.type} onChange={(e) => setExForm({ ...exForm, type: e.target.value })}>
          <option value="OFF">Off</option>
          <option value="CUSTOM">Custom hours</option>
        </select>
        {exForm.type === "CUSTOM" ? (
          <>
            <input type="time" className="border border-mist rounded-lg px-3 py-2" value={exForm.start} onChange={(e) => setExForm({ ...exForm, start: e.target.value })} />
            <input type="time" className="border border-mist rounded-lg px-3 py-2" value={exForm.end} onChange={(e) => setExForm({ ...exForm, end: e.target.value })} />
          </>
        ) : null}
        <button className="bg-ink text-cream rounded-lg px-4 py-2">Add</button>
      </form>
      <form onSubmit={bulkOff} className="bg-white rounded-2xl p-6 shadow-sm flex gap-3 items-end">
        <label className="text-sm">From<input type="date" required className="block mt-1 border border-mist rounded-lg px-3 py-2" value={bulkFrom} onChange={(e) => setBulkFrom(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" required className="block mt-1 border border-mist rounded-lg px-3 py-2" value={bulkTo} onChange={(e) => setBulkTo(e.target.value)} /></label>
        <button className="bg-ink text-cream rounded-lg px-4 py-2">Mark range off</button>
      </form>
      <ul className="bg-white rounded-2xl shadow-sm divide-y divide-mist">
        {exceptions.map((row) => (
          <li key={row.id || row.date} className="p-4 flex justify-between text-sm">
            <span>{row.date} · {row.type}{row.type === "CUSTOM" ? ` ${row.start}–${row.end}` : ""}</span>
            <button className="text-red-700" onClick={() => api.delete(`/stylists/${stylistId}/exceptions/${row.id}`).then(reloadExceptions)}>Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
