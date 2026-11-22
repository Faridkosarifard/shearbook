const express = require("express");
const cors = require("cors");
const qrcode = require("qrcode");

function startAdminServer(client, logger = console, opts = {}) {
  const port = Number(process.env.WHATSAPP_ADMIN_PORT || opts.port || 5001);
  const token = process.env.WHATSAPP_ADMIN_TOKEN || opts.token || "";
  const origin = process.env.WHATSAPP_ADMIN_CORS || opts.cors || "*";
  const app = express();
  app.use(cors({ origin: origin === "*" ? true : origin }));
  app.use(express.json());

  function auth(req, res, next) {
    const provided = req.get("x-admin-token") || req.query.t;
    if (token && provided !== token) {
      return res.status(401).json({ error: "unauthorized" });
    }
    return next();
  }

  let status = "booting";
  let me = null;
  let lastQrPng = null;
  const sseClients = new Set();

  function broadcast(msg) {
    const data = `data: ${JSON.stringify(msg)}\n\n`;
    for (const res of sseClients) {
      try { res.write(data); } catch { /* ignore */ }
    }
  }

  client.on("qr", async (qr) => {
    status = "qr";
    lastQrPng = await qrcode.toBuffer(qr, { type: "png", width: 400 });
    broadcast({ type: "qr" });
  });
  client.on("authenticated", () => {
    status = "authenticated";
    broadcast({ type: "authenticated" });
  });
  client.on("ready", () => {
    status = "ready";
    me = client.info?.wid?.user || null;
    lastQrPng = null;
    broadcast({ type: "ready", me });
  });
  client.on("disconnected", (reason) => {
    status = "disconnected";
    broadcast({ type: "disconnected", reason });
  });

  app.get("/wa/status", auth, (_req, res) => res.json({ status, me, qr: Boolean(lastQrPng) }));
  app.get("/wa/qr.png", auth, (_req, res) => {
    if (!lastQrPng) return res.status(404).json({ error: "no_qr" });
    res.type("png").send(lastQrPng);
  });
  app.get("/wa/events", auth, (req, res) => {
    res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.flushHeaders();
    sseClients.add(res);
    req.on("close", () => sseClients.delete(res));
  });
  app.post("/wa/logout", auth, async (_req, res) => {
    try { await client.logout(); } catch { /* ignore */ }
    status = "disconnected";
    me = null;
    res.json({ status });
  });
  app.post("/wa/restart", auth, async (_req, res) => {
    try { await client.destroy(); } catch { /* ignore */ }
    status = "booting";
    client.initialize();
    res.json({ status });
  });

  const server = app.listen(port, "127.0.0.1", () => {
    logger.info?.(`WhatsApp admin API listening on 127.0.0.1:${port}`);
  });
  return { app, server };
}

module.exports = { startAdminServer };
