import { useEffect, useMemo, useState, useCallback } from "react";

// -------- ENV (Vite) --------
// اگر VITE_BOT_ADMIN_BASE خالی باشد، same-origin استفاده می‌شود (پشت Caddy)
function normalizeBase() {
  const raw = import.meta.env.VITE_BOT_ADMIN_BASE ?? "";
  if (!raw) return "";
  try {
    const u = new URL(raw, window.location.href);
    if (["127.0.0.1", "localhost", "::1"].includes(u.hostname)) return "";
    return u.origin === window.location.origin ? "" : u.origin;
  } catch {
    return "";
  }
}
const BASE = normalizeBase();
const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN ?? "";
console.log("BASE=", BASE || "(same-origin)", "hasToken=", !!ADMIN_TOKEN);

// -------- Status → UI style --------
const STATUS_STYLES = {
  booting: "bg-yellow-100 text-yellow-800 border-yellow-200",
  qr: "bg-amber-100 text-amber-800 border-amber-200",
  authenticated: "bg-blue-100 text-blue-800 border-blue-200",
  ready: "bg-emerald-100 text-emerald-800 border-emerald-200",
  disconnected: "bg-rose-100 text-rose-800 border-rose-200",
  loading: "bg-gray-100 text-gray-700 border-gray-200",
};

