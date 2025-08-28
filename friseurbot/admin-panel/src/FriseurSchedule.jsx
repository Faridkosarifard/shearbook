import React, { useEffect, useMemo, useState } from "react";
import api from "./api";
import dayjs from "dayjs";

// Change this to '/api' if your backend is mounted under /api
const API_PREFIX = "";

/** Weekday helpers */
const WEEKDAYS = [
  { num: 0, label: "Monday" },
  { num: 1, label: "Tuesday" },
  { num: 2, label: "Wednesday" },
  { num: 3, label: "Thursday" },
  { num: 4, label: "Friday" },
  { num: 5, label: "Saturday" },
  { num: 6, label: "Sunday" },
];

/** Validate "HH:MM" format */
function isValidHHMM(v) {
  return /^\d{2}:\d{2}$/.test(v || "");
}

/** Sort time strings HH:MM asc */
function sortTimesAsc(a, b) {
  return a.localeCompare(b);
}

/** Compact UI message helper */
function notify(ok, msg) {
  if (ok) {
    console.log(msg);
  } else {
    console.warn(msg);
  }
  // You can swap with a toast library if you have one
  alert(msg);
}

function enumerateDatesInclusive(startISO, endISO) {
  const start = dayjs(startISO, "YYYY-MM-DD");
  const end = dayjs(endISO, "YYYY-MM-DD");
  if (!start.isValid() || !end.isValid()) return [];
  const out = [];
  for (let d = start; d.diff(end, "day") <= 0; d = d.add(1, "day")) {
    out.push(d.format("YYYY-MM-DD"));
  }
  return out;
}

