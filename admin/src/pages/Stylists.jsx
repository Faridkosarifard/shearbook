import { useEffect, useState } from "react";
import api from "../api";

export default function Stylists() {
  const [rows, setRows] = useState([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setRows((await api.get("/stylists")).data);
  }
  useEffect(() => { load().catch(() => setError("Could not load stylists.")); }, []);

  async function add(event) {
    event.preventDefault();
    try {
      await api.post("/stylists", { name, active: true });
      setName("");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not add the stylist.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Stylists</h1>
      <p className="text-ink/60">Each stylist gets their own calendar when you add them.</p>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <form onSubmit={add} className="bg-white rounded-2xl p-6 shadow-sm flex gap-3">
        <input className="flex-1 border border-mist rounded-lg px-3 py-2" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <button className="bg-ink text-cream rounded-lg px-4 py-2">Add stylist</button>
      </form>
      <div className="bg-white rounded-2xl shadow-sm divide-y divide-mist">
        {rows.map((row) => (
          <div key={row.id} className="p-4 flex items-center justify-between gap-4">
            <div>
              <div className="font-medium">{row.name}</div>
              <div className="text-xs text-ink/50">{row.calendar_id}</div>
            </div>
            <label className="text-sm flex items-center gap-2">
              <input type="checkbox" checked={row.active} onChange={() => api.put(`/stylists/${row.id}`, { active: !row.active }).then(load)} />
              Active
            </label>
            <button className="text-red-700 text-sm" onClick={() => api.delete(`/stylists/${row.id}`).then(load).catch((err) => setError(err.response?.data?.message || "Delete failed."))}>Delete</button>
          </div>
        ))}
      </div>
    </div>
  );
}
