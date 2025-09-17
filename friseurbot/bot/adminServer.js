// adminServer.js
/**
 * Lightweight admin HTTP server for a whatsapp-web.js client.
 * - GET  /wa/status, /wa/qr.png, /wa/events (SSE), /wa/debug
 * - POST /wa/logout, /wa/restart
 * - GET  /wa/nudge  (manual kickstart)
 * - Built-in /admin page for quick checks
 *
 * Auth:
 * - Header: x-admin-token  or  Query: ?t=
 */

const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");
const os = require("os");

/**
 * @param {import("whatsapp-web.js").Client} client
 * @param {Console} [logger=console]
 * @param {{ port?: number, token?: string, cors?: string }} [opts]
 */
function startAdminServer(client, logger = console, opts = {}) {
  const ADMIN_PORT = Number(process.env.ADMIN_PORT || opts.port || 5001);
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || opts.token || "";
  const CORS_ORIGIN = process.env.ADMIN_CORS || opts.cors || "*";

  const app = express();

  app.use(
    cors({
      origin: (origin, cb) =>
        cb(null, CORS_ORIGIN === "*" ? true : origin === CORS_ORIGIN),
    }),
  );
  app.use(express.json());

  function auth(req, res, next) {
    const tok = req.get("x-admin-token") || req.query.t;
    if (ADMIN_TOKEN && tok !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "unauthorized" });
    }
    next();
  }

  /** @type {"booting"|"qr"|"authenticated"|"ready"|"disconnected"} */
  let status = "booting";
  let me = null;
  let lastQrPng = null;

  // ---------- SSE ----------
  const sseClients = new Set();
  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of sseClients) {
      try { res.write(data); } catch {}
    }
  }

  // ---------- Promote-to-ready / Kickstart ----------
  let firstConnectedAt = null;
  let lastNudgeAt = 0;

  function tryPromoteToReady() {
    if (status === "ready") return true;
    const wid = client?.info?.wid;
    broadcast({ type: "promote_try", hasWid: !!wid });
    if (wid) {
      me = (wid.user || wid._serialized) || null;
      status = "ready";
      broadcast({ type: "ready", me });
      return true;
    }
    return false;
  }

  async function kickstartDataLoad(source = "auto") {
    try {
      broadcast({ type: "nudge", from: source });
      // این فراخوانی‌ها معمولاً باعث تکمیل Hydration داخلی می‌شوند
      await client.getChats().catch(() => {});
      await client.getContacts().catch(() => {});
      tryPromoteToReady();
    } catch (e) {
      logger.error("kickstartDataLoad error:", e?.message || e);
      broadcast({ type: "nudge_error", message: String(e?.message || e) });
    }
  }

  // ---------- WWebJS events ----------
  client.on("qr", async (qr) => {
    try {
      lastQrPng = await qrcode.toBuffer(qr, { type: "png", width: 320, margin: 1 });
      status = "qr";
      broadcast({ type: "qr" });
    } catch (e) {
      logger.error("QR render error:", e.message);
    }
  });

  client.on("authenticated", () => {
    status = "authenticated";
    broadcast({ type: "authenticated" });
    setTimeout(() => kickstartDataLoad("authenticated"), 1500);
  });

  client.on("ready", () => {
    status = "ready";
    const wid = client?.info?.wid;
    me = (wid && (wid.user || wid._serialized)) || null;
    broadcast({ type: "ready", me });
  });

  client.on("disconnected", (reason) => {
    status = "disconnected";
    broadcast({ type: "disconnected", reason });
  });

  // دیباگ اضافه
  client.on("loading_screen", (percent, message) => {
    broadcast({ type: "loading_screen", percent, message });
  });
  client.on("change_state", (state) => {
    broadcast({ type: "change_state", state }); // OPENING / CONNECTED ...
    if (state === "CONNECTED") {
      firstConnectedAt = Date.now();
      setTimeout(() => kickstartDataLoad("change_state"), 1000);
      setTimeout(tryPromoteToReady, 3000);
    }
  });
  client.on("auth_failure", (m) => {
    broadcast({ type: "auth_failure", message: String(m || "") });
  });
  client.on("remote_session_saved", () => {
    broadcast({ type: "remote_session_saved" });
  });

  // Mirror logger → SSE
  const emitLog = (level, ...args) => {
    const msg = args.map(a => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
    broadcast({ type: "log", level, msg });
  };
  if (logger && logger.info && logger.error) {
    const origInfo = logger.info.bind(logger);
    const origWarn = (logger.warn || console.warn).bind(logger);
    const origErr = logger.error.bind(logger);
    logger.info = (...a) => { emitLog("info", ...a); return origInfo(...a); };
    logger.warn = (...a) => { emitLog("warn", ...a); return origWarn(...a); };
    logger.error = (...a) => { emitLog("error", ...a); return origErr(...a); };
  }

  // ---------- Routes ----------
  app.get(["/wa/status", "/status"], auth, (_req, res) => {
    res.json({ status, me });
  });

  app.get(["/wa/qr.png", "/qr.png"], auth, (_req, res) => {
    if (!lastQrPng) return res.status(404).end();
    res.set("Content-Type", "image/png");
    res.set("Cache-Control", "no-store");
    res.send(lastQrPng);
  });

  app.get(["/wa/events", "/events"], auth, (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    res.write(`data: ${JSON.stringify({ type: "hello", status, me, host: os.hostname() })}\n\n`);
    sseClients.add(res);
    req.on("close", () => { sseClients.delete(res); });
  });

  // Quick diagnostic
  app.get(["/wa/debug", "/debug"], auth, async (_req, res) => {
    try {
      const st = await client.getState().catch(() => null); // "CONNECTED" | "OPENING" | null
      res.json({ status, me, state: st, info: client?.info || null });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Manual nudge
  app.get(["/wa/nudge", "/nudge"], auth, async (_req, res) => {
    await kickstartDataLoad("manual");
    res.json({ ok: true });
  });

  app.post(["/wa/logout", "/logout"], auth, async (_req, res) => {
    try {
      await client.logout();
      status = "booting";
      lastQrPng = null;
      broadcast({ type: "logged_out" });
      await client.initialize();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.post(["/wa/restart", "/restart"], auth, async (_req, res) => {
    try {
      status = "booting";
      lastQrPng = null;
      me = null;
      broadcast({ type: "restarting" });
      await client.destroy();
      await client.initialize();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/admin", auth, (_req, res) => {
    res.type("html").send(`<html><body>
      <h1>WhatsApp Admin</h1>
      <p>Status: <b>${status}</b></p>
      <p>Account: <code>${me || "-"}</code></p>
      <p><img src="/wa/qr.png?t=${Date.now()}" width="240" onerror="this.replaceWith('No QR')" /></p>
    </body></html>`);
  });

  // ---------- Keepalive ----------
  setInterval(() => broadcast({ type: "ping", ts: Date.now() }), 25_000);

  // ---------- Watchdog ----------
  setInterval(async () => {
    try {
      // هر ۵ ثانیه نوج بزن (سبک)، اگر هنوز آماده نیست— ولی اسپم نکن
      const now = Date.now();
      if (now - lastNudgeAt > 5_000 && status === "authenticated") {
        lastNudgeAt = now;
        await kickstartDataLoad("watchdog");
      }

      // اگر در authenticated گیر کرده ولی state=CONNECTED است، پیشروی کن/در نهایت ریستارت کن
      const st = await client.getState().catch(() => null);
      broadcast({ type: "watchdog_tick", status, st });

      if (status === "authenticated" && st === "CONNECTED") {
        if (!firstConnectedAt) firstConnectedAt = Date.now();
        if (!tryPromoteToReady()) {
          // بالا نرفت؟ صبر می‌کنیم تا تایم‌اوت
        }
        const stuckFor = Date.now() - firstConnectedAt;
        if (stuckFor > 120_000) {
          logger.warn("Stuck in authenticated while CONNECTED; restarting client…");
          broadcast({ type: "stuck_authenticated", ms: stuckFor });
          firstConnectedAt = null;
          await client.destroy();
          await client.initialize();
        }
      }
    } catch (e) {
      logger.error("watchdog error:", e?.message || e);
      broadcast({ type: "watchdog_error", message: String(e?.message || e) });
    }
  }, 5_000);

  app.listen(ADMIN_PORT, () => {
    logger.info(`✅ Admin server listening on :${ADMIN_PORT}`);
  });

  return app;
}

module.exports = { startAdminServer };
