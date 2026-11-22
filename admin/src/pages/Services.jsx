import { useEffect, useState } from "react";
import api from "../api";

export default function Services() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: "", duration: 30 });
  const [error, setError] = useState("");

  async function load() {
    setRows((await api.get("/services")).data);
  }
  useEffect(() => { load().catch(() => setError("Could not load services.")); }, []);

  async function save(event) {
    event.preventDefault();
    try {
      if (form.id) {
        await api.put(`/services/${form.id}`, { name: form.name, duration: Number(form.duration) });
      } else {
        await api.post("/services", { name: form.name, duration: Number(form.duration) });
      }
      setForm({ name: "", duration: 30 });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Save failed.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Services</h1>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <form onSubmit={save} className="bg-white rounded-2xl p-6 shadow-sm flex gap-3 items-end">
        <label className="flex-1 text-sm">Name
          <input className="mt-1 w-full border border-mist rounded-lg px-3 py-2" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </label>
        <label className="w-32 text-sm">Minutes
          <input type="number" min="5" className="mt-1 w-full border border-mist rounded-lg px-3 py-2" value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} required />
        </label>
        <button className="bg-ink text-cream rounded-lg px-4 py-2">{form.id ? "Update" : "Add"}</button>
      </form>
      <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-mist/50 text-left"><tr><th className="p-3">Name</th><th>Duration</th><th></th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-mist">
                <td className="p-3">{row.name}</td>
                <td>{row.duration} min</td>
                <td className="p-3 text-right space-x-3">
                  <button onClick={() => api.post(`/services/${row.id}/reorder`, { direction: "up" }).then(load)}>Up</button>
                  <button onClick={() => api.post(`/services/${row.id}/reorder`, { direction: "down" }).then(load)}>Down</button>
                  <button onClick={() => setForm(row)}>Edit</button>
                  <button className="text-red-700" onClick={() => api.delete(`/services/${row.id}`).then(load)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
