import { describe, expect, it } from "vitest";
import { parseStatus } from "./WhatsApp";

describe("parseStatus", () => {
  it("treats a missing body as offline with no QR", () => {
    expect(parseStatus(null)).toEqual({ status: "offline", me: null, qr: false });
  });

  it("trusts the qr flag from the bridge", () => {
    expect(parseStatus({ status: "qr", me: null, qr: true })).toEqual({
      status: "qr",
      me: null,
      qr: true,
    });
  });

  it("does not show a QR when the client is offline", () => {
    expect(parseStatus({ status: "offline", me: null, qr: false }).qr).toBe(false);
  });
});
