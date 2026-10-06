// "Where am I, and what is running around me" for the home map (MapView with locate).
// The rider's position never leaves the phone: it is not sent, not logged, and only the
// last point is kept, on this phone, so the map can open near them next time even before
// the GPS answers (gaza-transit-domain skill, privacy).
import { GAZA_BBOX } from "@/lib/places";

export type Point = { lat: number; lon: number };
export type Fix = Point & { accuracy: number; at: number };

/** The map's zoom on the rider: a few streets around them. */
export const NEAR_ZOOM = 15;
/** A vehicle this close is already on screen at NEAR_ZOOM on a phone-sized map. */
const ON_SCREEN_KM = 0.5;
/** Farther than this, the nearest vehicle is not "around me": stay on the rider. */
const AROUND_KM = 15;
/** Slack around the Strip's box: GPS near the edge, or the sea along the coast. */
const PAD = 0.03;

export function inStrip(p: Point): boolean {
  return p.lat >= GAZA_BBOX.south - PAD && p.lat <= GAZA_BBOX.north + PAD && p.lon >= GAZA_BBOX.west - PAD && p.lon <= GAZA_BBOX.east + PAD;
}

export function distanceKm(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export type View = { center: Point; zoom: number } | { bounds: [Point, Point] };

// Centre on the rider. When no vehicle would be on screen, widen just enough to show the
// nearest one with the rider, so "the cars around me" are never an empty map.
export function viewAroundMe(me: Point, vehicles: Point[]): View {
  let nearest: Point | null = null;
  let best = Infinity;
  for (const v of vehicles) {
    const d = distanceKm(me, v);
    if (d < best) [best, nearest] = [d, v];
  }
  if (!nearest || best <= ON_SCREEN_KM || best > AROUND_KM) return { center: me, zoom: NEAR_ZOOM };
  return { bounds: [me, nearest] };
}

const KEY = "mishwar:last-position";

/** The last point this phone was at (any age), or null. Never throws. */
export function readLastPosition(): Point | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null") as Point | null;
    return value && Number.isFinite(value.lat) && Number.isFinite(value.lon) ? { lat: value.lat, lon: value.lon } : null;
  } catch {
    return null;
  }
}

/** Keeps ONE point, rounded to about 100 m: enough to open the map nearby. */
export function saveLastPosition(p: Point): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat: Math.round(p.lat * 1000) / 1000, lon: Math.round(p.lon * 1000) / 1000 }));
  } catch {
    /* private mode or full: the map then opens on the Strip */
  }
}
