// The trip planner: from, to and a time → up to three options, sorted by arrival,
// including one change of vehicle. A pure function over the synced public data, so it
// runs in the browser with no network, and in unit tests.
//
// Rules from the gaza-transit-domain skill:
// - No fares. The planner never shows or compares a price.
// - Arrival and waiting times come ONLY from a fresh live position: the distance along the
//   route, stop to stop, at the phone's reported speed (or a typical one), always shown
//   as «تقريباً». No fresh position means no time. Nothing is ever guessed from the schedule.
import type { PublicData, SyncPosition, SyncRoute, SyncVehicle } from "@/lib/public-data";
import { isStale, vehiclesRunningAt, type VehicleNow } from "@/lib/rider-rules";
import type { GazaNow } from "@/lib/time";

export type LatLon = { lat: number; lon: number };
/** Where a place is. The app passes the gazetteer; tests pass fake fixtures. */
export type PlaceLookup = (placeId: string) => LatLon | undefined;

/** Used only when the phone reports no speed (or is standing): about 30 km/h. */
export const TYPICAL_SPEED_MPS = 8.3;
const MIN_SPEED_MPS = 2;
export const MAX_OPTIONS = 3;

export type PlanQuery = {
  from: string;
  to: string;
  /** The moment asked about, in Gaza time. */
  at: GazaNow;
  /** True for «هلأ»: only then are positions, and so times, used. */
  isNow: boolean;
  /** The real clock, for judging how old a position is. */
  now: number;
};

/** One ride on one vehicle. This is what a booking is made of (M5). */
export type PlanLeg = {
  vehicle: SyncVehicle;
  route: SyncRoute;
  /** The day the leg is ridden, "YYYY-MM-DD". */
  day: string;
  from: string;
  to: string;
  /** Indexes into route.stops. fromPosition > toPosition means the return direction. */
  fromPosition: number;
  toPosition: number;
  /** Stops passed after boarding, the last one included. */
  stopCount: number;
  startTime: string;
  endTime: string;
  /** The vehicle's latest point (any age), only when asking about now. */
  position: SyncPosition | null;
  /** Minutes until the vehicle reaches the boarding stop. Null without a fresh position. */
  boardInMinutes: number | null;
  /** Minutes until the rider gets off. Null without a fresh position. */
  arriveInMinutes: number | null;
};

export type PlanOption = {
  /** Stable for a list key: the vehicles and stops involved. */
  id: string;
  legs: PlanLeg[];
  /** The stop where the rider changes vehicle; absent on a direct trip. */
  changeAt?: string;
  /** Minutes waiting at the change stop. Null when either vehicle has no fresh position. */
  waitMinutes: number | null;
  /** Minutes until the rider reaches the destination. Null when it can't be known. */
  arriveInMinutes: number | null;
  stopCount: number;
};

// Metres between two points. Good to well under 1% at the Strip's size.
export function distanceMeters(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad);
  const y = (b.lat - a.lat) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// How far along the route line (stop to stop) a point sits, measured from the first stop.
// The point is dropped onto the nearest segment of the line.
function alongRoute(points: LatLon[], p: LatLon): number {
  let best = { off: Infinity, along: 0 };
  let walked = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const length = distanceMeters(a, b);
    const rad = Math.PI / 180;
    const k = Math.cos(a.lat * rad);
    const bx = (b.lon - a.lon) * k;
    const by = b.lat - a.lat;
    const px = (p.lon - a.lon) * k;
    const py = p.lat - a.lat;
    const t = bx === 0 && by === 0 ? 0 : Math.max(0, Math.min(1, (px * bx + py * by) / (bx * bx + by * by)));
    const foot = { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t };
    const off = distanceMeters(p, foot);
    if (off < best.off) best = { off, along: walked + length * t };
    walked += length;
  }
  return best.along;
}

/** Metres from the first stop to each stop, along the line. Null when a stop has no known place. */
function stopOffsets(route: SyncRoute, places: PlaceLookup): { points: LatLon[]; offsets: number[] } | null {
  const points: LatLon[] = [];
  for (const id of route.stops) {
    const place = places(id);
    if (!place) return null;
    points.push(place);
  }
  const offsets = [0];
  for (let i = 1; i < points.length; i++) offsets.push(offsets[i - 1] + distanceMeters(points[i - 1], points[i]));
  return { points, offsets };
}

