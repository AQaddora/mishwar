// GET /api/sync: what a phone needs to draw the map, search and plan with no network
// (offline-first-pwa skill, references/sync-protocol.md). Only changes since the cursor,
// only the fields the screens render, nulls left out. Photos travel as hashes only.
//
// Public data (routes, vehicles, schedule, positions) is the same for everyone, guests
// included. Later milestones add the signed-in user's private data (bookings, offers,
// messages) in buildSyncResponse, next to the public part: bookings (M5) and special
// requests, offers and chat threads (M6).
import { prisma } from "@/lib/prisma";
import type { VehicleType } from "@/lib/driver-rules";
import type { SyncBooking, SyncMessage, SyncOffer, SyncRequest, SyncResponse } from "@/lib/public-data";
import { averageOf } from "@/lib/rating-rules";
import { SYNC_MESSAGES_PER_THREAD } from "@/lib/request-rules";
import { addDays, gazaNow } from "@/lib/time";
import { firstName, shapeBooking } from "@/server/booking-view";
import { shapeRequest, type Viewer } from "@/server/request-view";

export { firstName };

/** The cursor is the server time of the sync minus this overlap, to catch late commits. */
export const CURSOR_OVERLAP_MS = 5000;
/** Changed records per response. Beyond it the phone is told `more` and asks again. */
export const PAGE_SIZE = 400;

export type RouteRow = {
  id: string;
  driverId: string;
  name: string;
  isDefault: boolean;
  updatedAt: Date;
  deletedAt: Date | null;
  stops: { placeId: string }[];
};
export type VehicleRow = {
  id: string;
  driverId: string;
  type: VehicleType;
  seats: number;
  maintenanceFrom: string | null;
  maintenanceUntil: string | null;
  updatedAt: Date;
  driver: { name: string | null };
  photos: { hash: string }[];
};
export type ScheduleRow = {
  driverId: string;
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
  routeId: string | null;
  updatedAt: Date;
};
export type PositionRow = { vehicleId: string; lat: number; lon: number; speed: number | null; at: Date };
export type Averages = Record<string, { rating: number; ratings: number }>;
export type SyncRows = {
  routes: RouteRow[];
  vehicles: VehicleRow[];
  schedule: ScheduleRow[];
  positions: PositionRow[];
  /** Seats held by today's live bookings, per driver id. */
  taken?: Record<string, number>;
  /** Average rating and count per rated user id. */
  ratings?: Averages;
  /** The signed-in user's own bookings, already shaped for them. Never set for a guest. */
  bookings?: SyncBooking[];
  /** The signed-in user's special requests, offers and threads, already shaped. Never set for a guest. */
  requests?: SyncRequest[];
  offers?: SyncOffer[];
  messages?: SyncMessage[];
};

