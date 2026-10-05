// Small helpers for things a person does on many screens.

/** Opens a place sheet with `open()`, types the name, taps the exact match. */
export async function pickPlace(page, open, name, searchBox = "#place-picker-search") {
  await open();
  const sheet = page.getByRole("dialog");
  await sheet.locator(searchBox).fill(name);
  await sheet.locator("li button").filter({ has: page.getByText(name, { exact: true }) }).first().click();
  await sheet.waitFor({ state: "detached" });
}

/**
 * A test photo, drawn in the browser so nothing is downloaded and nothing looks real:
 * a flat colour with «صورة محاكاة» and the label on it. Returns what setInputFiles takes.
 */
export async function makePhoto(page, label, colour = "#0A7D5A") {
  const base64 = await page.evaluate(
    ([text, fill]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const c = canvas.getContext("2d");
      c.fillStyle = fill;
      c.fillRect(0, 0, 1200, 900);
      c.fillStyle = "#FFFFFF";
      c.textAlign = "center";
      c.direction = "rtl";
      c.font = "bold 110px sans-serif";
      c.fillText("صورة محاكاة", 600, 420);
      c.font = "60px sans-serif";
      c.fillText(text, 600, 540);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [label, colour],
  );
  return { name: "sim-photo.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/** Waits until the service worker controls the page, so a reload can work offline. */
export async function waitForServiceWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 });
}

// ---- The planner («دوّر على مشوار») and booking from it

/** The first name the app shows for simulated person n. */
export const simName = (n) => `محاكاة-${n}`;

// The plan card of simulated driver n. Matched on the one line that ends with his name
// («عجلة · محاكاة-1»), so driver 1 is never confused with driver 10, or with "11 seats".
const driverCard = (page, n) => planCards(page).filter({ has: page.locator("span", { hasText: new RegExp(`· ${simName(n)}$`) }) });

// The routes being driven right now: the driver's week says he works today, at this
// hour (Asia/Gaza), and his vehicle is not in maintenance. Same rule as the app's.
export function routesRunningNow(sync) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Gaza", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).map((p) => [p.type, p.value]));
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  const time = `${parts.hour}:${parts.minute}`;
  return sync.changes.routes.filter((route) => {
    const day = sync.changes.schedule.find((d) => d.driverId === route.driverId && d.weekday === weekday);
    const vehicle = sync.changes.vehicles.find((v) => v.driverId === route.driverId);
    if (!day?.working || !vehicle || vehicle.maintenanceFrom) return false;
    if (time < day.startTime || time >= day.endTime) return false;
    return day.routeId ? day.routeId === route.id : route.isDefault;
  });
}

/** What the planner should answer for from → to right now: "direct", "change" or "none". */
export function expectedPlan(sync, from, to) {
  const running = routesRunningNow(sync);
  if (running.some((r) => r.stops.includes(from) && r.stops.includes(to))) return "direct";
  const starts = running.filter((r) => r.stops.includes(from) && !r.stops.includes(to));
  const ends = running.filter((r) => r.stops.includes(to) && !r.stops.includes(from));
  const change = starts.some((a) => ends.some((b) => a.driverId !== b.driverId && a.stops.some((s) => s !== from && b.stops.includes(s))));
  return change ? "change" : "none";
}

/** The option cards under the planner's heading. */
export const planCards = (page) => page.locator('section[aria-live="polite"] > button');

/** Opens the planner and asks for from → to, now. Waits for the answer to be drawn. */
export async function planTrip(page, sim, from, to) {
  await page.goto(`${sim.base}/search`);
  await pickPlace(page, () => page.getByRole("button", { name: /من وين؟/ }).click(), from.nameAr);
  await pickPlace(page, () => page.getByRole("button", { name: /لوين؟/ }).click(), to.nameAr);
  await page.getByRole("heading", { name: new RegExp(`من ${from.nameAr}`) }).waitFor();
  await planCards(page).first().or(page.getByText(/ما لقينا طريق/)).first().waitFor();
}

/**
 * From the planner's answer: opens the option driven by simulated driver n, taps
 * «احجز مع …» and sets the number of seats. Stops just before «أكّد الحجز».
 */
export async function openBookBox(page, sim, from, to, driverN, seats = 1) {
  await planTrip(page, sim, from, to);
  const card = driverCard(page, driverN).first();
  if ((await card.count()) === 0) throw new Error(`the planner shows no option with driver محاكاة-${driverN} from ${from.nameAr} to ${to.nameAr}`);
  await card.click();
  const sheet = page.getByRole("dialog");
  await sheet.getByRole("button", { name: `احجز مع ${simName(driverN)}`, exact: true }).click();
  for (let i = 1; i < seats; i++) await sheet.getByRole("button", { name: "كرسي زيادة" }).click();
  await sheet.getByRole("button", { name: "أكّد الحجز" }).waitFor();
  return sheet;
}

/** The rider's own bookings as the server holds them. */
export async function myBookings(sim, person) {
  return (await sim.api(person, "/api/sync")).changes.bookings ?? [];
}

/** Free seats of simulated driver's vehicle, from the public sync. */
export async function freeSeats(sim, driver) {
  const sync = await sim.api(driver, "/api/sync");
  return sync.changes.vehicles.find((v) => v.driverId === driver.userId)?.free;
}

/** One rider's row on the driver's «ركّاب اليوم» list. */
export const riderRow = (page, riderN) => page.locator("main ul > li").filter({ has: page.locator("p", { hasText: new RegExp(`^${simName(riderN)} ·`) }) });
