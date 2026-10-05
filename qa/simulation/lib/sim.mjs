// The simulation's small engine: simulated people (one browser context each), and
// step(), which runs one thing a person does, photographs the phone, and records
// pass / fail / skip with the words a human needs to repeat it.
import fs from "node:fs";
import path from "node:path";

export const VIEWPORTS = {
  iphone: {
    name: "iphone",
    width: 375,
    height: 812,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  },
  android: {
    name: "android",
    width: 412,
    height: 915,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
  },
};

const ARABIC_ROLE = { driver: "سوّاق", rider: "راكب", guest: "ضيف" };

export class Sim {
  constructor({ browser, base, key, viewport, outDir, city, places, counts }) {
    Object.assign(this, { browser, base, key, viewport, outDir, city, counts });
    this.places = new Map(places.map((p) => [p.id, p]));
    this.steps = [];
    this.people = new Map();
    this.shotNo = 0;
    this.timings = {};
  }

  place(id) {
    const place = this.places.get(id);
    if (!place) throw new Error(`city.json uses ${id}, which is not in data/gazetteer.json or data/places-extra.json`);
    return place;
  }

  /** The driver's route template from city.json: his number decides which one. */
  routeFor(n) {
    return this.city.routes[(n - 1) % this.city.routes.length];
  }

  /** A simulated person: role "driver" | "rider" | "guest", numbered from 1. Made once, reused. */
  async person(role, n = 1) {
    const id = `${role}-${n}`;
    if (this.people.has(id)) return this.people.get(id);
    const context = await this.browser.newContext({
      viewport: { width: this.viewport.width, height: this.viewport.height },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "ar",
      timezoneId: "Asia/Gaza",
      userAgent: this.viewport.userAgent,
      permissions: ["geolocation"],
    });
    context.setDefaultTimeout(15_000);
    context.setDefaultNavigationTimeout(30_000);
    const page = await context.newPage();
    const person = { id, role, n, label: `${ARABIC_ROLE[role]} ${n}`, context, page, signedIn: false, broken: false, seen: newSeen() };
    page.on("pageerror", (e) => person.seen.pageErrors.push(String(e).slice(0, 300)));
    page.on("console", (m) => m.type() === "error" && person.seen.consoleErrors.push(m.text().slice(0, 300)));
    page.on("response", (r) => r.status() >= 500 && person.seen.serverErrors.push(`HTTP ${r.status()} ${new URL(r.url()).pathname}`));
    this.people.set(id, person);
    return person;
  }

  /** Signs a person in through the QA-only route. The key never appears in a page URL. */
  async signIn(person) {
    if (person.role === "guest" || person.signedIn) return;
    const key = this.key ? `&key=${encodeURIComponent(this.key)}` : "";
    const response = await person.context.request.get(`${this.base}/api/qa-login?role=${person.role}&n=${person.n}${key}`, { maxRedirects: 0 });
    if (response.status() !== 303) {
      throw new Error(
        `QA sign-in answered ${response.status()}. The app must run with QA_MODE=1` +
          (response.status() === 404 ? "; if it has a QA_LOGIN_KEY, pass the same value as SIM_KEY." : "."),
      );
    }
    person.signedIn = true;
    person.userId = (await this.api(person, "/api/auth/session")).user?.id;
  }

