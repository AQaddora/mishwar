---
name: taqat-deploy
description: How Mishwar reaches production on Ahmed's Dokku server "Taqat apps" at mishwar.apps.taqat.academy. Use whenever you touch the Dockerfile, the Next.js standalone output, the start command, running migrations at boot, the /api/health route, production environment variables or secrets, and whenever you need to prove a merge is live — "is it deployed?", setting AUTH_SECRET or Google OAuth keys on the server, or a deploy that looks wrong. Not for branches, PRs or QA (ship-safely).
---

# Taqat deploy

**The server is already set up:**
- Dokku app `mishwar` at https://mishwar.apps.taqat.academy;
- its Postgres, provided as `DATABASE_URL`;
- TLS and the port map.

**Nobody deploys by hand.** Every commit that lands on main is deployed by Ahmed's fleet,
which then checks the live `/api/health` and posts a `fleet-deploy` commit status. Your
job is to keep the image correct and to verify.

## The container

- **Dockerfile with Next.js `output: "standalone"`,** listening on `PORT` (3000).
- **Set `HOSTNAME=0.0.0.0`,** as the official Next.js Dockerfile does. Docker sets
  `HOSTNAME` to the container id, and the standalone server binds to it otherwise.
- **Copy `public/` and `.next/static/` into the image.** Standalone output leaves them
  out.
- **Migrations run at start, and a failure stops the container.**
  - The entry script uses `set -e`: `prisma migrate deploy`, then `exec node server.js`.
  - So the deploy fails instead of serving a half-migrated app.
  - Standalone output doesn't include the Prisma CLI: install the pinned version in the
    runtime image, and copy `prisma/`.
- **Auth.js sits behind Dokku's proxy.** Set `AUTH_TRUST_HOST=true` (or
  `trustHost: true`) so callback URLs use the real host.

A ready-to-adapt Dockerfile and entry script are in `references/dockerfile.md`.

## `/api/health`

- **Response:** `GET /api/health` returns `{"ok": true, "commit": "<GIT_REV>"}`, where
  `commit` is `process.env.GIT_REV` (the server provides it).
- **Read the environment at request time.**
  - Add `export const dynamic = "force-dynamic"`.
  - Otherwise Next.js may prerender the route at build time and bake in the build
    machine's value, or none at all.
- **Nothing else in the response:** no secrets, no database details.

## Is it deployed?

Only one test counts: **the live commit equals the merged commit.**

```bash
merged=$(gh pr view <number> --json mergeCommit --jq .mergeCommit.oid)
gh api repos/{owner}/{repo}/commits/$merged/status --jq '.statuses[] | select(.context=="fleet-deploy") | .state'
curl -fsS https://mishwar.apps.taqat.academy/api/health
```

**If `commit` is not the merged SHA, it is not deployed**, whatever any log, status or
message says. Report that plainly. If it stays wrong, ask Ahmed (on-air skill).

## Secrets

Secrets reach the server only this way. The value is read from a file outside the repo,
and the output is discarded, because `config:set` echoes values:

```bash
ssh dokku@mishwar.apps.taqat.academy config:set mishwar NAME="$(cat /path/outside/repo/NAME)" >/dev/null 2>&1
```

- **Never show a value:**
  - never print it;
  - never `cat` a secret file on its own;
  - never put it in the repo, a committed `.env`, PR text or a log.
- **Restart the app only once** when setting several values: add `--no-restart` before
  the app name on all but the last.
- **To check which keys exist without seeing values:**
  `ssh dokku@mishwar.apps.taqat.academy config:keys mishwar`.
- **When the value must come from Ahmed** (for example the Google OAuth client from the
  Google Cloud Console):
  - Use a NEEDED FROM AHMED box (on-air skill). He saves the value to a file, then you
    run the command.
  - Also record new secrets in his vault, following his secrets rule.
