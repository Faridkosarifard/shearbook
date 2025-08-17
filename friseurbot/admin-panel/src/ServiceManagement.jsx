import { useEffect, useState } from "react";
import api from "./api";
import { Pencil, Trash2, ArrowUp, ArrowDown, Save, Plus } from "lucide-react";

export default function ServiceManagement() {
  const [services, setServices] = useState([]);
  const [newService, setNewService] = useState("");
  const [newDuration, setNewDuration] = useState(30);
  const [editId, setEditId] = useState(null);
  const [editService, setEditService] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [message, setMessage] = useState(null);

  const showMessage = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadServices = async () => {
    try {
      const res = await api.get("/services");
      setServices(res.data);
    } catch (err) {
      console.error("❌ Fehler beim Laden:", err);
      showMessage("❌ Fehler beim Laden", "error");
    }
  };

  useEffect(() => {
    loadServices();
  }, []);

  const handleAdd = async () => {
    try {
      await api.post("/services", { name: newService, duration: newDuration });
      setNewService("");
      setNewDuration(30);
      loadServices();
      showMessage("✅ Service hinzugefügt");
    } catch (err) {
      console.error("❌ Fehler beim Hinzufügen:", err);
      showMessage("❌ Fehler beim Hinzufügen", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Diesen Service wirklich löschen?")) return;
    try {
      await api.delete(`/services/${id}`);
      loadServices();
      showMessage("✅ Service gelöscht");
    } catch (err) {
      console.error("❌ Fehler beim Löschen:", err);
      showMessage("❌ Fehler beim Löschen", "error");
    }
  };

  const handleEdit = (service) => {
    setEditId(service.id);
    setEditService(service.name);
    setEditDuration(service.duration);
  };

  const handleEditSubmit = async () => {
    try {
      await api.put(`/services/${editId}`, { name: editService, duration: editDuration });
      setEditId(null);
      setEditService("");
      setEditDuration(30);
      loadServices();
      showMessage("✅ Service aktualisiert");
    } catch (err) {
      console.error("❌ Fehler beim Aktualisieren:", err);
      showMessage("❌ Fehler beim Aktualisieren", "error");
    }
  };

  const handleReorder = async (id, direction) => {
    try {
      await api.post(`/services/${id}/reorder`, { direction });
      loadServices();
      showMessage("✅ Reihenfolge geändert");
    } catch (err) {
      console.error("❌ Fehler beim Neuordnen:", err);
      showMessage("❌ Fehler beim Neuordnen", "error");
    }
  };

  return (
    <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow">
      {message && (
        <div
          className={`mb-4 p-3 rounded text-center ${message.type === "error" ? "bg-red-100 text-red-800" : "bg-green-100 text-green-800"}`}
        >
          {message.text}
        </div>
      )}
      <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-100">
        🛠 Service-Verwaltung
      </h2>

      <div className="mb-6 flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          placeholder="Service-Name"
          value={newService}
          onChange={(e) => setNewService(e.target.value)}
          className="border rounded px-3 py-2 w-full"
        />
        <input
          type="number"
          placeholder="Dauer (Min)"
          value={newDuration}
          onChange={(e) => setNewDuration(Number(e.target.value))}
          className="border rounded px-3 py-2 w-full sm:w-32"
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
              <th className="px-4 py-2 border dark:border-gray-600">Position</th>
              <th className="px-4 py-2 border dark:border-gray-600">Name</th>
              <th className="px-4 py-2 border dark:border-gray-600">Dauer (Min)</th>
              <th className="px-4 py-2 border dark:border-gray-600">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr
                key={service.id}
                className="border-t dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-4 py-2 font-mono text-sm">{service.position}</td>
                <td className="px-4 py-2">
                  {editId === service.id ? (
                    <input
                      type="text"
                      value={editService}
                      onChange={(e) => setEditService(e.target.value)}
                      className="border rounded px-2 py-1 w-full"
                    />
                  ) : (
                    service.name
                  )}
                </td>
                <td className="px-4 py-2">
                  {editId === service.id ? (
                    <input
                      type="number"
                      value={editDuration}
                      onChange={(e) => setEditDuration(Number(e.target.value))}
                      className="border rounded px-2 py-1 w-24"
                    />
                  ) : (
                    service.duration
                  )}
                </td>
                <td className="px-4 py-2 flex flex-wrap gap-2">
                  {editId === service.id ? (
                    <button
                      onClick={handleEditSubmit}
                      className="bg-green-500 text-white px-3 py-1 rounded hover:bg-green-600 transition flex items-center gap-1"
                    >
                      <Save className="w-4 h-4" /> Speichern
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => handleEdit(service)}
                        className="bg-yellow-500 text-white px-3 py-1 rounded hover:bg-yellow-600 transition flex items-center gap-1"
                      >
                        <Pencil className="w-4 h-4" /> Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(service.id)}
                        className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Löschen
                      </button>
                      <button
                        onClick={() => handleReorder(service.id, "up")}
                        className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition flex items-center gap-1"
                      >
                        <ArrowUp className="w-4 h-4" /> Hoch
                      </button>
                      <button
                        onClick={() => handleReorder(service.id, "down")}
                        className="bg-blue-500 text-white px-3 py-1 rounded hover:bg-blue-600 transition flex items-center gap-1"
                      >
                        <ArrowDown className="w-4 h-4" /> Runter
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
