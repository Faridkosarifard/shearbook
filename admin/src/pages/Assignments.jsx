import { useEffect, useState } from "react";
import api from "../api";

export default function Assignments() {
  const [stylists, setStylists] = useState([]);
  const [services, setServices] = useState([]);
  const [map, setMap] = useState({});
  const [error, setError] = useState("");

  async function load() {
    const [st, sv] = await Promise.all([api.get("/stylists"), api.get("/services")]);
    setStylists(st.data);
    setServices(sv.data);
    const assigned = await Promise.all(
      st.data.map((row) => api.get(`/stylists/${row.id}/services`)),
    );
    const next = {};
    assigned.forEach((res, i) => {
      for (const service of res.data.services || []) {
        next[`${st.data[i].id}:${service.id}`] = true;
      }
    });
    setMap(next);
  }

  useEffect(() => { load().catch(() => setError("Could not load assignments.")); }, []);

  async function toggle(stylistId, serviceId, on) {
    try {
      if (on) {
        await api.post(`/stylists/${stylistId}/services`, { service_id: serviceId });
      } else {
        await api.delete(`/stylists/${stylistId}/services/${serviceId}`);
      }
      await load();
    } catch (err) {
      setError(err.response?.data?.message || "Update failed.");
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Assignments</h1>
      <p className="text-ink/60">Choose which services each stylist offers.</p>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <div className="overflow-auto bg-white rounded-2xl shadow-sm">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="p-3 text-left">Stylist</th>
              {services.map((s) => <th key={s.id} className="p-3">{s.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {stylists.map((st) => (
              <tr key={st.id} className="border-t border-mist">
                <td className="p-3 font-medium">{st.name}</td>
                {services.map((sv) => {
                  const key = `${st.id}:${sv.id}`;
                  return (
                    <td key={sv.id} className="p-3 text-center">
                      <input type="checkbox" checked={!!map[key]} onChange={(e) => toggle(st.id, sv.id, e.target.checked)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
