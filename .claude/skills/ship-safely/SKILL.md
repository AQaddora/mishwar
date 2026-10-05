---
name: ship-safely
description: How work reaches main in Mishwar and the repo contract the Fleet QA runner relies on. Use whenever you start a milestone, create a branch, commit, push, open or update a pull request, add a screen or route, add or change an npm script, env var, Prisma schema or migration, or dependency, touch /api/qa-login, wait on or read a "Fleet QA" result or fleet-qa status, or are about to merge. Also use it whenever you are tempted to add an abstraction, service or library "for later".
---

# Ship safely

Ahmed doesn't test by hand; his fleet does. That only works if every PR keeps the repo
contract true, and nothing reaches main without a green Fleet QA run and Ahmed's word.

## Every milestone

1. **Branch from an up-to-date main:** `m<N>-<short-slug>` (for example
   `m2-special-requests`).
   - One milestone, one branch, one PR.
   - Never push to main.
2. **Build the smallest thing that works** (see below).
   - Add the milestone's screens to `qa/routes.txt`.
   - Add at least one unit test for its hardest rule.
3. **Before pushing,** `npm run build` and `npm test` must pass locally.
4. **Open the PR** with `gh pr create`, using the template below.
5. **Wait for Fleet QA.** It usually takes a minute or two.
   - It posts one "Fleet QA" comment (every check plus phone-size screenshots) and a
     `fleet-qa` commit status on the head commit. There are no GitHub Actions in this
     repo.
   - Status: `gh api repos/{owner}/{repo}/commits/$(git rev-parse HEAD)/status --jq '.statuses[] | select(.context=="fleet-qa") | .state'`
   - Comment: `gh pr view <number> --comments`. Read the latest "Fleet QA" comment in
     full.
   - Poll about every 30 seconds. If nothing arrives within 10 minutes, ask Ahmed with a
     NEEDED FROM AHMED box (on-air skill). Don't guess.
6. **Red:** fix it on the same branch, push, and wait again.
   - Never merge on red, pending or missing.
7. **Green:**
   - Tell Ahmed the PR is ready (on-air skill).
   - Merge only after he says "merge": `gh pr merge <number> --squash --delete-branch`.
   - Then the taqat-deploy skill takes over and confirms the merge is live.

## PR description template

```
## What a user can now do
<plain words, from the rider's or driver's side>

## What was cut
<what this milestone left out, and why>

## How to see it
<which qa/routes.txt screens, which demo role, what to tap>
```

Add any attribution lines the session requires at the end.

## The repo contract: keep it true in every PR

- **npm scripts:**
  - `build`;
  - `test` (unit tests);
  - `start`, which must honour `PORT`;
  - optional: `qa:seed` (fills demo data) and `qa:e2e` (browser tests that read
    `BASE_URL`).
- **Prisma schema with committed migrations.** The runner provides a fresh Postgres in
  `DATABASE_URL`.
- **`qa/routes.txt`:** one line per screen, in the form `<guest|driver|rider> <path> <short-name>`.
- **`GET /api/qa-login?role=driver|rider`:**
  - signs in a demo user of that role;
  - exists only when `QA_MODE=1`, and returns 404 otherwise;
  - a unit test proves the 404;
  - production never sets `QA_MODE`.
- **The app starts in QA mode with no Google credentials.**

Exact behaviour and code shapes are in `references/qa-contract.md`. Read it whenever you
touch scripts, auth, routes or Prisma.

## Smallest thing that works

- **No abstraction for later, no extra services.**
- **No library Ahmed didn't ask for, unless it removes work today.** Name that work in the
  PR.
- **Prefer the platform:** fetch, IndexedDB, CSS, Next.js built-ins.
- **Cut scope rather than stretch a milestone,** and list the cuts in the PR.
