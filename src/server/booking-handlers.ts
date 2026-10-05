// The outbox kinds of M5: booking a seat, the driver's pre-trip check, and asking for and
// answering a location share. The rules themselves are pure functions in
// src/lib/booking-rules.ts; this file reads the rows, asks the rules, and writes.
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  BOOKING_REFUSED_AR,
  canCancelNotReady,
  canStartTrip,
  decideBooking,
  isDue,
  isLive,
  MAX_DAYS_AHEAD,
  recheckBooking,
  SHARE_MS,
  shareIsOpen,
  validBookingShape,
  type BookingRequest,
  type DriverState,
} from "@/lib/booking-rules";
import { addDays, gazaNow } from "@/lib/time";
import { Reject, type Actor, type Handler } from "@/server/outbox";

type Tx = Prisma.TransactionClient;
const LIVE = { status: { in: ["confirmed", "ready"] }, completedAt: null };
const ID = /^[0-9a-f-]{16,64}$/i;

function requireRole(actor: Actor, role: "rider" | "driver") {
  if (actor.role !== role) throw new Reject(role === "rider" ? "not_rider" : "not_driver", role === "rider" ? "هاد للركّاب بس" : "هاد للسوّاقين بس");
}

async function driverState(tx: Tx, driverId: string): Promise<DriverState> {
  const [vehicle, schedule, routes] = await Promise.all([
    tx.vehicle.findUnique({ where: { driverId }, select: { seats: true, maintenanceFrom: true, maintenanceUntil: true } }),
    tx.scheduleDay.findMany({ where: { driverId }, select: { weekday: true, working: true, startTime: true, endTime: true, routeId: true } }),
    tx.route.findMany({ where: { driverId, deletedAt: null }, select: { id: true, isDefault: true, stops: { orderBy: { position: "asc" }, select: { placeId: true } } } }),
  ]);
  return { vehicle, schedule, routes: routes.map((r) => ({ id: r.id, isDefault: r.isDefault, stops: r.stops.map((s) => s.placeId) })) };
}

// Free seats travel with the vehicle in the public sync: touching the vehicle makes the
// next routine sync carry the new number.
const touchVehicle = (tx: Tx, driverId: string) => tx.vehicle.updateMany({ where: { driverId }, data: { updatedAt: new Date() } });

// Sharing is over: mark it and DELETE the position in the same write. No history.
export function endShares(tx: Tx, where: Prisma.LocationShareWhereInput, reason: "trip_started" | "stopped" | "declined" | "expired" | "booking_ended") {
  return tx.locationShare.updateMany({ where: { ...where, endedAt: null }, data: { endedAt: new Date(), endReason: reason, lat: null, lon: null, at: null } });
}

// «احجز»: the server decides, and the first booking to arrive wins. The vehicle row is
// locked while the seats are counted, so two phones can never both get the last seat.
const bookingCreate: Handler = async (actor, p) => {
  requireRole(actor, "rider");
  const now = gazaNow();
  const id = String(p.id ?? "");
  if (!ID.test(id) || !validBookingShape(p as Partial<BookingRequest>, now.day) || (p.day as string) > addDays(now.day, MAX_DAYS_AHEAD)) {
    throw new Reject("invalid", BOOKING_REFUSED_AR.invalid);
  }
  const request = { ...(p as unknown as BookingRequest) };
  // A booking for today can't be for a time that has passed: it is for now.
  if (request.day === now.day && request.time < now.time) request.time = now.time;

  const outcome = await prisma.$transaction(async (tx) => {
    const existing = await tx.booking.findUnique({ where: { id } });
    if (existing) return existing.riderId === actor.id ? { id } : { refuse: "invalid" as const };
    const route = await tx.route.findFirst({ where: { id: request.routeId, deletedAt: null }, select: { driverId: true } });
    if (!route) return { refuse: "stop_not_on_route" as const };
    await tx.$queryRaw`SELECT id FROM "Vehicle" WHERE "driverId" = ${route.driverId} FOR UPDATE`;
    const [state, held, mine] = await Promise.all([
      driverState(tx, route.driverId),
      tx.booking.aggregate({ where: { driverId: route.driverId, day: request.day, ...LIVE }, _sum: { seats: true } }),
      tx.booking.count({ where: { riderId: actor.id, driverId: route.driverId, day: request.day, ...LIVE } }),
    ]);
    if (mine > 0) return { refuse: "duplicate" as const };
    const decision = decideBooking(request, state, held._sum.seats ?? 0);
    const base = { id, riderId: actor.id, driverId: route.driverId, routeId: request.routeId, day: request.day, time: request.time, fromPosition: request.fromPosition, toPosition: request.toPosition, seats: request.seats };
    if (!decision.ok) {
      // Kept as a rejected row when the stops are known, so the rider's list says what happened.
      const stops = state.routes.find((r) => r.id === request.routeId)?.stops ?? [];
      const from = stops[request.fromPosition];
      const to = stops[request.toPosition];
      if (from && to && decision.reason !== "invalid") {
        await tx.booking.create({ data: { ...base, fromPlaceId: from, toPlaceId: to, status: "rejected", cancelReason: decision.reason === "seats_gone" ? "seats_gone" : decision.reason === "maintenance" ? "maintenance" : "not_running" } });
      }
      return { refuse: decision.reason };
    }
    await tx.booking.create({ data: { ...base, fromPlaceId: decision.fromPlaceId, toPlaceId: decision.toPlaceId, status: "confirmed" } });
    await touchVehicle(tx, route.driverId);
    return { id };
  });
  if ("refuse" in outcome) {
    if (outcome.refuse === "duplicate") throw new Reject("duplicate", "عندك حجز مع هالسوّاق بهاليوم");
    throw new Reject(outcome.refuse!, BOOKING_REFUSED_AR[outcome.refuse as keyof typeof BOOKING_REFUSED_AR]);
  }
  return outcome;
};

