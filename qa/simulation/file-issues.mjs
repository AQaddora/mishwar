#!/usr/bin/env node
// Turns a simulation run into GitHub issues, with no GitHub Actions.
//
//   npm run sim:issues                 (the latest run)
//   npm run sim:issues -- <run-dir> [--dry-run]
//
// Reads <run-dir>/results.json (written by run.mjs). For every step that failed:
//   - a stable fingerprint (the step id + the error with numbers and ids removed)
//     decides whether this failure is already known;
//   - known and still open: one comment "seen again at <commit>" (once per commit);
//   - new: the screenshot goes to the qa-evidence branch, and an issue is opened with
//     the label fleet-qa, the steps to repeat it, and the picture.
// For every step that passed for everyone: an open issue for the same step is commented
// "verified fixed" and closed. That is the runner checking the fix.
//
// Needs only the gh CLI, signed in. The repo comes from QA_REPO or `gh repo view`.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "fleet-qa";

// The same failure must get the same fingerprint tomorrow: drop everything that changes
// from run to run (ids, numbers, extra spaces) before hashing. Only the first line of
// the error counts; the rest is call logs.
export function fingerprint(step) {
  const error = String(step.error || "")
    .split("\n")[0]
    .replace(/[0-9a-f]{8,}/gi, "#")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
  return createHash("sha1").update(`${step.id}|${error}`).digest("hex").slice(0, 12);
}

export const marker = (fp, stepId) => `<!-- fleet-qa-fp:${fp} step:${stepId} -->`;

// Several simulated people do the same step. It failed if it failed for anyone (the
// first failure is the one reported); it passed only if it passed for everyone who ran it.
export function summarise(steps) {
  const failed = new Map();
  const passed = new Set();
  for (const step of steps) {
    if (step.status === "fail" && !failed.has(step.id)) failed.set(step.id, step);
    if (step.status === "pass") passed.add(step.id);
  }
  for (const id of failed.keys()) passed.delete(id);
  return { failed: [...failed.values()], passed };
}

