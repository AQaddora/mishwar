#!/usr/bin/env node
// The city simulation: N drivers and M riders use Mishwar on phone-size screens, the way
// people would, against a QA copy of the app. One command:
//
//   npm run sim                                  (the staging copy; needs SIM_KEY)
//   npm run sim -- --drivers 6 --riders 10 --viewport both
//   npm run sim -- --only offline --headed
//
// Every step is photographed. The result is qa/simulation/out/<run>/ with results.json,
// index.html (all the screenshots on one page) and the PNGs. README.md has the rest.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/browser.mjs";
import { Sim, VIEWPORTS } from "./lib/sim.mjs";
import { SCENARIOS } from "./scenarios/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(here, file), "utf8"));

function parseArgs(argv) {
  const args = { drivers: 3, riders: 5, viewport: "iphone", only: null, out: null, headed: false, clean: true };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = () => argv[++i] ?? fail(`${flag} needs a value`);
    if (flag === "--drivers") args.drivers = Number(value());
    else if (flag === "--riders") args.riders = Number(value());
    else if (flag === "--viewport") args.viewport = value();
    else if (flag === "--only") args.only = value();
    else if (flag === "--out") args.out = value();
    else if (flag === "--headed") args.headed = true;
    else if (flag === "--no-clean") args.clean = false;
    else fail(`unknown flag ${flag}. Flags: --drivers N --riders M --viewport iphone|android|both --only <scenario> --out <dir> --headed --no-clean`);
  }
  if (!(args.drivers >= 1 && args.drivers <= 99) || !(args.riders >= 1 && args.riders <= 99)) fail("--drivers and --riders take 1 to 99");
  if (!["iphone", "android", "both"].includes(args.viewport)) fail("--viewport takes iphone, android or both");
  if (args.only && !SCENARIOS.some((s) => s.name === args.only)) fail(`no scenario «${args.only}». There are: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  return args;
}
function fail(message) {
  console.error(message);
  process.exit(2);
}

// --only runs that scenario and, first, everything it needs.
function plan(only) {
  if (!only) return SCENARIOS;
  const wanted = new Set();
  const add = (name) => {
    const scenario = SCENARIOS.find((s) => s.name === name);
    if (!scenario || wanted.has(name)) return;
    scenario.needs.forEach(add);
    wanted.add(name);
  };
  add(only);
  return SCENARIOS.filter((s) => wanted.has(s.name));
}

async function cleanup(base, key) {
  const response = await fetch(`${base}/api/qa-cleanup`, { method: "POST", headers: key ? { "x-qa-key": key } : {} });
  if (!response.ok) throw new Error(`POST /api/qa-cleanup answered ${response.status}: is this a QA copy (QA_MODE=1), and is SIM_KEY right?`);
  return response.json();
}

async function runOnce(args, viewportName, stamp) {
  const base = (process.env.SIM_BASE_URL || "https://mishwar-sim.apps.taqat.academy").replace(/\/$/, "");
  const key = process.env.SIM_KEY || "";
  const outDir = path.resolve(args.out ? (args.viewport === "both" ? `${args.out}-${viewportName}` : args.out) : path.join(here, "out", `${stamp}-${viewportName}`));
  fs.mkdirSync(outDir, { recursive: true });

  const health = await fetch(`${base}/api/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) throw new Error(`${base}/api/health did not answer: is the app up?`);
  console.log(`\nMishwar simulation · ${base} · commit ${String(health.commit).slice(0, 8)} · ${viewportName} · ${args.drivers} drivers, ${args.riders} riders`);
  if (args.clean) {
    const removed = await cleanup(base, key);
    if (removed.users) console.log(`  removed ${removed.users} simulated users left by an earlier run`);
  }

  const places = [...readJson("../../data/gazetteer.json").places, ...readJson("../../data/places-extra.json")];
  const browser = await launchBrowser({ headed: args.headed });
  const sim = new Sim({ browser, base, key, viewport: VIEWPORTS[viewportName], outDir, city: readJson("city.json"), places, counts: { drivers: args.drivers, riders: args.riders } });
  const startedAt = new Date().toISOString();
  const rows = [];
  try {
    for (const scenario of plan(args.only)) {
      const before = sim.steps.length;
      const t0 = Date.now();
      console.log(`\n${scenario.name}`);
      try {
        await scenario.run(sim);
      } catch (error) {
        // A scenario that crashes outside a step is the harness's fault, not the app's: say so.
        sim.steps.push({ id: `${scenario.name}.harness`, actor: "—", title: `Scenario «${scenario.name}» crashed outside a step`, status: "fail", error: String(error?.stack ?? error).slice(0, 800), repro: [] });
        console.log(`  FAIL ${scenario.name}.harness — ${String(error).slice(0, 140)}`);
      }
      const mine = sim.steps.slice(before);
      const count = (status) => mine.filter((s) => s.status === status).length;
      rows.push({ scenario: scenario.name, passed: count("pass"), failed: count("fail"), skipped: count("skip"), seconds: Math.round((Date.now() - t0) / 1000) });
    }
  } finally {
    await sim.close();
    await browser.close();
  }
  const results = sim.writeResults({ base, commit: health.commit ?? "unknown", startedAt, finishedAt: new Date().toISOString() });
  console.log("");
  console.table(rows);
  const failed = results.steps.filter((s) => s.status === "fail");
  console.log(`${viewportName}: ${results.steps.filter((s) => s.status === "pass").length} passed, ${failed.length} failed, ${results.steps.filter((s) => s.status === "skip").length} skipped`);
  console.log(`screenshots and results: ${path.relative(process.cwd(), outDir)}/index.html`);
  fs.writeFileSync(path.join(here, "out", "latest"), outDir + "\n");
  return failed.length;
}

const args = parseArgs(process.argv.slice(2));
const stamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15);
fs.mkdirSync(path.join(here, "out"), { recursive: true });
let failures = 0;
try {
  for (const viewport of args.viewport === "both" ? ["iphone", "android"] : [args.viewport]) failures += await runOnce(args, viewport, stamp);
} catch (error) {
  console.error(`\nThe simulation could not run: ${error.message}`);
  process.exit(2);
}
console.log(failures ? `\n${failures} step(s) failed. File them as issues with: npm run sim:issues` : "\nEvery step passed.");
console.log("The simulated people stay in the database so you can look at them. Remove them with: npm run sim:cleanup");
process.exit(failures ? 1 : 0);
