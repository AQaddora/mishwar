// A guest and the riders look for a ride: the home map with the running vehicles, a
// vehicle's sheet, then each rider asks the planner about one journey from city.json.
import { expectedPlan, planCards, planTrip } from "../lib/ui.mjs";

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

      await sim.step("rider-map-search.search", rider, { title: "Rider asks how to get from one place to another", repro: [who, "Tap «لوين رايح؟ دوّر على مشوار»", `«من وين؟»: ${from.nameAr}`, `«لوين؟»: ${to.nameAr}`], expected: "Up to three options (direct, or with a change of vehicle) when routes running now connect the two places; otherwise «ما لقينا طريق…» with the hint to post a special request." }, async (page) => {
        // What the answer should be, from the same public data the phone holds.
        const expected = expectedPlan(await sim.api(rider, "/api/sync"), from.id, to.id);
        await planTrip(page, sim, from, to);
        const cards = await planCards(page).count();
        const none = await page.getByText(/ما لقينا طريق/).count();
        if (cards > 3) throw new Error(`the planner shows ${cards} options; it promises at most three`);
        if (expected !== "none" && cards === 0) throw new Error(`routes running now connect the two places (${expected}), but the planner shows no option`);
        if (expected === "none" && cards > 0) throw new Error(`no running route connects the two places, but the planner shows ${cards} option(s)`);
        if (cards === 0 && none === 0) throw new Error("no option and no «ما لقينا طريق…» line either: the result area is empty");
      });
      rider.broken = false;
    }
  },
};

export default riderMapSearch;
