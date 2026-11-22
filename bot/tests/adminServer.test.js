const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("events");
const { startAdminServer } = require("../adminServer");

test("status reports whether a QR image is available", async (t) => {
  const client = new EventEmitter();
  const { server } = startAdminServer(client, { info() {} }, { port: 0, token: "secret" });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  if (!server.listening) {
    await new Promise((resolve) => server.on("listening", resolve));
  }
  const { port } = server.address();
  const res = await fetch(`http://127.0.0.1:${port}/wa/status`, {
    headers: { "X-Admin-Token": "secret" },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.status, "booting");
  assert.equal(body.qr, false);
  assert.equal(body.me, null);
});
