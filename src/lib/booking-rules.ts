// The booking, pre-trip and location-sharing rules, as pure functions (gaza-transit-domain
// skill, references/data-model.md, invariants 4, 6, 7, 9, 11 and 12). The server uses them
// to accept or refuse; the screens use them to say what is going on. Shared by both.
import { isRunning, type Maintenance, type RouteRef, type ScheduleDayInput } from "@/lib/driver-rules";
import { offerPhoneVisible, type OfferLink } from "@/lib/request-rules";
import { isDay, isTime, weekdayOf } from "@/lib/time";

export type BookingStatus = "confirmed" | "ready" | "rejected" | "cancelled";
export type CancelReason = "rider_not_ready" | "schedule_change" | "maintenance" | "by_rider" | "seats_gone" | "not_running";

export const MAX_SEATS_PER_BOOKING = 6;
/** How far ahead a seat can be booked, in days (today = 0). */
export const MAX_DAYS_AHEAD = 7;
/** A rider's shared location lives this long after the driver's ask, at most. */
export const SHARE_MS = 15 * 60 * 1000;
export const OFF_ROUTE_METERS = 500;
export const OFF_ROUTE_MS = 2 * 60 * 1000;
/** Bookings up to this many minutes ahead belong to the trip that is about to start. */
export const DUE_WINDOW_MINUTES = 60;

type Liveness = { status: string; completedAt?: Date | string | null };

/** Live: holds a seat and links rider and driver. Confirmed or ready, and its trip has not ended. */
export function isLive(b: Liveness): boolean {
  return (b.status === "confirmed" || b.status === "ready") && !b.completedAt;
}

// Invariant 11, the one place that decides who sees whose phone. Two things can link a
// rider and a driver:
// - a live booking: each sees the other's phone while it is live;
// - a special-request offer: the rider sees the driver's phone with the offer; the driver
//   sees the rider's only after the rider accepted HIS offer (see request-rules.ts).
export function phoneVisible(link: Liveness | OfferLink): boolean {
  return "offerStatus" in link ? offerPhoneVisible(link) : isLive(link);
}

// ---- Booking a seat (invariants 4 and 6)

export type BookingRequest = { routeId: string; day: string; time: string; fromPosition: number; toPosition: number; seats: number };
export type DriverState = {
  vehicle: (Maintenance & { seats: number }) | null;
  schedule: ScheduleDayInput[];
  routes: (RouteRef & { stops: string[] })[];
};
export type BookingDecision =
  | { ok: true; fromPlaceId: string; toPlaceId: string }
  | { ok: false; reason: "invalid" | "maintenance" | "not_running" | "stop_not_on_route" | "seats_gone" };

export const BOOKING_REFUSED_AR: Record<Exclude<BookingDecision, { ok: true }>["reason"], string> = {
  invalid: "الحجز مش مزبوط",
  maintenance: "ما زبط الحجز: السيارة بالتصليح هالفترة",
  not_running: "ما زبط الحجز: السوّاق مش طالع بهالوقت",
  stop_not_on_route: "ما زبط الحجز: السوّاق ماشي اليوم على خط ثاني",
  seats_gone: "الكراسي خلصت قبل ما يوصل طلبك",
};

export function validBookingShape(p: Partial<BookingRequest>, today: string): p is BookingRequest {
  return (
    typeof p.routeId === "string" &&
    isDay(p.day) &&
    p.day >= today &&
    isTime(p.time) &&
    Number.isInteger(p.fromPosition) &&
    Number.isInteger(p.toPosition) &&
    p.fromPosition !== p.toPosition &&
    Number.isInteger(p.seats) &&
    p.seats! >= 1 &&
    p.seats! <= MAX_SEATS_PER_BOOKING
  );
}

// The server decides, and the first booking to arrive wins. `takenSeats` is what live
// bookings already hold on that route that day (counted per route per day, not per stretch
// of road: simple, and never oversold).
export function decideBooking(request: BookingRequest, driver: DriverState, takenSeats: number): BookingDecision {
  if (!driver.vehicle) return { ok: false, reason: "not_running" };
  const state = isRunning(driver, { day: request.day, weekday: weekdayOf(request.day), time: request.time });
  if (!state.running) return { ok: false, reason: state.reason === "maintenance" ? "maintenance" : "not_running" };
  // That day's route must be the one booked, and both stops must be on it.
  if (state.routeId !== request.routeId) return { ok: false, reason: "stop_not_on_route" };
  const stops = driver.routes.find((r) => r.id === request.routeId)?.stops ?? [];
  const from = stops[request.fromPosition];
  const to = stops[request.toPosition];
  if (!from || !to) return { ok: false, reason: "stop_not_on_route" };
  if (takenSeats + request.seats > driver.vehicle.seats) return { ok: false, reason: "seats_gone" };
  return { ok: true, fromPlaceId: from, toPlaceId: to };
}