function Badge({ status }) {
  const cls = STATUS_STYLES[status] || STATUS_STYLES.loading;
  return (
    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm font-medium ${cls}`}>
      <span
        className={`h-2 w-2 rounded-full ${
          status === "ready"
            ? "bg-emerald-500"
            : status === "authenticated"
            ? "bg-blue-500"
            : status === "qr"
            ? "bg-amber-500"
            : status === "booting"
            ? "bg-yellow-500"
            : status === "disconnected"
            ? "bg-rose-500"
            : "bg-gray-400"
        }`}
      />
      <span className="capitalize">{status}</span>
    </span>
  );
}

function Section({ title, right, children }) {
  return (
    <section className="rounded-2xl border bg-white shadow-sm">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {right}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export default function WhatsAppAdminPage() {
  const [status, setStatus] = useState("loading"); // booting | qr | authenticated | ready | disconnected
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [events, setEvents] = useState([]);       // recent SSE events
  const [qrTs, setQrTs] = useState(Date.now());   // cache-buster for QR refresh

  // همهٔ درخواست‌ها از این helper عبور کنند تا ?t=<TOKEN> هم اضافه شود
  const withTokenQS = useCallback(
    (path) => {
      const p = path.startsWith("/") ? path : `/${path}`;
      const base = BASE || "";
      if (!ADMIN_TOKEN) return `${base}${p}`;
      return `${base}${p}${p.includes("?") ? "&" : "?"}t=${encodeURIComponent(ADMIN_TOKEN)}`;
    },
    []
  );

  const headers = useMemo(
    () => (ADMIN_TOKEN ? { "x-admin-token": ADMIN_TOKEN } : {}),
    []
  );

  async function refresh() {
    setError("");
    try {
      const res = await fetch(withTokenQS("/wa/status"), { headers });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} ${res.statusText} :: ${body.slice(0, 180)}`);
      }
      const data = await res.json();
      setStatus(data.status);
      setMe(data.me || null);
    } catch (e) {
      setError("Failed to fetch status");
      console.error("Status fetch error:", e);
    }
  }

  async function logout() {
    setError("");
    try {
      await fetch(withTokenQS("/wa/logout"), { method: "POST", headers });
      await refresh();
    } catch {
      setError("Failed to log out");
    }
  }

  async function restart() {
    setError("");
    try {
      await fetch(withTokenQS("/wa/restart"), { method: "POST", headers });
      await refresh();
    } catch {
      setError("Failed to restart");
    }
  }

  // Copy helper
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  // ---- SSE wiring ----
  useEffect(() => {
    refresh();
    const es = new EventSource(withTokenQS("/wa/events")); // EventSource هدر سفارشی نمی‌فرستد → qs
    es.onmessage = (evt) => {
      const now = new Date();
      try {
        const msg = JSON.parse(evt.data);
        setEvents((prev) => [{ time: now.toISOString(), msg }, ...prev].slice(0, 50));

        if (msg.type === "qr") {
          setStatus("qr");
          setQrTs(Date.now()); // تصویر QR را فوراً تازه کن
        } else if (msg.type === "ready" || msg.type === "authenticated") {
          refresh();
        } else if (msg.type === "change_state" && msg.state === "CONNECTED") {
          // وقتی core وصل شد، وضعیت را رفرش کن
          refresh();
        } else if (["disconnected", "logged_out", "restarting"].includes(msg.type)) {
          refresh();
        }
      } catch {
        // ignore JSON errors
      }
    };
    es.onerror = () => {};
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const qrSrc = useMemo(() => {
    if (status !== "qr") return null;
    return withTokenQS(`/wa/qr.png?ts=${qrTs}`);
  }, [status, qrTs]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Topbar */}
      <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-black text-white">
              <span className="text-lg font-bold">WA</span>
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-tight">WhatsApp Admin</h1>
              <p className="text-xs text-gray-500">Manage connection, QR, and session controls</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge status={status} />
            <button
              onClick={refresh}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50 active:scale-[.98]"
              title="Refresh status"
            >
              Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-6 md:grid-cols-3">
        {/* Left column */}
        <div className="md:col-span-2 grid gap-6">
          <Section
            title="Connection"
            right={
              <div className="flex items-center gap-2">
                <button
                  onClick={restart}
                  className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50"
                  title="Restart client"
                >
                  Restart
                </button>
                <button
                  onClick={logout}
                  className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
                  title="Logout and clear session"
                >
                  Logout
                </button>
              </div>
            }
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-3">
                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">Status</div>
                  <div className="mt-1">
                    <Badge status={status} />
                  </div>
                </div>

                <div className="rounded-xl border bg-gray-50 p-4">
                  <div className="text-sm text-gray-500">Account</div>
                  {me ? (
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <code className="rounded bg-white px-2 py-1 text-sm">{me}</code>
                      <button
                        onClick={() => copy(me)}
                        className="rounded-lg border px-2 py-1 text-xs hover:bg-gray-100"
                      >
                        Copy
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-sm text-gray-600">—</div>
                  )}
                </div>

                {error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                    {error}
                  </div>
                )}
              </div>

              <div className="flex items-center justify-center">
                {status === "qr" ? (
                  <div className="flex w-full flex-col items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
                    <img
                      src={qrSrc ?? ""}
                      width={320}
                      height={320}
                      alt="WhatsApp QR"
                      className="h-[320px] w-[320px] rounded-xl border"
                    />
                    <p className="text-center text-xs text-gray-500">
                      Open WhatsApp on your phone → Linked devices → Scan this QR. If it fails, wait a few seconds or refresh.
                    </p>
                    <p className="text-center text-[11px] text-gray-400">
                      last update: {new Date(qrTs).toLocaleTimeString()}
                    </p>
                  </div>
                ) : (
                  <div className="flex w-full flex-col items-center gap-3 rounded-2xl border bg-white p-6 text-center text-sm text-gray-500">
                    <div className="text-4xl">💬</div>
                    <div>No QR right now. You will see it here whenever a new login is required.</div>
                  </div>
                )}
              </div>
            </div>
          </Section>

          <Section title="Live events (last 50)">
            {events.length === 0 ? (
              <div className="text-sm text-gray-500">No events yet.</div>
            ) : (
              <ul className="space-y-2">
                {events.map((e, i) => (
                  <li key={i} className="rounded-xl border bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <code className="text-xs text-gray-600">
                        {new Date(e.time).toLocaleString()}
                      </code>
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                        {e.msg?.type || "event"}
                      </span>
                    </div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-gray-800">
                      {JSON.stringify(e.msg, null, 2)}
                    </pre>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        {/* Right column */}
        <div className="grid gap-6">
          <Section title="Quick actions">
            <div className="grid grid-cols-2 gap-3">
              <button onClick={refresh} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
                Refresh status
              </button>
              <button onClick={restart} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
                Restart client
              </button>
              <button
                onClick={logout}
                className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100"
              >
                Logout & clear
              </button>
              <a
                href={withTokenQS("/admin")}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border px-3 py-2 text-center text-sm hover:bg-gray-50"
              >
                Open built-in admin
              </a>
            </div>
          </Section>

          <Section title="Legend">
            <ul className="space-y-2 text-sm text-gray-700">
              <li>
                <b>booting</b>: client is starting or reconnecting.
              </li>
              <li>
                <b>qr</b>: QR is available and must be scanned from your phone.
              </li>
              <li>
                <b>authenticated</b>: credentials stored, waiting for full readiness.
              </li>
              <li>
                <b>ready</b>: fully connected and operational.
              </li>
              <li>
                <b>disconnected</b>: connection closed; restart or wait for auto-reconnect.
              </li>
            </ul>
          </Section>
        </div>
      </main>

      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-2 text-center text-xs text-gray-500">
        WhatsApp Admin • Powered by whatsapp-web.js • UI updates via SSE
      </footer>
    </div>
  );
}
