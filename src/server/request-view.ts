// How a special request leaves the server: shaped for ONE viewer. Pure (no database), so
// the privacy rules are unit-tested here:
// - a rider sees his own requests with every offer and thread on them;
// - a driver sees open requests (first name only), and only HIS offer and HIS thread;
// - the rider's phone goes to one driver only, after the rider accepted that driver's offer;
// - a driver's phone goes to the rider with the offer, while the offer is in play.
import { phoneVisible } from "@/lib/booking-rules";
import type { SyncMessage, SyncOffer, SyncRequest } from "@/lib/public-data";
import { SYNC_MESSAGES_PER_THREAD } from "@/lib/request-rules";
import { firstName } from "@/server/booking-view";

export type MessageRow = { id: string; senderId: string; body: string; sentAt: Date };
export type OfferRow = {
  id: string;
  driverId: string;
  priceAgorot: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  driver: { name: string | null; phone: string | null };
  /** Any order; the newest SYNC_MESSAGES_PER_THREAD are sent, oldest first. */
  messages: MessageRow[];
};
export type RequestRow = {
  id: string;
  riderId: string;
  fromPlaceId: string;
  toPlaceId: string;
  day: string;
  time: string;
  seats: number;
  note: string | null;
  status: string;
  completedAt: Date | null;
  createdAt: Date;
  rider: { name: string | null; phone: string | null };
  offers: OfferRow[];
  /** The viewer's own rating of this private trip, if the query asked for it. */
  ratings?: unknown[];
};
export type Viewer = { id: string; role: "rider" | "driver" | null };
export type ShapedRequest = { request: SyncRequest; offers: SyncOffer[]; messages: SyncMessage[] };

/** Null when this viewer has no business seeing the request. */
export function shapeRequest(r: RequestRow, viewer: Viewer): ShapedRequest | null {
  const owner = viewer.id === r.riderId;
  const ownOffer = r.offers.find((o) => o.driverId === viewer.id);
  // Other riders never see it. A driver sees it while it is open, or when he offered on it.
  if (!owner && !(viewer.role === "driver" && (r.status === "open" || ownOffer))) return null;
  const link = (o: OfferRow, as: "rider" | "driver") => ({ offerStatus: o.status, requestStatus: r.status, completedAt: r.completedAt, viewer: as });

  const request: SyncRequest = {
    id: r.id,
    from: r.fromPlaceId,
    to: r.toPlaceId,
    day: r.day,
    time: r.time,
    seats: r.seats,
    ...(r.note ? { note: r.note } : {}),
    status: r.status as SyncRequest["status"],
    ...(r.completedAt ? { completedAt: r.completedAt.toISOString() } : {}),
    ...(r.completedAt && r.ratings?.length ? { rated: true } : {}),
    createdAt: r.createdAt.toISOString(),
    ...(owner ? { mine: true } : { name: firstName(r.rider.name, "راكب") }),
    ...(!owner && ownOffer && phoneVisible(link(ownOffer, "driver")) && r.rider.phone ? { phone: r.rider.phone } : {}),
  };
  const visible = owner ? r.offers : ownOffer ? [ownOffer] : [];
  const offers = visible.map<SyncOffer>((o) => ({
    id: o.id,
    requestId: r.id,
    driverId: o.driverId,
    name: firstName(o.driver.name),
    price: o.priceAgorot,
    status: o.status as SyncOffer["status"],
    ...(owner && phoneVisible(link(o, "rider")) && o.driver.phone ? { phone: o.driver.phone } : {}),
    createdAt: o.createdAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
  }));
  const messages = visible.flatMap((o) =>
    [...o.messages]
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime())
      .slice(-SYNC_MESSAGES_PER_THREAD)
      .map<SyncMessage>((m) => ({ id: m.id, offerId: o.id, mine: m.senderId === viewer.id, body: m.body, at: m.sentAt.toISOString() })),
  );
  return { request, offers, messages };
}