async function ownBooking(tx: Tx, actor: Actor, id: unknown, side: "rider" | "driver") {
  const booking = await tx.booking.findUnique({ where: { id: String(id ?? "") } });
  if (!booking || (side === "rider" ? booking.riderId : booking.driverId) !== actor.id) throw new Reject("not_yours", "الحجز مش موجود");
  return booking;
}

async function cancel(tx: Tx, booking: { id: string; driverId: string }, reason: string) {
  await tx.booking.update({ where: { id: booking.id }, data: { status: "cancelled", cancelReason: reason } });
  await endShares(tx, { bookingId: booking.id }, "booking_ended");
  await touchVehicle(tx, booking.driverId);
}

const bookingCancel: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    requireRole(actor, "rider");
    const booking = await ownBooking(tx, actor, p.id, "rider");
    if (!isLive(booking)) return null; // already over: nothing to do
    if (booking.startedAt) throw new Reject("started", "الرحلة بلّشت، ما بتقدر تلغي هلأ");
    await cancel(tx, booking, "by_rider");
    return null;
  });

// The driver tapped call. Only this unlocks «مش جاهز، الغي الحجز».
const bookingCalled: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    requireRole(actor, "driver");
    const booking = await ownBooking(tx, actor, p.id, "driver");
    if (isLive(booking) && !booking.calledAt) await tx.booking.update({ where: { id: booking.id }, data: { calledAt: new Date() } });
    return null;
  });

// Before the trip the driver decides each rider: ready, or not ready (cancel).
// A cancel beats a later "ready".
const bookingDecide: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    requireRole(actor, "driver");
    const booking = await ownBooking(tx, actor, p.id, "driver");
    if (!isLive(booking) || booking.startedAt) throw new Reject("not_live", booking.status === "cancelled" ? "هالحجز ملغي" : "هالحجز خلص");
    if (p.decision === "ready") {
      await tx.booking.update({ where: { id: booking.id }, data: { status: "ready", readyAt: new Date() } });
    } else if (p.decision === "not_ready") {
      if (!canCancelNotReady(booking)) throw new Reject("call_first", "اتصل بالراكب أول، وبعدين بتقدر تلغي حجزه");
      await cancel(tx, booking, "rider_not_ready");
    } else {
      throw new Reject("invalid", "الطلب مش مزبوط");
    }
    return null;
  });

// «اطلب موقع الراكب»: one ask, good for 15 minutes. A new ask replaces an older one, and
// needs its own yes.
const shareAsk: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    requireRole(actor, "driver");
    const id = String(p.id ?? "");
    if (!ID.test(id)) throw new Reject("invalid", "الطلب مش مزبوط");
    const booking = await ownBooking(tx, actor, p.bookingId, "driver");
    if (!isLive(booking) || booking.startedAt) throw new Reject("not_live", "بتقدر تطلب الموقع بس قبل ما تبلّش الرحلة");
    await endShares(tx, { bookingId: booking.id }, "expired");
    await tx.locationShare.create({ data: { id, bookingId: booking.id, riderId: booking.riderId, expiresAt: new Date(Date.now() + SHARE_MS) } });
    await tx.booking.update({ where: { id: booking.id }, data: { updatedAt: new Date() } });
    return { id };
  });

