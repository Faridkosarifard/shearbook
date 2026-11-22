import { useEffect, useState } from "react";
import api from "../api";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api
      .get("/dashboard")
      .then((res) => setData(res.data))
      .catch(() => setError("Could not load the dashboard."));
  }, []);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-semibold">Dashboard</h1>
        <p className="text-ink/60 mt-1">Today’s book and a short week summary.</p>
      </header>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="This week" value={data.week_count} />
        <Stat label="Customers" value={data.customer_count} />
        <Stat label="Today" value={data.today?.length || 0} />
      </div>
      <section className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="font-medium mb-4">Today</h2>
        {data.today?.length ? (
          <ul className="divide-y divide-mist">
            {data.today.map((row, i) => (
              <li key={i} className="py-3 flex justify-between text-sm">
                <span className="font-medium w-16">{row.time}</span>
                <span className="flex-1">{row.name}</span>
                <span className="text-ink/60">{row.service}</span>
                <span className="text-ink/60 w-32 text-right">{row.stylist}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink/60 text-sm">No appointments today.</p>
        )}
      </section>
      {data.top_services?.length ? (
        <section className="bg-white rounded-2xl p-6 shadow-sm">
          <h2 className="font-medium mb-4">Popular services</h2>
          <ul className="text-sm space-y-2">
            {data.top_services.map((row) => (
              <li key={row.service} className="flex justify-between">
                <span>{row.service}</span>
                <span className="text-ink/60">{row.count}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm">
      <div className="text-sm text-ink/60">{label}</div>
      <div className="text-3xl font-semibold mt-1">{value}</div>
    </div>
  );
}