// What the «احجز» box shows. The server's answer to this rider's own tap comes first: a
// refusal usually arrives together with fresh data saying the vehicle is now full, and
// "full" must not hide why HIS booking failed (lost the race: «الكراسي خلصت قبل ما يوصل طلبك»).
export type BookBoxView = "done" | "refused" | "full" | "closed" | "picker";

export function bookBoxView(input: { outcome: string | null; free: number; open: boolean }): BookBoxView {
  if (input.outcome && input.outcome !== "rejected") return "done";
  if (input.free <= 0) return input.outcome === "rejected" ? "refused" : "full";
  return input.open ? "picker" : "closed";
}

// A schedule or maintenance change against a booking that already exists. It survives
// only if the driver still runs at its time and both its stops are on that day's route
// (which may now be another route: then it moves there).
export type Recheck =
  | { keep: true; routeId: string; fromPosition: number; toPosition: number }
  | { keep: false; reason: "schedule_change" | "maintenance" };

export function recheckBooking(b: { day: string; time: string; fromPlaceId: string; toPlaceId: string }, driver: DriverState): Recheck {
  const state = isRunning(driver, { day: b.day, weekday: weekdayOf(b.day), time: b.time });
  if (!state.running) return { keep: false, reason: state.reason === "maintenance" ? "maintenance" : "schedule_change" };
  const stops = driver.routes.find((r) => r.id === state.routeId)?.stops ?? [];
  const fromPosition = stops.indexOf(b.fromPlaceId);
  const toPosition = stops.indexOf(b.toPlaceId);
  if (fromPosition < 0 || toPosition < 0) return { keep: false, reason: "schedule_change" };
  return { keep: true, routeId: state.routeId, fromPosition, toPosition };
}

// ---- Before the trip (invariant 7)

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** The bookings the trip starting now is for: today's live ones, due within the hour (or overdue). */
export function isDue(b: { day: string; time: string }, now: { day: string; time: string }): boolean {
  return b.day === now.day && minutesOf(b.time) <= minutesOf(now.time) + DUE_WINDOW_MINUTES;
}

/** «ابدأ الرحلة» is refused while any due booking is still only confirmed. */
export function canStartTrip(due: { status: string }[]): boolean {
  return due.every((b) => b.status !== "confirmed");
}

/** «مش جاهز، الغي الحجز» is refused until the driver has tapped call for that rider. */
export function canCancelNotReady(b: { status: string; calledAt: Date | string | null }): boolean {
  return (b.status === "confirmed" || b.status === "ready") && b.calledAt !== null;
}

export const CANCEL_REASON_AR: Record<string, string> = {
  rider_not_ready: "السوّاق لغى حجزك: اتصل فيك وما كنت جاهز",
  schedule_change: "انلغى حجزك لأنه السوّاق غيّر شغله اليوم",
  maintenance: "انلغى حجزك: السيارة بالتصليح هالفترة",
  by_rider: "لغيت الحجز",
  seats_gone: "الكراسي خلصت قبل ما يوصل طلبك",
  not_running: "ما زبط الحجز: السوّاق مش طالع بهالوقت",
};

// ---- Sharing the rider's location (invariant 12)

export type Share = { answer: string | null; expiresAt: Date | string; endedAt: Date | string | null };

/** Waiting for the rider's yes or no. */
export function shareIsOpen(s: Share, now: number): boolean {
  return s.answer === null && !s.endedAt && now < Number(new Date(s.expiresAt));
}

/** The rider said yes to THIS ask, and it has not ended or run out. Only then may a position be written or read. */
export function shareIsActive(s: Share, now: number): boolean {
  return s.answer === "yes" && !s.endedAt && now < Number(new Date(s.expiresAt));
}

export function canWriteSharedPosition(input: { share: Share | null; shareRiderId: string | null; actorId: string; tripStarted: boolean; now: number }):
  | "ok"
  | "not_yours"
  | "no_consent"
  | "ended" {
  if (!input.share || input.shareRiderId !== input.actorId) return "not_yours";
  if (input.share.answer !== "yes") return "no_consent";
  if (input.tripStarted || !shareIsActive(input.share, input.now)) return "ended";
  return "ok";
}

// ---- Off route (invariant 9)

// One step per GPS point of a running vehicle. `since` is when it was first seen off the
// line (null while on it). A single jump starts the clock but tells nobody; two minutes
// of it tells the riders once; coming back clears everything, so leaving again tells again.
export function offRouteStep(input: { since: number | null; distanceMeters: number; now: number }): { since: number | null; notify: boolean; clear: boolean } {
  if (input.distanceMeters <= OFF_ROUTE_METERS) return { since: null, notify: false, clear: input.since !== null };
  const since = input.since ?? input.now;
  return { since, notify: input.now - since >= OFF_ROUTE_MS, clear: false };
}
