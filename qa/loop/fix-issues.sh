#!/usr/bin/env bash
# fix-issues.sh — the fixer half of the loop: GitHub issue -> Claude Code -> pull request.
#
#   qa/loop/fix-issues.sh            one pass
#   qa/loop/fix-issues.sh --watch    a pass every two minutes
#
# Takes open issues labelled fleet-qa (oldest first) that nobody is working on, and for
# each one runs Claude Code in its own git worktree with one fixed prompt. It opens a
# pull request and stops there. It never merges: the tester and a human do the rest.
# Needs: git, the gh CLI (signed in) and the claude CLI. See qa/loop/README.md.
set -uo pipefail

REPO="${QA_REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
ROOT="$(git rev-parse --show-toplevel)"
WORK="${LOOP_WORKDIR:-$ROOT/../$(basename "$ROOT")-fixes}"
MAX="${LOOP_MAX:-1}"                                  # issues per pass
MODE="${LOOP_PERMISSION_MODE:-acceptEdits}"           # see the README before changing it
# One comma-separated argument: split on spaces, "Bash(git *)" would fall apart.
TOOLS="${LOOP_ALLOWED_TOOLS:-Read,Edit,Write,Glob,Grep,Bash(git:*),Bash(gh:*),Bash(npm:*),Bash(npx:*),Bash(node:*)}"

prompt() {
  echo "Fix GitHub issue #$1 in this repository. Read the issue, reproduce it with the command it gives, find the cause, and fix exactly that, following the project skills in .claude/skills. Work on a branch named fix-issue-$1, add or update one unit test that would have caught it, run npm run build and npm test, and open a pull request titled \"Fix #$1: <short name>\" whose description ends with \"Closes #$1\". Do not merge. Do not weaken any check."
}

pr_for() { # the open pull request for an issue: its fix branch, or one that mentions "#N"
  gh pr list -R "$REPO" --state open --json number,url,headRefName,title,body \
    --jq "map(select(.headRefName == \"fix-issue-$1\" or ((.title + \" \" + .body) | test(\"#$1([^0-9]|\$)\")))) | .[0].url // empty"
}

fix_one() {
  local n="$1" tree="$WORK/issue-$1" url
  echo "issue #$n: starting"
  gh issue edit "$n" -R "$REPO" --add-label claude-working >/dev/null
  git -C "$ROOT" fetch -q origin main
  git -C "$ROOT" worktree remove --force "$tree" 2>/dev/null
  if git -C "$ROOT" worktree add -q -B "fix-issue-$n" "$tree" origin/main &&
    (cd "$tree" && npm ci --no-audit --no-fund >/dev/null 2>&1 &&
      claude -p "$(prompt "$n")" --permission-mode "$MODE" --allowedTools "$TOOLS" >"$WORK/issue-$n.log" 2>&1); then
    url="$(pr_for "$n")"
  fi
  if [ -n "${url:-}" ]; then
    echo "issue #$n: pull request $url"
    gh issue comment "$n" -R "$REPO" --body "A fix is proposed in $url. It is not merged: the tester checks it and a person decides." >/dev/null
  else
    echo "issue #$n: no pull request came out of it (log: $WORK/issue-$n.log)"
    gh issue edit "$n" -R "$REPO" --remove-label claude-working >/dev/null
    gh issue comment "$n" -R "$REPO" --body "The automatic fixer tried this issue and did not produce a pull request. It needs a person." >/dev/null
  fi
  git -C "$ROOT" worktree remove --force "$tree" 2>/dev/null
}

pass() {
  local done=0 n
  for n in $(gh issue list -R "$REPO" --state open --label fleet-qa --limit 100 --json number,labels \
    --jq 'sort_by(.number) | .[] | select(all(.labels[]; .name != "claude-working")) | .number'); do
    [ "$done" -ge "$MAX" ] && break
    [ -n "$(pr_for "$n")" ] && continue
    fix_one "$n"
    done=$((done + 1))
  done
  echo "pass finished: $done issue(s) handed to Claude Code"
}

mkdir -p "$WORK"
gh label create claude-working -R "$REPO" --color 5319E7 --description "The automatic fixer is on it" 2>/dev/null || true
if [ "${1:-}" = "--watch" ]; then
  while true; do pass; sleep 120; done
else
  pass
fi
