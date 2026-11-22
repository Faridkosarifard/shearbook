import { describe, expect, it } from "vitest";
import { readCookie } from "./api";

describe("readCookie", () => {
  it("returns a named cookie value", () => {
    Object.defineProperty(document, "cookie", {
      writable: true,
      value: "csrf_token=abc%2F123; other=1",
    });
    expect(readCookie("csrf_token")).toBe("abc/123");
    expect(readCookie("missing")).toBeNull();
  });
});
