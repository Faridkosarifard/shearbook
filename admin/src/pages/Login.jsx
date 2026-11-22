import { useState } from "react";
import api from "../api";

export default function Login({ onSuccess }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api.post("/auth/login", { username, password });
      onSuccess(res.data.username);
    } catch {
      setError("Invalid username or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm bg-white rounded-2xl shadow-sm p-8 space-y-5">
        <div className="flex flex-col items-center gap-3 mb-2">
          <img src="/logo.svg" alt="ShearBook" className="h-16 w-16 rounded-2xl" />
          <h1 className="text-2xl font-semibold">ShearBook</h1>
          <p className="text-sm text-ink/60">Sign in to the salon desk</p>
        </div>
        <label className="block text-sm">
          Username
          <input
            className="mt-1 w-full rounded-lg border border-mist px-3 py-2"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            className="mt-1 w-full rounded-lg border border-mist px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full bg-ink text-cream rounded-lg py-2.5 font-medium disabled:opacity-60"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
