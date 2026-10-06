// The phone's copy of the public data: pulled from GET /api/sync into IndexedDB, read
// back from IndexedDB by the screens. So the map, the search and the planner draw from
// what is on the phone, with or without a network. Browser only.
import { getMeta, idbBatch, idbGetAll, setMeta } from "@/lib/idb";
import { EMPTY_PUBLIC_DATA, type PublicData, type SyncResponse } from "@/lib/public-data";

type Stored = { entity: keyof PublicData; id: string; value: unknown };

export type LocalData = { data: PublicData; /** The last sync that succeeded (ISO), not the last attempt. */ lastSyncAt: string | null };

export async function readLocal(): Promise<LocalData> {
  const [rows, lastSyncAt] = await Promise.all([idbGetAll<Stored>("data"), getMeta<string | null>("lastSyncAt")]);
  const data: PublicData = { routes: [], vehicles: [], schedule: [], positions: [], bookings: [], requests: [], offers: [], messages: [] };
  for (const row of rows) (data[row.entity] as unknown[] | undefined)?.push(row.value);
  return { data, lastSyncAt: lastSyncAt ?? null };
}

/** Entities the server always sends whole, not as a diff. */
const COMPLETE = ["positions", "bookings", "requests", "offers", "messages"] as const;

let running: Promise<boolean> | null = null;

// Pulls every change since the stored cursor. Resolves true when the phone is up to date,
// false when the network (or the server) didn't answer. navigator.onLine is not trusted:
// the request itself is the proof.
export function syncNow(): Promise<boolean> {
  running ??= pull().then((ok) => {
    // For the offline banner and the service worker's precache (layout components).
    window.dispatchEvent(new Event(ok ? SYNCED_EVENT : SYNC_FAILED_EVENT));
    return ok;
  });
  return running;
}

export const SYNCED_EVENT = "mishwar:synced";
export const SYNC_FAILED_EVENT = "mishwar:sync-failed";

function pull(): Promise<boolean> {
  return (async () => {
    try {
      for (let page = 0; page < 50; page++) {
        const cursor = (await getMeta<string | null>("cursor")) ?? null;
        const response = await fetch(`/api/sync${cursor ? `?since=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store" });
        if (!response.ok) return false;
        const body = (await response.json()) as SyncResponse;
        const puts: Stored[] = [];
        for (const entity of ["routes", "vehicles", "schedule", ...COMPLETE] as const) {
          for (const value of body.changes[entity] ?? []) puts.push({ entity, id: value.id, value });
        }
        // These arrive as the complete current set: drop the ones that are gone.
        const current = Object.fromEntries(COMPLETE.map((entity) => [entity, new Set((body.changes[entity] ?? []).map((v) => v.id))]));
        const gone = (await idbGetAll<Stored>("data")).filter((r) => r.entity in current && !current[r.entity].has(r.id));
        const deletes: IDBValidKey[] = [
          ...gone.map((r) => [r.entity, r.id]),
          ...body.deleted.routes.map((id) => ["routes", id]),
          ...body.deleted.vehicles.map((id) => ["vehicles", id]),
        ];
        await idbBatch("data", puts, deletes);
        await setMeta("cursor", body.cursor);
        if (!body.more) {
          await setMeta("lastSyncAt", body.serverTime);
          return true;
        }
      }
      return false;
    } catch {
      return false;
    } finally {
      running = null;
    }
  })();
}

export { EMPTY_PUBLIC_DATA };
