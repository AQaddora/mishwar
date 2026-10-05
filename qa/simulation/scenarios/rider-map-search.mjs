// A guest and the riders look for a ride: the home map with the running vehicles, a
// vehicle's sheet, then a search for each journey in city.json.
import { pickPlace } from "../lib/ui.mjs";

// The routes being driven right now: the driver's week says he works today, at this
// hour (Asia/Gaza), and his vehicle is not in maintenance. Same rule as the app's.
function routesRunningNow(sync) {
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

const riderMapSearch = {
  name: "rider-map-search",
  needs: ["driver-setup", "driving"],
  async run(sim) {
    const guest = await sim.person("guest", 1);
    const onTheRoad = [...sim.people.values()].filter((p) => p.driving).length;

    await sim.step("rider-map-search.guest-home", guest, { title: "A guest sees the running vehicles on the map, with no login", repro: ["Open the app signed out", "Wait for the map and the «شغّالين هلأ» list"], expected: `At least ${onTheRoad} vehicles in the list, each with «آخر مكان …», and their pins on the map.` }, async (page) => {
      await page.goto(sim.base);
      await page.getByRole("heading", { name: "شغّالين هلأ" }).waitFor();
      const fresh = page.locator("button", { hasText: /آخر مكان (هلأ|قبل)/ });
      await page.waitForFunction((min) => [...document.querySelectorAll("button")].filter((b) => /آخر مكان (هلأ|قبل)/.test(b.textContent) && !b.textContent.includes("ما في مكان جديد")).length >= min, onTheRoad, { timeout: 45_000 }).catch(() => {});
      const cards = await fresh.count();
      if (cards < onTheRoad) throw new Error(`${onTheRoad} drivers are on a trip but the home lists ${cards} vehicles with a position`);
      const pins = await page.locator(".leaflet-marker-icon").count();
      if (pins < onTheRoad) throw new Error(`${onTheRoad} drivers are on a trip but the map shows ${pins} pins`);
      if ((await page.getByText("OpenStreetMap").count()) === 0) throw new Error("the map does not credit OpenStreetMap");
    });
    guest.broken = false;

    for (let n = 1; n <= sim.counts.riders; n++) {
      const rider = await sim.person("rider", n);
      const journey = sim.city.journeys[(n - 1) % sim.city.journeys.length];
      const from = sim.place(journey.from);
      const to = sim.place(journey.to);
      const who = `Sign in as rider ${n} (on a QA copy: /api/qa-login?role=rider&n=${n})`;

      await sim.step("rider-map-search.vehicle-sheet", rider, { title: "Rider opens a vehicle from the home list", repro: [who, "Open the home screen", "Tap the first vehicle under «شغّالين هلأ»"], expected: "A sheet slides up with free seats, the position age, the photos and the route's stops in order. No phone number." }, async (page) => {
        await sim.signIn(rider);
        await page.goto(sim.base);
        const card = page.locator("section button", { hasText: /كراسي|كرسي/ }).nth((n - 1) % Math.max(onTheRoad, 1));
        await card.click();
        const sheet = page.getByRole("dialog");
        await sheet.locator("ol > li").first().waitFor();
        if ((await sheet.locator("ol > li").count()) < 2) throw new Error("the vehicle sheet lists fewer than two stops");
        if (/05\d{8}/.test(await sheet.innerText())) throw new Error("the vehicle sheet shows a phone number before any booking");
      });
      await rider.page.getByRole("dialog").getByRole("button", { name: "سكّر" }).last().click().catch(() => {});
      rider.broken = false;

      await sim.step("rider-map-search.search", rider, { title: "Rider searches from one place to another", repro: [who, "Tap «لوين رايح؟ دوّر على مشوار»", `«من وين؟»: ${from.nameAr}`, `«لوين؟»: ${to.nameAr}`], expected: "The vehicles whose route has both stops (either direction), or a plain line saying nobody is on this road now." }, async (page) => {
        // What the answer should be, from the same public data the phone holds.
        const sync = await sim.api(rider, "/api/sync");
        const direct = routesRunningNow(sync).filter((r) => r.stops.includes(from.id) && r.stops.includes(to.id)).length;
        await page.goto(`${sim.base}/search`);
        await pickPlace(page, () => page.getByRole("button", { name: /من وين؟/ }).click(), from.nameAr);
        await pickPlace(page, () => page.getByRole("button", { name: /لوين؟/ }).click(), to.nameAr);
        await page.getByRole("heading", { name: new RegExp(`من ${from.nameAr}`) }).waitFor();
        const cards = await page.locator("section button", { hasText: /كراسي|كرسي/ }).count();
        const none = await page.getByText(/ما في حدا/).count();
        if (direct > 0 && cards === 0) throw new Error(`${direct} route(s) have both stops, but the search shows no vehicle`);
        if (direct === 0 && cards > 0) throw new Error(`no route has both stops, but the search shows ${cards} vehicle(s)`);
        if (cards === 0 && none === 0) throw new Error("no vehicle and no «ما في حدا…» line either: the result area is empty");
      });
      rider.broken = false;
    }
  },
};

export default riderMapSearch;
