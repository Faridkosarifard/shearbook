import { useEffect, useMemo, useState } from "react";
import { Plus, Minus, Save, RefreshCcw, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle } from "lucide-react";
import api from "./api"; 
/**
 * FriseurServiceManager
 * UI to select a hairdresser (Friseur) and manage the services assigned to them.
 *
 * Expected backend endpoints:
 *  GET  /friseure                         -> list[{id,name,active,calendar_id}]
 *  GET  /services                         -> list[{id,name,duration_min,position}]
 *  GET  /friseure/:id/services            -> list[{id,name,duration_min,position}]  (array or {services:[...]})
 *  POST /friseure/:id/services            -> {added, services:[...]}
 *       body: { service_ids: number[] }
 *  PUT  /friseure/:id/services            -> {added, removed, services:[...]}
 *       body: { service_ids: number[] }   (replace all)
 *  DELETE /friseure/:id/services/:sid     -> {deleted, services:[...]}
 */
export default function FriseurServiceManager() {
  // data
  const [friseure, setFriseure] = useState([]);
  const [services, setServices] = useState([]);

  // selection
  const [selectedFriseurId, setSelectedFriseurId] = useState(null);
  const [assigned, setAssigned] = useState([]); // services assigned to selected friseur

  // UI selections (checkboxes)
  const [selectedAvailIds, setSelectedAvailIds] = useState(new Set());
  const [selectedAssignedIds, setSelectedAssignedIds] = useState(new Set());

  // search filters
  const [searchAvail, setSearchAvail] = useState("");
  const [searchAssigned, setSearchAssigned] = useState("");

  // loading & messages
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null); // {type:'success'|'error'|'info', text:string}

  const showMsg = (text, type = "success") => {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 3000);
  };

  // ---------- Load base data ----------
  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);
        const [frRes, svcRes] = await Promise.all([
          api.get("/friseure"),
          api.get("/services"),
        ]);
        setFriseure(frRes.data || []);
        const allServices = (Array.isArray(svcRes.data) ? svcRes.data : svcRes.data?.services) || [];
        // sort by position then name if present
        allServices.sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
        setServices(allServices);
      } catch (e) {
        console.error("Load init error:", e);
        showMsg("❌ Fehler beim Laden der Stammdaten", "error");
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  // Load assignments when friseur changes
  useEffect(() => {
    if (!selectedFriseurId) return;
    const loadAssigned = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/friseure_services/${selectedFriseurId}/services`);
        const arr = Array.isArray(res.data) ? res.data : res.data?.services || [];
        const sorted = [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
        setAssigned(sorted);
        setSelectedAvailIds(new Set());
        setSelectedAssignedIds(new Set());
      } catch (e) {
        console.error("Load assigned error:", e);
        showMsg("❌ Fehler beim Laden der Services des Friseurs", "error");
      } finally {
        setLoading(false);
      }
    };
    loadAssigned();
  }, [selectedFriseurId]);

  // Derived helpers
  const assignedIds = useMemo(() => new Set(assigned.map((s) => s.id)), [assigned]);
  const available = useMemo(
    () => services.filter((s) => !assignedIds.has(s.id)),
    [services, assignedIds]
  );

  const filteredAvailable = useMemo(() => {
    const q = searchAvail.trim().toLowerCase();
    if (!q) return available;
    return available.filter((s) =>
      [s.name, String(s.duration_min ?? ""), String(s.position ?? "")]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [available, searchAvail]);

  const filteredAssigned = useMemo(() => {
    const q = searchAssigned.trim().toLowerCase();
    if (!q) return assigned;
    return assigned.filter((s) =>
      [s.name, String(s.duration_min ?? ""), String(s.position ?? "")]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(q))
    );
  }, [assigned, searchAssigned]);

  // Checkbox handlers
  const toggleAvailSelect = (id) => {
    const next = new Set(selectedAvailIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedAvailIds(next);
  };
  const toggleAssignedSelect = (id) => {
    const next = new Set(selectedAssignedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelectedAssignedIds(next);
  };
  const selectAllAvail = () => setSelectedAvailIds(new Set(filteredAvailable.map((s) => s.id)));
  const selectAllAssigned = () => setSelectedAssignedIds(new Set(filteredAssigned.map((s) => s.id)));
  const clearAvailSelection = () => setSelectedAvailIds(new Set());
  const clearAssignedSelection = () => setSelectedAssignedIds(new Set());

  // ---------- Actions ----------
  const requireFriseur = () => {
    if (!selectedFriseurId) {
      showMsg("Bitte zuerst einen Friseur auswählen.", "error");
      return false;
    }
    return true;
  };

  const addSelected = async () => {
    if (!requireFriseur()) return;
    const ids = Array.from(selectedAvailIds);
    if (!ids.length) return;
    try {
      setLoading(true);
      await api.post(`/friseure_services/${selectedFriseurId}/services`, { service_ids: ids });
      // reload assigned
      const res = await api.get(`/friseure_services/${selectedFriseurId}/services`);
      const arr = Array.isArray(res.data) ? res.data : res.data?.services || [];
      setAssigned(arr);
      setSelectedAvailIds(new Set());
      showMsg("✅ Ausgewählte Services wurden hinzugefügt");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Hinzufügen der Services", "error");
    } finally {
      setLoading(false);
    }
  };

  const removeSelected = async () => {
    if (!requireFriseur()) return;
    const ids = Array.from(selectedAssignedIds);
    if (!ids.length) return;
    try {
      setLoading(true);
      await Promise.all(ids.map((sid) => api.delete(`/friseure_services/${selectedFriseurId}/services/${sid}`)));
      const res = await api.get(`/friseure_services/${selectedFriseurId}/services`);
      const arr = Array.isArray(res.data) ? res.data : res.data?.services || [];
      setAssigned(arr);
      setSelectedAssignedIds(new Set());
      showMsg("✅ Ausgewählte Services wurden entfernt");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Entfernen der Services", "error");
    } finally {
      setLoading(false);
    }
  };

  const saveReplaceAll = async () => {
    if (!requireFriseur()) return;
    try {
      setLoading(true);
      const newIds = assigned.map((s) => s.id); 
      await api.put(`/friseure/${selectedFriseurId}/services`, { service_ids: newIds });
      showMsg("✅ Änderungen gespeichert");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Speichern", "error");
    } finally {
      setLoading(false);
    }
  };

  const addAllAvailable = async () => {
    if (!requireFriseur()) return;
    try {
      setLoading(true);
      const ids = available.map((s) => s.id);
      if (ids.length) {
        await api.post(`/friseure_services/${selectedFriseurId}/services`, { service_ids: ids });
      }
      const res = await api.get(`/friseure_services/${selectedFriseurId}/services`);
      const arr = Array.isArray(res.data) ? res.data : res.data?.services || [];
      setAssigned(arr);
      setSelectedAvailIds(new Set());
      showMsg("✅ Alle verfügbaren Services wurden hinzugefügt");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Hinzufügen aller Services", "error");
    } finally {
      setLoading(false);
    }
  };

  const clearAllAssigned = async () => {
    if (!requireFriseur()) return;
    try {
      setLoading(true);
      // Alle entfernen: تک‌به‌تک
      await Promise.all(assigned.map((s) => api.delete(`/friseure/${selectedFriseurId}/services/${s.id}`)));
      setAssigned([]);
      setSelectedAssignedIds(new Set());
      showMsg("✅ Alle zugewiesenen Services wurden entfernt");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Entfernen aller Services", "error");
    } finally {
      setLoading(false);
    }
  };

  // Drag-drop style quick toggles (optional local move without hitting backend)
  const moveAvailToAssignedLocal = () => {
    // move selected avail to assigned (local only); saved with Save button
    const toAdd = services.filter((s) => selectedAvailIds.has(s.id) && !assignedIds.has(s.id));
    if (!toAdd.length) return;
    const merged = [...assigned, ...toAdd].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
    setAssigned(merged);
    setSelectedAvailIds(new Set());
  };
  const moveAssignedToAvailLocal = () => {
    // remove selected assigned locally
    if (!selectedAssignedIds.size) return;
    const remaining = assigned.filter((s) => !selectedAssignedIds.has(s.id));
    setAssigned(remaining);
    setSelectedAssignedIds(new Set());
  };

  const refreshAssigned = async () => {
    if (!selectedFriseurId) return;
    try {
      setLoading(true);
      const res = await api.get(`/friseure_services/${selectedFriseurId}/services`);
      const arr = Array.isArray(res.data) ? res.data : res.data?.services || [];
      const sorted = [...arr].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name));
      setAssigned(sorted);
      showMsg("🔄 Aktualisiert", "info");
    } catch (e) {
      console.error(e);
      showMsg("❌ Fehler beim Aktualisieren", "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-900 rounded-2xl shadow max-w-6xl mx-auto">
      {/* Alerts */}
      {msg && (
        <div
          className={`mb-4 flex items-center gap-2 p-3 rounded-xl text-sm ${
            msg.type === "error"
              ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-100"
              : msg.type === "info"
              ? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100"
              : "bg-green-100 text-green-800 dark:bg-emerald-900/40 dark:text-emerald-100"
          }`}
        >
          {msg.type === "error" ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
          <span>{msg.text}</span>
        </div>
      )}

      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-[240px]">
          <label className="block text-sm text-gray-600 dark:text-gray-300 mb-1">Friseur</label>
          <select
            className="w-full rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2"
            value={selectedFriseurId ?? ""}
            onChange={(e) => setSelectedFriseurId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">- Wählen Sie -</option>
            {friseure.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} {f.active === false ? "(Inaktiv)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={refreshAssigned}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            disabled={!selectedFriseurId || loading}
            title="Aktualisieren"
          >
            <RefreshCcw className="w-4 h-4" />
            Aktualisieren
          </button>
          <button
            onClick={saveReplaceAll}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow transition"
            disabled={!selectedFriseurId || loading}
            title="Save (PUT)"
          >
            <Save className="w-4 h-4" />
            Änderungen speichern
          </button>
        </div>
      </div>

      {/* Dual list */}
      <div className="grid grid-cols-1 md:grid-cols-11 gap-4 mt-6">
        {/* Available */}
        <div className="md:col-span-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Verfügbare Services</h3>
            <div className="flex gap-2">
              <button
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                onClick={selectAllAvail}
              >
                Alle auswählen
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                onClick={clearAvailSelection}
              >
                Auswahl löschen
              </button>
            </div>
          </div>

          <input
            placeholder="Suchen..."
            value={searchAvail}
            onChange={(e) => setSearchAvail(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />

          <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-[360px] overflow-auto divide-y dark:divide-gray-800">
            {filteredAvailable.map((s) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-emerald-600"
                  checked={selectedAvailIds.has(s.id)}
                  onChange={() => toggleAvailSelect(s.id)}
                />
                <div className="flex-1">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{s.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.duration_min ?? ""} min</div>
                </div>
                <span className="text-xs text-gray-500">#{s.id}</span>
              </label>
            ))}
            {filteredAvailable.length === 0 && (
              <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Keine Einträge gefunden</div>
            )}
          </div>
        </div>

        {/* Middle controls */}
        <div className="md:col-span-1 flex flex-col items-center justify-center gap-3">
          {/* local move (no backend) */}
          <button
            onClick={moveAvailToAssignedLocal}
            disabled={!selectedAvailIds.size}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Auswahl nach Rechts verschieben (lokal)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={moveAssignedToAvailLocal}
            disabled={!selectedAssignedIds.size}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
            title="Auswahl nach links verschieben (lokal)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* backend actions */}
          <button
            onClick={addSelected}
            disabled={!selectedFriseurId || !selectedAvailIds.size || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow disabled:opacity-50"
            title="POST: Auswahl hinzufügen"
          >
            <Plus className="w-4 h-4" /> Auswahl hinzufügen
          </button>
          <button
            onClick={removeSelected}
            disabled={!selectedFriseurId || !selectedAssignedIds.size || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white shadow disabled:opacity-50"
            title="DELETE: Auswahl entfernen"
          >
            <Minus className="w-4 h-4" /> Auswahl entfernen
          </button>

          <div className="h-[1px] w-8 bg-gray-200 dark:bg-gray-700 my-2" />

          <button
            onClick={addAllAvailable}
            disabled={!selectedFriseurId || !available.length || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow disabled:opacity-50"
          >
            Alle hinzufügen
          </button>
          <button
            onClick={clearAllAssigned}
            disabled={!selectedFriseurId || !assigned.length || loading}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-gray-600 hover:bg-gray-700 text-white shadow disabled:opacity-50"
          >
            Alle entfernen
          </button>
        </div>

        {/* Assigned */}
        <div className="md:col-span-5">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Zugewiesene Services</h3>
            <div className="flex gap-2">
              <button
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                onClick={selectAllAssigned}
              >
                Alle auswählen
              </button>
              <button
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200"
                onClick={clearAssignedSelection}
              >
                Auswahl löschen
              </button>
            </div>
          </div>

          <input
            placeholder="Suchen..."
            value={searchAssigned}
            onChange={(e) => setSearchAssigned(e.target.value)}
            className="w-full mb-3 px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />

          <div className="border border-gray-200 dark:border-gray-700 rounded-xl max-h-[360px] overflow-auto divide-y dark:divide-gray-800">
            {filteredAssigned.map((s) => (
              <label key={s.id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-rose-600"
                  checked={selectedAssignedIds.has(s.id)}
                  onChange={() => toggleAssignedSelect(s.id)}
                />
                <div className="flex-1">
                  <div className="text-sm text-gray-900 dark:text-gray-100">{s.name}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{s.duration_min ?? ""} min</div>
                </div>
                <span className="text-xs text-gray-500">#{s.id}</span>
              </label>
            ))}
            {filteredAssigned.length === 0 && (
              <div className="p-4 text-sm text-gray-500 dark:text-gray-400">Keine Services zugewiesen</div>
            )}
          </div>
        </div>
      </div>

      {/* Footer hint */}
      <div className="mt-6 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
        Das Schreiben von Änderungen in die Datenbank erfolgt über die Schaltfläche „Änderungen speichern“ (PUT) oder die Schaltflächen „Auswahl hinzufügen/entfernen“.
      </div>

      {loading && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-[1px] flex items-center justify-center">
          <div className="px-4 py-2 bg-white dark:bg-gray-800 rounded-xl shadow text-gray-700 dark:text-gray-100 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 animate-spin" />
            Bitte warten...
          </div>
        </div>
      )}
    </div>
  );
}