// Pure: rows in, response out. Unit-tested against the byte budgets with the seed data.
export function shapeSync(rows: SyncRows, serverTime: Date): SyncResponse {
  type Change = { at: number; apply: (r: SyncResponse) => void };
  const changes: Change[] = [];
  for (const r of rows.routes) {
    changes.push({
      at: Math.max(r.updatedAt.getTime(), r.deletedAt?.getTime() ?? 0),
      apply: (out) => {
        if (r.deletedAt) out.deleted.routes.push(r.id);
        else out.changes.routes.push({ id: r.id, driverId: r.driverId, name: r.name, isDefault: r.isDefault, stops: r.stops.map((s) => s.placeId) });
      },
    });
  }
  for (const v of rows.vehicles) {
    changes.push({
      at: v.updatedAt.getTime(),
      apply: (out) =>
        out.changes.vehicles.push({
          id: v.id,
          driverId: v.driverId,
          driverName: firstName(v.driver.name),
          type: v.type,
          seats: v.seats,
          free: Math.max(0, v.seats - (rows.taken?.[v.driverId] ?? 0)),
          photos: v.photos.map((p) => p.hash),
          ...rows.ratings?.[v.driverId],
          ...(v.maintenanceFrom ? { maintenanceFrom: v.maintenanceFrom } : {}),
          ...(v.maintenanceFrom && v.maintenanceUntil ? { maintenanceUntil: v.maintenanceUntil } : {}),
        }),
    });
  }
  for (const d of rows.schedule) {
    changes.push({
      at: d.updatedAt.getTime(),
      apply: (out) =>
        out.changes.schedule.push({
          id: `${d.driverId}:${d.weekday}`,
          driverId: d.driverId,
          weekday: d.weekday,
          working: d.working,
          startTime: d.startTime,
          endTime: d.endTime,
          ...(d.routeId ? { routeId: d.routeId } : {}),
        }),
    });
  }

  const out: SyncResponse = {
    cursor: new Date(serverTime.getTime() - CURSOR_OVERLAP_MS).toISOString(),
    serverTime: serverTime.toISOString(),
    changes: {
      routes: [],
      vehicles: [],
      schedule: [],
      // Latest point only, and always the complete current set: it is one small row per
      // vehicle on the road, and a missing vehicle means "no position" with no extra rule.
      positions: rows.positions.map((p) => ({
        id: p.vehicleId,
        lat: p.lat,
        lon: p.lon,
        ...(p.speed != null ? { speed: Math.round(p.speed * 10) / 10 } : {}),
        at: p.at.toISOString(),
      })),
      bookings: rows.bookings ?? [],
      requests: rows.requests ?? [],
      offers: rows.offers ?? [],
      messages: rows.messages ?? [],
    },
    deleted: { routes: [], vehicles: [] },
    more: false,
  };

  changes.sort((a, b) => a.at - b.at);
  let page = changes;
  if (changes.length > PAGE_SIZE) {
    // Cut after PAGE_SIZE, but never in the middle of records that share a timestamp:
    // the next request starts one millisecond after the last record sent.
    let end = PAGE_SIZE;
    while (end < changes.length && changes[end].at === changes[end - 1].at) end++;
    if (end < changes.length) {
      page = changes.slice(0, end);
      out.more = true;
      out.cursor = new Date(page[page.length - 1].at + 1).toISOString();
    }
  }
  for (const change of page) change.apply(out);
  return out;
}

export function parseCursor(value: string | null): Date | null {
  if (!value) return null;
  const at = new Date(value);
  return Number.isNaN(at.getTime()) ? null : at;
}

