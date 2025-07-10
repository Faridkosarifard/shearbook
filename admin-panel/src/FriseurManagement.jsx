import { useEffect, useState } from "react";
import axios from "axios";
import { Pencil, Trash2, Save, Plus } from "lucide-react";

export default function FriseurManagement() {
  const [friseure, setFriseure] = useState([]);
  const [newName, setNewName] = useState("");
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState("");
  const [message, setMessage] = useState(null);

  const showMessage = (text, type = "success") => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  const loadFriseure = async () => {
    try {
      const res = await axios.get("http://localhost:5000/friseure");
      setFriseure(res.data);
    } catch (err) {
      showMessage("❌ Fehler beim Laden", "error");
    }
  };

  useEffect(() => {
    loadFriseure();
  }, []);

  const handleAdd = async () => {
    try {
      await axios.post("http://localhost:5000/friseure", { name: newName });
      setNewName("");
      loadFriseure();
      showMessage("✅ Friseur hinzugefügt");
    } catch (err) {
      showMessage("❌ Fehler beim Hinzufügen", "error");
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Diesen Friseur wirklich löschen?")) return;
    try {
      await axios.delete(`http://localhost:5000/friseure/${id}`);
      loadFriseure();
      showMessage("✅ Friseur gelöscht");
    } catch (err) {
      showMessage("❌ Fehler beim Löschen", "error");
    }
  };

  const handleEdit = (f) => {
    setEditId(f.id);
    setEditName(f.name);
  };

  const handleEditSubmit = async () => {
    try {
      await axios.put(`http://localhost:5000/friseure/${editId}`, {
        name: editName,
        active: true,
      });
      setEditId(null);
      setEditName("");
      loadFriseure();
      showMessage("✅ Friseur aktualisiert");
    } catch (err) {
      showMessage("❌ Fehler beim Aktualisieren", "error");
    }
  };

  const toggleActive = async (f) => {
    try {
      await axios.put(`http://localhost:5000/friseure/${f.id}`, {
        name: f.name,
        active: !f.active,
      });
      loadFriseure();
      showMessage(`✅ Status geändert für ${f.name}`);
    } catch (err) {
      showMessage("❌ Fehler beim Statuswechsel", "error");
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
                      className="border rounded px-2 py-1 w-full"
                    />
                  ) : (
                    f.name
                  )}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => toggleActive(f)}
                    className={`px-3 py-1 rounded ${f.active ? "bg-green-500 hover:bg-green-600" : "bg-gray-400 hover:bg-gray-500"} text-white transition`}
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
                        className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 transition flex items-center gap-1"
                      >
                        <Trash2 className="w-4 h-4" /> Löschen
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
