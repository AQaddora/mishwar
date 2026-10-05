// How a booking leaves the server: shaped for ONE viewer, its rider or its driver.
// Pure (no database), so the privacy rules are unit-tested here:
// - the other side's phone is included only while the booking is live;
// - a rider's shared position is included only for the driver, only while sharing is on.
import { phoneVisible, shareIsActive } from "@/lib/booking-rules";
import type { SyncBooking, SyncShare } from "@/lib/public-data";

export type ShareRow = {
  id: string;
  askedAt: Date;
  expiresAt: Date;
  answer: string | null;
  endedAt: Date | null;
  endReason: string | null;
  lat: number | null;
  lon: number | null;
  at: Date | null;
};
export type BookingRow = {
  id: string;
  riderId: string;
  driverId: string;
  routeId: string;
  day: string;
  time: string;
  fromPosition: number;
  toPosition: number;
  fromPlaceId: string;
  toPlaceId: string;
  seats: number;
  status: string;
  cancelReason: string | null;
  calledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  offRouteNotifiedAt: Date | null;
  createdAt: Date;
  rider: { name: string | null; phone: string | null };
  route: { name: string; driver: { name: string | null; phone: string | null } };
  /** Newest first; only the newest is sent. */
  shares: ShareRow[];
};

// First name only. «أبو خالد» and «عبد الله» are one name, not two.
export function firstName(name: string | null, fallback = "سوّاق"): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return fallback;
  return /^(أبو|ابو|أم|ام|عبد)$/.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

function shapeShare(s: ShareRow, forDriver: boolean, now: number): SyncShare {
  const active = shareIsActive(s, now);
  // Past its 15 minutes it is over, whether or not anything has cleaned the row up yet.
  const ended = s.endReason ?? (s.endedAt || now >= s.expiresAt.getTime() ? "expired" : undefined);
  return {
    id: s.id,
    askedAt: s.askedAt.toISOString(),
    expiresAt: s.expiresAt.toISOString(),
    ...(s.answer === "yes" || s.answer === "no" ? { answer: s.answer } : {}),
    ...(ended ? { ended } : {}),
    ...(forDriver && active && s.lat !== null && s.lon !== null && s.at ? { lat: s.lat, lon: s.lon, at: s.at.toISOString() } : {}),
  };
}

/** Null when the viewer is neither the rider nor the driver of this booking. */
export function shapeBooking(b: BookingRow, viewerId: string, now: number): SyncBooking | null {
  const forDriver = viewerId === b.driverId;
  if (!forDriver && viewerId !== b.riderId) return null;
  const other = forDriver ? b.rider : b.route.driver;
  const share = b.shares[0];
  return {
    id: b.id,
    routeId: b.routeId,
    routeName: b.route.name,
    driverId: b.driverId,
    day: b.day,
    time: b.time,
    from: b.fromPlaceId,
    to: b.toPlaceId,
    fromPosition: b.fromPosition,
    toPosition: b.toPosition,
    seats: b.seats,
    status: b.status as SyncBooking["status"],
    ...(b.cancelReason ? { cancelReason: b.cancelReason } : {}),
    name: firstName(other.name, forDriver ? "راكب" : "سوّاق"),
    ...(phoneVisible(b) && other.phone ? { phone: other.phone } : {}),
    ...(b.calledAt ? { called: true } : {}),
    ...(b.startedAt ? { startedAt: b.startedAt.toISOString() } : {}),
    ...(b.completedAt ? { completedAt: b.completedAt.toISOString() } : {}),
    ...(b.offRouteNotifiedAt && !b.completedAt ? { offRoute: true } : {}),
    createdAt: b.createdAt.toISOString(),
    ...(share ? { share: shapeShare(share, forDriver, now) } : {}),
  };
}
