import { describe, expect, it } from "vitest";
import { PLACES } from "@/lib/places";
import { searchLogRow } from "./search-log";

const [a, b] = PLACES;
const NOW = new Date("2026-10-05T07:41:27.123Z");

describe("searchLogRow", () => {
  it("keeps only the search itself, with the time rounded down to the hour", () => {
    const row = searchLogRow(
      { from: a.id, to: b.id, weekday: 1, hour: 10, options: 2, userId: "u1", email: "x@y.z", ip: "10.0.0.1", text: "بدي أروح", phone: "0590000000" },
      NOW,
    );
    expect(row).toEqual({ fromPlaceId: a.id, toPlaceId: b.id, weekday: 1, hour: 10, options: 2, createdAt: new Date("2026-10-05T07:00:00.000Z") });
  });

  it("has no field that could identify a person", () => {
    const row = searchLogRow({ from: a.id, to: b.id, weekday: 1, hour: 10, options: 0 }, NOW)!;
    expect(Object.keys(row).sort()).toEqual(["createdAt", "fromPlaceId", "hour", "options", "toPlaceId", "weekday"]);
  });

  it("refuses places that are not in the gazetteer, and broken numbers", () => {
    expect(searchLogRow({ from: "node/1", to: b.id, weekday: 1, hour: 10, options: 1 }, NOW)).toBeNull();
    expect(searchLogRow({ from: a.id, to: a.id, weekday: 1, hour: 10, options: 1 }, NOW)).toBeNull();
    expect(searchLogRow({ from: a.id, to: b.id, weekday: 8, hour: 10, options: 1 }, NOW)).toBeNull();
    expect(searchLogRow({ from: a.id, to: b.id, weekday: 1, hour: 24, options: 1 }, NOW)).toBeNull();
    expect(searchLogRow({ from: a.id, to: b.id, weekday: 1, hour: 10, options: 9 }, NOW)).toBeNull();
    expect(searchLogRow("hello", NOW)).toBeNull();
  });
});
