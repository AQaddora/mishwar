# Mishwar (مِشوار)

**Offline-first public transport for the Gaza Strip.** Riders find a seat on the cars,
buses and *ajalas* that already run along the main roads, book it, and see where the
vehicle is. Drivers publish their route and their week, confirm their riders, and quote
private trips. Everything works from what is already on the phone, because the network
in Gaza is weak, intermittent and paid by the megabyte.

The app is Arabic, right to left, built for iPhone Safari first and installable as a PWA.
Production runs at [mishwar.apps.taqat.academy](https://mishwar.apps.taqat.academy).

<p align="center">
  <img src="docs/screenshots/home-map.png" width="19%" alt="Home: the map of the Strip with the vehicles running now" />
  <img src="docs/screenshots/planner.png" width="19%" alt="Trip planner: a journey with a change of vehicle and approximate arrival" />
  <img src="docs/screenshots/driver-today.png" width="19%" alt="Driver's today screen: running now, start driving, notices" />
  <img src="docs/screenshots/request-offers.png" width="19%" alt="A private-trip request with two priced offers" />
</p>

<sub>Phone-size screenshots taken by the project's own QA runner against the QA seed. The
people, phone numbers and photos in them are demo data.</sub>

## Contents

- [What it does](#what-it-does)
- [The rules that shape the code](#the-rules-that-shape-the-code)
- [Architecture](#architecture)
- [Stack](#stack)
- [Run it locally](#run-it-locally)
- [Configuration](#configuration)
- [Scripts](#scripts)
- [Testing](#testing)
- [Deployment](#deployment)
- [Project structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License and attribution](#license-and-attribution)

## What it does

**Guests** (no login) see the vehicles running now on a map of the Strip, each with the
age of its last position, and plan a trip from A to B at a time of their choosing.

**Riders** sign in with Google, give a phone number once, and can:

- book one or more seats on a driver's route for today or the week ahead, from the
  planner, even with no network: the booking waits on the phone and the server decides
  when it arrives (the first booking wins);
- follow «وين السيارة هلأ؟», the vehicle's last position and an approximate arrival at
  their own stop, computed only from a fresh live position;
- answer a driver's request for their location with a yes or no, every time, and share it
  for at most 15 minutes or until the trip starts;
- post a «طلب خاص», a private trip, receive priced offers from drivers, chat with them in
  the app and accept one;
- see their finished trips and rate the driver, 1 to 5 stars.

**Drivers** have one vehicle and can:

- describe it (type, seats, photos they took themselves, maintenance dates);
- keep several routes, each an ordered list of OpenStreetMap stops, running both ways,
  with one default;
- set the week: for each day, working or not, hours, and which route;
- open «أنا سايق», the only screen that sends GPS, between «ابدأ الرحلة» and
  «خلّصت الرحلة», with the screen kept awake;
- run the pre-trip check: call each rider, mark them ready or cancel them, and start only
  when every booking is decided;
- send offers on private requests, chat, and mark the agreed trip done;
- see their finished trips and rate their riders.

There is no payment in the app and no route fare anywhere. The only price is a driver's
own quote on a private-trip offer.

## The rules that shape the code

These are product decisions, not implementation details. They are written down in the
project skills under `.claude/skills/` and enforced by unit tests.

| Rule | What it means in the code |
|---|---|
| **Offline first** | Every screen renders from IndexedDB first. Every write goes to an outbox on the phone and is replayed later with an idempotency key. Sync is a diff since a cursor, within a byte budget that a test checks. |
| **Positions come from GPS only, during a trip** | The driving screen posts a point every 15 seconds while a trip is open. Only the latest point per vehicle is stored. Nothing is ever estimated from the schedule or the route. Older than 5 minutes is stale and says so. |
| **Privacy is not negotiable** | A rider's phone reaches one driver only after a booking or an accepted offer links them. A shared location lives at most 15 minutes and is deleted, never copied. No location history, no coordinates in logs. The search log has no user, no IP and the hour rounded down. |
| **No fares** | Routes carry no price. The one price is an offer on a special request, stored as integer agorot. |
| **Places are OpenStreetMap** | Every stop and place name comes from `data/gazetteer.json` (regenerated from Overpass) or `data/places-extra.json` (checked on the ground). Nothing is typed into code, tests or seeds. |
| **Palestinian Arabic, right to left, iPhone first** | 17px body text, 16px minimum inputs, 44px touch targets, safe-area padding, logical CSS properties, bottom sheets instead of dialogs. English stays in identifiers, logs and comments. |
| **Smallest thing that works** | Platform APIs over libraries: fetch, IndexedDB, a hand-written service worker, Leaflet over OSM tiles. No abstraction for later. |

## Architecture

```
  phone (PWA)                                     server (one Next.js container)
  ┌─────────────────────────────────────┐         ┌──────────────────────────────────┐
  │ screens (React, RTL, Tajawal)       │         │ Next.js 16 App Router            │
  │   read ← IndexedDB "data"           │  GET    │   GET  /api/sync   diff + binary │
  │   write → IndexedDB "outbox" ───────┼─────────┼─► POST /api/outbox  22 kinds     │
  │ sync.ts  pulls /api/sync every 30 s │  POST   │   POST /api/position  GPS point  │
  │ outbox.ts replays oldest first      │◄────────┼─► POST /api/location-share       │
  │ photos.ts  Wi-Fi-only photo queue   │         │   GET  /api/history, /api/photos │
  │ sw.js  pages, assets, tiles, photos │         │   Auth.js (Google) + Prisma      │
  └─────────────────────────────────────┘         └───────────────┬──────────────────┘
                                                                  │
                                                           PostgreSQL (Prisma)
```

- **One Next.js app** serves the pages and the API. There is no separate backend.
- **The phone owns its data.** `src/lib/sync.ts` pulls `GET /api/sync?since=<cursor>` into
  IndexedDB; screens read IndexedDB through `usePublicData()`. Public data (routes,
  vehicles, schedules, positions) is the same for everyone; a signed-in user also receives
  their own bookings, requests, offers and chat threads, shaped for them on the server.
- **Every write is an outbox entry** with a UUID the phone made up. `POST /api/outbox`
  applies each entry once and stores the result, so a replay returns the first answer.
  Handlers throw an Arabic `Reject` message that the screen shows as is.
- **Live positions are the exception.** They are never queued: a stale point is worse than
  none. A phone that asks for `application/octet-stream` gets positions in about 7 bytes
  each (`src/lib/position-codec.ts`).
- **Photos never ride in sync.** Sync carries content hashes; the bytes move on Wi-Fi, or
  when the user taps the button, and are cached by hash.
- **The service worker** keeps every screen of the user's role on the phone, not only the
  ones opened, so a tab never visited still opens with no network.
- **Pure rules, thin handlers.** The domain rules live in `src/lib/*-rules.ts` as pure
  functions, shared by the server (to accept or refuse) and the screens (to say what will
  happen), and unit-tested. The `src/server/*-handlers.ts` files only read rows, ask the
  rules and write.

The protocol, the outbox kinds, the data model and the privacy rules are spelled out in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, standalone output), React 19, TypeScript |
| Styling | Tailwind CSS 4 with design tokens as CSS custom properties; Tajawal via `next/font` |
| Map | Leaflet 1.9 over OpenStreetMap tiles; the Strip's outline from OSM masks the rest |
| Auth | Auth.js (next-auth v5) with Google, database sessions, Prisma adapter |
| Database | PostgreSQL via Prisma 6, committed migrations |
| Offline | IndexedDB (data, outbox, meta, photos), hand-written service worker |
| Optional AI | Anthropic API (Claude Haiku) for parsing a free-text trip request and explaining options; off without a key |
| Tests | Vitest for unit tests; Playwright (`playwright-core`) for the end-to-end scripts and the city simulation |
| Runtime | Node 22, Docker image on Dokku |

## Run it locally

Prerequisites: Node 22, npm, and a PostgreSQL you can point at. Google Chrome is needed
only for the browser tests.

```bash
git clone https://github.com/AQaddora/mishwar.git
cd mishwar
npm ci
```

Start a database. Any PostgreSQL 14+ works; with Docker, for local use only:

```bash
docker run --name mishwar-pg -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=mishwar -p 5432:5432 -d postgres:16
```

Create `.env` from the example and fill in the database. For local work turn QA mode on,
so you can sign in without a Google project:

```bash
cp .env.example .env
```

```dotenv
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/mishwar
QA_MODE=1
```

Apply the migrations, load the demo data and start the dev server:

```bash
npm run qa:seed
```

```bash
npm run dev
```

Open <http://localhost:3000>. To sign in, visit
<http://localhost:3000/api/qa-login?role=rider> or `?role=driver`; the demo driver
already has a vehicle, photos, a route along Salah al-Din Road and a week schedule.

Notes:

- The service worker registers in production builds only. To try offline behaviour, run
  `npm run build` then `npm start` (also honours `PORT`).
- Without `QA_MODE=1`, Google sign-in needs `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and
  `AUTH_SECRET`, and the Google OAuth client must list
  `http://localhost:3000/api/auth/callback/google` as a redirect URI.
- The optional AI step in the planner is a plain 404 until `ANTHROPIC_API_KEY` is set.

## Configuration

All configuration is environment variables. `.env.example` lists the ones the app reads;
never commit a `.env` with real values (the `.gitignore` already refuses them).

### The app

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string. Dokku provides it in production. |
| `AUTH_SECRET` | production | Secret for Auth.js session cookies, for example `openssl rand -base64 32`. In QA mode a random per-process secret is generated when it is unset. |
| `AUTH_URL` | no | Public address of the app, for example `http://localhost:3000`. Usually unnecessary: `trustHost` is on and the proxy's host is used. |
| `AUTH_GOOGLE_ID` | for Google login | Google OAuth client ID. With either Google variable missing, the provider is not registered and the button is hidden. |
| `AUTH_GOOGLE_SECRET` | for Google login | Google OAuth client secret. |
| `QA_MODE` | no | `1` turns on the QA-only routes `/api/qa-login` and `/api/qa-cleanup` and the demo sign-in. Anything else: those routes are a plain 404. The server logs a loud warning at start when it is on. **Never set in production.** |
| `QA_LOGIN_KEY` | no | Extra lock for a QA copy on the public internet: the QA routes then need `?key=` or an `x-qa-key` header with this value. |
| `ANTHROPIC_API_KEY` | no | Enables the optional AI step of the planner (`POST /api/plan-ai`): Arabic free text to from, to and time, plus a short explanation of the options. Capped at 30 calls per minute per process. |
| `GIT_REV` | set by the server | The deployed commit. Reported by `GET /api/health` and used by the service worker to tell an old build from a new one. |
| `PORT` | no | Port for `npm start` and the container (default 3000). |
| `HOSTNAME` | container | `0.0.0.0` so the standalone server binds to every interface (the Dockerfile sets it). |
| `AUTH_TRUST_HOST` | container | `true` behind the Dokku proxy (the Dockerfile sets it). |

### The QA tooling

| Variable | Used by | Meaning |
|---|---|---|
| `BASE_URL` | `npm run qa:e2e` | The running app to test, default `http://127.0.0.1:3000`. |
| `SIM_BASE_URL` | `npm run sim` | The QA copy the simulation drives; default is the staging copy. |
| `SIM_KEY` | `npm run sim`, `sim:cleanup` | That copy's `QA_LOGIN_KEY`, when it has one. |
| `SIM_CHROME` | simulation, e2e | Path to a Chrome or Chromium to drive instead of auto-detecting one. |
| `QA_REPO` | `sim:issues`, `qa/loop` | `owner/name` of the GitHub repository; default is the current repo. |
| `LOOP_MAX`, `LOOP_PERMISSION_MODE`, `LOOP_ALLOWED_TOOLS`, `LOOP_WORKDIR` | `qa/loop/fix-issues.sh` | Settings of the issue fixer, documented in [qa/loop/README.md](qa/loop/README.md). |

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server with hot reload (no service worker). |
| `npm run build` | `prisma generate`, `next build`, then copies `public/` and `.next/static/` into the standalone output. |
| `npm start` | `prisma migrate deploy`, then starts `.next/standalone/server.js` on `PORT`. The same artifact production runs. |
| `npm test` | Unit tests with Vitest (`src/**/*.test.ts`, `qa/**/*.test.mjs`). No network, no database. |
| `npm run lint` | ESLint with the Next.js and TypeScript presets. |
| `npm run qa:seed` | Migrations, then idempotent demo data: a demo driver with vehicle, photos, route and schedule, a demo rider, a small fleet and sample requests. All users have `@mishwar.test` emails. |
| `npm run qa:e2e` | Browser tests against `BASE_URL`: the home map finds the rider (mocked GPS) and every screen opens offline after one online visit. Needs a production build with `QA_MODE=1` and the seed. |
| `npm run sim` | The city simulation: N drivers and M riders use a QA copy on phone-size screens; every step is photographed. See [qa/simulation/README.md](qa/simulation/README.md). |
| `npm run sim:issues` | Files each failed simulation step as a GitHub issue labelled `fleet-qa`, or closes the issue when a merged fix made it pass. |
| `npm run sim:cleanup` | Removes the simulated people from the QA copy. |
| `npm run gazetteer` | Regenerates `data/gazetteer.json` from OpenStreetMap through the Overpass API. |
| `npm run strip-outline` | Regenerates `data/gaza-strip.json`, the Strip's outline, from OpenStreetMap. |

## Testing

Three layers, each with a different cost:

1. **Unit tests** (`npm test`, under a second) cover the rules that would hurt most if
   broken: seats are never oversold, a rider's phone stays hidden until a booking, a
   shared location is dropped when sharing ends, positions are refused outside an open
   trip, the sync response fits its byte budget, the binary codec round-trips, every seed
   and simulation place exists in the gazetteer, and `/api/qa-login` is a 404 without
   `QA_MODE`.
2. **End-to-end scripts** (`npm run qa:e2e`) drive a real browser at phone size against a
   production build: GPS behaviour on the home map, and the offline promise for every
   screen of every role.
3. **The city simulation** (`npm run sim`) plays a whole day in the city against a QA
   copy, from driver setup to ratings, and photographs each step. Its failures become
   GitHub issues, and an unattended fixer can turn them into pull requests. The loop has
   no CI service; it runs on timers on machines Ahmed already has, and is described in
   [docs/AUTOMATED-LOOP.md](docs/AUTOMATED-LOOP.md).

Every pull request is also built, tested, started and photographed by the Fleet QA runner,
which posts one comment and a `fleet-qa` commit status. A person merges; nothing merges
itself.

## Deployment

Production is one Docker container on a Dokku server, with Dokku's PostgreSQL in
`DATABASE_URL`.

- The `Dockerfile` builds the Next.js standalone output on `node:22-bookworm-slim`,
  installs the pinned Prisma CLI in its own folder, and runs as `node`.
- `docker-entrypoint.sh` runs `prisma migrate deploy` and then `exec node server.js`. A
  failed migration stops the container instead of serving a half-migrated app.
- `GET /api/health` returns `{ ok, commit }`, where `commit` is `GIT_REV`. A deploy counts
  as live only when the reported commit equals the merged commit.
- Nobody deploys by hand. A poller watches `main`, pushes the merged commit to the server,
  checks `/api/health`, and posts a `fleet-deploy` commit status.
- `sw.js` and the manifest are served with `Cache-Control: no-cache`, so phones never keep
  an old service worker.

To run the image anywhere else:

```bash
docker build -t mishwar .
```

```bash
docker run --rm -p 3000:3000 -e DATABASE_URL=postgresql://... -e AUTH_SECRET=... -e GIT_REV=$(git rev-parse HEAD) mishwar
```

Secrets are set on the server from files outside the repository and never printed; the
procedure is in `.claude/skills/taqat-deploy/SKILL.md`.

## Project structure

```
.
├── src/
│   ├── app/                 Next.js App Router: one folder per screen, plus api/
│   │   ├── api/             sync, outbox, position, location-share, photos, history,
│   │   │                    search-log, plan-ai, health, auth, qa-login, qa-cleanup
│   │   ├── driver/          today, drive, vehicle, routes, schedule, requests
│   │   ├── search/ trips/ requests/ chat/ history/ account/ login/ welcome/ offline/
│   │   ├── layout.tsx       RTL shell, font, tab bar, offline banner, outbox, SW
│   │   └── manifest.ts      the web app manifest (icons are generated in icons/)
│   ├── components/          Screen, Sheet, TabBar, MapView, PlacePicker, cards, notices
│   ├── lib/                 shared by phone and server: pure rules, planner, time,
│   │                        places, sync + outbox + IndexedDB (browser), codec, copy
│   └── server/              server only: sync builder, outbox processor, handlers,
│                            viewer-shaped responses, history, search log, AI step
├── prisma/                  schema.prisma and the committed migrations
├── public/sw.js             the service worker, hand-written
├── data/                    gazetteer.json, places-extra.json, gaza-strip.json (OSM)
├── scripts/                 qa-seed.mjs, fetch-gazetteer.mjs, fetch-strip-outline.mjs
├── qa/
│   ├── routes.txt           every screen the QA runner photographs
│   ├── e2e/                 Playwright scripts: gps.mjs, offline.mjs
│   ├── simulation/          the city simulation, its scenarios and city.json
│   └── loop/                fix-issues.sh, the unattended issue fixer
├── docs/                    ARCHITECTURE.md, PLAN.md, AUTOMATED-LOOP.md, screenshots/
├── .claude/skills/          the six project skills (domain, offline, iOS feel, shipping,
│                            deploy, on-air) that the code and its tests follow
├── Dockerfile, docker-entrypoint.sh
└── .env.example
```

## Documentation

| Document | Read it for |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The sync protocol, the outbox kinds, the API, the data model, the service worker, privacy |
| [docs/PLAN.md](docs/PLAN.md) | The approved plan, the seven milestones, and what was cut or built anyway |
| [docs/AUTOMATED-LOOP.md](docs/AUTOMATED-LOOP.md) | How the repo tests itself, files its own bugs and proposes fixes without a CI service |
| [data/README.md](data/README.md) | Where places come from, how to refresh or add one |
| [qa/simulation/README.md](qa/simulation/README.md) | Running and extending the city simulation |
| [qa/loop/README.md](qa/loop/README.md) | The unattended issue fixer and its settings |
| [.claude/skills/](.claude/skills/) | The domain rules, offline rules, UI standard, shipping contract and deploy procedure, as skills for coding agents and as reference for people |

## Contributing

Issues and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains the
branch and PR conventions, the repo contract the QA runner relies on, and the rules every
change must keep true (offline behaviour, privacy, real places only, Arabic copy).

Mishwar was built in a recorded, time-boxed session with Claude Code as the engineer and
Ahmed Qaddoura directing, and is maintained the same way: the project skills in
`.claude/skills/` are how the rules are handed to the next session.

## License and attribution

Code is released under the [MIT License](LICENSE).

Place names, coordinates and the outline of the Strip are
© [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, licensed under
the ODbL. The app shows this credit wherever places are listed. Map tiles come from
OpenStreetMap's own tile servers; follow their
[usage policy](https://operations.osmfoundation.org/policies/tiles/) if you run your own copy.
