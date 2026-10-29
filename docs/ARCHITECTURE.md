# Architecture

How Mishwar is put together, from the phone to the database. The README has the
overview; this page has the shapes. The rules behind each part are in the project skills
under `.claude/skills/`, and the code comments point back to them.

## Contents

- [One app, two halves](#one-app-two-halves)
- [Data on the phone](#data-on-the-phone)
- [Sync: `GET /api/sync`](#sync-get-apisync)
- [Writes: `POST /api/outbox`](#writes-post-apioutbox)
- [Live positions](#live-positions)
- [Photos](#photos)
- [The other endpoints](#the-other-endpoints)
- [The service worker](#the-service-worker)
- [Authentication and roles](#authentication-and-roles)
- [Data model](#data-model)
- [Time](#time)
- [Places](#places)
- [Privacy, as enforced](#privacy-as-enforced)
- [QA mode](#qa-mode)
- [The optional AI step](#the-optional-ai-step)

## One app, two halves

Mishwar is one Next.js 16 application. Server components render the shell of each screen;
client components draw the data; API routes under `src/app/api/` are the whole backend.
There is no separate service, queue or worker process.

The code is split by where it runs:

| Folder | Runs | Holds |
|---|---|---|
| `src/lib/` | phone and server | pure rules (`*-rules.ts`), the planner, time and place helpers, the binary codec, Arabic copy; and the browser-only data layer (`idb.ts`, `sync.ts`, `outbox.ts`, `photos.ts`) |
| `src/server/` | server only | the sync builder, the outbox processor and its handlers, viewer-shaped responses (`*-view.ts`), history, the search log, the AI step |
| `src/app/` | both | one folder per screen: a server `page.tsx` that checks the role and reads what the screen needs, and a `*Client.tsx` that renders from the phone's copy |
| `src/components/` | phone | the shell (`Screen`, `Sheet`, `TabBar`), the map, pickers, cards and notice lists |

The rule of thumb: a decision that can refuse a write lives in `src/lib/*-rules.ts` as a
pure function, so the server and the screen agree and a unit test can hold it.

## Data on the phone

`src/lib/idb.ts` opens one IndexedDB database, `mishwar`, with four stores:

| Store | Key | Holds |
|---|---|---|
| `data` | `[entity, id]` | the last-known records: routes, vehicles, schedule, positions, and the signed-in user's bookings, requests, offers, messages |
| `outbox` | `id` (index on `createdAt`) | writes waiting to be sent, oldest first |
| `meta` | `name` | `cursor`, `lastSyncAt`, `syncSchema`, `accountId`, settings such as photos on Wi-Fi only |
| `photos` | `id` | the separate photo upload queue, never mixed with the data outbox |

Downloaded photos live in Cache Storage (`photos-v1`), keyed by their hash URL.

Screens read through `usePublicData()` (`src/lib/use-public-data.ts`): it returns the
phone's copy at once, pulls a sync in the background, refreshes every 30 seconds while a
screen is open, and reports `lastSyncAt` (the last sync that succeeded, not the last
attempt) and whether the last attempt failed. «آخر تحديث قبل ٥ دقايق» is `lastSyncAt`.

On logout or an account switch the outbox is paused and purged, so one account's writes
are never sent as another's.

## Sync: `GET /api/sync`

`src/server/sync.ts` builds the response; `src/lib/sync.ts` consumes it.

```
GET /api/sync?since=<cursor>
Accept: application/json | application/octet-stream

{
  "cursor": "<ISO time>",
  "serverTime": "<ISO time>",
  "changes": {
    "routes": [...], "vehicles": [...], "schedule": [...], "positions": [...],
    "bookings": [...], "requests": [...], "offers": [...], "messages": [...]
  },
  "deleted": { "routes": [...], "vehicles": [...] },
  "more": false
}
```

- **Public part**, identical for everyone including guests: routes with their ordered
  stop ids, vehicles (type, seats, free seats today, photo hashes, the driver's first
  name, average rating, maintenance), the week schedules, and the latest position per
  vehicle. No phone numbers.
- **Private part**, only for a signed-in user and shaped for them: their bookings,
  their requests with offers and chat threads (a rider), or the open requests plus their
  own offers and threads (a driver). The other side's phone number is included only
  while the rule says so (see [Privacy](#privacy-as-enforced)).
- **Cursor:** the previous sync's `serverTime` minus a 5-second overlap, so a write that
  committed late is not missed. The phone upserts by id, so overlap is harmless. Routes
  are soft-deleted (`deletedAt`) so a deletion reaches phones through `deleted`.
- **Diff vs whole:** routes, vehicles and schedule travel as changes since the cursor,
  up to `PAGE_SIZE` (400) per response with `more: true` beyond it. Positions, bookings,
  requests, offers and messages are sent whole each time (they are small and must be
  exact). A thread carries its newest 30 messages.
- **Budget:** a unit test builds a realistic response from the seed data and asserts the
  gzipped size: a first sync under 150 KB, a routine sync under 10 KB.
- **Schema version on the phone:** `src/lib/sync.ts` stores a `syncSchema` number in the
  `meta` store and bumps it when the stored shape changes; a phone with an older number
  resets its cursor and pulls everything once.

### Binary positions

Positions are the part of the sync that goes out whole every 30 seconds, and as JSON a
position is about 100 bytes that gzip cannot shrink much. A phone that sends
`Accept: application/octet-stream` receives one frame instead:

```
u8 version · varint jsonLength · JSON (as above, positions: []) · varint count · count × (varint gap in n · point)
point = varint head (age·4 + outsideFlag·2 + speedFlag) · u16 dLat · u16 dLon [· u8 speed/4]
```

Coordinates are whole 1e-5 degrees (about 1.1 m) as offsets from the Strip's south-west
corner; vehicles are named by `Vehicle.seq`, a small number sent with each vehicle in the
JSON part; times are ages in seconds before `serverTime`. A vehicle on the road costs
about 7 bytes. The route gzips the frame itself when that is smaller, since the platform
leaves `octet-stream` alone. `src/lib/position-codec.ts` has the layouts, the decoder
(every read bounds-checked) and the rule that a new layout gets a new version byte.

## Writes: `POST /api/outbox`

Every write a user makes becomes an outbox entry on the phone first:

```json
{ "entries": [ { "id": "<uuid the phone made>", "kind": "booking.create", "accountId": "<user id>", "createdAt": "<ISO>", "payload": { } } ] }
```

The phone replays entries serially, oldest first, when the app starts, when the network
comes back, and when the app returns to the foreground. It stops at the first network
failure and leaves the rest queued. The response names each entry:

```json
{ "results": [ { "id": "...", "status": "applied" | "duplicate" | "rejected", "result": { }, "reason": "seats_gone", "message": "الكراسي خلصت قبل ما يوصل طلبك" } ] }
```

`src/server/outbox.ts` applies each entry once: the id is stored with its outcome
(`OutboxEntry` table), so a replay gets the first answer back (`duplicate`). A handler
refuses by throwing `Reject(reason, arabicMessage)`; the rejection is stored too, so the
phone drops the entry and shows the message. An unexpected error is not stored, so the
phone keeps the entry and retries. An entry whose `accountId` is not the signed-in user
is rejected without being applied. A batch is capped at 20 KB.

The kinds, grouped by the file that handles them:

| File | Kinds |
|---|---|
| `src/server/handlers.ts` (driver setup and trips) | `vehicle.save`, `maintenance.set`, `photo.remove`, `route.save`, `route.delete`, `schedule.save`, `trip.start`, `trip.end` |
| `src/server/booking-handlers.ts` | `booking.create`, `booking.cancel`, `booking.called`, `booking.decide`, `share.ask`, `share.answer`, `share.stop` |
| `src/server/request-handlers.ts` | `request.create`, `request.close`, `request.complete`, `offer.send`, `offer.accept`, `message.send` |
| `src/server/rating-handlers.ts` | `rating.create` |

Conflicts have one stated rule each, and the user always sees the outcome:

| Data | Rule |
|---|---|
| Seats on a trip | the server decides; the first booking to arrive wins; the loser is told «الكراسي خلصت قبل ما يوصل طلبك» |
| Accepting an offer | first accept wins and closes the request; the other drivers are told |
| A driver's own data | one author; the latest edit by server time wins |
| A booking for a driver who has since stopped running | rejected on arrival, with the reason |
| Ready or cancel before a trip | the driver decides each booking; a cancel beats a later change |
| Chat | append-only, ordered by server time |

A schedule or maintenance change that invalidates bookings cancels them on save and tells
the driver how many; each rider is told why at the next sync.

## Live positions

The driving screen (`/driver/drive`) is the only sender of the driver's position, and only
between `trip.start` and `trip.end`. It posts to `POST /api/position` about every 15
seconds while the screen is open (less often standing still), keeps the display awake with
the Wake Lock API, and never queues a point: a position that waited offline is stale, and a
stale point is worse than none. The body is JSON `{ lat, lon, speed }` or the 8-byte binary
driver point, which also carries the age of the GPS fix.

The server accepts a point only from the vehicle's own driver with an open trip
(`canWritePosition`), keeps exactly one row per vehicle (`VehiclePosition`, overwritten,
deleted when the trip ends), and runs the off-route check: more than 500 m from the route
line for 2 minutes sets `offRouteNotifiedAt` on the trip's bookings once, so the riders see
a notice with a call button.

A rider's shared location follows the same pattern through `POST /api/location-share`:
accepted only after that rider said yes to that ask, stored as one point on the
`LocationShare` row, included in the driver's sync only while sharing is active, and
deleted when sharing ends (trip start, 15 minutes, or the rider stopping).

On the phone, a position older than 5 minutes is stale: it is shown as such and nothing is
computed from it. Arrival times exist only from a fresh position: distance along the
route, stop to stop, at the reported speed or a typical 30 km/h, always labelled
«تقريباً».

## Photos

Photos never travel in sync or in the outbox. The phone compresses a photo to about
200 KB and at most 1280 px, puts it in the `photos` IndexedDB store, and uploads it from
there with `POST /api/photos` under the Wi-Fi rule: `navigator.connection.type` of `wifi`
or `ethernet` allows automatic transfer; `cellular` or `saveData` refuses it; unknown
(iPhone Safari) is treated as refused, and the user gets «ابعت الصور هلأ» and
«نزّل الصور هلأ» buttons instead. The setting «الصور بس على الواي فاي» defaults to on.

The server stores the JPEG in Postgres (`Photo.bytes`), because the container disk is wiped
on every deploy, under a content hash. `GET /api/photos/<hash>` serves it with a one-year
immutable cache header, so the service worker can cache it forever. A vehicle holds at most
four photos.

## The other endpoints

| Route | Method | Who | What |
|---|---|---|---|
| `/api/sync` | GET | anyone | the sync response above |
| `/api/outbox` | POST | signed in | the writes above |
| `/api/position` | POST | driver with an open trip | the vehicle's GPS point |
| `/api/location-share` | POST | rider who said yes | the rider's point for one booking |
| `/api/photos` | POST | driver | one JPEG, at most 600 KB, returns `{ hash }` |
| `/api/photos/<hash>` | GET | anyone | the photo bytes, immutable |
| `/api/history` | GET | signed in | finished trips, newest first, one page, shaped for the viewer; no phones, no locations, a rating's comment only for the person it is about |
| `/api/search-log` | POST | anyone | one anonymous row per planner search: from, to, weekday, hour, options found; no user, no IP, no text |
| `/api/plan-ai` | POST | anyone | the optional AI step; 404 without `ANTHROPIC_API_KEY` |
| `/api/health` | GET | anyone | `{ ok: true, commit }`, read at request time |
| `/api/auth/*` | GET, POST | | Auth.js |
| `/api/qa-login`, `/api/qa-cleanup` | GET, POST | QA only | see [QA mode](#qa-mode) |

Every API route is `force-dynamic`: nothing is prerendered at build time, so environment
variables are read per request.

## The service worker

`public/sw.js` is hand-written and has no build step. Its strategies:

| Request | Strategy |
|---|---|
| Pages (navigations) | network first, but never longer than a short wait when a copy is on the phone; the copy when there is no network; the same screen without its query string when only that is kept; a short Arabic "not on your phone yet" page only for a screen this phone never had |
| Page data for in-app links (RSC) | network first, then the exact copy; with neither, the error makes Next.js load the page itself from the cache |
| `/_next/static/*` | cache first: the hash in the name means it never changes |
| `/api/photos/<hash>` | cache first, in the same `photos-v1` cache the app fills |
| Map tiles | cached as viewed, capped in number |
| Every other `/api/*` | untouched: the app keeps its own data in IndexedDB |

Every screen of the user's role is kept, not only the ones opened: the page sends the
worker a `precache` message with its role's screens (`src/lib/screens.ts`) and the
requests, chats and routes in the phone's data, and the worker fetches each with its
scripts and styles. A screen already kept is fetched again only when the build (`GIT_REV`)
or the account changed. A new worker takes over at once and drops the old version's caches;
the page reloads itself once. `sw.js` and the manifest are served with `no-cache`, and the
worker is registered in production builds only.

## Authentication and roles

Auth.js (next-auth v5) with the Prisma adapter and database sessions. Google is the only
provider and is registered only when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are
set; without them the login screen has no button and QA mode is the way in. The session
callback hands the app `id`, `name`, `email`, `image`, `role` and `phone`, and never the
session token.

A new user has no role. Every page sends such a user to `/welcome`, where they pick rider
or driver once (it never changes) and give a Palestinian mobile number
(`normalizePhone` in `src/lib/role.ts` accepts `05…`, `+970`, `+972`, `00970`, `00972`
and Arabic digits). `/driver/*` is for drivers only; the root layout picks the tab bar by
role; server code learns who is asking through `getCurrentUser()` in `src/lib/session.ts`.

## Data model

`prisma/schema.prisma` is the source of truth, and its comments say why each column
exists. In outline:

| Model | What it is |
|---|---|
| `User`, `Account`, `Session`, `VerificationToken` | Auth.js, plus `role` (set once) and `phone` on `User` |
| `Vehicle` | one per driver: type (`car`, `bus`, `ajala`), seats, maintenance from/until, `seq` (the small number the binary sync uses), `offRouteSince` |
| `Photo` | a vehicle's JPEG bytes under a content hash |
| `Route`, `RouteStop` | a driver's routes, soft-deleted, with ordered OSM place ids |
| `ScheduleDay` | at most one row per driver and ISO weekday: working, hours, route |
| `Trip` | from «ابدأ الرحلة» to «خلّصت الرحلة»; at most one open per driver |
| `VehiclePosition` | the latest GPS point per vehicle, overwritten; deleted at trip end |
| `Booking` | seats on a route on a day; status `confirmed` → `ready`, or `rejected` / `cancelled` with a reason; `pending` exists only on the phone |
| `LocationShare` | one ask, one answer, at most one point, deleted when sharing ends |
| `SpecialRequest`, `Offer`, `Message` | a private-trip request, drivers' priced offers (integer agorot, one per driver), and one chat thread per offer |
| `Rating` | 1 to 5 stars both ways, once per trip per rater, on a completed booking or private trip |
| `OutboxEntry` | processed outbox ids with their outcome, per user |
| `SearchLog` | anonymous planner searches |

Ids for everything a phone creates (routes, trips, bookings, requests, offers, messages,
ratings) are made on the phone, which is what makes replays idempotent. Places are not in
the database: rows store the OSM id and the app resolves it from the bundled gazetteer.

## Time

Everything a person sees is `Asia/Gaza` local time, whatever the server's or the phone's
zone. `src/lib/time.ts` produces `{ day, weekday, time }`: days as `YYYY-MM-DD`, times as
`HH:MM`, weekdays ISO (Monday = 1). The week is shown from Saturday. A driver is "running
now" when the vehicle is not in maintenance, today is a working day, and now is inside
today's hours (`isRunning` in `src/lib/driver-rules.ts`).

## Places

`data/gazetteer.json` is regenerated from OpenStreetMap through the Overpass API by
`scripts/fetch-gazetteer.mjs`: named places, junctions, squares, stands, hospitals,
universities and markets inside the five governorates, with `name:ar`, the element's own
coordinates and the extract date. `data/places-extra.json` holds places OSM lacks,
checked on the ground, with `manual/…` ids. `data/gaza-strip.json` is the Strip's outline
(relation 1473938), used to mask the map outside it. All three are bundled at build time;
`src/lib/places.ts` exposes lookup and the bounding box. A unit test checks every id used
by the seed and the simulation against the data.

## Privacy, as enforced

| Data | Who sees it, and when | Where it is enforced |
|---|---|---|
| Driver's phone | the rider with their offer while the offer is in play; the rider of a live booking | `phoneVisible` in `booking-rules.ts`, `shapeBooking`, `shapeRequest` (unit-tested) |
| Rider's phone | the driver of a live booking; the one driver whose offer was accepted | same |
| Driver's position | everyone, latest point only, during an open trip | `canWritePosition`; one row, deleted at trip end |
| Rider's location | the driver of that booking, only after a yes, only until trip start or 15 minutes | `shareIsActive`; the point is deleted when sharing ends |
| Rider's own GPS on the home map | nobody: it never leaves the phone | `src/lib/near-me.ts` |
| Planner searches | nobody: no user, no IP, hour rounded down | `src/server/search-log.ts` |
| History | the two parties; no phones, no locations; a comment only for the person it is about | `src/server/history.ts` (unit-tested) |
| Logs | never a phone number or a coordinate | by convention, checked in review |

## QA mode

`QA_MODE=1` turns on two routes that otherwise do not exist (a plain 404, with a unit
test proving it):

- `GET /api/qa-login?role=driver|rider[&n=1..99]` upserts a demo user and creates a real
  Auth.js session row and cookie, then redirects home. `n` signs in a numbered simulated
  person (`sim-driver-N@mishwar.test`), which is how the city simulation gets many people.
- `POST /api/qa-cleanup` deletes every `sim-…@mishwar.test` user and everything that
  cascades from them.

With `QA_LOGIN_KEY` set, both also require `?key=` or `x-qa-key` (compared in constant
time), which is how the staging copy on the public internet stays closed. The server logs
a loud warning at start whenever QA mode is on. Production sets neither variable.

## The optional AI step

`POST /api/plan-ai` (`src/server/plan-ai.ts`) is off without `ANTHROPIC_API_KEY`. With it,
two small calls to Claude Haiku: turning an Arabic sentence («بدي أروح من جباليا للنصيرات
بكرة الصبح») into from, to and time, and explaining the options the planner found in a
line or two. The model never finds routes: it picks places by their number in a list the
server built from the gazetteer, every answer is checked against the data, and no free
text from the phone reaches the explain call. Calls are capped per process.