export default function FriseurSchedulePage() {
  const [loading, setLoading] = useState(false);
  const [friseurs, setFriseurs] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [weekly, setWeekly] = useState([]); // [{weekday, start, end, id?}]
  const [exceptions, setExceptions] = useState([]); // [{id, date, type, start?, end?, note?}]
  const [exForm, setExForm] = useState({ type: "OFF", date: "", start: "", end: "", note: "" });
  const [range, setRange] = useState({ startDate: "", endDate: "" }); // YYYY-MM-DD
  const [rangeMode, setRangeMode] = useState(false);
  const [saving, setSaving] = useState(false);

  /** Group weekly by weekday for rendering */
  const weeklyByDay = useMemo(() => {
    const map = new Map();
    WEEKDAYS.forEach((d) => map.set(d.num, []));
    weekly.forEach((w) => {
      const arr = map.get(w.weekday) || [];
      arr.push(w);
      map.set(w.weekday, arr);
    });
    // sort each day's ranges
    WEEKDAYS.forEach((d) => {
      const arr = map.get(d.num);
      arr.sort((a, b) => sortTimesAsc(a.start, b.start));
    });
    return map;
  }, [weekly]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Backend list of stylists
        const res = await api.get(`${API_PREFIX}/friseure`);
        const items = res.data?.items || res.data || [];
        setFriseurs(items);
      } catch (e) {
        notify(false, "Failed to load stylists.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function loadSchedule(id) {
    if (!id) return;
    setSelectedId(id);
    setLoading(true);
    try {
      const res = await api.get(`${API_PREFIX}/friseure/${id}/schedule`);
      const w = res.data?.weekly || [];
      const ex = res.data?.exceptions || [];
      setWeekly(w);
      setExceptions(ex);
    } catch (e) {
      notify(false, "Failed to load schedule.");
      setWeekly([]);
      setExceptions([]);
    } finally {
      setLoading(false);
    }
  }

  /** Weekly editor operations */
  function addRange(weekday) {
    const start = "09:00";
    const end = "18:00";
    setWeekly((prev) => [...prev, { weekday, start, end }]);
  }

  function updateRange(weekday, indexInDay, field, value) {
    setWeekly((prev) => {
      // rebuild by finding the Nth item belonging to the day
      let count = -1;
      return prev.map((item) => {
        if (item.weekday !== weekday) return item;
        count += 1;
        if (count !== indexInDay) return item;
        const next = { ...item, [field]: value };
        return next;
      });
    });
  }

  function removeRange(weekday, indexInDay) {
    setWeekly((prev) => {
      let count = -1;
      return prev.filter((item) => {
        if (item.weekday !== weekday) return true;
        count += 1;
        return count !== indexInDay;
      });
    });
  }

  function validateWeekly() {
    // Basic validation: times format + start < end
    for (const item of weekly) {
      if (!isValidHHMM(item.start) || !isValidHHMM(item.end)) {
        return "Invalid time format in weekly hours.";
      }
      if (item.end <= item.start) {
        return "Weekly hour ranges must have end > start.";
      }
    }
    return null;
  }

  async function saveWeekly() {
    if (!selectedId) return;
    const err = validateWeekly();
    if (err) {
      notify(false, err);
      return;
    }
    setSaving(true);
    try {
      const payload = {
        weekly: weekly.map((w) => ({
          weekday: Number(w.weekday),
          start: w.start,
          end: w.end,
        })),
      };
      await api.put(`${API_PREFIX}/friseure/${selectedId}/schedule`, payload);
      notify(true, "Weekly schedule saved.");
      await loadSchedule(selectedId); // reload to normalize order/ids
    } catch (e) {
      notify(false, e?.response?.data?.message || "Failed to save weekly schedule.");
    } finally {
      setSaving(false);
    }
  }

  /** Exceptions operations */
  function validateExceptionForm() {
    if (!rangeMode) {
      if (!exForm.date) return "Date is required.";
    } else {
      if (!range.startDate || !range.endDate) return "Start and end dates are required for range mode.";
      if (dayjs(range.endDate).isBefore(dayjs(range.startDate), "day")) {
        return "End date must be on or after start date.";
      }
      // Optional: cap extremely large ranges
      const days = enumerateDatesInclusive(range.startDate, range.endDate).length;
      if (days > 90) return "Range too large (limit 90 days).";
    }
    if (exForm.type === "CUSTOM") {
      if (!isValidHHMM(exForm.start) || !isValidHHMM(exForm.end)) {
        return "Start and end times are required and must be HH:MM.";
      }
      if (exForm.end <= exForm.start) {
        return "Custom exception must have end > start.";
      }
    }
    return null;
  }

  async function addExceptionRange() {
    if (!selectedId) return;
    const days = enumerateDatesInclusive(range.startDate, range.endDate);
    if (days.length === 0) {
      notify(false, "Invalid date range.");
      return;
    }
  
    // Confirm for large ranges
    if (days.length > 14) {
      const ok = window.confirm(`This will create ${days.length} OFF/CUSTOM exceptions (one per day). Continue?`);
      if (!ok) return;
    }
  
    setSaving(true);
    try {
      const requests = days.map((d) => {
        const payload = {
          type: exForm.type,
          date: d,
          note: exForm.note || undefined,
          ...(exForm.type === "CUSTOM" ? { start: exForm.start, end: exForm.end } : {}),
        };
        return api.post(`${API_PREFIX}/friseure/${selectedId}/exceptions`, payload);
      });
  
      const results = await Promise.allSettled(requests);
      const okCount = results.filter((r) => r.status === "fulfilled").length;
      const failCount = results.length - okCount;
  
      notify(true, `Added ${okCount} day(s).${failCount ? ` ${failCount} failed.` : ""}`);
      // Reset form
      setExForm({ type: "OFF", date: "", start: "", end: "", note: "" });
      setRange({ startDate: "", endDate: "" });
      setRangeMode(false);
      await loadSchedule(selectedId);
    } catch (e) {
      notify(false, e?.response?.data?.message || "Failed to add range exceptions.");
    } finally {
      setSaving(false);
    }
  }

  async function addException() {
    if (!selectedId) return;
    const err = validateExceptionForm();
    if (err) {
      notify(false, err);
      return;
    }
    if (rangeMode) {
      return addExceptionRange();
    }
    setSaving(true);
    try {
      const payload = {
        type: exForm.type,
        date: exForm.date,
        note: exForm.note || undefined,
        ...(exForm.type === "CUSTOM" ? { start: exForm.start, end: exForm.end } : {}),
      };
      await api.post(`${API_PREFIX}/friseure/${selectedId}/exceptions`, payload);
      notify(true, "Exception added.");
      setExForm({ type: "OFF", date: "", start: "", end: "", note: "" });
      await loadSchedule(selectedId);
    } catch (e) {
      notify(false, e?.response?.data?.message || "Failed to add exception.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteException(exId) {
    if (!selectedId || !exId) return;
    if (!window.confirm("Delete this exception?")) return;
    setSaving(true);
    try {
      await api.delete(`${API_PREFIX}/friseure/${selectedId}/exceptions/${exId}`);
      notify(true, "Exception deleted.");
      await loadSchedule(selectedId);
    } catch (e) {
      notify(false, e?.response?.data?.message || "Failed to delete exception.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Stylist Working Hours & Exceptions</h1>

      {/* Stylist selector */}
      <div className="flex gap-3 items-end">
        <div className="w-72">
          <label className="block text-sm font-medium mb-1">Stylist</label>
          <select
            className="w-full border rounded p-2"
            value={selectedId}
            onChange={(e) => loadSchedule(e.target.value)}
            disabled={loading}
          >
            <option value="">— Select a stylist —</option>
            {friseurs.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </div>

        <button
          className="px-4 py-2 rounded bg-gray-100 border"
          onClick={() => selectedId && loadSchedule(selectedId)}
          disabled={!selectedId || loading}
          title="Reload"
        >
          Reload
        </button>
      </div>

      {selectedId ? (
        <>
          {/* Weekly template editor */}
          <div className="rounded-xl border p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Weekly Template</h2>
              <button
                onClick={saveWeekly}
                disabled={saving}
                className="px-4 py-2 rounded bg-black text-white"
              >
                {saving ? "Saving..." : "Save Weekly"}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {WEEKDAYS.map(({ num, label }) => {
                const rows = weeklyByDay.get(num) || [];
                return (
                  <div key={num} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-medium">{label}</div>
                      <button
                        className="text-sm px-2 py-1 rounded bg-blue-600 text-white"
                        onClick={() => addRange(num)}
                      >
                        + Add range
                      </button>
                    </div>

                    {rows.length === 0 && <div className="text-sm text-gray-500">No ranges.</div>}

                    <div className="space-y-2">
                      {rows.map((r, idx) => (
                        <div key={idx} className="flex gap-2 items-center">
                          <input
                            type="time"
                            className="border rounded p-2"
                            value={r.start}
                            onChange={(e) => updateRange(num, idx, "start", e.target.value)}
                          />
                          <span>—</span>
                          <input
                            type="time"
                            className="border rounded p-2"
                            value={r.end}
                            onChange={(e) => updateRange(num, idx, "end", e.target.value)}
                          />
                          <button
                            className="ml-auto text-sm px-2 py-1 rounded bg-red-600 text-white"
                            onClick={() => removeRange(num, idx)}
                          >
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Exceptions */}
          <div className="rounded-xl border p-4">
            <h2 className="font-semibold mb-3">Exceptions</h2>

            {/* Add exception form */}
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end mb-4">
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  className="w-full border rounded p-2"
                  value={exForm.type}
                  onChange={(e) => setExForm((s) => ({ ...s, type: e.target.value }))}
                >
                  <option value="OFF">OFF (day off)</option>
                  <option value="CUSTOM">CUSTOM (custom hours)</option>
                </select>
              </div>

              {/* Range toggle */}
              <div>
                <label className="block text-sm font-medium mb-1">Mode</label>
                <label className="inline-flex items-center gap-2 border rounded p-2 h-10">
                  <input
                    type="checkbox"
                    checked={rangeMode}
                    onChange={(e) => setRangeMode(e.target.checked)}
                  />
                  <span>Range (vacation)</span>
                </label>
              </div>

              {/* Single date OR Range dates */}
              {!rangeMode ? (
                <div>
                  <label className="block text-sm font-medium mb-1">Date</label>
                  <input
                    type="date"
                    className="w-full border rounded p-2"
                    value={exForm.date}
                    onChange={(e) => setExForm((s) => ({ ...s, date: e.target.value }))}
                  />
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Start date</label>
                    <input
                      type="date"
                      className="w-full border rounded p-2"
                      value={range.startDate}
                      onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End date</label>
                    <input
                      type="date"
                      className="w-full border rounded p-2"
                      value={range.endDate}
                      onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
                    />
                  </div>
                </>
              )}

              {exForm.type === "CUSTOM" && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1">Start</label>
                    <input
                      type="time"
                      className="w-full border rounded p-2"
                      value={exForm.start}
                      onChange={(e) => setExForm((s) => ({ ...s, start: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">End</label>
                    <input
                      type="time"
                      className="w-full border rounded p-2"
                      value={exForm.end}
                      onChange={(e) => setExForm((s) => ({ ...s, end: e.target.value }))}
                    />
                  </div>
                </>
              )}

                <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1">Note (optional)</label>
                <input
                  type="text"
                  className="w-full border rounded p-2"
                  value={exForm.note}
                  onChange={(e) => setExForm((s) => ({ ...s, note: e.target.value }))}
                  placeholder="Short note"
                />
              </div>

              <div>
                <button
                  onClick={addException}
                  disabled={saving || !selectedId}
                  className="w-full px-4 py-2 rounded bg-green-600 text-white"
                >
                  {saving ? "Saving..." : "Add"}
                </button>
              </div>
            </div>

            {/* Exceptions list */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left p-2 border">Date</th>
                    <th className="text-left p-2 border">Type</th>
                    <th className="text-left p-2 border">Start</th>
                    <th className="text-left p-2 border">End</th>
                    <th className="text-left p-2 border">Note</th>
                    <th className="text-left p-2 border">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {exceptions.length === 0 && (
                    <tr>
                      <td className="p-3 border text-gray-500" colSpan={6}>
                        No exceptions.
                      </td>
                    </tr>
                  )}
                  {exceptions.map((ex) => (
                    <tr key={ex.id}>
                      <td className="p-2 border">{ex.date}</td>
                      <td className="p-2 border">{ex.type}</td>
                      <td className="p-2 border">{ex.start || "—"}</td>
                      <td className="p-2 border">{ex.end || "—"}</td>
                      <td className="p-2 border">{ex.note || "—"}</td>
                      <td className="p-2 border">
                        <button
                          className="px-2 py-1 rounded bg-red-600 text-white"
                          onClick={() => deleteException(ex.id)}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <div className="text-gray-600">Select a stylist to edit schedule.</div>
      )}
    </div>
  );
}
