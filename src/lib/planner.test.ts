import { describe, expect, it } from "vitest";
import type { PublicData, SyncPosition } from "./public-data";
import { MAX_OPTIONS, planTrips, TYPICAL_SPEED_MPS, type PlanQuery } from "./planner";

// A tiny FIXED network of clearly fake places: test names, coordinates on the equator
// (nowhere near the Gaza Strip), and a `fake` marker. One hundredth of a degree is
// 1,112 metres, so the arithmetic below can be checked by hand.
const FAKE_PLACES: Record<string, { nameAr: string; lat: number; lon: number; fake: true }> = {
  s1: { nameAr: "موقف تجريبي ١", lat: 0.0, lon: 0, fake: true },
  s2: { nameAr: "موقف تجريبي ٢", lat: 0.01, lon: 0, fake: true },
  s3: { nameAr: "موقف تجريبي ٣", lat: 0.02, lon: 0, fake: true },
  s6: { nameAr: "موقف تجريبي ٦", lat: 0.02, lon: 0.01, fake: true },
  s7: { nameAr: "موقف تجريبي ٧", lat: 0.02, lon: 0.02, fake: true },
  s9: { nameAr: "موقف تجريبي ٩", lat: 0.09, lon: 0.09, fake: true },
};
const places = (id: string) => FAKE_PLACES[id];
const STEP = 1112; // metres between neighbouring fake stops (rounded)

const NOW = Date.parse("2026-10-05T07:00:00Z"); // 10:00 on a Monday in Gaza
const AT = { day: "2026-10-05", weekday: 1, time: "10:00" };

function driver(id: string, stops: string[], hours: [string, string] = ["06:00", "20:00"], seats = 4) {
  return {
    route: { id: `route-${id}`, driverId: `driver-${id}`, name: `خط تجريبي ${id}`, isDefault: true, stops },
    vehicle: { id: `vehicle-${id}`, driverId: `driver-${id}`, driverName: `سوّاق ${id}`, type: "car" as const, seats, free: seats, photos: [] },
    schedule: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      id: `driver-${id}:${weekday}`,
      driverId: `driver-${id}`,
      weekday,
      working: true,
      startTime: hours[0],
      endTime: hours[1],
    })),
  };
}
function network(drivers: ReturnType<typeof driver>[], positions: SyncPosition[] = []): PublicData {
  return {
    routes: drivers.map((d) => d.route),
    vehicles: drivers.map((d) => d.vehicle),
    schedule: drivers.flatMap((d) => d.schedule),
    bookings: [],
    requests: [],
    offers: [],
    messages: [],
    positions,
  };
}
const at = (vehicle: string, stop: string, speed: number | undefined, ageMinutes = 0): SyncPosition => ({
  id: `vehicle-${vehicle}`,
  lat: FAKE_PLACES[stop].lat,
  lon: FAKE_PLACES[stop].lon,
  ...(speed === undefined ? {} : { speed }),
  at: new Date(NOW - ageMinutes * 60_000).toISOString(),
});
const query = (from: string, to: string, extra: Partial<PlanQuery> = {}): PlanQuery => ({ from, to, at: AT, isNow: true, now: NOW, ...extra });

const A = driver("a", ["s1", "s2", "s3"]);
const B = driver("b", ["s3", "s6", "s7"]);

