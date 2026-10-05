import { describe, expect, it } from "vitest";
import type { PublicData } from "./public-data";
import { canWritePosition, isStale, searchVehicles, STALE_MS, stopsBetween, vehiclesRunningAt } from "./rider-rules";
import { formatAge } from "./time";

// Clearly fake fixtures: places that can never be mistaken for real ones.
const A = "fake/a";
const B = "fake/b";
const C = "fake/c";
const X = "fake/x";

const data: PublicData = {
  routes: [
    { id: "r1", driverId: "d1", name: "خط تجريبي ١", isDefault: true, stops: [A, B, C] },
    { id: "r2", driverId: "d2", name: "خط تجريبي ٢", isDefault: true, stops: [C, X] },
  ],
  vehicles: [
    { id: "v1", driverId: "d1", driverName: "سوّاق", type: "ajala", seats: 10, free: 10, photos: [] },
    { id: "v2", driverId: "d2", driverName: "سوّاق", type: "car", seats: 4, free: 4, photos: [], maintenanceFrom: "2026-10-06" },
  ],
  schedule: [
    { id: "d1:1", driverId: "d1", weekday: 1, working: true, startTime: "06:00", endTime: "14:00" },
    { id: "d2:1", driverId: "d2", weekday: 1, working: true, startTime: "06:00", endTime: "14:00" },
    { id: "d2:2", driverId: "d2", weekday: 2, working: true, startTime: "06:00", endTime: "14:00" },
  ],
  positions: [{ id: "v1", lat: 1, lon: 1, at: "2026-10-05T07:00:00Z" }],
  bookings: [],
    requests: [],
    offers: [],
    messages: [],
};
const monday = (time: string) => ({ day: "2026-10-05", weekday: 1, time });
const tuesday = (time: string) => ({ day: "2026-10-06", weekday: 2, time });

describe("a position's age", () => {
  const at = new Date("2026-10-05T10:00:00Z");
  it("is fresh up to five minutes, the edge included", () => {
    expect(isStale(at, new Date(at.getTime() + STALE_MS))).toBe(false);
    expect(isStale(at, new Date(at.getTime() + 60_000))).toBe(false);
  });
  it("is stale one millisecond past five minutes", () => {
    expect(isStale(at, new Date(at.getTime() + STALE_MS + 1))).toBe(true);
  });
  it("is said in everyday words", () => {
    expect(formatAge(at, at)).toBe("هلأ");
    expect(formatAge(at, at.getTime() + 60_000)).toBe("قبل دقيقة");
    expect(formatAge(at, at.getTime() + 2 * 60_000)).toBe("قبل دقيقتين");
    expect(formatAge(at, at.getTime() + 3 * 60_000)).toBe("قبل 3 دقايق");
    expect(formatAge(at, at.getTime() + 25 * 60_000)).toBe("قبل 25 دقيقة");
    expect(formatAge(at, at.getTime() + 60 * 60_000)).toBe("قبل ساعة");
  });
});

describe("who may write a vehicle's position", () => {
  it("the vehicle's own driver during an open trip", () => {
    expect(canWritePosition({ actorId: "d1", vehicleDriverId: "d1", hasOpenTrip: true })).toBe("ok");
  });
  it("nobody without an open trip", () => {
    expect(canWritePosition({ actorId: "d1", vehicleDriverId: "d1", hasOpenTrip: false })).toBe("no_open_trip");
  });
  it("never another driver, and never a user with no vehicle", () => {
    expect(canWritePosition({ actorId: "d2", vehicleDriverId: "d1", hasOpenTrip: true })).toBe("not_your_vehicle");
    expect(canWritePosition({ actorId: "d1", vehicleDriverId: null, hasOpenTrip: true })).toBe("not_your_vehicle");
  });
});

describe("who is running", () => {
  it("lists working vehicles with their latest position, and null when there is none", () => {
    const now = vehiclesRunningAt(data, monday("07:00"), true);
    expect(now.map((v) => v.vehicle.id)).toEqual(["v1", "v2"]);
    expect(now[0].position?.id).toBe("v1");
    expect(now[1].position).toBeNull();
  });
  it("never attaches a position to a future time", () => {
    expect(vehiclesRunningAt(data, monday("09:00"), false).every((v) => v.position === null)).toBe(true);
  });
});

describe("search by time, from and to", () => {
  const q = (from: string, to: string, at = monday("07:00")) => ({ from, to, at, isNow: true });
  it("finds a vehicle whose route has both stops", () => {
    expect(searchVehicles(data, q(A, C)).map((v) => v.vehicle.id)).toEqual(["v1"]);
  });
  it("works in the other direction too: routes run both ways", () => {
    expect(searchVehicles(data, q(C, A)).map((v) => v.vehicle.id)).toEqual(["v1"]);
  });
  it("finds nothing when a stop is not on the route", () => {
    expect(searchVehicles(data, q(A, X))).toEqual([]);
  });
  it("finds nothing outside the driver's hours, the end minute included", () => {
    expect(searchVehicles(data, q(A, C, monday("05:59")))).toEqual([]);
    expect(searchVehicles(data, q(A, C, monday("14:00")))).toEqual([]);
  });
  it("finds nothing on a day off", () => {
    expect(searchVehicles(data, q(A, C, tuesday("07:00")))).toEqual([]);
  });
  it("hides a vehicle in maintenance from the day it starts", () => {
    expect(searchVehicles(data, q(C, X, monday("07:00"))).map((v) => v.vehicle.id)).toEqual(["v2"]);
    expect(searchVehicles(data, q(C, X, tuesday("07:00")))).toEqual([]);
  });
  it("finds nothing from a place to itself", () => {
    expect(searchVehicles(data, q(A, A))).toEqual([]);
  });
});

describe("the stops a rider passes", () => {
  it("keeps the route order one way and reverses it the other way", () => {
    expect(stopsBetween(data.routes[0], A, C)).toEqual([A, B, C]);
    expect(stopsBetween(data.routes[0], C, B)).toEqual([C, B]);
    expect(stopsBetween(data.routes[0], A, X)).toEqual([]);
  });
});
