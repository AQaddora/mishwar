import { describe, expect, it } from "vitest";
import {
  bookBoxView,
  canCancelNotReady,
  canStartTrip,
  canWriteSharedPosition,
  decideBooking,
  isDue,
  isLive,
  offRouteStep,
  OFF_ROUTE_MS,
  phoneVisible,
  recheckBooking,
  SHARE_MS,
  shareIsActive,
  shareIsOpen,
  validBookingShape,
  type DriverState,
} from "./booking-rules";

// 2026-10-05 is a Monday (ISO weekday 1). Fake stops on purpose: no real place is needed.
const MONDAY = "2026-10-05";
const week = (patch: Partial<{ working: boolean; startTime: string; endTime: string; routeId: string | null }> = {}) =>
  [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, working: true, startTime: "06:00", endTime: "18:00", routeId: null, ...patch }));
const driver = (patch: Partial<DriverState> = {}): DriverState => ({
  vehicle: { seats: 4, maintenanceFrom: null, maintenanceUntil: null },
  schedule: week(),
  routes: [
    { id: "r1", isDefault: true, stops: ["fake/1", "fake/2", "fake/3"] },
    { id: "r2", isDefault: false, stops: ["fake/2", "fake/3", "fake/9"] },
  ],
  ...patch,
});
const ask = { routeId: "r1", day: MONDAY, time: "08:00", fromPosition: 0, toPosition: 2, seats: 1 };

describe("booking a seat: the server decides", () => {
  it("accepts while seats are left, and names the two stops", () => {
    expect(decideBooking(ask, driver(), 3)).toEqual({ ok: true, fromPlaceId: "fake/1", toPlaceId: "fake/3" });
  });
  it("never oversells: the booking that would pass the capacity loses", () => {
    expect(decideBooking(ask, driver(), 4)).toEqual({ ok: false, reason: "seats_gone" });
    expect(decideBooking({ ...ask, seats: 2 }, driver(), 3)).toEqual({ ok: false, reason: "seats_gone" });
  });
  it("accepts the way back (a later stop to an earlier one)", () => {
    expect(decideBooking({ ...ask, fromPosition: 2, toPosition: 0 }, driver(), 0)).toMatchObject({ ok: true, fromPlaceId: "fake/3", toPlaceId: "fake/1" });
  });
  it("refuses outside the driver's hours, on a day off and during maintenance", () => {
    expect(decideBooking({ ...ask, time: "18:00" }, driver(), 0)).toEqual({ ok: false, reason: "not_running" });
    expect(decideBooking(ask, driver({ schedule: week({ working: false }) }), 0)).toEqual({ ok: false, reason: "not_running" });
    expect(decideBooking(ask, driver({ vehicle: { seats: 4, maintenanceFrom: MONDAY, maintenanceUntil: null } }), 0)).toEqual({ ok: false, reason: "maintenance" });
    expect(decideBooking(ask, driver({ vehicle: null }), 0)).toEqual({ ok: false, reason: "not_running" });
  });
  it("refuses a route the driver is not driving that day, and a stop that is not on it", () => {
    expect(decideBooking(ask, driver({ schedule: week({ routeId: "r2" }) }), 0)).toEqual({ ok: false, reason: "stop_not_on_route" });
    expect(decideBooking({ ...ask, toPosition: 7 }, driver(), 0)).toEqual({ ok: false, reason: "stop_not_on_route" });
  });
  it("checks the shape of what the phone sent", () => {
    expect(validBookingShape(ask, MONDAY)).toBe(true);
    expect(validBookingShape({ ...ask, seats: 0 }, MONDAY)).toBe(false);
    expect(validBookingShape({ ...ask, seats: 7 }, MONDAY)).toBe(false);
    expect(validBookingShape({ ...ask, toPosition: 0 }, MONDAY)).toBe(false);
    expect(validBookingShape({ ...ask, day: "2026-10-04" }, MONDAY)).toBe(false);
    expect(validBookingShape({ ...ask, time: "8" }, MONDAY)).toBe(false);
  });
});

