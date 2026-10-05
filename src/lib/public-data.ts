// The public data every phone holds after a sync (offline-first-pwa skill,
// references/sync-protocol.md): routes, vehicles, the week schedules and the latest
// positions. Guests get exactly the same: no phone number and no rider data is in the
// public part. A signed-in user also gets their own bookings (private scope).
import type { VehicleType } from "@/lib/driver-rules";

export type SyncRoute = { id: string; driverId: string; name: string; isDefault: boolean; stops: string[] };
export type SyncVehicle = {
  id: string;
  driverId: string;
  /** First name only. */
  driverName: string;
  type: VehicleType;
  seats: number;
  /** Seats nobody has booked. Equal to seats until bookings exist (M5). */
  free: number;
  photos: string[];
  /** The driver's average rating (one decimal) and how many ratings. Absent until someone rates him. */
  rating?: number;
  ratings?: number;
  maintenanceFrom?: string;
  /** Present only with maintenanceFrom. Absent = until the driver says it's back. */
  maintenanceUntil?: string;
};
export type SyncScheduleDay = {
  /** "<driverId>:<weekday>" */
  id: string;
  driverId: string;
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
  routeId?: string;
};
/** The latest point only, with its own time. id is the vehicle id. */
export type SyncPosition = { id: string; lat: number; lon: number; speed?: number; at: string };

/** The rider's latest shared point, as its driver sees it while sharing is on. */
export type SyncShare = {
  id: string;
  askedAt: string;
  expiresAt: string;
  /** Absent = the rider has not answered yet. */
  answer?: "yes" | "no";
  /** Absent while it is on. expired, trip_started, stopped, declined. */
  ended?: string;
  /** Only for the driver, only while sharing is on. */
  lat?: number;
  lon?: number;
  at?: string;
};
// A booking as its rider or its driver sees it. PRIVATE: only in the sync of the two
// people it links. `phone` is the other side's phone, present only while the booking is live.
export type SyncBooking = {
  id: string;
  routeId: string;
  routeName: string;
  driverId: string;
  day: string;
  time: string;
  from: string;
  to: string;
  fromPosition: number;
  toPosition: number;
  seats: number;
  status: "confirmed" | "ready" | "rejected" | "cancelled";
  cancelReason?: string;
  /** The other person: the driver's first name for a rider, the rider's for a driver. */
  name: string;
  phone?: string;
  called?: boolean;
  startedAt?: string;
  completedAt?: string;
  /** The viewer has already rated this completed trip. */
  rated?: boolean;
  offRoute?: boolean;
  createdAt: string;
  /** The latest location ask on this booking, if any. */
  share?: SyncShare;
};

// ---- Special requests. PRIVATE: a rider gets his own requests with every offer on them;
// a driver gets the open requests, his own offers and his own threads. Never a guest.

export type SyncRequest = {
  id: string;
  from: string;
  to: string;
  day: string;
  time: string;
  seats: number;
  note?: string;
  status: "open" | "accepted" | "closed";
  completedAt?: string;
  /** The viewer has already rated this completed private trip. */
  rated?: boolean;
  createdAt: string;
  /** True on the rider's own phone. */
  mine?: boolean;
  /** For a driver: the rider's first name. */
  name?: string;
  /** For the ONE driver whose offer the rider accepted, until the trip is done. */
  phone?: string;
};
export type SyncOffer = {
  id: string;
  requestId: string;
  driverId: string;
  /** The driver's first name. */
  name: string;
  /** Integer agorot: the only money in the app. */
  price: number;
  status: "sent" | "accepted" | "declined";
  /** The driver's average rating and count, as on his vehicle. */
  rating?: number;
  ratings?: number;
  /** The driver's phone, for the rider, while the offer is in play. */
  phone?: string;
  createdAt: string;
  updatedAt: string;
};
export type SyncMessage = { id: string; offerId: string; mine: boolean; body: string; at: string };

export type SyncChanges = {
  routes: SyncRoute[];
  vehicles: SyncVehicle[];
  schedule: SyncScheduleDay[];
  /** Always the COMPLETE current set, not a diff: a vehicle missing here has no position. */
  positions: SyncPosition[];
  /** PRIVATE, signed-in only. Like positions, always the COMPLETE current set for this user. */
  bookings: SyncBooking[];
  /** PRIVATE, signed-in only, COMPLETE current sets like bookings. */
  requests: SyncRequest[];
  offers: SyncOffer[];
  /** The last messages of each of the user's threads (see SYNC_MESSAGES_PER_THREAD). */
  messages: SyncMessage[];
};
export type SyncResponse = {
  cursor: string;
  serverTime: string;
  changes: SyncChanges;
  deleted: { routes: string[]; vehicles: string[] };
  more: boolean;
};

export type PublicData = SyncChanges;
export const EMPTY_PUBLIC_DATA: PublicData = { routes: [], vehicles: [], schedule: [], positions: [], bookings: [], requests: [], offers: [], messages: [] };
