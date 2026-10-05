# The automated loop

How this repo tests itself, reports its own bugs, proposes its own fixes, and ships: with
no CI service, on machines you already have. This page explains it simply, so you can
build the same loop for your own project in an afternoon.

There are three parts, and each one is small:

1. **a tester**: a script that builds the app, uses it, and says what it saw;
2. **a poller**: a script on a timer that asks GitHub "anything new for me?";
3. **Claude Code CLI**: which turns a written problem into a pull request.

## The picture

```
             you (or Claude Code) open a pull request
                              |
                              v
 +------------------+   polls open PRs    +--------------------------------+
 |   PR TESTER      | ------------------> | build, unit tests, start the   |
 | (cron, 1 minute) |                     | app, phone screenshots         |
 +------------------+                     +--------------------------------+
                              |
              one comment with screenshots + a commit status (green / red)
                              |
                              v
                 a PERSON reads it and merges        <-- the only manual step
                              |
                              v
 +------------------+   polls main        +--------------------------------+
 |   DEPLOYER       | ------------------> | push to the server, then check |
 | (cron, 1 minute) |                     | /api/health reports THAT commit|
 +------------------+                     +--------------------------------+
                              |
                              v
 +------------------+                     +--------------------------------+
 |   SIMULATION     | ------------------> | N drivers and M riders use the |
 |  npm run sim     |                     | app on phone screens           |
 +------------------+                     +--------------------------------+
                              |
        npm run sim:issues: one GitHub issue per failure (label fleet-qa),
        with steps and a screenshot; a known failure is not filed twice
                              |
                              v
 +------------------+   polls issues      +--------------------------------+
 |   FIXER          | ------------------> | Claude Code in a fresh worktree|
 | fix-issues.sh    |                     | -> a pull request "Closes #N"  |
 +------------------+                     +--------------------------------+
                              |
                              +------> back to the top: the PR is tested,
                                       a person merges, it deploys, and the
                                       next simulation run closes the issue
```

## 1. The contract: what the repo promises the tester

A tester can only test a repo it understands. This repo keeps a few promises in every
pull request (they live in the project skill `.claude/skills/ship-safely`):

- `npm run build`, `npm test` and `npm start` work, and `start` listens on `PORT`;
- the database is built from committed migrations, starting from an empty Postgres;
- `qa/routes.txt` lists every screen to photograph, one per line:
  `<guest|driver|rider> <path> <short-name>`;
- `GET /api/qa-login?role=driver|rider` signs in a demo user, **only when `QA_MODE=1`**.
  Without it the route is a plain 404, and a unit test proves that. Production never
  sets `QA_MODE`.

Write your own contract first. It is one page, and everything else leans on it.

## 2. The PR tester

A script on a timer. Ours runs every minute on a small server; a laptop works too. Its
whole shape:

```bash
for pr in $(gh pr list --state open --json number,headRefOid ...); do
  already_tested "$pr" && continue          # remember the last commit you tested
  gh api repos/$REPO/statuses/$SHA -f state=pending -f context=fleet-qa
  git clone ... && git checkout "pull/$N/head"
  npm ci
  docker run -d postgres                    # a fresh, empty database
  npx prisma migrate deploy && npm run qa:seed
  npm run build && npm test
  QA_MODE=1 PORT=$FREE_PORT npm start &
  node shots.mjs http://127.0.0.1:$FREE_PORT qa/routes.txt out/   # phone-size screenshots
  push the screenshots to a branch (qa-evidence)
  create or edit ONE comment on the PR: a table of checks + the screenshots
  gh api repos/$REPO/statuses/$SHA -f state=success|failure -f context=fleet-qa
done
```

Three details matter more than the rest:

- **A check that did not run is "skipped", never "passed".**
- **One comment, edited in place**, so the pull request stays readable.
- **The screenshot script also checks**: page errors, HTTP 5xx, a page wider than the
  phone, inputs under 16px (iPhone Safari zooms on those).

## 3. The simulation

Screenshots show that pages open. The simulation shows that the product works: several
people, each in their own browser, doing a whole day.

```bash
SIM_KEY=<the QA copy's key> npm run sim                   # 3 drivers, 5 riders, iPhone size
npm run sim -- --drivers 4 --riders 8 --viewport both     # iPhone and Android sizes
```

It runs against a **staging copy** of the app (`https://mishwar-sim.apps.taqat.academy`),
never against production. Drivers register vehicles and routes and go out; riders plan
and book; one vehicle is overbooked on purpose; a driver asks where his riders are; a
private trip is agreed through offers and chat. Every step is photographed and recorded
as pass, fail or skip in `results.json`. Details: `qa/simulation/README.md`.

The simulated city is one editable file, `qa/simulation/city.json`, and the places come
from `data/gazetteer.json`. A unit test names any place that no longer exists.

## 4. Failures become issues

```bash
npm run sim:issues -- --dry-run     # print what would be filed
npm run sim:issues                  # file it
```