function buildLeg(item: VehicleNow, from: string, to: string, query: PlanQuery, places: PlaceLookup): PlanLeg | null {
  const fromPosition = item.route.stops.indexOf(from);
  const toPosition = item.route.stops.indexOf(to);
  if (fromPosition < 0 || toPosition < 0 || fromPosition === toPosition) return null;

  let boardInMinutes: number | null = null;
  let arriveInMinutes: number | null = null;
  const position = query.isNow ? item.position : null;
  if (position && !isStale(position.at, query.now)) {
    const line = stopOffsets(item.route, places);
    if (line) {
      const speed = position.speed && position.speed >= MIN_SPEED_MPS ? position.speed : TYPICAL_SPEED_MPS;
      const here = alongRoute(line.points, position);
      const toBoard = Math.abs(line.offsets[fromPosition] - here);
      const ride = Math.abs(line.offsets[toPosition] - line.offsets[fromPosition]);
      boardInMinutes = toBoard / speed / 60;
      arriveInMinutes = (toBoard + ride) / speed / 60;
    }
  }

  return {
    vehicle: item.vehicle,
    route: item.route,
    day: query.at.day,
    from,
    to,
    fromPosition,
    toPosition,
    stopCount: Math.abs(toPosition - fromPosition),
    startTime: item.startTime,
    endTime: item.endTime,
    position,
    boardInMinutes,
    arriveInMinutes,
  };
}

function direct(leg: PlanLeg): PlanOption {
  return {
    id: `${leg.vehicle.id}:${leg.from}>${leg.to}`,
    legs: [leg],
    waitMinutes: null,
    arriveInMinutes: leg.arriveInMinutes,
    stopCount: leg.stopCount,
  };
}

// Two vehicles with a change at a stop both routes share. The second vehicle's time is
// used only when it reaches the change stop after the rider does: it goes back and forth,
// and its next pass can't be known, so an earlier pass gives no time at all.
function withChange(first: PlanLeg, second: PlanLeg): PlanOption {
  let waitMinutes: number | null = null;
  let arriveInMinutes: number | null = null;
  if (first.arriveInMinutes !== null && second.boardInMinutes !== null && second.arriveInMinutes !== null) {
    const wait = second.boardInMinutes - first.arriveInMinutes;
    if (wait >= 0) {
      waitMinutes = wait;
      arriveInMinutes = second.arriveInMinutes;
    }
  }
  return {
    id: `${first.vehicle.id}:${first.from}>${first.to}+${second.vehicle.id}>${second.to}`,
    legs: [first, second],
    changeAt: first.to,
    waitMinutes,
    arriveInMinutes,
    stopCount: first.stopCount + second.stopCount,
  };
}

// Timed options first, soonest arrival first. Then the ones with no time: direct before
// a change, fewer stops first. The id breaks ties, so the order never flickers.
export function compareOptions(a: PlanOption, b: PlanOption): number {
  if (a.arriveInMinutes !== null && b.arriveInMinutes !== null) return a.arriveInMinutes - b.arriveInMinutes || a.id.localeCompare(b.id);
  if (a.arriveInMinutes !== null) return -1;
  if (b.arriveInMinutes !== null) return 1;
  return a.legs.length - b.legs.length || a.stopCount - b.stopCount || a.id.localeCompare(b.id);
}

export function planTrips(data: PublicData, query: PlanQuery, places: PlaceLookup): PlanOption[] {
  if (!query.from || !query.to || query.from === query.to) return [];
  const running = vehiclesRunningAt(data, query.at, query.isNow);
  const options: PlanOption[] = [];

  for (const item of running) {
    const leg = buildLeg(item, query.from, query.to, query, places);
    if (leg) options.push(direct(leg));
  }

  // One change: vehicle A passes `from`, vehicle B passes `to`, and they share a stop.
  // A vehicle that already goes the whole way is never used as half of a change.
  const starts = running.filter((v) => v.route.stops.includes(query.from) && !v.route.stops.includes(query.to));
  const ends = running.filter((v) => v.route.stops.includes(query.to) && !v.route.stops.includes(query.from));
  for (const a of starts) {
    for (const b of ends) {
      if (a.vehicle.id === b.vehicle.id) continue;
      let best: PlanOption | null = null;
      for (const stop of a.route.stops) {
        if (stop === query.from || !b.route.stops.includes(stop)) continue;
        const first = buildLeg(a, query.from, stop, query, places);
        const second = buildLeg(b, stop, query.to, query, places);
        if (!first || !second) continue;
        const option = withChange(first, second);
        if (!best || compareOptions(option, best) < 0) best = option;
      }
      if (best) options.push(best);
    }
  }

  return options.sort(compareOptions).slice(0, MAX_OPTIONS);
}
