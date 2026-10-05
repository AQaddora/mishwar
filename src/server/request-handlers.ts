// The outbox kinds of M6: special requests, offers, the chat thread of an offer, and
// accepting one offer. The rules themselves are pure functions in src/lib/request-rules.ts;
// this file reads the rows, asks the rules, and writes.
import { prisma } from "@/lib/prisma";
import { getPlace } from "@/lib/places";
import {
  ACCEPT_REFUSED_AR,
  canOffer,
  CANT_OFFER_AR,
  decideAccept,
  isParticipant,
  MAX_NOTE,
  MAX_OPEN_REQUESTS,
  threadIsOpen,
  validateRequest,
  validMessage,
  validPrice,
  type RequestInput,
} from "@/lib/request-rules";
import { gazaNow } from "@/lib/time";
import { Reject, type Actor, type Handler } from "@/server/outbox";

const ID = /^[0-9a-f-]{16,64}$/i;
const MAX_THREAD = 500;

function requireRole(actor: Actor, role: "rider" | "driver") {
  if (actor.role !== role) throw new Reject(role === "rider" ? "not_rider" : "not_driver", role === "rider" ? "هاد للركّاب بس" : "هاد للسوّاقين بس");
}
function requireId(value: unknown): string {
  const id = String(value ?? "");
  if (!ID.test(id)) throw new Reject("invalid", "الطلب مش مزبوط");
  return id;
}

// «طلب جديد»: the rider posts a private trip.
const requestCreate: Handler = async (actor, p) => {
  requireRole(actor, "rider");
  const id = requireId(p.id);
  const note = typeof p.note === "string" ? p.note.trim().slice(0, MAX_NOTE) : "";
  const input = { from: p.from, to: p.to, day: p.day, time: p.time, seats: p.seats } as Partial<RequestInput>;
  const problem = validateRequest(input, gazaNow().day, (placeId) => getPlace(placeId) !== undefined);
  if (problem) throw new Reject("invalid", problem);
  const existing = await prisma.specialRequest.findUnique({ where: { id } });
  if (existing) {
    if (existing.riderId !== actor.id) throw new Reject("invalid", "الطلب مش مزبوط");
    return { id };
  }
  if ((await prisma.specialRequest.count({ where: { riderId: actor.id, status: "open" } })) >= MAX_OPEN_REQUESTS) {
    throw new Reject("too_many", "عندك طلبات مفتوحة كثير. سكّر واحد منهم أول");
  }
  const r = input as RequestInput;
  await prisma.specialRequest.create({ data: { id, riderId: actor.id, fromPlaceId: r.from, toPlaceId: r.to, day: r.day, time: r.time, seats: r.seats, note: note || null } });
  return { id };
};

// The rider withdraws an open request. Offers on it are declined.
const requestClose: Handler = async (actor, p) => {
  requireRole(actor, "rider");
  const id = requireId(p.id);
  await prisma.$transaction(async (tx) => {
    const done = await tx.specialRequest.updateMany({ where: { id, riderId: actor.id, status: "open" }, data: { status: "closed" } });
    if (done.count === 0) throw new Reject("not_open", "الطلب مش مفتوح");
    await tx.offer.updateMany({ where: { requestId: id, status: "sent" }, data: { status: "declined" } });
  });
  return null;
};

// «ابعت عرض»: one offer per driver per request; sending again changes the price while it
// is still only sent.
const offerSend: Handler = async (actor, p) => {
  requireRole(actor, "driver");
  const id = requireId(p.id);
  const requestId = requireId(p.requestId);
  if (!validPrice(p.price)) throw new Reject("invalid", "اكتب السعر بالشيكل");
  const vehicle = await prisma.vehicle.findUnique({ where: { driverId: actor.id }, select: { maintenanceFrom: true, maintenanceUntil: true } });
  const can = canOffer(vehicle, gazaNow().day);
  if (!can.ok) throw new Reject(can.reason, CANT_OFFER_AR[can.reason]);
  return prisma.$transaction(async (tx) => {
    const request = await tx.specialRequest.findUnique({ where: { id: requestId }, select: { status: true } });
    if (!request || request.status !== "open") throw new Reject("not_open", "الطلب تسكّر");
    const mine = await tx.offer.findUnique({ where: { requestId_driverId: { requestId, driverId: actor.id } } });
    if (mine && mine.status !== "sent") throw new Reject("not_open", "الطلب تسكّر");
    if (mine) await tx.offer.update({ where: { id: mine.id }, data: { priceAgorot: p.price as number } });
    else await tx.offer.create({ data: { id, requestId, driverId: actor.id, priceAgorot: p.price as number } });
    return { id: mine?.id ?? id };
  });
};