export function issueBody(step, fp, run, shotUrl) {
  const commit = String(run.commit || "unknown").slice(0, 8);
  const phone = `${run.viewport?.name || "phone"} (${run.viewport?.width}x${run.viewport?.height})`;
  return [
    marker(fp, step.id),
    `**Found by the fleet QA simulation** at commit \`${commit}\`, ${phone}, against ${run.base}.`,
    "",
    "## What failed",
    `Step \`${step.id}\`, done by ${step.actor}: ${step.title}`,
    "",
    "```",
    String(step.error || "no error text").slice(0, 1500),
    "```",
    ...(step.url ? ["", `Screen: \`${step.url}\``] : []),
    "",
    "## Steps to repeat",
    ...(step.repro?.length ? step.repro.map((s, i) => `${i + 1}. ${s}`) : ["1. Run the simulation (see below)."]),
    "",
    "## Expected",
    step.expected || "The step finishes without an error.",
    "",
    shotUrl ? `## Screenshot\n<img width="320" src="${shotUrl}">` : "_No screenshot was taken for this step._",
    "",
    "## Check the fix",
    "```",
    `npm run sim -- --only ${step.id.split(".")[0]}`,
    "```",
    "The simulation closes this issue by itself when the step passes again (`npm run sim:issues`).",
  ].join("\n");
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const here = path.dirname(fileURLToPath(import.meta.url));
  const latest = path.join(here, "out", "latest");
  const runDir = args.find((a) => !a.startsWith("--")) || (fs.existsSync(latest) ? fs.readFileSync(latest, "utf8").trim() : "");
  if (!runDir || !fs.existsSync(path.join(runDir, "results.json"))) {
    console.error("usage: file-issues.mjs [run-dir with results.json] [--dry-run]   (no run found: run `npm run sim` first)");
    process.exit(2);
  }
  const gh = (ghArgs, input) => execFileSync("gh", ghArgs, { encoding: "utf8", input, maxBuffer: 32 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
  const repo = process.env.QA_REPO || gh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]).trim();
  const run = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
  const commit = String(run.commit || "unknown").slice(0, 8);
  const phone = run.viewport?.name || "phone";
  const { failed, passed } = summarise(run.steps || []);

  const known = JSON.parse(gh(["issue", "list", "-R", repo, "--label", LABEL, "--state", "open", "--limit", "200", "--json", "number,title,body"])).map((issue) => {
    const m = /<!-- fleet-qa-fp:([0-9a-f]+) step:(\S+) -->/.exec(issue.body || "");
    return { number: issue.number, fp: m?.[1], step: m?.[2] };
  });

  if (!dry) {
    try {
      gh(["label", "create", LABEL, "-R", repo, "--color", "B60205", "--description", "Found by the fleet QA simulation", "--force"]);
    } catch {
      /* no right to manage labels: creating the issue will say so */
    }
  }

  // Screenshots live on the qa-evidence branch, like the PR screenshots. The contents
  // API needs no clone, so this also works on a laptop.
  function uploadShot(file, dest) {
    const body = JSON.stringify({ message: `qa: simulation evidence ${dest}`, branch: "qa-evidence", content: fs.readFileSync(file).toString("base64") });
    try {
      gh(["api", "-X", "PUT", `repos/${repo}/contents/${dest}`, "--input", "-"], body);
    } catch (error) {
      if (!/"sha" wasn't supplied|already exists/.test(String(error.stderr || error))) throw error; // the same file from an earlier run is fine
    }
    return `https://github.com/${repo}/blob/qa-evidence/${dest}?raw=true`;
  }

  const summary = { opened: [], seenAgain: [], closed: [] };
  for (const step of failed) {
    const fp = fingerprint(step);
    const existing = known.find((issue) => issue.fp === fp);
    const title = `[fleet-qa] ${step.title}: ${String(step.error || "failed").split("\n")[0].slice(0, 90)}`;
    if (existing) {
      const note = `Seen again at commit \`${commit}\` (${phone}).`;
      if (dry) console.log(`would comment on #${existing.number}: ${note}`);
      else if (!gh(["issue", "view", String(existing.number), "-R", repo, "--json", "comments", "--jq", ".comments[].body"]).includes(note)) {
        gh(["issue", "comment", String(existing.number), "-R", repo, "--body", note]);
      }
      summary.seenAgain.push(existing.number);
      continue;
    }
    if (dry) {
      console.log(`would open: ${title}\n${"-".repeat(72)}\n${issueBody(step, fp, run, step.screenshot ? `<qa-evidence>/sim/${commit}-${fp}/${step.screenshot}` : "")}\n${"=".repeat(72)}`);
      continue;
    }
    const shot = step.screenshot && path.join(runDir, step.screenshot);
    const shotUrl = shot && fs.existsSync(shot) ? uploadShot(shot, `sim/${commit}-${fp}/${path.basename(shot)}`) : "";
    const url = gh(["issue", "create", "-R", repo, "--title", title, "--label", LABEL, "--body-file", "-"], issueBody(step, fp, run, shotUrl)).trim();
    known.push({ number: Number(url.split("/").pop()), fp, step: step.id });
    summary.opened.push(url);
  }

  // A step that now passes for everyone closes the issues that were opened for it.
  for (const issue of known) {
    if (!issue.step || !passed.has(issue.step)) continue;
    // An error that comes and goes can skip this step today and hit another one: while the
    // same error line is still failing anywhere in this run, the issue stays open.
    const stillSeen = failed.some((f) => (issue.body || "").includes(String(f.error || "").split("\n")[0].trim() || "\u0000"));
    if (stillSeen) continue;
    if (dry) console.log(`would close #${issue.number}: step ${issue.step} passes`);
    else gh(["issue", "close", String(issue.number), "-R", repo, "--comment", `Verified fixed: step \`${issue.step}\` passes at commit \`${commit}\` (${phone}).`]);
    summary.closed.push(issue.number);
  }

  if (!dry) fs.writeFileSync(path.join(runDir, "issues.json"), JSON.stringify(summary, null, 2));
  console.log(`fleet-qa issues${dry ? " (dry run)" : ""}: ${dry ? failed.length - summary.seenAgain.length : summary.opened.length} to open, ${summary.seenAgain.length} seen again, ${summary.closed.length} closed`);
}

// Only when run directly: the unit test imports fingerprint() without calling GitHub.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
