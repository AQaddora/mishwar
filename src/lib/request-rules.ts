// The special-request rules, as pure functions (gaza-transit-domain skill,
// references/data-model.md, invariants 10 and 11). The server uses them to accept or
// refuse; the screens use them to say what is going on. Shared by both.
import { inMaintenance, type Maintenance } from "@/lib/driver-rules";
import { addDays, isDay, isTime } from "@/lib/time";

export type RequestStatus = "open" | "accepted" | "closed";
export type OfferStatus = "sent" | "accepted" | "declined";

export const MAX_REQUEST_SEATS = 14;
/** How far ahead a private trip can be asked for, in days (today = 0). */
export const MAX_REQUEST_DAYS_AHEAD = 14;
export const MAX_NOTE = 200;
export const MAX_OPEN_REQUESTS = 5;
export const MAX_MESSAGE = 500;
/** Messages per thread that travel in a sync. Older ones stay on the server. */
export const SYNC_MESSAGES_PER_THREAD = 30;
/** Offer prices: 1 to 5000 shekels, kept as integer agorot. */
export const MIN_PRICE_AGOROT = 100;
export const MAX_PRICE_AGOROT = 500_000;

export type RequestInput = { from: string; to: string; day: string; time: string; seats: number; note?: string };

/** Null when the request is fine, otherwise what to tell the rider. */
export function validateRequest(p: Partial<RequestInput>, today: string, isKnownPlace: (id: string) => boolean): string | null {
  if (typeof p.from !== "string" || typeof p.to !== "string" || !isKnownPlace(p.from) || !isKnownPlace(p.to)) return "اختار من وين ولوين";
  if (p.from === p.to) return "من وين ولوين لازم يكونوا مكانين مختلفين";
  if (!isDay(p.day) || p.day < today || p.day > addDays(today, MAX_REQUEST_DAYS_AHEAD)) return "اختار يوم من اليوم لبعد أسبوعين";
  if (!isTime(p.time)) return "اختار الساعة";
  if (!Number.isInteger(p.seats) || p.seats! < 1 || p.seats! > MAX_REQUEST_SEATS) return "عدد الكراسي مش مزبوط";
  if (p.note !== undefined && (typeof p.note !== "string" || p.note.length > MAX_NOTE)) return "الملاحظة طويلة";
  return null;
}

/** Shekels as the driver types them («٥٠», "50", "50.5") → integer agorot, or null. */
export function parsePrice(input: string): number | null {
  const ascii = input.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) & 0xf)).replace(/[٫,]/g, ".").trim();
  if (!/^\d{1,5}(\.\d{1,2})?$/.test(ascii)) return null;
  const agorot = Math.round(Number(ascii) * 100);
  return validPrice(agorot) ? agorot : null;
}

export function validPrice(agorot: unknown): agorot is number {
  return Number.isInteger(agorot) && (agorot as number) >= MIN_PRICE_AGOROT && (agorot as number) <= MAX_PRICE_AGOROT;
}

// A driver can send an offer only with a vehicle that is in service today.
export function canOffer(vehicle: Maintenance | null | undefined, today: string): { ok: true } | { ok: false; reason: "no_vehicle" | "maintenance" } {
  if (!vehicle) return { ok: false, reason: "no_vehicle" };
  if (inMaintenance(vehicle, today)) return { ok: false, reason: "maintenance" };
  return { ok: true };
}
export const CANT_OFFER_AR = { no_vehicle: "سجّل سيارتك أول عشان تبعت عروض", maintenance: "السيارة بالتصليح، ما بتقدر تبعت عروض هلأ" } as const;

// ---- Accepting an offer (invariant 10): first accept wins, at most one accepted offer.

type OfferRef = { id: string; status: string };
export type AcceptDecision =
  | { ok: true; statuses: Record<string, OfferStatus> }
  | { ok: false; reason: "not_yours" | "already_accepted" | "closed" | "offer_gone" };

export const ACCEPT_REFUSED_AR: Record<Exclude<AcceptDecision, { ok: true }>["reason"], string> = {
  not_yours: "هاد الطلب مش إلك",
  already_accepted: "قبلت عرض ثاني لهاد الطلب قبل",
  closed: "الطلب تسكّر",
  offer_gone: "العرض مش موجود",
};

// The server runs this with the request row locked, so two accepts are decided one after
// the other: the first gets ok, the second sees "accepted" and is refused.
export function decideAccept(request: { riderId: string; status: string; offers: OfferRef[] }, offerId: string, actorId: string): AcceptDecision {
  if (request.riderId !== actorId) return { ok: false, reason: "not_yours" };
  if (request.status === "accepted") return { ok: false, reason: "already_accepted" };
  if (request.status !== "open") return { ok: false, reason: "closed" };
  const chosen = request.offers.find((o) => o.id === offerId);
  if (!chosen || chosen.status !== "sent") return { ok: false, reason: "offer_gone" };
  // The chosen one is accepted; every other offer is declined, and its driver is told.
  return { ok: true, statuses: Object.fromEntries(request.offers.map((o) => [o.id, o.id === offerId ? "accepted" : "declined"])) };
}

// ---- Chat: one thread per offer, between that driver and the request's rider.

export type Thread = { riderId: string; driverId: string; offerStatus: string; requestStatus: string; completedAt?: Date | string | null };

export function isParticipant(t: Thread, userId: string): boolean {
  return userId === t.riderId || userId === t.driverId;
}

/** A thread can be written to while its offer is still in play: sent on an open request, or accepted and not finished. */
export function threadIsOpen(t: Omit<Thread, "riderId" | "driverId">): boolean {
  if (t.offerStatus === "sent") return t.requestStatus === "open";
  return t.offerStatus === "accepted" && !t.completedAt;
}

export function validMessage(body: unknown): body is string {
  return typeof body === "string" && body.trim().length > 0 && body.trim().length <= MAX_MESSAGE;
}

// ---- Phones (invariant 11), used by phoneVisible in booking-rules.ts.

export type OfferLink = { offerStatus: string; requestStatus: string; completedAt?: Date | string | null; viewer: "rider" | "driver" };

// A driver's phone is shown with his offer: the rider sees it while the offer is in play.
// The rider's phone is shown to ONE driver only, and only after the rider accepted his offer.
export function offerPhoneVisible(link: OfferLink): boolean {
  if (link.completedAt || link.requestStatus === "closed") return false;
  if (link.viewer === "driver") return link.offerStatus === "accepted" && link.requestStatus === "accepted";
  return link.offerStatus === "accepted" || (link.offerStatus === "sent" && link.requestStatus === "open");
}
