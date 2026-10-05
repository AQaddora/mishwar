// The trip planner, three ways: a direct trip, a trip that needs a change of vehicle at
// a stop two routes share, and two places nothing connects. A guest does it, then a rider.
import { expectedPlan, planCards, planTrip } from "../lib/ui.mjs";

const planner = {
  name: "planner",
  needs: ["driver-setup", "driving"],
  async run(sim) {
    const guest = await sim.person("guest", 1);
    const rider = await sim.person("rider", 1);
    await sim.signIn(rider);
    const sync = await sim.api(rider, "/api/sync");

    for (const kind of ["direct", "change", "none"]) {
      // The journey of this kind that the drivers on the road today really make true.
      const journey = sim.city.journeys.find((j) => j.kind === kind && expectedPlan(sync, j.from, j.to) === kind);
      if (!journey) {
        sim.skip(`planner.${kind}`, `Planner: ${kind}`, `with ${sim.counts.drivers} drivers no journey in city.json is «${kind}» right now (a change needs drivers 1 and 3)`);
        continue;
      }
      const from = sim.place(journey.from);
      const to = sim.place(journey.to);
      const repro = ["Open the app (signed out works too)", "Tap «لوين رايح؟ دوّر على مشوار»", `«من وين؟»: ${from.nameAr}`, `«لوين؟»: ${to.nameAr}`, "Leave «إمتى؟» on «هلأ»"];

      for (const person of [guest, rider]) {
        if (kind === "direct") {
          await sim.step("planner.direct", person, { title: "Planner finds a direct trip", repro: [...repro, "Tap the first option"], expected: "At least one option with one vehicle (no «بدّل السيارة»). Its sheet is titled «مشوار مباشر», shows the stops with «بتركب من هون» and «بتنزل هون», and says fares are agreed with the driver." }, async (page) => {
            await planTrip(page, sim, from, to);
            const directCards = planCards(page).filter({ hasNotText: "بدّل السيارة" });
            if ((await directCards.count()) === 0) throw new Error("a running route has both stops, but no option is a direct one");
            await directCards.first().click();
            const sheet = page.getByRole("dialog", { name: "مشوار مباشر" });
            await sheet.getByText("بتركب من هون").waitFor();
            await sheet.getByText("بتنزل هون").waitFor();
            await sheet.locator(".leaflet-container").waitFor();
            const text = await sheet.innerText();
            if (!text.includes(from.nameAr) || !text.includes(to.nameAr)) throw new Error("the option's sheet does not name both the boarding stop and the last stop");
            if (!text.includes("الأجرة بتتفق عليها مع السوّاق")) throw new Error("the sheet does not say that the fare is agreed with the driver");
            if (/₪|شيكل/.test(text)) throw new Error("the planner shows a price; routes have no fares");
            if (person.role === "guest" && (await sheet.getByText("سجّل دخولك عشان تحجز").count()) === 0) throw new Error("a guest is not told to sign in to book");
          });
        } else if (kind === "change") {
          await sim.step("planner.change", person, { title: "Planner finds a trip with one change of vehicle", repro: [...repro, "Tap the option that says «بدّل السيارة في …»"], expected: "An option with two vehicles and «بدّل السيارة في <the shared stop>». Its sheet is titled «مشوار بسيارتين» and lists both legs." }, async (page) => {
            await planTrip(page, sim, from, to);
            const changeCards = planCards(page).filter({ hasText: "بدّل السيارة في" });
            if ((await changeCards.count()) === 0) throw new Error("two running routes share a stop between these places, but no option has a change of vehicle");
            await changeCards.first().click();
            const sheet = page.getByRole("dialog", { name: "مشوار بسيارتين" });
            await sheet.getByText("بدّل السيارة في").waitFor();
            const boards = await sheet.getByText("بتركب من هون").count();
            if (boards !== 2) throw new Error(`a trip with two vehicles should show two boarding stops; the sheet shows ${boards}`);
          });
        } else {
          await sim.step("planner.no-route", person, { title: "Planner says plainly when nothing connects two places", repro, expected: "«ما لقينا طريق من … لـ…» with the hint to post a special request. No option cards." }, async (page) => {
            await planTrip(page, sim, from, to);
            await page.getByText(/ما لقينا طريق/).waitFor();
            if ((await planCards(page).count()) > 0) throw new Error("the planner says there is no route and shows options at the same time");
            if ((await page.getByText(/طلب خاص/).count()) === 0) throw new Error("the no-route line does not point to a special request");
          });
        }
        await person.page.getByRole("dialog").getByRole("button", { name: "سكّر" }).last().click({ timeout: 2000 }).catch(() => {});
        person.broken = false;
      }
    }
  },
};

export default planner;