  /**
   * One step. `id` is "<scenario>.<step>"; the same id for every person who does it.
   * `info`: { title, repro: [...], expected }. `fn(page, person)` does the work and
   * throws when the app is wrong. Returns true when the step passed.
   */
  async step(id, person, info, fn) {
    const record = { id, actor: person.label, title: info.title, repro: info.repro ?? [], expected: info.expected, status: "pass" };
    if (person.broken) {
      this.steps.push({ ...record, status: "skip", error: "an earlier step for this person failed" });
      return false;
    }
    const started = Date.now();
    person.seen = Object.assign(person.seen, newSeen());
    try {
      await fn(person.page, person);
    } catch (error) {
      // The person could not finish: their later steps in this scenario are skipped.
      record.status = "fail";
      record.error = cleanError(error);
      person.broken = true;
    }
    if (record.status === "pass") {
      // The flow worked. Now the same phone checks as the Fleet QA screenshots; one of
      // these fails the step, but the person carries on.
      const layout = await person.page
        .evaluate(() => ({
          over: document.documentElement.scrollWidth - window.innerWidth,
          small: [...document.querySelectorAll("input,select,textarea")].filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).length,
        }))
        .catch(() => ({ over: 0, small: 0 }));
      const problem = person.seen.pageErrors.length
        ? `page error: ${person.seen.pageErrors[0]}`
        : person.seen.serverErrors.length
          ? `server error: ${person.seen.serverErrors[0]}`
          : layout.over > 2
            ? `the page is ${layout.over}px wider than the phone screen`
            : layout.small
              ? `${layout.small} input(s) with text under 16px: iPhone Safari zooms in on focus`
              : null;
      if (problem) {
        record.status = "fail";
        record.error = `${problem}\n(the step itself finished; this was seen while it ran)`;
      }
    }
    if (person.seen.consoleErrors.length) record.consoleErrors = [...new Set(person.seen.consoleErrors)].slice(0, 5);
    record.url = safeUrl(person.page.url());
    record.ms = Date.now() - started;
    record.screenshot = `${String(++this.shotNo).padStart(3, "0")}-${id}-${person.id}.png`;
    await person.page.screenshot({ path: path.join(this.outDir, record.screenshot) }).catch(() => delete record.screenshot);
    this.steps.push(record);
    const mark = record.status === "pass" ? "ok  " : "FAIL";
    console.log(`  ${mark} ${id.padEnd(34)} ${person.id.padEnd(9)} ${record.error ? "— " + record.error.split("\n")[0].slice(0, 110) : ""}`);
    return record.status === "pass";
  }

  /** Records a step that could not run, with the reason. */
  skip(id, title, reason, actor = "—") {
    this.steps.push({ id, actor, title, status: "skip", error: reason, repro: [] });
    console.log(`  skip ${id.padEnd(34)} ${reason}`);
  }

  /** GET a JSON API as this person (their cookies), for checking what the server holds. */
  async api(person, pathname) {
    const response = await person.context.request.get(this.base + pathname);
    if (!response.ok()) throw new Error(`GET ${pathname} answered ${response.status()}`);
    return response.json();
  }

  async close() {
    for (const person of this.people.values()) await person.context.close().catch(() => {});
  }

  writeResults(meta) {
    const results = { ...meta, viewport: { name: this.viewport.name, width: this.viewport.width, height: this.viewport.height }, counts: this.counts, steps: this.steps };
    fs.writeFileSync(path.join(this.outDir, "results.json"), JSON.stringify(results, null, 2));
    fs.writeFileSync(path.join(this.outDir, "index.html"), contactSheet(results));
    return results;
  }
}

const newSeen = () => ({ pageErrors: [], consoleErrors: [], serverErrors: [] });

// Playwright errors carry ANSI colours and a long call log; an issue needs the first lines.
function cleanError(error) {
  return String(error?.message ?? error)
    .replace(/\u001b\[[0-9;]*m/g, "")
    .replace(/key=[^&\s"']+/g, "key=…")
    .split("\n")
    .filter((line) => line.trim() && !/^\s+at /.test(line))
    .slice(0, 8)
    .join("\n");
}

const safeUrl = (url) => url.replace(/key=[^&]+/g, "key=…");

const escapeHtml = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

function contactSheet(results) {
  const cards = results.steps
    .filter((s) => s.screenshot)
    .map(
      (s) => `<figure class="${s.status}"><img loading="lazy" src="${escapeHtml(s.screenshot)}" alt="">
<figcaption><b>${escapeHtml(s.id)}</b> · ${escapeHtml(s.actor)}<br>${escapeHtml(s.title)}${s.error ? `<pre>${escapeHtml(s.error)}</pre>` : ""}</figcaption></figure>`,
    )
    .join("\n");
  const count = (status) => results.steps.filter((s) => s.status === status).length;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mishwar simulation · ${escapeHtml(results.viewport.name)}</title>
<style>body{font:15px system-ui;margin:16px;background:#f2f2f7;color:#1c1c1e}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px}
figure{margin:0;background:#fff;border-radius:12px;padding:8px;border:2px solid transparent}figure.fail{border-color:#c62828}img{width:100%;border-radius:8px}
figcaption{font-size:13px;margin-top:6px}pre{white-space:pre-wrap;color:#c62828;font-size:12px}</style>
<h1>Mishwar simulation</h1>
<p>${escapeHtml(results.base)} · commit ${escapeHtml(String(results.commit).slice(0, 8))} · ${escapeHtml(results.viewport.name)} ${results.viewport.width}×${results.viewport.height} ·
${results.counts.drivers} drivers, ${results.counts.riders} riders · <b>${count("pass")} passed, ${count("fail")} failed, ${count("skip")} skipped</b></p>
<main>${cards}</main></html>`;
}