// «اقبل العرض»: first accept wins. The request row is locked while the rule is asked, so a
// second accept (another phone, a replay with another id) sees "accepted" and is refused.
// The chosen offer is accepted, every other one declined, the request is the agreed trip.
const offerAccept: Handler = async (actor, p) => {
  requireRole(actor, "rider");
  const offerId = requireId(p.id);
  return prisma.$transaction(async (tx) => {
    const offer = await tx.offer.findUnique({ where: { id: offerId }, select: { requestId: true } });
    if (!offer) throw new Reject("offer_gone", ACCEPT_REFUSED_AR.offer_gone);
    await tx.$queryRaw`SELECT id FROM "SpecialRequest" WHERE id = ${offer.requestId} FOR UPDATE`;
    const request = await tx.specialRequest.findUniqueOrThrow({ where: { id: offer.requestId }, select: { riderId: true, status: true, offers: { select: { id: true, status: true } } } });
    const decision = decideAccept(request, offerId, actor.id);
    if (!decision.ok) throw new Reject(decision.reason, ACCEPT_REFUSED_AR[decision.reason]);
    await tx.offer.update({ where: { id: offerId }, data: { status: "accepted" } });
    await tx.offer.updateMany({ where: { requestId: offer.requestId, id: { not: offerId } }, data: { status: "declined" } });
    await tx.specialRequest.update({ where: { id: offer.requestId }, data: { status: "accepted" } });
    return { requestId: offer.requestId };
  });
};

// «خلّصت المشوار»: the chosen driver says the private trip is done.
const requestComplete: Handler = async (actor, p) => {
  requireRole(actor, "driver");
  const id = requireId(p.id);
  const done = await prisma.specialRequest.updateMany({
    where: { id, status: "accepted", completedAt: null, offers: { some: { driverId: actor.id, status: "accepted" } } },
    data: { completedAt: new Date() },
  });
  if (done.count === 0) throw new Reject("not_yours", "هاد المشوار مش إلك");
  return null;
};

// A chat message on one offer's thread. Append-only; the server's clock orders them.
const messageSend: Handler = async (actor, p) => {
  const id = requireId(p.id);
  const offerId = requireId(p.offerId);
  if (!validMessage(p.body)) throw new Reject("invalid", "الرسالة فاضية أو طويلة كثير");
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { driverId: true, status: true, request: { select: { riderId: true, status: true, completedAt: true } }, _count: { select: { messages: true } } },
  });
  const thread = offer && { riderId: offer.request.riderId, driverId: offer.driverId, offerStatus: offer.status, requestStatus: offer.request.status, completedAt: offer.request.completedAt };
  if (!thread || !isParticipant(thread, actor.id)) throw new Reject("not_yours", "هاي المحادثة مش إلك");
  if (!threadIsOpen(thread)) throw new Reject("closed", "المحادثة تسكّرت");
  if (offer._count.messages >= MAX_THREAD) throw new Reject("too_many", "المحادثة طويلة كثير، كمّلوا بالتلفون");
  const existing = await prisma.message.findUnique({ where: { id } });
  if (!existing) await prisma.message.create({ data: { id, offerId, senderId: actor.id, body: (p.body as string).trim() } });
  else if (existing.senderId !== actor.id) throw new Reject("invalid", "الرسالة مش مزبوطة");
  return { id };
};

export const requestHandlers: Record<string, Handler> = {
  "request.create": requestCreate,
  "request.close": requestClose,
  "request.complete": requestComplete,
  "offer.send": offerSend,
  "offer.accept": offerAccept,
  "message.send": messageSend,
};
