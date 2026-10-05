// The outbox kind of M7: «ابعت التقييم». The rule is the pure decideRating in
// src/lib/rating-rules.ts; this file finds the trip, asks the rule, and writes.
import { prisma } from "@/lib/prisma";
import { decideRating, RATING_REFUSED_AR, type RatedTrip } from "@/lib/rating-rules";
import { Reject, type Handler } from "@/server/outbox";

const ID = /^[0-9a-f-]{16,64}$/i;

// payload: { id, kind: "booking" | "private", target: <booking or request id>, stars, comment? }
const ratingCreate: Handler = async (actor, p) => {
  const id = String(p.id ?? "");
  const target = String(p.target ?? "");
  if (!ID.test(id) || !ID.test(target) || (p.kind !== "booking" && p.kind !== "private")) throw new Reject("invalid", "التقييم مش مزبوط");
  const onBooking = p.kind === "booking";

  let trip: RatedTrip | null = null;
  if (onBooking) {
    const b = await prisma.booking.findUnique({ where: { id: target }, select: { riderId: true, driverId: true, status: true, completedAt: true } });
    trip = b;
  } else {
    const r = await prisma.specialRequest.findUnique({
      where: { id: target },
      select: { riderId: true, status: true, completedAt: true, offers: { where: { status: "accepted" }, select: { driverId: true } } },
    });
    trip = r && r.offers[0] ? { riderId: r.riderId, driverId: r.offers[0].driverId, status: r.status, completedAt: r.completedAt } : null;
  }

  const where = onBooking ? { raterId: actor.id, bookingId: target } : { raterId: actor.id, requestId: target };
  const existing = await prisma.rating.findFirst({ where, select: { id: true } });
  // The same phone sending the same rating again (a replay under a new entry) is not a second rating.
  if (existing?.id === id) return { id };
  const decision = decideRating(trip, actor.id, { stars: p.stars, comment: p.comment }, existing !== null);
  if (!decision.ok) throw new Reject(decision.reason, RATING_REFUSED_AR[decision.reason]);

  try {
    await prisma.$transaction([
      prisma.rating.create({ data: { id, ...where, rateeId: decision.rateeId, stars: decision.stars, comment: decision.comment } }),
      // A driver's average travels with his vehicle in the public sync: touch it.
      prisma.vehicle.updateMany({ where: { driverId: decision.rateeId }, data: { updatedAt: new Date() } }),
    ]);
  } catch (error) {
    // Two phones at once: the unique pair (rater, trip) lets one through.
    if ((error as { code?: string }).code === "P2002") throw new Reject("already", RATING_REFUSED_AR.already);
    throw error;
  }
  return { id };
};

export const ratingHandlers: Record<string, Handler> = { "rating.create": ratingCreate };
