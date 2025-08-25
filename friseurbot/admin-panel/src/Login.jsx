// src/Login.jsx
import { useState } from "react";
import PropTypes from "prop-types";
import api from "./api";

export default function Login({ onLoginSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await api.post("/auth/login", { username, password });
      if (res.data?.status === "ok") {
        onLoginSuccess(res.data.username ?? username);
      } else {
        setError("Benutzername oder Passwort ist falsch.");
      }
    } catch (err) {
      console.error("Login-Fehler:", err);
      setError("Benutzername oder Passwort ist falsch.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-100 to-blue-200 px-4">
      <form onSubmit={handleSubmit} className="bg-white p-10 rounded-xl shadow-2xl w-full max-w-sm">
        <h2 className="text-3xl font-extrabold mb-6 text-center text-blue-700">🔐 Admin-Login</h2>

        {error && <p className="text-red-600 text-sm mb-4 text-center">{error}</p>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Benutzername</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">Passwort</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
            required
          />
        </div>

        <button
          type="submit"
          className="w-full bg-blue-600 text-white font-semibold py-2 rounded-md hover:bg-blue-700 transition duration-200"
        >
          Einloggen
        </button>
      </form>
    </div>
  );
}

Login.propTypes = {
  onLoginSuccess: PropTypes.func.isRequired,
};
