// Offline end-to-end: every screen opens with no network, after ONE online visit.
//
//   BASE_URL=http://127.0.0.1:3000 node qa/e2e/offline.mjs [--out dir]
//
// The app must run as a production build (the service worker is registered only there),
// with QA_MODE=1 and the QA seed (npm run qa:seed). For each role (guest, rider, driver):
//   1. a fresh phone opens ONE screen online and waits until the worker has kept every
//      screen of the role (the other screens are never opened online);
//   2. the network goes off; every screen is opened by address and every tab by a tap:
//      each shows its own title, never the "not on your phone" page, with the offline
//      banner; the rider's «اتصل بالسوّاق» is a tel: link drawn from the phone's data;
//      a driver's change is kept in the outbox («انحفظ على جوالك…»);
//   3. cold start: the browser is closed and opened again with no network at all, and the
//      first screen still opens.
// Screenshots (390x844) go to --out (default qa/e2e/out). Exits 1 on any failure.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";
import { findChromium } from "../simulation/lib/browser.mjs";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "qa/e2e/out";
const KEY = process.env.QA_LOGIN_KEY ? `&key=${encodeURIComponent(process.env.QA_LOGIN_KEY)}` : "";
const PAGES_CACHE = "pages-v2";
const NOT_KEPT = "هاي الصفحة لسّا مش محفوظة";
const U = (suffix) => `00000000-0000-4000-8000-${suffix.padStart(12, "0")}`;

// [path, title shown on the screen]. The seed's ids: request d1, its offer e1, route 1.
const ROLES = {
  guest: {
    start: "/",
    screens: [["/", "مِشوار"], ["/search", "دوّر على مشوار"], ["/login", "مِشوار"]],
    tabs: [["/login", "مِشوار"]], // the login screen has no tab bar to tap back from
  },
  rider: {
    start: "/",
    screens: [
      ["/", "مِشوار"],
      ["/search", "دوّر على مشوار"],
      ["/search?from=node/504259697&to=node/505021826", "دوّر على مشوار"],
      ["/trips", "رحلاتي"],
      ["/requests", "طلب خاص"],
      ["/requests/new", "طلب جديد"],
      [`/requests/${U("d1")}`, "طلبك"],
      [`/chat/${U("e1")}`, "السوّاق"],
      ["/history", "رحلاتي السابقة"],
      ["/account", "حسابي"],
    ],
    tabs: [["/trips", "رحلاتي"], ["/requests", "طلب خاص"], ["/account", "حسابي"], ["/", "مِشوار"]],
  },
  driver: {
    start: "/driver",
    screens: [
      ["/driver", "اليوم"],
      ["/driver/drive", "أنا سايق"],
      ["/driver/vehicle", "سيارتي"],
      ["/driver/routes", "خطوطي"],
      [`/driver/routes/${U("1")}`, ""],
      ["/driver/routes/new", "خط جديد"],
      ["/driver/schedule", "أيام وساعات الشغل"],
      ["/driver/requests", "الطلبات"],
      [`/chat/${U("e1")}`, "الراكب"],
      ["/history", "رحلات سابقة"],
      ["/account", "حسابي"],
    ],
    tabs: [["/driver/vehicle", "سيارتي"], ["/driver/routes", "خطوطي"], ["/driver/requests", "الطلبات"], ["/driver", "اليوم"]],
  },
};

