import { useEffect, useMemo, useState } from "react";
import api from "./api";
import { Pencil, Trash2, Save, Plus, X, RotateCcw } from "lucide-react";

const reasonMap = {
  appointment_or_friseur_missing_or_no_calendar: "Kalender/Termin fehlt",
  service_duration_missing: "Servicedauer fehlt",
  no_working_windows_that_day: "An diesem Tag keine Arbeitszeit",
  outside_personal_working_window: "Außerhalb der Arbeitszeit",
  time_conflict_in_google_calendar: "Zeitkonflikt im Google Kalender",
  time_conflict: "Zeitkonflikt",
  fully_booked: "Voll ausgebucht",
  closed_weekly: "Im Wochenplan geschlossen",
  stylist_off: "Stylist ist abwesend",
  global_day_off: "Globaler freier Tag",
  public_holiday: "Feiertag",
  no_windows: "Kein Zeitfenster verfügbar",
};
const humanReason = (r) => reasonMap[r] || r || "Unbekannter Fehler";

export default function FriseurManagement() {
  const [friseure, setFriseure] = useState([]);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);

  // --- Reassign Modal State ---
  const [modalOpen, setModalOpen] = useState(false);
  const [deletingFriseurId, setDeletingFriseurId] = useState(null);

  const [upcomingAppointments, setUpcomingAppointments] = useState([]);
  const [selectedAppointmentIds, setSelectedAppointmentIds] = useState(new Set());
  const [replacementFriseurId, setReplacementFriseurId] = useState(null);

  const [modalStep, setModalStep] = useState("select");

  const [moved, setMoved] = useState([]);   // [{appointment_id, action, event_id}]
  const [failed, setFailed] = useState([]); // [{appointment_id, reason, suggested_slots: ["HH:MM", ...]}]
  const [reassigning, setReassigning] = useState(false);

  const [chosenSlot, setChosenSlot] = useState({}); // { [appointment_id]: "HH:MM" }
  const [reschedulingId, setReschedulingId] = useState(null);

  const showMessage = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const errMsg = (err, fallback) =>
    err?.response?.data?.message || err?.message || fallback;

  const loadFriseure = async () => {
    try {
      const res = await api.get("/friseure");
      setFriseure(res.data || []);
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Laden"), "error");
    }
  };

  useEffect(() => {
    loadFriseure();
  }, []);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e) => e.key === "Escape" && closeModal();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalOpen]);

  useEffect(() => {
    if (!modalOpen) return;
    setUpcomingAppointments((prev) => {
      const copy = [...prev];
      copy.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
      return copy;
    });
  }, [modalOpen]);

  const replacementOptions = useMemo(
    () => friseure.filter((f) => f.id !== deletingFriseurId && f.active),
    [friseure, deletingFriseurId]
  );
  useEffect(() => {
    if (!modalOpen) return;
    if (!replacementFriseurId && replacementOptions.length > 0) {
      setReplacementFriseurId(replacementOptions[0].id);
    }
  }, [modalOpen, replacementOptions, replacementFriseurId]);

  const handleAdd = async () => {
    if (!newName.trim())
      return showMessage("❌ Name darf nicht leer sein", "error");
    try {
      await api.post("/friseure", { name: newName.trim() });
      setNewName("");
      await loadFriseure();
      showMessage("✅ Friseur hinzugefügt");
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Hinzufügen"), "error");
    }
  };

  const handleEdit = (f) => {
    setEditId(f.id);
    setEditName(f.name);
  };

  const handleEditSubmit = async () => {
    if (!editName.trim())
      return showMessage("❌ Name darf nicht leer sein", "error");
    try {
      await api.put(`/friseure/${editId}`, {
        name: editName.trim(),
        active: true,
      });
      setEditId(null);
      setEditName("");
      await loadFriseure();
      showMessage("✅ Friseur aktualisiert");
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Aktualisieren"), "error");
    }
  };

  const toggleActive = async (f) => {
    try {
      await api.put(`/friseure/${f.id}`, { name: f.name, active: !f.active });
      await loadFriseure();
      showMessage(`✅ Status geändert für ${f.name}`);
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Statuswechsel"), "error");
    }
  };

  // ---------- DELETE flow with 409 ----------
  const handleDelete = async (id) => {
    if (loading) return; // جلوگیری از دوباره‌کاری
    if (!confirm("Diesen Friseur wirklich deaktivieren?")) return;
    setLoading(true);
    try {
      await api.delete(`/friseure/${id}`);
      await loadFriseure();
      showMessage("✅ Friseur deaktiviert");
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data;
      if (status === 409 && data?.upcoming_appointments?.length) {
        setDeletingFriseurId(id);
        setUpcomingAppointments(data.upcoming_appointments); // [{appointment_id, date, time, ...}]
        setSelectedAppointmentIds(
          new Set(data.upcoming_appointments.map((a) => a.appointment_id))
        );
        setMoved([]);
        setFailed([]);
        setChosenSlot({});
        setModalStep("select");
        setModalOpen(true);
        showMessage(
          "⚠️ Zukünftige Termine vorhanden – bitte umbuchen.",
          "error"
        );
      } else {
        showMessage(errMsg(err, "❌ Fehler beim Löschen"), "error");
      }
    } finally {
      setLoading(false);
    }
  };

  // --------- Helpers for modal ----------
  const apMap = useMemo(() => {
    const m = {};
    for (const a of upcomingAppointments) m[a.appointment_id] = a;
    return m;
  }, [upcomingAppointments]);

  const allSelected = useMemo(() => {
    if (!upcomingAppointments.length) return false;
    return upcomingAppointments.every((a) =>
      selectedAppointmentIds.has(a.appointment_id)
    );
  }, [upcomingAppointments, selectedAppointmentIds]);

  const toggleSelectOne = (id) => {
    const next = new Set(selectedAppointmentIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedAppointmentIds(next);
  };

  const toggleSelectAll = () => {
    if (allSelected) setSelectedAppointmentIds(new Set());
    else
      setSelectedAppointmentIds(
        new Set(upcomingAppointments.map((a) => a.appointment_id))
      );
  };

  const closeModal = () => {
    setModalOpen(false);
    setDeletingFriseurId(null);
    setUpcomingAppointments([]);
    setSelectedAppointmentIds(new Set());
    setReplacementFriseurId(null);
    setMoved([]);
    setFailed([]);
    setChosenSlot({});
    setModalStep("select");
  };

  // ---------- Reassign selected appointments ----------
  const handleReassignAndShowResult = async () => {
    if (!replacementFriseurId)
      return showMessage("❌ Bitte Ersatz-Friseur wählen", "error");
    if (selectedAppointmentIds.size === 0)
      return showMessage(
        "❌ Bitte mindestens einen Termin auswählen",
        "error"
      );

    setReassigning(true);
    try {
      const body = {
        new_friseur_id: replacementFriseurId,
        appointment_ids: Array.from(selectedAppointmentIds),
      };
      const res = await api.post(
        `/friseure/${deletingFriseurId}/reassign`,
        body
      );
      const movedArr = res?.data?.moved || [];
      const failedArr = res?.data?.failed || [];

      setMoved(movedArr);
      setFailed(failedArr);

      const initChoice = {};
      for (const f of failedArr) {
        if (Array.isArray(f.suggested_slots) && f.suggested_slots.length > 0) {
          initChoice[f.appointment_id] = f.suggested_slots[0];
        }
      }
      setChosenSlot(initChoice);

      setModalStep("result");
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Umbuchen"), "error");
    } finally {
      setReassigning(false);
    }
  };

  // ---------- Reschedule one failed item to chosen slot ----------
  const handleRescheduleOne = async (appointmentId) => {
    const slot = chosenSlot[appointmentId];
    if (!slot) return showMessage("❌ Bitte eine Uhrzeit wählen", "error");

    const ap = apMap[appointmentId];
    if (!ap) return showMessage("❌ Termin nicht gefunden", "error");

    setReschedulingId(appointmentId);
    try {
      // PATCH/POST /appointments/:id/reschedule  body: { date, time, friseur_id }
      const res = await api.post(`/appointments/${appointmentId}/reschedule`, {
        date: ap.date, // YYYY-MM-DD
        time: slot, // "HH:MM"
        friseur_id: replacementFriseurId,
      });
      const updated = res?.data?.appointment;

      
      const newFailed = failed.filter((f) => f.appointment_id !== appointmentId);
      const newMoved = [
        ...moved,
        { appointment_id: appointmentId, action: "rescheduled", event_id: updated?.event_id || "new" },
      ];
      setFailed(newFailed);
      setMoved(newMoved);

      setUpcomingAppointments((prev) =>
        prev.map((a) =>
          a.appointment_id === appointmentId
            ? {
                ...a,
                date: updated?.date || a.date,
                time: updated?.time || slot,
                friseur_id: updated?.friseur_id || a.friseur_id,
              }
            : a
        )
      );

      showMessage("✅ Termin neu geplant & umgebucht");
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Neuplanen"), "error");
    } finally {
      setReschedulingId(null);
    }
  };

  // ---------- Final deactivate after all resolved ----------
  const handleFinalizeDeactivate = async () => {
    if (failed.length > 0) return;
    try {
      await api.delete(`/friseure/${deletingFriseurId}`);
      await loadFriseure();
      closeModal();
      showMessage("✅ Friseur deaktiviert");
    } catch (err) {
      showMessage(errMsg(err, "❌ Fehler beim Deaktivieren"), "error");
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow">
      {message && (
        <div
          className={`mb-4 p-3 rounded text-center ${
            message.type === "error"
              ? "bg-red-100 text-red-800"
              : "bg-green-100 text-green-800"
          }`}
        >
          {message.text}
        </div>
      )}

      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">
        ✂️ Friseur-Verwaltung
      </h2>

      <div className="mb-6 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="border rounded px-3 py-2 w-full bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:placeholder-gray-400"
        />
        <button
          onClick={handleAdd}
          className="bg-gradient-to-r from-green-500 to-green-600 text-white px-4 py-2 rounded shadow hover:from-green-600 hover:to-green-700 transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Hinzufügen
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse rounded shadow">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              <th className="px-4 py-2 border dark:border-gray-600">ID</th>
              <th className="px-4 py-2 border dark:border-gray-600">Name</th>
              <th className="px-4 py-2 border dark:border-gray-600">Aktiv</th>
              <th className="px-4 py-2 border dark:border-gray-600">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {friseure.map((f) => (
              <tr
                key={f.id}
                className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-4 py-2 font-mono text-sm">{f.id}</td>
                <td className="px-4 py-2">
                  {editId === f.id ? (
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="border rounded px-2 py-1 w-full dark:bg-gray-700 dark:text-white"
                    />
                  ) : (
                    <span className="text-gray-900 dark:text-gray-100">
                      {f.name}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActive(f)}
                    className={`px-3 py-1 rounded ${
                      f.active
                        ? "bg-green-500 hover:bg-green-600"
                        : "bg-gray-400 hover:bg-gray-500"
                    } text-white transition`}
                  >
                    {f.active ? "Aktiv" : "Inaktiv"}
                  </button>
                </td>
                <td className="px-4 py-2 flex flex-wrap gap-2">
                  {editId === f.id ? (
                    <button
                      onClick={handleEditSubmit}
                      className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition flex items-center gap-1"
                    >
                      <Save className="w-4 h-4" /> Speichern
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(f)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 transition flex items-center gap-1"
                      >
                        <Pencil className="w-4 h-4" /> Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(f.id)}
                        disabled={loading}
                        className="bg-red-600 disabled:opacity-60 text-white px-3 py-1 rounded hover:bg-red-700 transition flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Löschen
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {friseure.length === 0 && (
              <tr>
                <td
                  className="px-4 py-6 text-center text-gray-500 dark:text-gray-400"
                  colSpan={4}
                >
                  Keine Friseure gefunden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- Reassign Modal ---------- */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeModal(); // backdrop click
          }}
        >
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-3xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">
                {modalStep === "select"
                  ? "Zukünftige Termine umbuchen"
                  : "Ergebnis der Umbuchung"}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              </button>
            </div>

            {modalStep === "select" && (
              <>
                <div className="mb-3">
                  <label className="block text-sm mb-1 text-gray-700 dark:text-gray-300">
                    Ersatz-Friseur wählen
                  </label>
                  <select
                    value={replacementFriseurId || ""}
                    onChange={(e) =>
                      setReplacementFriseurId(Number(e.target.value))
                    }
                    className="w-full border rounded px-3 py-2 bg-white dark:bg-gray-700 dark:text-white"
                  >
                    <option value="" disabled>
                      Bitte auswählen…
                    </option>
                    {replacementOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        #{f.id} — {f.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Termine ({upcomingAppointments.length})
                  </span>
                  <button
                    onClick={toggleSelectAll}
                    className="text-sm px-3 py-1 rounded border hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    {allSelected ? "Alle abwählen" : "Alle auswählen"}
                  </button>
                </div>

                <div className="max-h-72 overflow-auto border rounded">
                  <table className="w-full text-left">
                    <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                      <tr>
                        <th className="px-3 py-2 w-10">
                          <input
                            type="checkbox"
                            checked={allSelected}
                            onChange={toggleSelectAll}
                          />
                        </th>
                        <th className="px-3 py-2">Datum & Zeit</th>
                        <th className="px-3 py-2">Kunde</th>
                        <th className="px-3 py-2">Service</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingAppointments.map((a) => {
                        const id = a.appointment_id;
                        const checked = selectedAppointmentIds.has(id);
                        return (
                          <tr key={id} className="border-t dark:border-gray-700">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelectOne(id)}
                              />
                            </td>
                            <td className="px-3 py-2 font-mono text-xs">
                              {a.date} {a.time}
                            </td>
                            <td className="px-3 py-2">
                              {a.customer_name || "—"}
                            </td>
                            <td className="px-3 py-2">
                              {a.service_name || "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    onClick={closeModal}
                    className="px-4 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleReassignAndShowResult}
                    disabled={reassigning}
                    className="bg-blue-600 disabled:opacity-60 text-white px-4 py-2 rounded hover:bg-blue-700 transition"
                  >
                    {reassigning ? "Bitte warten…" : "Umbuchen"}
                  </button>
                </div>
              </>
            )}

            {modalStep === "result" && (
              <>
                <div className="mb-2 text-sm text-gray-600 dark:text-gray-300">
                  Ergebnis:{" "}
                  <span className="font-semibold text-green-700">
                    {moved.length}
                  </span>{" "}
                  ok /{" "}
                  <span className="font-semibold text-red-700">
                    {failed.length}
                  </span>{" "}
                  offen
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded p-3">
                    <h4 className="font-semibold mb-2 text-green-700">
                      Erfolgreich umgebucht ({moved.length})
                    </h4>
                    {moved.length === 0 ? (
                      <p className="text-sm text-gray-500">Keine</p>
                    ) : (
                      <ul className="list-disc pl-5 space-y-1 text-sm">
                        {moved.map((m) => {
                          const ap = apMap[m.appointment_id] || {};
                          return (
                            <li key={m.appointment_id}>
                              #{m.appointment_id} — {ap.date} {ap.time} (
                              {m.action})
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  <div className="border rounded p-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold mb-2 text-red-700">
                        Nicht umgebucht ({failed.length})
                      </h4>
                      <button
                        onClick={() => setChosenSlot({})}
                        className="text-xs inline-flex items-center gap-1 px-2 py-1 border rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                        title="Eingaben zurücksetzen"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset
                      </button>
                    </div>

                    {failed.length === 0 ? (
                      <p className="text-sm text-gray-500">Keine</p>
                    ) : (
                      <div className="max-h-60 overflow-auto">
                        <table className="w-full text-left text-sm">
                          <thead>
                            <tr>
                              <th className="px-2 py-1">Termin</th>
                              <th className="px-2 py-1">Grund</th>
                              <th className="px-2 py-1">Vorschläge</th>
                              <th className="px-2 py-1">Aktion</th>
                            </tr>
                          </thead>
                          <tbody>
                            {failed.map((f) => {
                              const ap = apMap[f.appointment_id] || {};
                              const options = Array.isArray(f.suggested_slots)
                                ? f.suggested_slots
                                : [];
                              const selected =
                                chosenSlot[f.appointment_id] || "";
                              const busy =
                                reschedulingId === f.appointment_id;
                              return (
                                <tr key={f.appointment_id} className="border-t">
                                  <td className="px-2 py-1 font-mono">
                                    #{f.appointment_id}
                                    <br />
                                    {ap.date} {ap.time}
                                  </td>
                                  <td className="px-2 py-1 text-gray-600">
                                    {humanReason(f.reason)}
                                  </td>
                                  <td className="px-2 py-1">
                                    {options.length > 0 ? (
                                      <select
                                        className="border rounded px-2 py-1"
                                        value={selected}
                                        onChange={(e) =>
                                          setChosenSlot((s) => ({
                                            ...s,
                                            [f.appointment_id]: e.target.value,
                                          }))
                                        }
                                      >
                                        <option value="">
                                          Uhrzeit wählen…
                                        </option>
                                        {options.map((t) => (
                                          <option key={t} value={t}>
                                            {t}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="text-gray-500">
                                        Keine Vorschläge
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1">
                                    <button
                                      disabled={!selected || busy}
                                      onClick={() =>
                                        handleRescheduleOne(f.appointment_id)
                                      }
                                      className="px-3 py-1 rounded bg-blue-600 text-white disabled:opacity-60 hover:bg-blue-700"
                                    >
                                      {busy ? "…" : "Neu planen"}
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 flex justify-between">
                  <button
                    onClick={() => setModalStep("select")}
                    className="px-4 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    ← Zurück
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={closeModal}
                      className="px-4 py-2 rounded border hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      Schließen
                    </button>
                    <button
                      onClick={handleFinalizeDeactivate}
                      disabled={failed.length > 0}
                      className="bg-green-600 disabled:opacity-60 text-white px-4 py-2 rounded hover:bg-green-700 transition"
                      title={
                        failed.length > 0
                          ? "Noch offene Termine"
                          : "Friseur deaktivieren"
                      }
                    >
                      Deaktivieren
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
