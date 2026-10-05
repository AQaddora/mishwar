# The city simulation

A handful of simulated drivers and riders use Mishwar on phone-size screens, the way
people would: they tap, type, pick places and add photos. Every step is photographed.
What fails can be filed as a GitHub issue with one more command.

It never runs against production. It needs a **QA copy** of the app: one started with
`QA_MODE=1`, which is the only place `/api/qa-login` and `/api/qa-cleanup` exist.

## One command

```bash
SIM_KEY=<the QA copy's key> npm run sim
```

With nothing else set it runs against the staging copy,
`https://mishwar-sim.apps.taqat.academy`, with 3 drivers and 5 riders on an iPhone-size
screen. You need Node, this repo (`npm ci`) and Google Chrome; no Docker, no database.
With no Chrome on the machine: `npx playwright-core install chromium`.

The key is the staging app's `QA_LOGIN_KEY`. Never write it into the repo. On a machine
with the `taqat-apps` SSH alias:

```bash
SIM_KEY=$(ssh taqat-apps dokku config:get mishwar-sim QA_LOGIN_KEY) npm run sim
```

Useful flags (after `--`):

| Flag | Meaning |
|---|---|
| `--drivers 6 --riders 10` | How many people (1 to 99 each) |
| `--viewport iphone\|android\|both` | 375×812 iPhone or 412×915 Android; `both` runs twice |
| `--only offline` | One scenario, plus the ones it needs |
| `--headed` | Watch the browser do it |
| `--out <dir>` | Where the screenshots go (default `qa/simulation/out/<time>-<viewport>/`) |
| `--no-clean` | Keep the simulated people of the previous run instead of starting clean |

Against your own machine: start the app with `QA_MODE=1` and a Postgres in
`DATABASE_URL`, then `SIM_BASE_URL=http://localhost:3000 npm run sim` (no key needed
unless you set `QA_LOGIN_KEY`).

## What you get

`qa/simulation/out/<run>/`:

- `index.html`: every screenshot on one page, failures outlined in red;
- `NNN-<step>-<person>.png`: the phone after each step;
- `results.json`: each step with pass, fail or skip, the error, and the steps to repeat it.

The command exits with 1 when any step failed.

## What is simulated

The scenarios run in the order of a day in the city.

| Scenario | What happens |
|---|---|
| `driver-setup` | Each driver signs in, saves a vehicle, adds a photo and sends it, builds a route stop by stop, sets the week, and sees «شغّال هلأ» |
| `driving` | Each driver opens «أنا سايق» and starts a trip; the phone's GPS is set to one of his own stops |
| `rider-map-search` | A guest sees the vehicles on the map; each rider opens a vehicle and asks the planner about one journey |
| `planner` | A guest and a rider plan a direct trip, a trip with a change of vehicle at a shared stop, and two places nothing connects |
| `offline` | A rider reopens the app with no internet; a driver saves a change with no internet and it is sent later |
| `booking` | Riders 1 to 4 book with driver 1 from the planner (rider 2 with no internet, rider 4 cancels). Then riders 3 and up all ask for driver 2's seats at the same moment: the first bookings win, the rest are told |
| `location-share` | Driver 1 asks two riders where they are: one says yes (banner on his phone, his point on the driver's), one says no (the driver sees nothing) |
| `trip` | Driver 1 calls, marks ready, cancels one rider as not ready; «ابدأ الرحلة» unlocks only when all are decided; starting ends the location sharing; ending completes the bookings. Driver 2 runs his full vehicle. Everyone else finishes the day |
| `special-request`, `history-rating` | Not written yet: they are listed as skipped, with the reason |

The full story needs at least 2 drivers and 4 riders; a change of vehicle needs 3
drivers. With fewer, the steps that cannot happen are skipped and say why.

On top of what each step checks, every step fails on a page error, an HTTP 5xx, a page
wider than the phone, or an input under 16px (iPhone Safari zooms on those). These are
the same checks the Fleet QA screenshots make.

**Real:** the app, its database, the places (OpenStreetMap ids), the taps.
**Simulated:** the people (`sim-driver-N@mishwar.test`, `sim-rider-N@mishwar.test`,
shown as «محاكاة-N»), their photos (a flat colour reading «صورة محاكاة»), the GPS
(set to the exact OpenStreetMap point of a stop) and the phone calls: a tap on
«اتصل بالراكب» is recorded by the app, but the simulated phone has no dialer, so no call
is placed. What happens when a real phone comes back from the dialer is for a hand test.

## Removing the simulated people

```bash
SIM_KEY=… npm run sim:cleanup
```

This deletes the users whose email is `sim-…@mishwar.test` and everything that belongs
to them, and nothing else. A run also does this first, so two runs never mix.

## Filing what failed as GitHub issues

```bash
npm run sim:issues -- --dry-run   # print what would be filed
npm run sim:issues                # file it (needs the gh CLI, signed in)
```

Each failed step becomes one issue labelled `fleet-qa`, with the steps to repeat it and
the screenshot. A failure that is already open gets a "seen again" comment instead of a
second issue. When the step passes again, the same command closes the issue.

## Changing the city

The map points will change. Two files hold all of them:

1. **The places** are `data/gazetteer.json` (from OpenStreetMap; refresh with
   `npm run gazetteer`) and `data/places-extra.json` (added by hand). See
   `data/README.md`.
2. **The simulated city** is `qa/simulation/city.json`: the routes the drivers build
   (ordered place ids), their vehicles, the journeys the riders plan (one must be
   direct, one must need a change, one must have no route) and who books what. The
   `note` next to an id is only for the reader.

After editing either one, run `npm test`: it names every id in `city.json` that is no
longer in the data, every journey whose kind the routes no longer make true, and every stop whose name is not unique (the simulation picks a stop
by typing its name, like a person). Then run the simulation again; it starts clean.

## Adding a scenario

Copy `scenarios/booking.mjs`, export `{ name, needs, run }`, and list it in
`scenarios/index.mjs` in place of its stub from `scenarios/todo.mjs`. Inside `run`:

```js
const rider = await sim.person("rider", 1);          // one phone per person
await sim.step("booking.book-seat", rider, { title, repro: [...], expected }, async (page) => {
  await sim.signIn(rider);
  await page.goto(`${sim.base}/…`);
  // tap and type like a person; throw an Error in plain words when the app is wrong
});
```

Step ids start with the scenario's name. Places come from `sim.place(id)` and
`sim.routeFor(n)`, never typed into the scenario.
