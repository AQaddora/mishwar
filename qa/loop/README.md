# The fixer: issue → Claude Code → pull request

`fix-issues.sh` is the part of the loop that picks up what the tester found. The whole
loop is explained in [docs/AUTOMATED-LOOP.md](../../docs/AUTOMATED-LOOP.md).

```bash
qa/loop/fix-issues.sh            # one pass
qa/loop/fix-issues.sh --watch    # a pass every two minutes, until Ctrl-C
```

One pass:

1. lists the open issues labelled `fleet-qa`, oldest first;
2. skips any that has the label `claude-working`, or an open pull request that mentions it;
3. for the next one: adds `claude-working`, makes a fresh git worktree from `origin/main`
   on the branch `fix-issue-<N>`, and runs Claude Code there with one fixed prompt (it is
   in the script: read the issue, reproduce it, fix exactly that, add a test, open a pull
   request that ends with `Closes #<N>`);
4. comments on the issue with the pull request's link. If no pull request came out, it
   removes the label and says the issue needs a person.

It never merges. A green tester run and a person do that.

## What you need

- `git`, and this repo cloned with push rights;
- the GitHub CLI, signed in: `gh auth status`;
- the Claude Code CLI, signed in: `claude --version`.

## Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `LOOP_MAX` | `1` | Issues handed to Claude Code per pass |
| `LOOP_PERMISSION_MODE` | `acceptEdits` | Passed to `claude --permission-mode` |
| `LOOP_ALLOWED_TOOLS` | reading, editing, and `git`, `gh`, `npm`, `npx`, `node` commands | Passed to `claude --allowedTools` |
| `LOOP_WORKDIR` | a folder next to the repo, `<repo>-fixes` | Where the worktrees and logs go |
| `QA_REPO` | the repo of the current folder | `owner/name` |

**About the permission mode.** The run is unattended: nobody is there to answer a
permission question. With the default, Claude Code may edit files in its worktree and run
only the commands on the allowed list; anything else is refused and it has to do without.
That is the safe choice for your own laptop. `bypassPermissions` lets it run anything, so
use that only inside a throwaway machine or container, never where your own files and
keys are. Run `claude --help` to see the modes your version has.

## Watching it

Each run's full output is in `$LOOP_WORKDIR/issue-<N>.log`. The pull request it opens is
tested like any other, and the next simulation run closes the issue by itself when the
step passes again.
