import { useEffect, useState } from "react";
import api from "../api";

export default function Blacklist() {
  const [rows, setRows] = useState([]);
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setRows((await api.get("/blacklist")).data);
  }
  useEffect(() => { load().catch(() => setError("Could not load the block list.")); }, []);

  async function add(event) {
    event.preventDefault();
    try {
      await api.post("/blacklist", { phone });
      setPhone("");
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Could not add the number.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Block list</h1>
      <p className="text-ink/60">Blocked numbers cannot book, change, or cancel appointments over WhatsApp.</p>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <form onSubmit={add} className="bg-white rounded-2xl p-6 shadow-sm flex gap-3">
        <input className="flex-1 border border-mist rounded-lg px-3 py-2" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
        <button className="bg-ink text-cream rounded-lg px-4 py-2">Block</button>
      </form>
      <div className="bg-white rounded-2xl shadow-sm divide-y divide-mist">
        {rows.map((row) => (
          <div key={row.id || row.phone} className="p-4 flex justify-between text-sm">
            <div className="font-medium">{row.phone}</div>
            <button className="text-red-700" onClick={() => api.delete(`/blacklist/${encodeURIComponent(row.phone)}`).then(load)}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}