describe("a schedule or maintenance change against an existing booking", () => {
  const booking = { day: MONDAY, time: "08:00", fromPlaceId: "fake/2", toPlaceId: "fake/3" };
  it("keeps it when nothing that matters changed", () => {
    expect(recheckBooking(booking, driver())).toEqual({ keep: true, routeId: "r1", fromPosition: 1, toPosition: 2 });
  });
  it("moves it to the day's new route when both stops are on it", () => {
    expect(recheckBooking(booking, driver({ schedule: week({ routeId: "r2" }) }))).toEqual({ keep: true, routeId: "r2", fromPosition: 0, toPosition: 1 });
  });
  it("cancels it when the new route skips one of its stops", () => {
    expect(recheckBooking({ ...booking, fromPlaceId: "fake/1" }, driver({ schedule: week({ routeId: "r2" }) }))).toEqual({ keep: false, reason: "schedule_change" });
  });
  it("cancels it when the day is switched off or the hours no longer cover it", () => {
    expect(recheckBooking(booking, driver({ schedule: week({ working: false }) }))).toEqual({ keep: false, reason: "schedule_change" });
    expect(recheckBooking(booking, driver({ schedule: week({ startTime: "09:00" }) }))).toEqual({ keep: false, reason: "schedule_change" });
  });
  it("cancels it with the maintenance reason", () => {
    expect(recheckBooking(booking, driver({ vehicle: { seats: 4, maintenanceFrom: "2026-10-01", maintenanceUntil: null } }))).toEqual({ keep: false, reason: "maintenance" });
  });
});

describe("before the trip", () => {
  it("start is locked while any due rider is only confirmed", () => {
    expect(canStartTrip([])).toBe(true);
    expect(canStartTrip([{ status: "ready" }, { status: "cancelled" }])).toBe(true);
    expect(canStartTrip([{ status: "ready" }, { status: "confirmed" }])).toBe(false);
  });
  it("due means today, and within the hour or overdue", () => {
    const now = { day: MONDAY, time: "08:00" };
    expect(isDue({ day: MONDAY, time: "07:00" }, now)).toBe(true);
    expect(isDue({ day: MONDAY, time: "09:00" }, now)).toBe(true);
    expect(isDue({ day: MONDAY, time: "09:01" }, now)).toBe(false);
    expect(isDue({ day: "2026-10-06", time: "08:00" }, now)).toBe(false);
  });
  it("a not-ready cancel needs a call first", () => {
    expect(canCancelNotReady({ status: "confirmed", calledAt: null })).toBe(false);
    expect(canCancelNotReady({ status: "confirmed", calledAt: new Date() })).toBe(true);
    expect(canCancelNotReady({ status: "cancelled", calledAt: new Date() })).toBe(false);
  });
});

describe("phones (invariant 11)", () => {
  it("are visible only while a live booking links rider and driver", () => {
    expect(phoneVisible({ status: "confirmed" })).toBe(true);
    expect(phoneVisible({ status: "ready" })).toBe(true);
    expect(phoneVisible({ status: "cancelled" })).toBe(false);
    expect(phoneVisible({ status: "rejected" })).toBe(false);
    expect(phoneVisible({ status: "ready", completedAt: new Date() })).toBe(false);
    expect(isLive({ status: "ready", completedAt: null })).toBe(true);
  });
});