For every failed step, `qa/simulation/file-issues.mjs`:

- computes a **fingerprint**: the step's id plus the error with the numbers and ids
  removed. The same bug gets the same fingerprint tomorrow;
- if an open issue already carries that fingerprint, adds one "seen again" comment;
- otherwise uploads the screenshot and opens an issue labelled `fleet-qa` with what
  failed, the steps to repeat it, what was expected, and the command that re-checks it.

The fingerprint is stored in the issue as a hidden comment:
`<!-- fleet-qa-fp:311c5a087f64 step:driver-setup.route -->`.

## 5. The fixer

```bash
qa/loop/fix-issues.sh            # one pass
qa/loop/fix-issues.sh --watch    # every two minutes
```

It takes the oldest open `fleet-qa` issue that nobody is working on, makes a fresh git
worktree, and runs Claude Code there without a person at the keyboard:

```bash
claude -p "Fix GitHub issue #12 in this repository. Read the issue, reproduce it ..." \
  --permission-mode acceptEdits --allowedTools "Read,Edit,Write,Bash(git:*),Bash(gh:*),..."
```

Claude Code reads the issue, follows the project skills, fixes that one thing, adds a
test, and opens a pull request whose description ends with `Closes #12`. The script
never merges. Settings and the permission modes are explained in `qa/loop/README.md`.

## 6. Verification

The fix is checked twice, by machines, before and after a person looks:

- the pull request is tested by the PR tester like any other;
- after it is merged and deployed, the next `npm run sim` + `npm run sim:issues` sees
  the step pass and **closes the issue itself**, with a "verified fixed" comment. If the
  step still fails, the issue stays open and gets "seen again".

A passing step alone is not proof: some errors come and go. So the filer says "verified
fixed" only when a fix for that issue was merged (the `fix-issue-<N>` branch, or a pull
request that says "Closes #N") **and** the step passes. With no merged fix the issue
stays open with a note, and a failure that returns reopens its closed issue instead of
filing a twin. We learned this the first night: an on-and-off map error closed its own
issue twice before the rule existed.

## 7. Deploy on merge

One more poller, same idea:

```bash
sha=$(gh api repos/$REPO/commits/main --jq .sha)
[ "$sha" = "$(cat deployed-sha)" ] && exit 0
git push -f <server remote> "$sha:refs/heads/main"      # the server builds the Dockerfile
live=$(curl -s https://your-app/api/health | jq -r .commit)
[ "$live" = "$sha" ] && state=success || state=failure
gh api repos/$REPO/statuses/$sha -f state=$state -f context=fleet-deploy
```

The rule: **it is deployed only if the live `/api/health` reports the merged commit.**
Not because a log said so.

## The rule that does not move: a person stays at the merge

Everything around the merge is automatic. The merge is not. The tester can be wrong, a
fix can be the wrong fix, and a green check only says what was checked. A person reads
the summary, looks at the screenshots, and decides. The fixer is built so it cannot
merge, and you should keep it that way.

## Build your own in an afternoon

- [ ] Write the contract: build, test and start commands; how a test user signs in
      (QA-only, 404 in production, with a test that proves it); the list of screens.
- [ ] Write `shots.mjs`: open each screen at phone size with Playwright, save a PNG,
      fail on page errors and on pages wider than the screen.
- [ ] Write the PR tester (section 2) and put it on a timer: `cron`, or
      `while true; do ./tester.sh; sleep 60; done` in a terminal.
- [ ] Add `/api/health` that returns the commit, and the deploy poller (section 7).
- [ ] Write one simulation scenario for your most important flow. Record steps with
      pass or fail and a screenshot. Add more scenarios later.
- [ ] Copy `qa/simulation/file-issues.mjs` and `qa/loop/fix-issues.sh`; change the label
      and the prompt to fit your project.
- [ ] Write your project's rules as skills in `.claude/skills`, so the fixer works your
      way without being told each time.
- [ ] Break something on purpose and watch the loop go round once.

## Honest limits

- **A headless browser is not an iPhone.** Safari's real behaviour (install to home
  screen, the notch, zoom on focus, the service worker's first visit) needs a real phone.
- **Phone calls are not placed.** The simulated phone has no dialer: a tap on a call
  button is recorded by the app, and that is all that is checked.
- **GPS is fake.** Positions are set to the exact map point of a stop. Real GPS drifts,
  stops in the background, and drains the battery.
- **Google sign-in is not exercised.** The simulation signs in through the QA-only
  route. The real sign-in is tested by hand.
- **The staging copy has a back door on purpose.** It runs with `QA_MODE=1`, and its
  demo sign-in also needs a key (`QA_LOGIN_KEY`) that is not in the repo. Production
  sets neither, so there the route does not exist.
- **Network loss is simulated by switching the browser offline.** A weak, slow network
  behaves differently from none.
- **The fixer fixes what was written down.** A vague issue gets a vague fix. The issue
  text, with exact steps and one expected result, is most of the work.
