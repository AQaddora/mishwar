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
