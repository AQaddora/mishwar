// The home map finds the rider: GPS mocked at a real Gaza place (from the gazetteer).
//
//   BASE_URL=http://127.0.0.1:3000 node qa/e2e/gps.mjs [--out dir]
//
// Needs the QA seed (vehicles on the road). Checks, at 390x844:
//   1. GPS allowed: the map zooms in on the rider (street zoom, not the whole Strip),
//      draws "you are here", and at least one vehicle pin is on screen with it;
//   2. after the rider drags the map away, «وين أنا؟» brings it back;
//   3. GPS refused: the map opens on the last place this phone was; with no last place,
//      on the Strip; the button says how to allow it, and never asks again by itself.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import { findChromium } from "../simulation/lib/browser.mjs";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "qa/e2e/out";
const gazetteer = JSON.parse(fs.readFileSync(new URL("../../data/gazetteer.json", import.meta.url), "utf8"));
const places = Array.isArray(gazetteer) ? gazetteer : gazetteer.places;
const GAZA = places.find((p) => p.id === "node/504266619"); // غزة

const results = [];
const record = (check, ok, detail = "") => {
  results.push({ check, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  gps ${check}${detail ? `  (${detail})` : ""}`);
};

async function launch() {
  const options = { headless: true };
  try {
    return await chromium.launch(options);
  } catch {
    return chromium.launch({ ...options, executablePath: findChromium() });
  }
}

const phone = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "ar", timezoneId: "Asia/Gaza" };

// The zoom Leaflet is showing, from the tiles it asked for (…/{z}/{x}/{y}.png).
const zoomShown = (page) =>
  page.evaluate(() => {
    const zs = [...document.querySelectorAll(".leaflet-tile-container img")].map((img) => Number(new URL(img.src).pathname.split("/")[1])).filter(Number.isFinite);
    return zs.length ? Math.max(...zs) : null;
  });

// Vehicle pins whose centre is inside the map box.
const pinsOnScreen = (page) =>
  page.evaluate(() => {
    const box = document.querySelector(".leaflet-container").getBoundingClientRect();
    return [...document.querySelectorAll(".leaflet-marker-icon")].filter((el) => {
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    }).length;
  });

const settle = async (page) => {
  await page.waitForTimeout(1200); // Leaflet's zoom animation and the tiles
};

const browser = await launch();
fs.mkdirSync(OUT, { recursive: true });
try {
  // 1. GPS allowed.
  {
    const context = await browser.newContext({ ...phone, permissions: ["geolocation"], geolocation: { latitude: GAZA.lat, longitude: GAZA.lon, accuracy: 30 } });
    const page = await context.newPage();
    await page.goto(BASE + "/");
    const located = await page.locator("path.map-me").waitFor({ timeout: 20_000 }).then(() => true, () => false);
    record("allowed: «you are here» is drawn", located);
    await page.locator("section button", { hasText: /كراسي|كرسي/ }).first().waitFor({ timeout: 15_000 }).catch(() => {});
    await settle(page);
    const zoom = await zoomShown(page);
    record("allowed: the map zooms in on the rider", zoom !== null && zoom >= 13, `zoom ${zoom}`);
    const pins = await pinsOnScreen(page);
    record("allowed: vehicles around the rider are on screen", pins > 0, `${pins} pins`);
    await page.screenshot({ path: path.join(OUT, "gps-home-located.png") });

    // 2. Drag away, then the button.
    const box = await page.locator(".leaflet-container").boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 10, box.y + 10, { steps: 8 });
    await page.mouse.up();
    await settle(page);
    const away = await page.evaluate(() => {
      const dot = document.querySelector("path.map-me").getBoundingClientRect();
      const map = document.querySelector(".leaflet-container").getBoundingClientRect();
      return Math.hypot(dot.left + dot.width / 2 - (map.left + map.width / 2), dot.top + dot.height / 2 - (map.top + map.height / 2));
    });
    await page.getByRole("button", { name: "وين أنا؟" }).click();
    await settle(page);
    const back = await page.evaluate(() => {
      const dot = document.querySelector("path.map-me").getBoundingClientRect();
      const map = document.querySelector(".leaflet-container").getBoundingClientRect();
      const inside = dot.left >= map.left && dot.right <= map.right && dot.top >= map.top && dot.bottom <= map.bottom;
      return inside;
    });
    record("the button brings the map back to the rider", back, `dragged ${Math.round(away)}px away`);
    await context.close();
  }

  // 3a. Refused, but this phone was somewhere before: open there, no dot.
  {
    const context = await browser.newContext({ ...phone });
    await context.addInitScript(([lat, lon]) => localStorage.setItem("mishwar:last-position", JSON.stringify({ lat, lon })), [GAZA.lat, GAZA.lon]);
    const page = await context.newPage();
    await page.goto(BASE + "/");
    await page.locator(".leaflet-tile-container img").first().waitFor({ timeout: 20_000 }).catch(() => {});
    await settle(page);
    const zoom = await zoomShown(page);
    record("refused: opens on the last place this phone was", zoom !== null && zoom >= 13, `zoom ${zoom}`);
    record("refused: no «you are here» without a fresh position", (await page.locator("path.map-me").count()) === 0);
    await context.close();
  }

  // 3b. Refused, never located: the whole Strip, and the button explains.
  {
    const context = await browser.newContext({ ...phone });
    const page = await context.newPage();
    await page.goto(BASE + "/");
    await page.locator(".leaflet-tile-container img").first().waitFor({ timeout: 20_000 }).catch(() => {});
    await settle(page);
    const zoom = await zoomShown(page);
    record("refused, first time: the map shows the Strip", zoom !== null && zoom <= 12, `zoom ${zoom}`);
    await page.getByRole("button", { name: "وين أنا؟" }).click();
    const said = await page.getByText("مِشوار مش مسموحله يعرف مكانك").waitFor({ timeout: 20_000 }).then(() => true, () => false);
    record("refused: the button says how to allow it", said);
    await page.screenshot({ path: path.join(OUT, "gps-home-refused.png") });
    await context.close();
  }
} catch (error) {
  record("run", false, String(error.message ?? error).slice(0, 200));
} finally {
  await browser.close();
}
fs.writeFileSync(path.join(OUT, "gps-results.json"), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
