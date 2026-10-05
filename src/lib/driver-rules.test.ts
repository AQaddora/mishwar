import { describe, expect, it } from "vitest";
import {
  isRunning,
  toRouteStops,
  validateMaintenance,
  validateSchedule,
  validateStops,
  validateVehicle,
  type ScheduleDayInput,
} from "./driver-rules";

// Clearly fake fixtures (never real places): see the gaza-transit-domain skill.
const A_B = { id: "route-a-b", isDefault: true };
const C_D = { id: "route-c-d", isDefault: false };
const inService = { maintenanceFrom: null, maintenanceUntil: null };
const tuesday = (time: string) => ({ day: "2026-10-06", weekday: 2, time });
const day = (patch: Partial<ScheduleDayInput> = {}): ScheduleDayInput => ({
  weekday: 2,
  working: true,
  startTime: "06:00",
  endTime: "14:00",
  routeId: null,
  ...patch,
});

describe("isRunning: who is running right now", () => {
  it("runs the default route inside today's hours", () => {
    const state = isRunning({ vehicle: inService, schedule: [day()], routes: [A_B, C_D] }, tuesday("09:00"));
    expect(state).toEqual({ running: true, routeId: "route-a-b", startTime: "06:00", endTime: "14:00" });
  });

  it("starts on the first minute and stops on the minute the hours end", () => {
    const input = { vehicle: inService, schedule: [day()], routes: [A_B] };
    expect(isRunning(input, tuesday("05:59")).running).toBe(false);
    expect(isRunning(input, tuesday("06:00")).running).toBe(true);
    expect(isRunning(input, tuesday("13:59")).running).toBe(true);
    expect(isRunning(input, tuesday("14:00"))).toEqual({ running: false, reason: "outside_hours" });
  });

  it("maintenance comes first, even on a working day inside hours", () => {
    const vehicle = { maintenanceFrom: "2026-10-01", maintenanceUntil: "2026-10-06" };
    const input = { vehicle, schedule: [day()], routes: [A_B] };
    expect(isRunning(input, tuesday("09:00"))).toEqual({ running: false, reason: "maintenance" });
    // The day after the last maintenance day the vehicle is back.
    expect(isRunning(input, { day: "2026-10-07", weekday: 2, time: "09:00" }).running).toBe(true);
    // Before it starts, too.
    expect(isRunning(input, { day: "2026-09-30", weekday: 2, time: "09:00" }).running).toBe(true);
  });

  it("maintenance with no end day lasts until the driver says it's back", () => {
    const vehicle = { maintenanceFrom: "2026-10-01", maintenanceUntil: null };
    const state = isRunning({ vehicle, schedule: [day()], routes: [A_B] }, { day: "2027-03-01", weekday: 2, time: "09:00" });
    expect(state).toEqual({ running: false, reason: "maintenance" });
  });

  it("today switched off by an urgent edit: not running", () => {
    const state = isRunning({ vehicle: inService, schedule: [day({ working: false })], routes: [A_B] }, tuesday("09:00"));
    expect(state).toEqual({ running: false, reason: "day_off" });
  });

  it("a weekday with no row is a day off", () => {
    const state = isRunning({ vehicle: inService, schedule: [day({ weekday: 3 })], routes: [A_B] }, tuesday("09:00"));
    expect(state).toEqual({ running: false, reason: "day_off" });
  });

  it("today's route switched from A → B to C → D", () => {
    const state = isRunning(
      { vehicle: inService, schedule: [day({ routeId: "route-c-d" })], routes: [A_B, C_D] },
      tuesday("09:00"),
    );
    expect(state).toMatchObject({ running: true, routeId: "route-c-d" });
  });

  it("no vehicle or no route: not running", () => {
    expect(isRunning({ vehicle: null, schedule: [day()], routes: [A_B] }, tuesday("09:00"))).toEqual({
      running: false,
      reason: "no_vehicle",
    });
    expect(isRunning({ vehicle: inService, schedule: [day()], routes: [] }, tuesday("09:00"))).toEqual({
      running: false,
      reason: "no_route",
    });
  });
});

describe("validateStops", () => {
  const known = (id: string) => id.startsWith("fake/");

  it("needs at least two stops", () => {
    expect(validateStops([], known)).not.toBeNull();
    expect(validateStops(["fake/1"], known)).not.toBeNull();
    expect(validateStops(["fake/1", "fake/2"], known)).toBeNull();
  });
  it("refuses the same place twice", () => {
    expect(validateStops(["fake/1", "fake/2", "fake/1"], known)).not.toBeNull();
  });
  it("refuses a place that is not in the gazetteer", () => {
    expect(validateStops(["fake/1", "invented/9"], known)).not.toBeNull();
  });
  it("refuses anything that is not a list of ids", () => {
    expect(validateStops("fake/1,fake/2", known)).not.toBeNull();
    expect(validateStops(["fake/1", 2], known)).not.toBeNull();
  });
  it("keeps the driver's order, with positions contiguous from 0", () => {
    expect(toRouteStops(["fake/z", "fake/a", "fake/m"])).toEqual([
      { position: 0, placeId: "fake/z" },
      { position: 1, placeId: "fake/a" },
      { position: 2, placeId: "fake/m" },
    ]);
  });
});

describe("validateSchedule", () => {
  const own = ["route-a-b", "route-c-d"];

  it("accepts a normal week", () => {
    expect(validateSchedule([day({ weekday: 6 }), day({ weekday: 7, routeId: "route-c-d" })], own)).toBeNull();
  });
  it("on a working day the end must be after the start", () => {
    expect(validateSchedule([day({ startTime: "14:00", endTime: "06:00" })], own)).not.toBeNull();
    expect(validateSchedule([day({ startTime: "06:00", endTime: "06:00" })], own)).not.toBeNull();
  });
  it("a day off may keep any hours", () => {
    expect(validateSchedule([day({ working: false, startTime: "14:00", endTime: "06:00" })], own)).toBeNull();
  });
  it("at most one row per weekday", () => {
    expect(validateSchedule([day(), day()], own)).not.toBeNull();
  });
  it("a day's route must be one of the driver's own", () => {
    expect(validateSchedule([day({ routeId: "someone-elses-route" })], own)).not.toBeNull();
  });
  it("refuses a weekday outside 1–7 and broken times", () => {
    expect(validateSchedule([day({ weekday: 8 })], own)).not.toBeNull();
    expect(validateSchedule([day({ startTime: "6am" })], own)).not.toBeNull();
  });
});

describe("validateVehicle / validateMaintenance", () => {
  it("capacity is whatever the driver sets, at least 1", () => {
    expect(validateVehicle({ type: "ajala", seats: 10 })).toBeNull();
    expect(validateVehicle({ type: "car", seats: 0 })).not.toBeNull();
    expect(validateVehicle({ type: "car", seats: 2.5 })).not.toBeNull();
    expect(validateVehicle({ type: "truck", seats: 4 })).not.toBeNull();
  });
  it("maintenance: an end day can't come before the start day", () => {
    expect(validateMaintenance({ from: "2026-10-05", until: null })).toBeNull();
    expect(validateMaintenance({ from: "2026-10-05", until: "2026-10-04" })).not.toBeNull();
    expect(validateMaintenance({ from: null, until: null })).toBeNull();
    expect(validateMaintenance({ from: null, until: "2026-10-04" })).not.toBeNull();
  });
});
