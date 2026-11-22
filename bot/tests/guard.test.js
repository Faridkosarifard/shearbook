const { test } = require("node:test");
const assert = require("node:assert/strict");
const { shouldHandleMessage, isSystemOrStatus } = require("../guard");

test("drops system and empty messages", async () => {
  assert.equal(isSystemOrStatus({ fromMe: true, from: "x" }), true);
  assert.equal(isSystemOrStatus({ from: "status@broadcast" }), true);
  const ok = await shouldHandleMessage({
    from: "49170@c.us",
    type: "chat",
    body: "termin",
    timestamp: Math.floor(Date.now() / 1000) + 10,
    id: { _serialized: "msg-1" },
  });
  assert.equal(ok, true);
  const dup = await shouldHandleMessage({
    from: "49170@c.us",
    type: "chat",
    body: "termin",
    timestamp: Math.floor(Date.now() / 1000) + 10,
    id: { _serialized: "msg-1" },
  });
  assert.equal(dup, false);
});