describe("sharing the rider's location (invariant 12)", () => {
  const T = Date.parse("2026-10-05T08:00:00Z");
  const share = (patch = {}) => ({ answer: null as string | null, expiresAt: new Date(T + SHARE_MS), endedAt: null as Date | null, ...patch });
  const write = (s: ReturnType<typeof share> | null, extra = {}) => canWriteSharedPosition({ share: s, shareRiderId: "rider", actorId: "rider", tripStarted: false, now: T + 1000, ...extra });

  it("no position can be written without a yes to that ask", () => {
    expect(write(share())).toBe("no_consent");
    expect(write(share({ answer: "no" }))).toBe("no_consent");
    expect(write(share({ answer: "yes" }))).toBe("ok");
  });
  it("only the rider who was asked can write", () => {
    expect(write(share({ answer: "yes" }), { actorId: "someone-else" })).toBe("not_yours");
    expect(write(null)).toBe("not_yours");
  });
  it("it ends at trip start, or 15 minutes after the ask, whichever comes first", () => {
    expect(write(share({ answer: "yes" }), { tripStarted: true })).toBe("ended");
    expect(write(share({ answer: "yes" }), { now: T + SHARE_MS - 1 })).toBe("ok");
    expect(write(share({ answer: "yes" }), { now: T + SHARE_MS })).toBe("ended");
    expect(write(share({ answer: "yes", endedAt: new Date(T + 5) }))).toBe("ended");
  });
  it("the next ask needs a new yes", () => {
    const first = share({ answer: "yes", endedAt: new Date(T + 5) });
    const second = share(); // a new ask, not answered
    expect(shareIsActive(first, T + 10)).toBe(false);
    expect(shareIsOpen(second, T + 10)).toBe(true);
    expect(write(second)).toBe("no_consent");
  });
  it("an unanswered ask closes after 15 minutes", () => {
    expect(shareIsOpen(share(), T + SHARE_MS)).toBe(false);
  });
});

describe("off route (invariant 9)", () => {
  const T = 1_000_000;
  it("a single GPS jump does not count", () => {
    const jump = offRouteStep({ since: null, distanceMeters: 900, now: T });
    expect(jump).toEqual({ since: T, notify: false, clear: false });
    expect(offRouteStep({ since: jump.since, distanceMeters: 20, now: T + 15_000 })).toEqual({ since: null, notify: false, clear: true });
  });
  it("500 m is still on the route", () => {
    expect(offRouteStep({ since: null, distanceMeters: 500, now: T }).since).toBeNull();
  });
  it("two minutes off the route notifies", () => {
    expect(offRouteStep({ since: T, distanceMeters: 800, now: T + OFF_ROUTE_MS - 1 }).notify).toBe(false);
    expect(offRouteStep({ since: T, distanceMeters: 800, now: T + OFF_ROUTE_MS }).notify).toBe(true);
  });
  it("coming back and leaving again starts over, so it notifies again", () => {
    const back = offRouteStep({ since: T, distanceMeters: 100, now: T + OFF_ROUTE_MS + 1 });
    expect(back.clear).toBe(true);
    const again = offRouteStep({ since: back.since, distanceMeters: 800, now: T + 300_000 });
    expect(again).toEqual({ since: T + 300_000, notify: false, clear: false });
    expect(offRouteStep({ since: again.since, distanceMeters: 800, now: T + 300_000 + OFF_ROUTE_MS }).notify).toBe(true);
  });
});

describe("what the «احجز» box shows", () => {
  it("tells a rider who lost the race why, even though the vehicle is now full", () => {
    // The refusal and the fresh data (0 free seats) arrive together.
    expect(bookBoxView({ outcome: "rejected", free: 0, open: true })).toBe("refused");
  });
  it("says the vehicle is full only to a rider who has not just been refused", () => {
    expect(bookBoxView({ outcome: null, free: 0, open: false })).toBe("full");
    expect(bookBoxView({ outcome: null, free: 0, open: true })).toBe("full");
  });
  it("keeps the picker after a refusal while seats are left, and shows the answer once booked or queued", () => {
    expect(bookBoxView({ outcome: "rejected", free: 1, open: true })).toBe("picker");
    expect(bookBoxView({ outcome: null, free: 3, open: false })).toBe("closed");
    expect(bookBoxView({ outcome: "applied", free: 0, open: true })).toBe("done");
    expect(bookBoxView({ outcome: "queued", free: 2, open: true })).toBe("done");
  });
});
