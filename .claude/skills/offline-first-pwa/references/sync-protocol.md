# Sync protocol

## Pull: `GET /api/sync?since=<cursor>`

```json
{
  "cursor": "opaque-string",
  "serverTime": "2026-10-05T12:00:00Z",
  "changes": { "routes": [], "stops": [], "vehicles": [], "bookings": [], "offers": [], "messages": [] },
  "deleted": { "routes": [], "bookings": [] },
  "more": false
}
```

- **What gets sent:**
  - Only the fields the client renders. Omit nulls; gzip handles repeated keys.
  - Public data (routes, stops, vehicles) is the same for everyone.
  - Private data (bookings, offers, messages) is scoped to the signed-in user.
- **Cursor:** the server time of the previous successful sync, minus a 5-second overlap.
  - The overlap catches writes that committed late.
  - The client upserts by `id` and `version`, so duplicates are harmless.
- **Deletions:** soft-delete with `deletedAt`, so deletions reach phones through `deleted`.
- **Pagination:** when a response would pass 50 KB gzipped, return a page with
  `more: true`. The client calls again with the new cursor.
- **Photos:** only hashes travel here, never photo bytes.

### Binary positions (`src/lib/position-codec.ts`)

- **JSON stays the default** (old phones, the simulation, curl, debugging). A phone that
  sends `Accept: application/octet-stream` gets the same response as one binary frame:
  `u8 version · varint jsonLength · the JSON with positions: [] · the positions`.
- **A position is ~7 bytes:** the vehicle's small number `n` (Vehicle.seq, sent with each
  vehicle in the JSON part; positions sorted, sent as gaps), its age in whole seconds before
  `serverTime`, lat/lon as u16 offsets of 1e-5° (≈1.1 m) from the Strip's south-west
  corner (absolute zigzag varints outside it), speed in quarter m/s.
- **The route gzips the frame itself when that is smaller** (Next.js and nginx leave
  octet-stream alone). Routine sync, 50 vehicles on the road: 584 B instead of 2,120 B.
- **The phone decodes on arrival** and IndexedDB keeps the usual decoded records, so every
  screen and the offline copy read exactly what they read before.
- **`meta.syncSchema` = 2:** a phone that synced before vehicles carried `n` pulls
  everything once. A position for a vehicle the phone doesn't know after a partial sync
  resets the cursor (a full sync names every vehicle, so it never loops).
- **The points a phone sends** (`POST /api/position`, `POST /api/location-share`) may be
  binary too (`Content-Type: application/octet-stream`, 8 and 24 bytes, answered 204), and
  carry the GPS fix's own age. A phone that gets a 400 from an older server switches to JSON.
  Standing still (moved < 15 m), a phone sends one point a minute instead of every 15–20 s.
- **Change the layout only with a new version byte,** and keep the decoder for the old one.

## Push: `POST /api/outbox`

```json
{ "entries": [ { "id": "uuid-v4", "kind": "booking.create", "accountId": "…", "createdAt": "…", "payload": {} } ] }
```

Response per entry: `{ "id", "status": "applied" | "duplicate" | "rejected", "result"?, "reason"? }`.

- **`id` is the idempotency key.** The server stores processed ids per account, and
  replaying an entry returns the original result.
- **Replay:**
  - The client replays serially, oldest first.
  - It stops at the first network failure and leaves the rest queued.
- **On `rejected`:**
  - Show the outcome from the conflict table in SKILL.md.
  - Then remove the entry.
- **Account safety:**
  - Entries carry `accountId`.
  - On logout or an account switch, pause replay and purge.
  - Never send account A's entries as account B.

## IndexedDB layout

| Store | Key | Holds |
|---|---|---|
| `data` | `[entity, id]` | Last-known records, each with `version` |
| `outbox` | `id` (index on `createdAt`) | Pending writes |
| `meta` | name | `cursor`, `lastSyncAt`, settings (photos on Wi-Fi only) |

- **Photos:** Cache Storage, in a cache named with a version (for example `photos-v1`),
  keyed by the hash URL.
- **"Last updated" means `meta.lastSyncAt`:** the last sync that succeeded, not the last
  attempt.
- **Schema versioning:** version the stored schema, and migrate or discard on upgrade
  (P-525).

## Budget test (vitest)

```ts
import { gzipSync } from "node:zlib";

it("first sync of the seed data fits the budget", async () => {
  const body = JSON.stringify(await buildSyncResponse(seedRider, null));
  expect(gzipSync(body).byteLength).toBeLessThanOrEqual(150 * 1024);
});
```

Add the routine-sync case too (cursor from yesterday, ≤ 10 KB).