// The signed-in user's bookings, as a rider or as a driver: the live ones, and the rest
// from yesterday on (so a cancel or a finished trip is still seen). Complete set each time.
async function privateBookings(userId: string, now: Date): Promise<SyncBooking[]> {
  const mine = { OR: [{ riderId: userId }, { driverId: userId }] };
  // A share past its 15 minutes is over: delete its position now, on this write path too,
  // not only hide it when reading.
  await prisma.locationShare.updateMany({
    where: { endedAt: null, expiresAt: { lte: now }, booking: mine },
    data: { endedAt: now, endReason: "expired", lat: null, lon: null, at: null },
  });
  const rows = await prisma.booking.findMany({
    where: { AND: [mine, { OR: [{ day: { gte: addDays(gazaNow(now).day, -1) } }, { status: { in: ["confirmed", "ready"] }, completedAt: null }] }] },
    orderBy: [{ day: "asc" }, { time: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      rider: { select: { name: true, phone: true } },
      route: { select: { name: true, driver: { select: { name: true, phone: true } } } },
      shares: { orderBy: { askedAt: "desc" }, take: 1 },
      ratings: { where: { raterId: userId }, select: { id: true } },
    },
  });
  return rows.flatMap((row) => shapeBooking(row, userId, now.getTime()) ?? []);
}

/** Open requests a driver is sent at once; the newest win. */
export const OPEN_REQUESTS_IN_SYNC = 60;

// Special requests for the signed-in user. A rider: his own, with every offer and thread.
// A driver: the open ones, plus those he offered on, with only his own offer and thread.
// Complete set each time; finished and closed ones drop out after yesterday.
async function privateRequests(viewer: Viewer, now: Date, averages: Promise<Averages>) {
  const today = gazaNow(now).day;
  const recent = { OR: [{ day: { gte: addDays(today, -1) } }, { status: "accepted", completedAt: null }] };
  const rows = await prisma.specialRequest.findMany({
    where: {
      OR: [
        { riderId: viewer.id, ...recent },
        { offers: { some: { driverId: viewer.id } }, ...recent },
        ...(viewer.role === "driver" ? [{ status: "open", day: { gte: today } }] : []),
      ],
    },
    orderBy: { createdAt: "desc" },
    take: OPEN_REQUESTS_IN_SYNC + 40,
    include: {
      rider: { select: { name: true, phone: true } },
      ratings: { where: { raterId: viewer.id }, select: { id: true } },
      offers: {
        orderBy: { createdAt: "asc" },
        include: { driver: { select: { name: true, phone: true } }, messages: { orderBy: { sentAt: "desc" }, take: SYNC_MESSAGES_PER_THREAD } },
      },
    },
  });
  const ratings = await averages;
  const out = { requests: [] as SyncRequest[], offers: [] as SyncOffer[], messages: [] as SyncMessage[] };
  for (const row of rows) {
    const shaped = shapeRequest(row, viewer);
    if (!shaped) continue;
    out.requests.push(shaped.request);
    out.offers.push(...shaped.offers.map((o) => ({ ...o, ...ratings[o.driverId] })));
    out.messages.push(...shaped.messages);
  }
  return out;
}

export async function buildSyncResponse(user: Viewer | { id: string } | null, since: Date | null): Promise<SyncResponse> {
  const serverTime = new Date();
  const changed = since ? { gte: since } : undefined;
  // Everyone's average rating: one small grouped query. Drivers' averages go out on their vehicles and offers.
  const averages: Promise<Averages> = prisma.rating
    .groupBy({ by: ["rateeId"], _sum: { stars: true }, _count: { _all: true } })
    .then((groups) => Object.fromEntries(groups.flatMap((g) => { const a = averageOf(g._sum.stars ?? 0, g._count._all); return a ? [[g.rateeId, a]] : []; })));
  const [routes, vehicles, schedule, positions, held, bookings, special, ratings] = await Promise.all([
    prisma.route.findMany({
      // A first sync has no use for routes that are already deleted.
      where: since ? { OR: [{ updatedAt: changed }, { deletedAt: changed }] } : { deletedAt: null },
      select: {
        id: true,
        driverId: true,
        name: true,
        isDefault: true,
        updatedAt: true,
        deletedAt: true,
        stops: { orderBy: { position: "asc" }, select: { placeId: true } },
      },
    }),
    prisma.vehicle.findMany({
      where: since ? { OR: [{ updatedAt: changed }, { photos: { some: { createdAt: changed } } }] } : {},
      select: {
        id: true,
        driverId: true,
        type: true,
        seats: true,
        maintenanceFrom: true,
        maintenanceUntil: true,
        updatedAt: true,
        driver: { select: { name: true } },
        photos: { select: { hash: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.scheduleDay.findMany({
      where: since ? { updatedAt: changed } : {},
      select: { driverId: true, weekday: true, working: true, startTime: true, endTime: true, routeId: true, updatedAt: true },
    }),
    prisma.vehiclePosition.findMany({ select: { vehicleId: true, lat: true, lon: true, speed: true, at: true } }),
    // Free seats = seats minus what today's live bookings hold. A booking change touches
    // its vehicle (see booking-handlers), so the new number reaches phones in a routine sync.
    prisma.booking.groupBy({
      by: ["driverId"],
      where: { day: gazaNow(serverTime).day, status: { in: ["confirmed", "ready"] }, completedAt: null },
      _sum: { seats: true },
    }),
    user ? privateBookings(user.id, serverTime) : Promise.resolve(undefined),
    user ? privateRequests({ id: user.id, role: "role" in user ? user.role : null }, serverTime, averages) : Promise.resolve(undefined),
    averages,
  ]);
  const taken = Object.fromEntries(held.map((h) => [h.driverId, h._sum.seats ?? 0]));
  return shapeSync({ routes, vehicles, schedule, positions, taken, ratings, bookings, ...special }, serverTime);
}
