// GET /api/sync: what a phone needs to draw the map, search and plan with no network
// (offline-first-pwa skill, references/sync-protocol.md). Only changes since the cursor,
// only the fields the screens render, nulls left out. Photos travel as hashes only.
//
// Public data (routes, vehicles, schedule, positions) is the same for everyone, guests
// included. Later milestones add the signed-in user's private data (bookings, offers,
// messages) in buildSyncResponse, next to the public part.
import { prisma } from "@/lib/prisma";
import type { VehicleType } from "@/lib/driver-rules";
import type { SyncBooking, SyncResponse } from "@/lib/public-data";
import { addDays, gazaNow } from "@/lib/time";
import { firstName, shapeBooking } from "@/server/booking-view";

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
export type SyncRows = {
  routes: RouteRow[];
  vehicles: VehicleRow[];
  schedule: ScheduleRow[];
  positions: PositionRow[];
  /** Seats held by today's live bookings, per driver id. */
  taken?: Record<string, number>;
  /** The signed-in user's own bookings, already shaped for them. Never set for a guest. */
  bookings?: SyncBooking[];
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
    },
  });
  return rows.flatMap((row) => shapeBooking(row, userId, now.getTime()) ?? []);
}

export async function buildSyncResponse(user: { id: string } | null, since: Date | null): Promise<SyncResponse> {
  const serverTime = new Date();
  const changed = since ? { gte: since } : undefined;
  const [routes, vehicles, schedule, positions, held, bookings] = await Promise.all([
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
  ]);
  const taken = Object.fromEntries(held.map((h) => [h.driverId, h._sum.seats ?? 0]));
  return shapeSync({ routes, vehicles, schedule, positions, taken, bookings }, serverTime);
}
