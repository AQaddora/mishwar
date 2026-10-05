// GET /api/history: the signed-in user's finished trips, newest first, one page.
// The shaping is pure (no database), so what leaves the server is unit-tested: no phone,
// no location, and a rating's comment only for the person it was written about.
import type { VehicleType } from "@/lib/driver-rules";
import { HISTORY_PAGE, type HistoryItem, type HistoryRating, type HistoryResponse } from "@/lib/history";
import { prisma } from "@/lib/prisma";
import { firstName } from "@/server/booking-view";

type RatingRow = { raterId: string; stars: number; comment: string | null };
export type HistoryBookingRow = {
  id: string;
  riderId: string;
  driverId: string;
  day: string;
  time: string;
  fromPlaceId: string;
  toPlaceId: string;
  seats: number;
  status: string;
  cancelReason: string | null;
  tripId: string | null;
  completedAt: Date | null;
  updatedAt: Date;
  rider: { name: string | null };
  route: { name: string; driver: { name: string | null; vehicle: { type: VehicleType } | null } };
  ratings: RatingRow[];
};
export type HistoryRequestRow = {
  id: string;
  riderId: string;
  day: string;
  time: string;
  fromPlaceId: string;
  toPlaceId: string;
  seats: number;
  completedAt: Date | null;
  rider: { name: string | null };
  /** Only the accepted offer. */
  offers: { driverId: string; priceAgorot: number; driver: { name: string | null; vehicle: { type: VehicleType } | null } }[];
  ratings: RatingRow[];
};

// My own rating as I wrote it; the other side's stars, and its comment because it is about me.
function ratingsFor(ratings: RatingRow[], viewerId: string): { mine?: HistoryRating; theirs?: HistoryRating } {
  const shape = (r: RatingRow | undefined) => (r ? { stars: r.stars, ...(r.comment ? { comment: r.comment } : {}) } : undefined);
  const mine = shape(ratings.find((r) => r.raterId === viewerId));
  const theirs = shape(ratings.find((r) => r.raterId !== viewerId));
  return { ...(mine ? { mine } : {}), ...(theirs ? { theirs } : {}) };
}

/** Null when the viewer was not on this booking. */
export function shapeHistoryBooking(b: HistoryBookingRow, viewerId: string): HistoryItem | null {
  const forDriver = viewerId === b.driverId;
  if (!forDriver && viewerId !== b.riderId) return null;
  const outcome = b.status === "cancelled" || b.status === "rejected" ? b.status : b.completedAt ? "completed" : null;
  if (!outcome) return null;
  return {
    id: b.id,
    kind: "booking",
    day: b.day,
    time: b.time,
    from: b.fromPlaceId,
    to: b.toPlaceId,
    seats: b.seats,
    name: forDriver ? firstName(b.rider.name, "راكب") : firstName(b.route.driver.name),
    ...(b.route.driver.vehicle ? { vehicleType: b.route.driver.vehicle.type } : {}),
    routeName: b.route.name,
    outcome,
    ...(outcome !== "completed" && b.cancelReason ? { cancelReason: b.cancelReason } : {}),
    ...(forDriver && b.tripId ? { tripId: b.tripId } : {}),
    at: (b.completedAt ?? b.updatedAt).toISOString(),
    ...(outcome === "completed" ? ratingsFor(b.ratings, viewerId) : {}),
  };
}

/** Null when the viewer was not one of the two people of this private trip. */
export function shapeHistoryRequest(r: HistoryRequestRow, viewerId: string): HistoryItem | null {
  const offer = r.offers[0];
  if (!offer || !r.completedAt) return null;
  const forDriver = viewerId === offer.driverId;
  if (!forDriver && viewerId !== r.riderId) return null;
  return {
    id: r.id,
    kind: "private",
    day: r.day,
    time: r.time,
    from: r.fromPlaceId,
    to: r.toPlaceId,
    seats: r.seats,
    name: forDriver ? firstName(r.rider.name, "راكب") : firstName(offer.driver.name),
    ...(offer.driver.vehicle ? { vehicleType: offer.driver.vehicle.type } : {}),
    price: offer.priceAgorot,
    outcome: "completed",
    at: r.completedAt.toISOString(),
    ...ratingsFor(r.ratings, viewerId),
  };
}

const ratingSelect = { select: { raterId: true, stars: true, comment: true } } as const;
const driverSelect = { select: { name: true, vehicle: { select: { type: true } } } } as const;

export async function buildHistory(user: { id: string; role: "rider" | "driver" | null }): Promise<HistoryResponse> {
  const asDriver = user.role === "driver";
  const [trips, bookings, requests] = await Promise.all([
    asDriver
      ? prisma.trip.findMany({
          where: { driverId: user.id, endedAt: { not: null } },
          orderBy: { endedAt: "desc" },
          take: HISTORY_PAGE,
          select: { id: true, day: true, startedAt: true, endedAt: true, route: { select: { name: true } } },
        })
      : Promise.resolve([]),
    prisma.booking.findMany({
      where: asDriver
        ? { driverId: user.id, completedAt: { not: null }, status: { in: ["confirmed", "ready"] } }
        : { riderId: user.id, OR: [{ completedAt: { not: null } }, { status: { in: ["cancelled", "rejected"] } }] },
      orderBy: { updatedAt: "desc" },
      take: asDriver ? HISTORY_PAGE * 4 : HISTORY_PAGE,
      include: { rider: { select: { name: true } }, route: { select: { name: true, driver: driverSelect } }, ratings: ratingSelect },
    }),
    prisma.specialRequest.findMany({
      where: { completedAt: { not: null }, ...(asDriver ? { offers: { some: { driverId: user.id, status: "accepted" } } } : { riderId: user.id }) },
      orderBy: { completedAt: "desc" },
      take: HISTORY_PAGE,
      include: {
        rider: { select: { name: true } },
        offers: { where: { status: "accepted" }, select: { driverId: true, priceAgorot: true, driver: driverSelect } },
        ratings: ratingSelect,
      },
    }),
  ]);
  const shown = new Set(trips.map((t) => t.id));
  const items = [
    // A driver's riders are listed under their trip, so only riders of the trips on this page.
    ...bookings.filter((b) => !asDriver || (b.tripId && shown.has(b.tripId))).flatMap((b) => shapeHistoryBooking(b, user.id) ?? []),
    ...requests.flatMap((r) => shapeHistoryRequest(r, user.id) ?? []),
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    items,
    trips: trips.map((t) => ({ id: t.id, routeName: t.route.name, day: t.day, startedAt: t.startedAt.toISOString(), endedAt: t.endedAt!.toISOString() })),
  };
}
