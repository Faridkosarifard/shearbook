import { useEffect, useState } from "react";
import api from "../api";

function parseStatus(payload) {
  if (!payload || typeof payload !== "object") {
    return { status: "offline", me: null, qr: false };
  }
  return {
    status: payload.status || "offline",
    me: payload.me || null,
    qr: Boolean(payload.qr) || payload.status === "qr",
  };
}

export default function WhatsApp() {
  const [status, setStatus] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [stamp, setStamp] = useState(Date.now());
  const [hasQr, setHasQr] = useState(false);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const stRes = await fetch("/wa/status", { credentials: "include" });
      const st = parseStatus(stRes.ok ? await stRes.json() : null);
      setStatus(st);
      if (st.qr) {
        setHasQr(true);
        setStamp(Date.now());
      } else {
        setHasQr(false);
      }
      try {
        const se = await api.get("/sessions");
        setSessions(se.data);
      } catch {
        setSessions([]);
      }
      setError("");
    } catch {
      setStatus({ status: "offline", me: null, qr: false });
      setHasQr(false);
      setError("Could not reach the WhatsApp bridge or the API.");
    }
  }

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, []);

  async function post(path) {
    await fetch(path, { method: "POST", credentials: "include" });
    refresh();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-3xl font-semibold">WhatsApp</h1>
      <p className="text-ink/60">
        Pair the unofficial WhatsApp Web client by scanning this QR code with the salon phone.
        The session is stored only on this machine.
      </p>
      {error ? <p className="text-red-700 text-sm">{error}</p> : null}
      <div className="bg-white rounded-2xl p-6 shadow-sm space-y-4">
        <div className="text-sm">
          Status: <strong>{status?.status || "unknown"}</strong>
          {status?.me ? <span className="text-ink/60"> · {status.me}</span> : null}
        </div>
        {hasQr ? (
          <img
            alt="WhatsApp pairing QR code"
            src={`/wa/qr.png?t=${stamp}`}
            className="w-64 h-64 bg-mist rounded-xl object-contain"
            onError={() => setHasQr(false)}
          />
        ) : (
          <div className="w-64 h-64 bg-mist rounded-xl flex items-center justify-center text-sm text-ink/60 text-center p-4">
            No QR code right now. If the client is already connected, this is expected.
          </div>
        )}
        <div className="flex gap-3 text-sm">
          <button className="underline" onClick={refresh}>Refresh</button>
          <button className="underline" onClick={() => post("/wa/restart")}>Restart</button>
          <button className="underline text-red-700" onClick={() => post("/wa/logout")}>Log out WhatsApp</button>
        </div>
      </div>
      <section className="bg-white rounded-2xl p-6 shadow-sm">
        <h2 className="font-medium mb-3">Recent chats</h2>
        {sessions.length ? (
          <ul className="text-sm divide-y divide-mist">
            {sessions.map((row) => (
              <li key={row.id || row.phone} className="py-2 flex justify-between gap-4">
                <span>{row.phone}</span>
                <span className="text-ink/60">{row.step || "idle"}{row.expired ? " (expired)" : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink/60">No active sessions.</p>
        )}
      </section>
    </div>
  );
}

export { parseStatus };
