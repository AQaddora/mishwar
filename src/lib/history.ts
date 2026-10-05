// What «رحلاتي السابقة» and the driver's «رحلات سابقة» show: finished trips, both kinds,
// and the bookings that were cancelled or refused. Old items leave the routine sync, so
// history has its own request (GET /api/history) and its own copy on the phone.
// There is no location here, and no phone number: the trip is over, so the link that
// made a phone visible is over too.
import type { VehicleType } from "@/lib/driver-rules";

export type HistoryRating = { stars: number; comment?: string };
export type HistoryItem = {
  id: string;
  /** A seat on a route, or a private trip from a special request. */
  kind: "booking" | "private";
  day: string;
  time: string;
  from: string;
  to: string;
  seats: number;
  /** The other person's first name. */
  name: string;
  vehicleType?: VehicleType;
  routeName?: string;
  /** Private trips only: the agreed price in agorot. */
  price?: number;
  outcome: "completed" | "cancelled" | "rejected";
  cancelReason?: string;
  /** For a driver: the trip this rider was carried on. */
  tripId?: string;
  /** When it ended, for sorting, newest first. */
  at: string;
  /** The rating I gave. */
  mine?: HistoryRating;
  /** The rating I got. Its comment is shown to me only. */
  theirs?: HistoryRating;
};
/** A driver's ended trip on a route. Its riders are the items with this tripId. */
export type HistoryTrip = { id: string; routeName: string; day: string; startedAt: string; endedAt: string };
export type HistoryResponse = { items: HistoryItem[]; trips: HistoryTrip[] };

export const HISTORY_PAGE = 30;
export const canRate = (item: HistoryItem) => item.outcome === "completed" && !item.mine;
/** The key in a /history?rate=… link and in the pending list: "booking:<id>" or "private:<id>". */
export const rateKey = (item: { kind: string; id: string }) => `${item.kind}:${item.id}`;
