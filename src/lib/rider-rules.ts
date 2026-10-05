// The rider-side rules, as pure functions over the synced public data. They run in the
// browser (so the map and the search work offline) and in unit tests.
import { isRunning, type Running } from "@/lib/driver-rules";
import type { PublicData, SyncPosition, SyncRoute, SyncVehicle } from "@/lib/public-data";
import type { GazaNow } from "@/lib/time";

/** A position older than this is stale: say so, and never compute anything from it. */
export const STALE_MS = 5 * 60 * 1000;

export function isStale(at: Date | string | number, now: Date | number = Date.now()): boolean {
  return Number(new Date(now)) - Number(new Date(at)) > STALE_MS;
}

// A position is accepted only from the vehicle's own driver, and only while that driver
// has an open trip. Anything else is refused (see POST /api/position).
export function canWritePosition(input: {
  actorId: string;
  vehicleDriverId: string | null;
  hasOpenTrip: boolean;
}): "ok" | "not_your_vehicle" | "no_open_trip" {
  if (!input.vehicleDriverId || input.vehicleDriverId !== input.actorId) return "not_your_vehicle";
  if (!input.hasOpenTrip) return "no_open_trip";
  return "ok";
}

export type VehicleNow = {
  vehicle: SyncVehicle;
  route: SyncRoute;
  startTime: string;
  endTime: string;
  /** The latest point, whatever its age. The screen decides how to show a stale one. */
  position: SyncPosition | null;
};

function stateOf(data: PublicData, vehicle: SyncVehicle, at: GazaNow): Running {
  return isRunning(
    {
      vehicle: { maintenanceFrom: vehicle.maintenanceFrom ?? null, maintenanceUntil: vehicle.maintenanceUntil ?? null },
      schedule: data.schedule
        .filter((d) => d.driverId === vehicle.driverId)
        .map((d) => ({ ...d, routeId: d.routeId ?? null })),
      routes: data.routes.filter((r) => r.driverId === vehicle.driverId),
    },
    at,
  );
}

// Who is running at a moment. Riders are never shown a driver who isn't running.
// Positions are attached only when asking about now: a future time has none.
export function vehiclesRunningAt(data: PublicData, at: GazaNow, withPositions: boolean): VehicleNow[] {
  const out: VehicleNow[] = [];
  for (const vehicle of data.vehicles) {
    const state = stateOf(data, vehicle, at);
    if (!state.running) continue;
    const route = data.routes.find((r) => r.id === state.routeId);
    if (!route) continue;
    const position = withPositions ? (data.positions.find((p) => p.id === vehicle.id) ?? null) : null;
    out.push({ vehicle, route, startTime: state.startTime, endTime: state.endTime, position });
  }
  return out;
}

export type SearchQuery = { from: string; to: string; at: GazaNow; isNow: boolean };

// Search by time, from and to: vehicles working at that moment whose route for that day
// has both stops. Routes run both ways, so the order of the two stops doesn't matter.
export function searchVehicles(data: PublicData, query: SearchQuery): VehicleNow[] {
  if (query.from === query.to) return [];
  return vehiclesRunningAt(data, query.at, query.isNow).filter(
    (v) => v.route.stops.includes(query.from) && v.route.stops.includes(query.to),
  );
}

/** The stops a rider passes, in travel order, from one stop to the other (either direction). */
export function stopsBetween(route: SyncRoute, from: string, to: string): string[] {
  const a = route.stops.indexOf(from);
  const b = route.stops.indexOf(to);
  if (a < 0 || b < 0) return [];
  return a <= b ? route.stops.slice(a, b + 1) : route.stops.slice(b, a + 1).reverse();
}
