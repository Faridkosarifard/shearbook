import { describe, expect, it } from "vitest";
import { appointmentTooltip, earliestOpenMinutes, parseHhmm, scrollToDate } from "./calendarHours";

describe("parseHhmm", () => {
  it("parses hours and minutes", () => {
    expect(parseHhmm("09:00")).toBe(9 * 60);
    expect(parseHhmm("8:30")).toBe(8 * 60 + 30);
  });

  it("rejects invalid values", () => {
    expect(parseHhmm("24:00")).toBeNull();
    expect(parseHhmm("not-a-time")).toBeNull();
    expect(parseHhmm(null)).toBeNull();
  });
});

describe("earliestOpenMinutes", () => {
  it("falls back to 08:00 when nothing is configured", () => {
    expect(earliestOpenMinutes({}, [])).toBe(8 * 60);
  });

  it("uses business hours when no stylist schedules are present", () => {
    expect(earliestOpenMinutes({ business_hours_start: "09:00" }, [])).toBe(9 * 60);
  });

  it("uses the earliest stylist start, even when it is earlier than settings", () => {
    expect(
      earliestOpenMinutes({ business_hours_start: "09:00" }, ["10:00", "07:30", "08:00"]),
    ).toBe(7 * 60 + 30);
  });
});

describe("scrollToDate", () => {
  it("scrolls a little before the opening time", () => {
    const date = scrollToDate({ business_hours_start: "09:00" }, [], new Date(2026, 10, 22));
    expect(date.getHours()).toBe(8);
    expect(date.getMinutes()).toBe(30);
  });

  it("does not scroll before midnight", () => {
    const date = scrollToDate({ business_hours_start: "00:15" }, [], new Date(2026, 10, 22));
    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
  });
});

describe("appointmentTooltip", () => {
  it("includes the customer, service, stylist and time", () => {
    const text = appointmentTooltip({
      title: "Jamie Keller · Cut",
      resource: {
        name: "Jamie Keller",
        service: "Cut",
        stylist_name: "Alex",
        time: "09:00",
        duration: 45,
      },
    });
    expect(text).toContain("Jamie Keller");
    expect(text).toContain("Cut");
    expect(text).toContain("Alex");
    expect(text).toContain("09:00");
    expect(text).toContain("45 min");
  });
});
