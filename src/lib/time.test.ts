import { describe, expect, it } from "vitest";
import { gazaNow, isDay, isTime, WEEK_ORDER } from "./time";

describe("gazaNow", () => {
  it("uses Asia/Gaza, not UTC: late evening UTC is already the next day in Gaza", () => {
    // Saturday 2026-01-10 22:30 UTC = Sunday 00:30 in Gaza (UTC+2 in winter).
    expect(gazaNow(new Date("2026-01-10T22:30:00Z"))).toEqual({ day: "2026-01-11", weekday: 7, time: "00:30" });
  });
  it("gives ISO weekdays: Monday = 1", () => {
    expect(gazaNow(new Date("2026-01-12T10:00:00Z")).weekday).toBe(1);
  });
  it("shows the week Saturday first", () => {
    expect(WEEK_ORDER[0]).toBe(6);
    expect([...WEEK_ORDER].sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("isTime / isDay", () => {
  it("accepts plain local values only", () => {
    expect(isTime("06:00")).toBe(true);
    expect(isTime("24:00")).toBe(false);
    expect(isTime("6:00")).toBe(false);
    expect(isDay("2026-10-05")).toBe(true);
    expect(isDay("05/10/2026")).toBe(false);
  });
});