async function ownShare(tx: Tx, actor: Actor, id: unknown) {
  const share = await tx.locationShare.findUnique({ where: { id: String(id ?? "") } });
  if (!share || share.riderId !== actor.id) throw new Reject("not_yours", "الطلب مش موجود");
  return share;
}

// The rider's yes or no, to this ask only.
const shareAnswer: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    const share = await ownShare(tx, actor, p.id);
    if (p.answer !== "yes" && p.answer !== "no") throw new Reject("invalid", "الطلب مش مزبوط");
    if (!shareIsOpen(share, Date.now())) throw new Reject("closed", "هالطلب خلص وقته");
    await tx.locationShare.update({
      where: { id: share.id },
      data: p.answer === "yes" ? { answer: "yes" } : { answer: "no", endedAt: new Date(), endReason: "declined" },
    });
    return null;
  });

// The rider's stop button.
const shareStop: Handler = (actor, p) =>
  prisma.$transaction(async (tx) => {
    const share = await ownShare(tx, actor, p.id);
    await endShares(tx, { id: share.id }, "stopped");
    return null;
  });

// ---- Used by trip.start, trip.end, schedule.save and maintenance.set in handlers.ts

/** Today's live bookings this trip is for. Throws while any of them is still undecided. */
export async function startBookedRiders(tx: Tx, driverId: string, tripId: string, now: { day: string; time: string }) {
  const live = await tx.booking.findMany({ where: { driverId, day: now.day, tripId: null, ...LIVE }, select: { id: true, day: true, time: true, status: true } });
  const due = live.filter((b) => isDue(b, now));
  if (!canStartTrip(due)) throw new Reject("riders_undecided", "ضل ركّاب ما تأكدت منهم");
  const ids = due.map((b) => b.id);
  if (ids.length === 0) return;
  await tx.booking.updateMany({ where: { id: { in: ids } }, data: { tripId, startedAt: new Date() } });
  // Sharing ends the moment the trip starts.
  await endShares(tx, { bookingId: { in: ids } }, "trip_started");
}

/** The trip ended: its riders' bookings are complete, and their seats are free again. */
export async function completeBookedRiders(tx: Tx, driverId: string) {
  const open = await tx.trip.findMany({ where: { driverId, endedAt: null }, select: { id: true } });
  if (open.length > 0) await tx.booking.updateMany({ where: { tripId: { in: open.map((t) => t.id) }, completedAt: null }, data: { completedAt: new Date() } });
  await tx.vehicle.updateMany({ where: { driverId }, data: { offRouteSince: null, updatedAt: new Date() } });
}

// After a schedule or maintenance change: every live booking that has not started is
// checked again. It stays (moving to that day's new route when both its stops are on it)
// or is cancelled with the reason, which frees the seat and tells the rider.
export async function recheckDriverBookings(tx: Tx, driverId: string): Promise<number> {
  const today = gazaNow().day;
  const [state, bookings] = await Promise.all([
    driverState(tx, driverId),
    tx.booking.findMany({ where: { driverId, day: { gte: today }, tripId: null, ...LIVE } }),
  ]);
  let cancelled = 0;
  for (const b of bookings) {
    const check = recheckBooking(b, state);
    if (!check.keep) {
      await cancel(tx, b, check.reason);
      cancelled++;
    } else if (check.routeId !== b.routeId || check.fromPosition !== b.fromPosition || check.toPosition !== b.toPosition) {
      await tx.booking.update({ where: { id: b.id }, data: { routeId: check.routeId, fromPosition: check.fromPosition, toPosition: check.toPosition } });
    }
  }
  return cancelled;
}

export const bookingHandlers: Record<string, Handler> = {
  "booking.create": bookingCreate,
  "booking.cancel": bookingCancel,
  "booking.called": bookingCalled,
  "booking.decide": bookingDecide,
  "share.ask": shareAsk,
  "share.answer": shareAnswer,
  "share.stop": shareStop,
};