describe("planTrips on a tiny fixed network", () => {
  it("finds a direct trip, with an arrival time from the fresh position", () => {
    const [option, ...rest] = planTrips(network([A, B], [at("a", "s2", 10)]), query("s1", "s3"), places);
    expect(rest).toHaveLength(0);
    expect(option.legs).toHaveLength(1);
    expect(option.changeAt).toBeUndefined();
    const leg = option.legs[0];
    expect(leg).toMatchObject({ from: "s1", to: "s3", fromPosition: 0, toPosition: 2, stopCount: 2, day: "2026-10-05" });
    // The vehicle is one stop away (1,112 m at 10 m/s), then rides two stops.
    expect(leg.boardInMinutes!).toBeCloseTo(STEP / 10 / 60, 1);
    expect(option.arriveInMinutes!).toBeCloseTo((3 * STEP) / 10 / 60, 1);
  });

  it("finds a two-vehicle trip with the wait at the change stop", () => {
    const data = network([A, B], [at("a", "s2", 10), at("b", "s7", 5)]);
    const [option] = planTrips(data, query("s1", "s7"), places);
    expect(option.legs).toHaveLength(2);
    expect(option.changeAt).toBe("s3");
    expect(option.legs.map((l) => [l.vehicle.id, l.from, l.to, l.stopCount])).toEqual([
      ["vehicle-a", "s1", "s3", 2],
      ["vehicle-b", "s3", "s7", 2],
    ]);
    expect(option.stopCount).toBe(4);
    const riderAtChange = (3 * STEP) / 10 / 60; // 5.6 minutes
    const secondAtChange = (2 * STEP) / 5 / 60; // 7.4 minutes
    expect(option.waitMinutes!).toBeCloseTo(secondAtChange - riderAtChange, 1);
    expect(option.arriveInMinutes!).toBeCloseTo((4 * STEP) / 5 / 60, 1);
  });

  it("gives no time for a change when the second vehicle passes before the rider gets there", () => {
    const data = network([A, B], [at("a", "s2", 10), at("b", "s6", 10)]);
    const [option] = planTrips(data, query("s1", "s7"), places);
    expect(option.legs).toHaveLength(2);
    expect(option.waitMinutes).toBeNull();
    expect(option.arriveInMinutes).toBeNull();
  });

  it("returns nothing when there is no route", () => {
    expect(planTrips(network([A, B], [at("a", "s2", 10)]), query("s1", "s9"), places)).toEqual([]);
    expect(planTrips(network([A]), query("s1", "s7"), places)).toEqual([]);
    expect(planTrips(network([A, B]), query("s1", "s1"), places)).toEqual([]);
  });

  it("works in the opposite direction: routes run both ways", () => {
    const [option] = planTrips(network([A, B], [at("a", "s1", 10)]), query("s3", "s1"), places);
    expect(option.legs[0]).toMatchObject({ fromPosition: 2, toPosition: 0, stopCount: 2 });
    expect(option.arriveInMinutes!).toBeCloseTo((4 * STEP) / 10 / 60, 1);
    const [back] = planTrips(network([A, B]), query("s7", "s1"), places);
    expect(back.legs.map((l) => l.vehicle.id)).toEqual(["vehicle-b", "vehicle-a"]);
    expect(back.changeAt).toBe("s3");
  });

  it("uses a typical speed when the phone reports none, or is standing still", () => {
    for (const speed of [undefined, 0]) {
      const [option] = planTrips(network([A], [at("a", "s2", speed)]), query("s1", "s3"), places);
      expect(option.arriveInMinutes!).toBeCloseTo((3 * STEP) / TYPICAL_SPEED_MPS / 60, 1);
    }
  });

  it("gives no time from a stale position, and none without a position", () => {
    const [stale] = planTrips(network([A], [at("a", "s2", 10, 6)]), query("s1", "s3"), places);
    expect(stale.arriveInMinutes).toBeNull();
    expect(stale.legs[0].boardInMinutes).toBeNull();
    expect(stale.legs[0].position).not.toBeNull(); // the screen still says how old it is
    const [none] = planTrips(network([A]), query("s1", "s3"), places);
    expect(none.arriveInMinutes).toBeNull();
  });

  it("leaves out a vehicle that is not running at the chosen time", () => {
    const early = driver("early", ["s1", "s2", "s3"], ["06:00", "09:00"]);
    const options = planTrips(network([A, early], [at("early", "s1", 10)]), query("s1", "s3"), places);
    expect(options.map((o) => o.legs[0].vehicle.id)).toEqual(["vehicle-a"]);
  });

  it("for a later time lists who will be running, with no position and no time", () => {
    const later = query("s1", "s3", { at: { day: "2026-10-06", weekday: 2, time: "08:00" }, isNow: false });
    const [option] = planTrips(network([A], [at("a", "s2", 10)]), later, places);
    expect(option.legs[0].day).toBe("2026-10-06");
    expect(option.legs[0].position).toBeNull();
    expect(option.arriveInMinutes).toBeNull();
  });

  it("sorts timed options before untimed ones, earliest arrival first", () => {
    const slow = driver("slow", ["s1", "s2", "s3"]);
    const fast = driver("fast", ["s1", "s2", "s3"]);
    const quiet = driver("quiet", ["s1", "s3"]);
    const data = network([quiet, slow, fast], [at("slow", "s1", 5), at("fast", "s1", 10)]);
    const options = planTrips(data, query("s1", "s3"), places);
    expect(options.map((o) => o.legs[0].vehicle.id)).toEqual(["vehicle-fast", "vehicle-slow", "vehicle-quiet"]);
  });

  it("puts a direct trip before a change when neither has a time", () => {
    const through = driver("through", ["s1", "s3", "s7"]);
    const options = planTrips(network([A, B, through]), query("s1", "s7"), places);
    expect(options.map((o) => o.legs.length)).toEqual([1, 2]);
  });

  it("never returns more than three options", () => {
    const many = ["m1", "m2", "m3", "m4", "m5"].map((id) => driver(id, ["s1", "s2", "s3"]));
    expect(planTrips(network(many), query("s1", "s3"), places)).toHaveLength(MAX_OPTIONS);
  });
});