const results = [];
const record = (role, check, ok, detail = "") => {
  results.push({ role, check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${role.padEnd(6)} ${check}${detail ? `  (${detail})` : ""}`);
};

async function open(userDataDir) {
  const options = {
    headless: true,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: "ar",
    serviceWorkers: "allow",
  };
  // The headless shell playwright-core ships with first (the full build dies under cron on
  // the QA runner), then any Chromium the simulation's finder knows.
  try {
    return await chromium.launchPersistentContext(userDataDir, options);
  } catch {
    return chromium.launchPersistentContext(userDataDir, { ...options, executablePath: findChromium() });
  }
}

async function title(page) {
  const h1 = page.locator("h1").first();
  await h1.waitFor({ timeout: 15_000 });
  return (await h1.innerText()).trim();
}

async function checkScreen(page, role, [route, expected], how) {
  const name = `${role}-${how}-${route.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "home"}`;
  try {
    const shown = await title(page);
    const body = await page.locator("body").innerText();
    if (body.includes(NOT_KEPT)) throw new Error("the 'not on your phone' page");
    if (expected && !shown.includes(expected)) throw new Error(`title «${shown}», expected «${expected}»`);
    await page.locator("[data-offline-banner]").waitFor({ timeout: 10_000 });
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    record(role, `offline ${how} ${route}`, true, `«${shown}»`);
  } catch (error) {
    await page.screenshot({ path: path.join(OUT, `${name}-FAIL.png`) }).catch(() => {});
    record(role, `offline ${how} ${route}`, false, String(error.message ?? error).slice(0, 160));
  }
}

async function waitForKept(page, urls) {
  const deadline = Date.now() + 90_000;
  let missing = urls;
  while (Date.now() < deadline) {
    missing = await page.evaluate(
      async ({ name, urls }) => {
        const cache = await caches.open(name);
        const out = [];
        for (const url of urls) if (!(await cache.match(url, { ignoreVary: true }))) out.push(url);
        if (!(await cache.match("/__mishwar-precache"))) out.push("(precache stamp)");
        return out;
      },
      { name: PAGES_CACHE, urls },
    );
    if (missing.length === 0) return [];
    await page.waitForTimeout(1000);
  }
  return missing;
}

async function runRole(role) {
  const spec = ROLES[role];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `mishwar-offline-${role}-`));
  let context = await open(dir);
  try {
    let page = context.pages()[0] ?? (await context.newPage());
    if (role !== "guest") {
      const r = await page.goto(`${BASE}/api/qa-login?role=${role}${KEY}`);
      if (!r || r.status() >= 400) throw new Error(`QA sign-in as ${role} failed (${r?.status()})`);
    }
    // 1. One online visit.
    await page.goto(BASE + spec.start, { waitUntil: "load" });
    const vehicles = page.locator("section button", { hasText: /كراسي|كرسي/ });
    if (role === "rider") await vehicles.first().waitFor({ timeout: 15_000 }).catch(() => {});
    const onlineVehicles = role === "rider" ? await vehicles.count() : 0;
    await page.evaluate(() => navigator.serviceWorker.ready);
    // Screens with a query are served from their path's copy: wait for the path.
    const kept = [...new Set(spec.screens.map(([route]) => route.split("?")[0]))];
    const missing = await waitForKept(page, kept);
    record(role, "one online visit keeps every screen", missing.length === 0, missing.length ? `missing: ${missing.join(" ")}` : `${kept.length} screens`);
    const size = await page.evaluate(async () => {
      let bytes = 0;
      for (const name of await caches.keys()) {
        if (name.startsWith("tiles")) continue;
        const cache = await caches.open(name);
        for (const key of await cache.keys()) bytes += (await (await cache.match(key)).arrayBuffer()).byteLength;
      }
      return bytes;
    });
    console.log(`       ${role} kept on the phone (pages + scripts + photos, no tiles): ${(size / 1024).toFixed(0)} KB uncompressed`);

    // 2. No network.
    await context.setOffline(true);
    const probe = await page.evaluate(() => fetch("/api/health", { cache: "no-store" }).then(() => "answered", () => "no network"));
    record(role, "the network is really off", probe === "no network", probe);
    // A screen this phone never had must get the "not on your phone" page, never the server.
    await page.goto(`${BASE}/not-a-screen-${Date.now()}`).catch(() => {});
    const unknown = await page.locator("body").innerText().catch(() => "");
    record(role, "an unknown screen gets the offline page", unknown.includes(NOT_KEPT));

    for (const screen of spec.screens) {
      await page.goto(BASE + screen[0]).catch(() => {});
      await checkScreen(page, role, screen, "open");
    }
    // In-app taps (Next.js links): from the start screen, through the tab bar.
    await page.goto(BASE + spec.start).catch(() => {});
    for (const [route, expected] of spec.tabs) {
      await page.locator(`nav a[href="${route}"]`).click();
      await page.waitForURL((url) => url.pathname === route, { timeout: 15_000 }).catch(() => {});
      await checkScreen(page, role, [route, expected], "tap");
    }

    if (role === "rider") {
      await page.goto(`${BASE}/trips`).catch(() => {});
      const call = page.locator('a[href^="tel:"]', { hasText: "اتصل بالسوّاق" }).first();
      const href = await call.getAttribute("href", { timeout: 15_000 }).catch(() => null);
      record(role, "offline: «اتصل بالسوّاق» is a tel: link from the phone's data", Boolean(href && /^tel:\+?\d{6,}$/.test(href)), href ? "tel:…" : "no call button");
      await call.scrollIntoViewIfNeeded().catch(() => {});
      await page.screenshot({ path: path.join(OUT, "rider-offline-call-button.png") });
      await page.goto(`${BASE}/requests/${U("d1")}`).catch(() => {});
      const offerCall = await page.locator('a[href^="tel:"]').count();
      record(role, "offline: the offers keep their call buttons", offerCall > 0, `${offerCall} tel: links`);
      await page.goto(BASE + "/").catch(() => {});
      if (onlineVehicles > 0) await vehicles.first().waitFor({ timeout: 15_000 }).catch(() => {});
      const cards = await vehicles.count();
      record(role, "offline: home lists the same vehicles as online", cards === onlineVehicles, `online ${onlineVehicles}, offline ${cards}`);
    }
    if (role === "driver") {
      await page.goto(`${BASE}/driver/vehicle`).catch(() => {});
      const seats = page.locator("#seats");
      await seats.waitFor({ timeout: 15_000 }).catch(() => {});
      const before = await seats.inputValue().catch(() => "");
      record(role, "offline: the vehicle screen shows the saved seats", /^\d+$/.test(before), before);
      await seats.fill(String(Number(before || 4) + 1)).catch(() => {});
      await page.getByRole("button", { name: "احفظ", exact: true }).first().click().catch(() => {});
      const saved = await page.getByText("انحفظ على جوالك").first().waitFor({ timeout: 10_000 }).then(() => true, () => false);
      await page.screenshot({ path: path.join(OUT, "driver-offline-outbox.png") });
      record(role, "offline: a change goes to the outbox («انحفظ على جوالك…»)", saved);
    }

    // 3. Cold start: close everything, open again with no network at all.
    await context.close();
    context = await open(dir);
    await context.setOffline(true);
    page = context.pages()[0] ?? (await context.newPage());
    await page.goto(BASE + spec.start).catch(() => {});
    await checkScreen(page, role, spec.screens.find(([route]) => route === spec.start), "cold-start");
    const second = spec.tabs[0];
    await page.locator(`nav a[href="${second[0]}"]`).click().catch(() => {});
    await page.waitForURL((url) => url.pathname === second[0], { timeout: 15_000 }).catch(() => {});
    await checkScreen(page, role, second, "cold-start-tap");
  } catch (error) {
    record(role, "run", false, String(error.message ?? error).slice(0, 200));
  } finally {
    await context.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

fs.mkdirSync(OUT, { recursive: true });
for (const role of ["guest", "rider", "driver"]) await runRole(role);
fs.writeFileSync(path.join(OUT, "offline-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
