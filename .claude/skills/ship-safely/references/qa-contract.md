# Fleet QA contract: details

## npm scripts

| Script | Must |
|---|---|
| `build` | `prisma generate`, then `next build`, then copy `public/` and `.next/static/` into `.next/standalone/` (see taqat-deploy). Exit non-zero on any error |
| `test` | Unit tests only (`vitest run`). Fast and deterministic; no network |
| `start` | Run `prisma migrate deploy`, then start the standalone server on `process.env.PORT` (default 3000). This is exactly what production runs, so QA tests the real artifact |
| `qa:seed` (optional) | Idempotent demo data: at least one driver with a vehicle, photos and a route, and one rider. Runs `prisma migrate deploy` first. Real OSM places only (see gaza-transit-domain) |
| `qa:e2e` (optional) | Browser tests against `process.env.BASE_URL`. Never hardcode localhost |

With `output: "standalone"`, Next.js says `next start` is not supported. Start
`.next/standalone/server.js` instead.

## Prisma

- **Files:** schema at `prisma/schema.prisma`; migrations in `prisma/migrations/`,
  committed.
- **Every schema change ships with its migration in the same PR.**
  - Never edit a migration that has already been applied.
  - Never rely on `db push` for anything that ships.
- **Assume a fresh database.** The runner's Postgres is empty, so migrations plus
  `qa:seed` must build everything from scratch.

## `qa/routes.txt`

```
guest / home
rider /requests/new new-request
driver /driver/route my-route
```

- **One screen per line:** role, path, short name. No comment lines.
- **The path must render for that role** after `/api/qa-login` with the same role (`guest`
  means not signed in).
- **Short names** are kebab-case and unique.
- **No ids that only exist in your local database.** Seed them deterministically, or use
  list pages.

## `/api/qa-login`

- **`QA_MODE` is anything other than `"1"`:** respond 404, exactly like an unknown route.
  No hint that the route exists.
- **`QA_MODE=1`:**
  - `role` must be `driver` or `rider`; anything else is 400.
  - Find or create the seeded demo user for that role.
  - Create a session through Auth.js's own mechanism, with the same cookie name and flags
    as a real login. Don't build a parallel auth path.
  - Redirect to `/`.
  - The user skill `e2e-against-prod-build` shows how to mint a valid Auth.js session.
- **Startup warning:** log a loud one-line warning when `QA_MODE=1`.
- **Unit tests:**
  - With `QA_MODE` unset, calling the route handler's `GET` returns 404.
  - With `QA_MODE=1` and `role=driver`, it sets a session cookie.

## Starting without Google credentials

- **Register the Google provider only when both `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`
  are set.** Hide the Google button when it isn't registered.
- **Auth.js refuses to run in production without `AUTH_SECRET`.**
  - When `QA_MODE=1` and `AUTH_SECRET` is unset, generate a random secret per process.
    QA sessions then die on restart, which is fine.
  - Never do this outside QA mode.
- **Never commit a `.env` file with real values.**

## One unit test per milestone

Test the rule that would hurt most if broken. For example: seats are never oversold, or a
rider's phone stays hidden until a booking.
