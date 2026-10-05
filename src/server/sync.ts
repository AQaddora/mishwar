// GET /api/sync: what a phone needs to draw the map, search and plan with no network
// (offline-first-pwa skill, references/sync-protocol.md). Only changes since the cursor,
// only the fields the screens render, nulls left out. Photos travel as hashes only.
//
// Public data (routes, vehicles, schedule, positions) is the same for everyone, guests
// included. Later milestones add the signed-in user's private data (bookings, offers,
// messages) in buildSyncResponse, next to the public part.
import { prisma } from "@/lib/prisma";
import type { VehicleType } from "@/lib/driver-rules";
import type { SyncResponse } from "@/lib/public-data";

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
export type SyncRows = { routes: RouteRow[]; vehicles: VehicleRow[]; schedule: ScheduleRow[]; positions: PositionRow[] };

// First name only. «أبو خالد» and «عبد الله» are one name, not two.
export function firstName(name: string | null): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "سوّاق";
  return /^(أبو|ابو|أم|ام|عبد)$/.test(words[0]) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

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
          free: v.seats,
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

// `user` is unused until the private scopes arrive (M5: bookings; M6: offers, messages).
export async function buildSyncResponse(user: { id: string } | null, since: Date | null): Promise<SyncResponse> {
  void user;
  const serverTime = new Date();
  const changed = since ? { gte: since } : undefined;
  const [routes, vehicles, schedule, positions] = await Promise.all([
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
  ]);
  return shapeSync({ routes, vehicles, schedule, positions }, serverTime);
}
