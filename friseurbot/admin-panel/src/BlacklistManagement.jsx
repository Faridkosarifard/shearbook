import React, { useState, useEffect } from "react";
import api from "./api";

const API_URL = "/blacklist";

function BlacklistManagement() {
  const [numbers, setNumbers] = useState([]);
  const [newNumber, setNewNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const API_URL = "http://localhost:5000/blacklist";

  useEffect(() => {
    fetchNumbers();
  }, []);

  async function fetchNumbers() {
    try {
      setLoading(true);
      const res = await api.get(API_URL);
      setNumbers(res.data);
    } catch (err) {
      setError("Fehler beim Laden der Blacklist");
    } finally {
      setLoading(false);
    }
  }

  async function addNumber(e) {
    e.preventDefault();
    if (!newNumber) return;

    try {
      await api.post(API_URL, { phone: newNumber });
      setNewNumber("");
      fetchNumbers();
    } catch (err) {
      setError("Fehler beim Hinzufügen");
    }
  }

  // حذف شماره
  async function removeNumber(phone) {
    try {
      await api.delete(`${API_URL}/${encodeURIComponent(phone)}`);
      fetchNumbers();
    } catch (err) {
      setError("Fehler beim Entfernen");
    }
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold mb-4">📵 Blacklist Management</h1>

      <form onSubmit={addNumber} className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Neue Nummer hinzufügen"
          value={newNumber}
          onChange={(e) => setNewNumber(e.target.value)}
          className="border p-2 rounded w-full bg-gray-800 text-white placeholder-gray-400"
        />
        <button type="submit" className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded">
          Hinzufügen
        </button>
      </form>

      {error && <p className="text-red-600">{error}</p>}

      {loading ? (
        <p>⏳ Lade...</p>
      ) : numbers.length === 0 ? (
        <p>Keine Nummern in der Blacklist.</p>
      ) : (
        <ul className="space-y-2">
          {numbers.map((n) => (
            <li key={n.id} className="flex justify-between items-center border p-2 rounded">
              <span>{n.phone}</span>
              <button
                onClick={() => removeNumber(n.phone)}
                className="bg-gray-800 hover:bg-gray-900 text-white px-3 py-1 rounded"
              >
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default BlacklistManagement;
