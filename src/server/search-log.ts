// The anonymised search log (docs/PLAN.md, M4). The row is built here, field by field,
// so nothing that identifies a person can slip in: no user, no IP address, no free text.
import { getPlace } from "@/lib/places";

export type SearchLogRow = {
  fromPlaceId: string;
  toPlaceId: string;
  weekday: number;
  hour: number;
  options: number;
  createdAt: Date;
};

const int = (value: unknown, min: number, max: number): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;

/** The row to store, or null when the body isn't a real search. */
export function searchLogRow(body: unknown, now: Date = new Date()): SearchLogRow | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.from !== "string" || typeof b.to !== "string" || b.from === b.to) return null;
  if (!getPlace(b.from) || !getPlace(b.to)) return null;
  const weekday = int(b.weekday, 1, 7);
  const hour = int(b.hour, 0, 23);
  const options = int(b.options, 0, 3);
  if (weekday === null || hour === null || options === null) return null;
  const createdAt = new Date(now);
  createdAt.setUTCMinutes(0, 0, 0);
  return { fromPlaceId: b.from, toPlaceId: b.to, weekday, hour, options, createdAt };
}
