# Contributing to Mishwar

Thank you for helping. Mishwar is small on purpose, and most of what makes it work is a
handful of rules that every change has to keep true. This page is those rules, plus the
mechanics of getting a change in.

## Before you start

1. Read the [README](README.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
2. Skim the project skills in `.claude/skills/`. They were written for coding agents, but
   they are the clearest statement of the product rules for people too:
   - `gaza-transit-domain`: vehicles, routes, schedules, bookings, privacy, Arabic copy, places;
   - `offline-first-pwa`: what every feature must do with no network, the sync budget, conflicts;
   - `ios-native-feel`: the front-end standard (RTL, sizes, sheets, tokens);
   - `ship-safely`: the branch and PR flow and the repo contract below;
   - `taqat-deploy`: the container and how a deploy is verified.
3. Open an issue first for anything bigger than a fix, so the scope is agreed before the
   work. Issues the QA simulation files itself carry the label `fleet-qa`.

## Development setup

The [README](README.md#run-it-locally) has the full walkthrough. In short: Node 22, a
PostgreSQL, `cp .env.example .env` with `DATABASE_URL` and `QA_MODE=1`, then
`npm ci`, `npm run qa:seed`, `npm run dev`, and sign in at `/api/qa-login?role=driver`.

## Branches and pull requests

- Branch from an up-to-date `main`. Never push to `main`.
- Name the branch after the change: `fix-issue-<N>` for an issue, `m<N>-<slug>` for a
  planned milestone, or a short descriptive slug otherwise.
- One change per pull request. Keep it as small as it can be and still work.
- Before pushing, `npm run build`, `npm test` and `npm run lint` must pass locally.
- Describe the pull request in plain words, from the rider's or driver's side:

  ```
  ## What a user can now do
  <plain words>

  ## What was cut
  <what this leaves out, and why>

  ## How to see it
  <which qa/routes.txt screens, which demo role, what to tap>
  ```

  A fix ends with `Closes #<N>`.
- Every pull request is built, tested, started and photographed at phone size by the
  Fleet QA runner, which posts one comment (edited in place) and a `fleet-qa` commit
  status on the head commit. There are no GitHub Actions in this repository.
- Red means fix it on the same branch. Nothing is merged on red, pending or missing, and
  nothing merges itself: a person reads the comment, looks at the screenshots, and merges
  with squash.
- GitHub-facing text (issues, pull requests, comments, commit messages) is in English.
  The app itself is in Arabic.

## The repo contract

The QA runner, the simulation and the deploy poller rely on these staying true in every
pull request. Exact behaviour is in `.claude/skills/ship-safely/references/qa-contract.md`.

- `npm run build`, `npm test` and `npm start` work, and `start` honours `PORT`.
- The database is built from the committed Prisma migrations, starting from an empty
  PostgreSQL. Every schema change ships with its migration in the same pull request; a
  migration that has been applied is never edited; `db push` never ships anything.
- `qa/routes.txt` lists every screen to photograph, one per line:
  `<guest|driver|rider> <path> <short-name>`. Add every new screen. A unit test checks
  the list against the screens the service worker keeps (`src/lib/screens.ts`).
- `GET /api/qa-login?role=driver|rider` signs in a demo user only when `QA_MODE=1` and is
  a plain 404 otherwise, with a unit test proving the 404. Production never sets `QA_MODE`.
- The app starts in QA mode with no Google credentials.
- `GET /api/health` returns `{ ok, commit }` and nothing else.

## Rules every change keeps true

**Offline first.** A screen renders from the phone's copy before any request. A write goes
through `useOutbox().send(kind, payload)` with an id the phone made, never straight to an
API route (live positions are the one exception, and they are never queued). Say
«انحفظ على جوالك، ورح ينبعت أول ما يرجع النت» at once, and keep the item pending until the
server answers. New shared data gets a row in the conflicts table of the
`offline-first-pwa` skill before it gets code.

**Sync stays cheap.** Only the fields a screen renders, nulls left out, changes since the
cursor. A unit test asserts the gzipped size of a realistic sync response; raise a budget
only on purpose, in the same pull request, with the reason.

**Privacy.** Phone numbers reach the other side only through a live booking or an offer in
play, and only that other side. A shared location is deleted when sharing ends. Never log
a phone number or a coordinate. Responses are shaped for one viewer in `src/server/*-view.ts`,
which is pure and unit-tested; add your field there, with a test.

**Rules are pure functions.** Put a new rule in `src/lib/*-rules.ts`, test it, and call it
from both the handler (to accept or refuse) and the screen (to say what will happen). A
handler refuses with `throw new Reject(code, arabicMessage)`.

**Real places only.** Every stop, place name and coordinate comes from `data/gazetteer.json`
or `data/places-extra.json`. Never type one into code, seeds, tests or copy; if a place
you need is missing, add it the way [data/README.md](data/README.md) says.

**Arabic copy.** The UI is Palestinian Arabic, short and warm, for people who are not
technical. No "sync", "offline mode", "error 500" or "token" on screen. Read
`.claude/skills/gaza-transit-domain/references/arabic-copy.md` before writing a line.

**iPhone Safari first.** Inputs at least 16px, touch targets at least 44px, nothing wider
than the screen, logical properties (`ms-`, `pe-`, `text-start`), `<bdi>` around numbers in
Arabic text, sheets from the bottom, safe-area padding. Tokens only: no raw colours or
one-off spacing. Hover styles only inside `@media (hover: hover) and (pointer: fine)`.

**No fares.** Routes never carry a price. The one price is an offer's `priceAgorot`.

**Smallest thing that works.** Prefer the platform to a library, and cut scope rather than
add an abstraction for later. If a new dependency removes work today, name that work in
the pull request.

## Tests

- `npm test` runs Vitest over `src/**/*.test.ts` and `qa/**/*.test.mjs`. Tests are
  pure and deterministic: no network, no database. Database-backed code is tested through
  the pure shaping and rule functions it calls.
- Add at least one unit test for the rule your change would hurt most if it broke.
- `npm run qa:e2e` and `npm run sim` need a running QA copy; see the README's
  [Testing](README.md#testing) section and [qa/simulation/README.md](qa/simulation/README.md).
- After editing `qa/simulation/city.json`, `data/gazetteer.json` or
  `data/places-extra.json`, run `npm test`: it names every id that no longer exists.

## Code style

- TypeScript strict; ESLint with `eslint-config-next` (`npm run lint`).
- A short comment at the top of each module saying what it is for and which rule it
  serves. Comments explain why, in plain words, and point to the skill or document the
  rule comes from.
- Identifiers, logs and comments in English; user-facing strings in Arabic, kept in the
  `*-copy.ts` files or next to the component that shows them.
- Times are `Asia/Gaza` local, through `src/lib/time.ts`. Days are `YYYY-MM-DD`, times
  `HH:MM`, weekdays ISO (Monday = 1), weeks shown from Saturday.

## Reporting a bug

Open an issue with the exact steps, what you expected, what happened, the screen
(`qa/routes.txt` short name if you know it), the phone and browser, and whether you were
online. A screenshot helps. If the bug involves a phone number or a location appearing
where it should not, say so plainly in the title: it is treated first.

## Security

If you find a way to read another person's phone number or location, or to sign in as
someone else, do not open a public issue. Email the maintainer (see the GitHub profile of
[@AQaddora](https://github.com/AQaddora)) and allow time for a fix before disclosure.
