import { useEffect, useState } from "react";
import api from "./api";
import { CalendarDays, CalendarCheck, Users, Star } from "lucide-react";

export default function DashboardOverview() {
  const [todayAppointments, setTodayAppointments] = useState([]);
  const [weeklyCount, setWeeklyCount] = useState(0);
  const [customerCount, setCustomerCount] = useState(0);
  const [topServices, setTopServices] = useState([]);

  useEffect(() => {
    api
      .get("/appointments/today")
      .then((res) => setTodayAppointments(res.data))
      .catch((err) => console.error("Fehler bei heute:", err));

    api
      .get("/appointments/week-count")
      .then((res) => setWeeklyCount(res.data.count))
      .catch((err) => console.error("Fehler bei Woche:", err));

    api
      .get("/customers/count")
      .then((res) => setCustomerCount(res.data.count))
      .catch((err) => console.error("Fehler bei Kunden:", err));

    api
      .get("/services/top")
      .then((res) => setTopServices(res.data))
      .catch((err) => console.error("Fehler bei Top Services:", err));
  }, []);

  return (
    <div className="space-y-6 w-full">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div className="bg-blue-100 p-5 rounded-xl shadow flex items-center gap-4 w-full">
          <CalendarDays className="text-blue-700 w-8 h-8" />
          <div>
            <p className="text-2xl font-bold text-blue-800">{todayAppointments.length}</p>
            <p className="text-sm text-blue-700">📅 Nütige Termine</p>
          </div>
        </div>

        <div className="bg-yellow-100 p-5 rounded-xl shadow flex items-center gap-4 w-full">
          <CalendarCheck className="text-yellow-700 w-8 h-8" />
          <div>
            <p className="text-2xl font-bold text-yellow-800">{weeklyCount}</p>
            <p className="text-sm text-yellow-700">📈 Termine diese Woche</p>
          </div>
        </div>

        <div className="bg-green-100 p-5 rounded-xl shadow flex items-center gap-4 w-full">
          <Users className="text-green-700 w-8 h-8" />
          <div>
            <p className="text-2xl font-bold text-green-800">{customerCount}</p>
            <p className="text-sm text-green-700">👥 Kunden insgesamt</p>
          </div>
        </div>

        <div className="bg-purple-100 p-5 rounded-xl shadow flex items-center gap-4 w-full">
          <Star className="text-purple-700 w-8 h-8" />
          <div>
            <p className="text-xl font-semibold text-purple-800">Top Services:</p>
            <ul className="text-sm text-purple-700 list-disc ml-4">
              {topServices.map((s, i) => (
                <li key={i}>
                  {s.service} ({s.count})
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow w-full">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3">
            📋 Termine heute
          </h2>
          {todayAppointments.length === 0 ? (
            <p className="text-gray-500">Keine Termine für heute.</p>
          ) : (
            <ul className="space-y-2">
              {todayAppointments.map((appt, i) => (
                <li
                  key={i}
                  className="p-2 border rounded flex justify-between items-center text-sm"
                >
                  <span>
                    {appt.name} –{" "}
                    <span className="font-medium text-gray-700 dark:text-gray-300">
                      {appt.service}
                    </span>
                  </span>
                  <span className="text-gray-500 font-mono">{appt.time}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow w-full">
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
            <Star className="w-5 h-5 text-purple-600" /> Beliebteste Services
          </h2>
          {topServices.length === 0 ? (
            <p className="text-gray-500">Keine Daten verfügbar.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {topServices.map((s, i) => (
                <li key={i} className="flex justify-between border-b pb-1">
                  <span>
                    {i + 1}. {s.service}
                  </span>
                  <span className="text-purple-700 font-mono">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
