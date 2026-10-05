// The day is over. Riders find their finished trips in the history and rate the driver;
// drivers see each ended trip with the riders they carried and rate them back; the
// private trip is rated both ways. One rating is made with no internet. Then the driver's
// average shows where riders choose a vehicle, and it must equal the stars given here.
import { myBookings, openBookBox, simName } from "../lib/ui.mjs";

const STAR_NAME = { 1: "نجمة واحدة", 2: "نجمتين", 3: "3 نجوم", 4: "4 نجوم", 5: "5 نجوم" };
const COMMENT = "سوّاق محترم ووصلنا عالوقت";
const countText = (n) => (n === 1 ? "تقييم واحد" : n === 2 ? "تقييمين" : `${n} تقييمات`);
/** What the app should print for these stars: «★ 4.5 من 5 · تقييمين». */
const averageText = (stars) => `★ ${Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10} من 5 · ${countText(stars.length)}`;

const historyRating = {
  name: "history-rating",
  needs: ["driver-setup", "driving", "booking", "location-share", "trip", "special-request"],
  async run(sim) {
    const d1 = await sim.person("driver", 1);
    const d2 = sim.counts.drivers >= 2 ? await sim.person("driver", 2) : null;
    const given = { 1: [], 2: [] }; // the stars each driver received in this run
    const items = (page) => page.locator("main ul > li");
    const tripItem = (page, otherRole, n, status = "خلصت الرحلة") => items(page).filter({ hasText: status }).filter({ has: page.locator("span", { hasText: new RegExp(`${otherRole} ${simName(n)}( ·|$)`) }) });
    const noPhone = async (page) => {
      if (/05\d{8}/.test(await page.locator("main").innerText())) throw new Error("the history screen shows a phone number");
    };
    // Tap the rate button on one history item, pick the stars, send.
    const rate = async (page, item, button, stars, comment) => {
      await item.getByRole("button", { name: button }).click();
      const sheet = page.getByRole("dialog", { name: button });
      const send = sheet.getByRole("button", { name: "ابعت التقييم" });
      if (await send.isEnabled()) throw new Error("«ابعت التقييم» is enabled before any star is picked");
      await sheet.getByRole("radio", { name: STAR_NAME[stars], exact: true }).click();
      if (comment) await sheet.locator("#rating-comment").fill(comment);
      await send.click();
      await sheet.waitFor({ state: "detached" });
    };
    const rated = async (item, stars) => {
      await item.getByText("تقييمك:").waitFor({ timeout: 30_000 });
      await item.getByRole("img", { name: `${stars} من 5` }).first().waitFor();
    };

    // ---- Riders of driver 1's trip.
    const r1 = await sim.person("rider", 1);
    if (!r1.booked || !r1.ready) sim.skip("history-rating.rider-rates", "Rider rates his driver from the history", "rider 1 did not complete a trip with driver 1", r1.label);
    else {
      await sim.step("history-rating.rider-rates", r1, { title: "Rider finds his finished trip in the history and rates the driver", repro: ["Sign in as rider 1 after his trip with driver 1 ended", "Open «رحلاتي»: a line says «كيف كان مشوارك؟ قيّم»", "Tap «رحلاتي السابقة»", "On the trip with «السوّاق محاكاة-1» tap «قيّم السوّاق», pick 5 stars, write a comment, tap «ابعت التقييم»"], expected: "The trip says «خلصت الرحلة». The send button is disabled until a star is picked. Afterwards the item shows «تقييمك:» with five stars and the comment. No phone number on the screen." }, async (page) => {
        await page.goto(`${sim.base}/trips`);
        await page.getByText("كيف كان مشوارك؟ قيّم").first().waitFor({ timeout: 30_000 });
        await page.getByRole("link", { name: /رحلاتي السابقة/ }).click();
        await page.waitForURL(/\/history/);
        const item = tripItem(page, "السوّاق", 1);
        await item.waitFor();
        await noPhone(page);
        await rate(page, item, "قيّم السوّاق", 5, COMMENT);
        await rated(item, 5);
        await item.getByText(COMMENT).waitFor();
        given[1].push(5);
        r1.rated = (await myBookings(sim, r1)).find((b) => b.driverId === d1.userId && b.completedAt)?.id;
      });
      r1.broken = false;

      if (r1.rated) {
        await sim.step("history-rating.once-only", r1, { title: "A trip can be rated only once", repro: ["Sign in as rider 1 after rating his trip", "Open «رحلاتي السابقة»", "Also open the rating link for the same trip directly: /history?rate=booking:<its id>"], expected: "No «قيّم السوّاق» button on the rated trip, and the direct link opens no rating sheet." }, async (page) => {
          await page.goto(`${sim.base}/history?rate=booking:${r1.rated}`);
          const item = tripItem(page, "السوّاق", 1);
          await item.getByText("تقييمك:").waitFor();
          if ((await item.getByRole("button", { name: "قيّم السوّاق" }).count()) > 0) throw new Error("the trip is already rated, but «قيّم السوّاق» is offered again");
          await page.waitForTimeout(1000);
          if ((await page.getByRole("dialog").count()) > 0) throw new Error("the direct rating link opened the star sheet for a trip that is already rated");
        });
        r1.broken = false;
      }
    }

    const r2 = sim.counts.riders >= 2 ? await sim.person("rider", 2) : null;
    if (r2?.booked && r2.ready) {
      await sim.step("history-rating.offline", r2, { title: "Rider rates with no internet; it is sent when the network returns", repro: ["Sign in as rider 2 after his trip with driver 1 ended", "Open «رحلاتي السابقة» once with internet", "Turn on airplane mode", "Tap «قيّم السوّاق», pick 4 stars, tap «ابعت التقييم»", "Turn airplane mode off and wait"], expected: "Offline the item shows the four stars with «مستني ينبعت». Back online it is sent by itself and the item shows «تقييمك:» with four stars." }, async (page) => {
        await page.goto(`${sim.base}/history`);
        const item = tripItem(page, "السوّاق", 1);
        await item.waitFor();
        await r2.context.setOffline(true);
        try {
          await item.getByRole("button", { name: "قيّم السوّاق" }).click();
          const sheet = page.getByRole("dialog", { name: "قيّم السوّاق" });
          await sheet.getByRole("radio", { name: STAR_NAME[4], exact: true }).click();
          await sheet.getByRole("button", { name: "ابعت التقييم" }).click();
          await item.getByText("مستني ينبعت").waitFor();
        } finally {
          await r2.context.setOffline(false);
        }
        await page.evaluate(() => window.dispatchEvent(new Event("online")));
        await page.getByText(/محفوظة على جوالك/).waitFor({ state: "detached", timeout: 30_000 });
        await page.goto(`${sim.base}/history`);
        await rated(tripItem(page, "السوّاق", 1), 4);
        given[1].push(4);
      });
      r2.broken = false;
    }

    // ---- Driver 1 sees the ended trip with its riders, and rates one back.
    if (given[1].length > 0) {
      await sim.step("history-rating.driver-rates", d1, { title: "Driver sees the ended trip with its riders and rates a rider", repro: ["Sign in as driver 1 after his trip ended and riders rated him", "Open «اليوم», tap «رحلات سابقة وتقييمات»", "On rider «محاكاة-1» tap «قيّم الراكب», pick 5 stars, tap «ابعت التقييم»"], expected: "The trip is listed under its route name with the riders carried. Rider 1's item shows «الراكب قيّمك:» with his stars and comment, then «تقييمك:» after the driver rates. No phone number on the screen." }, async (page) => {
        await page.goto(`${sim.base}/driver`);
        await page.getByRole("link", { name: /رحلات سابقة وتقييمات/ }).click();
        await page.waitForURL(/\/history/);
        await page.getByRole("heading", { name: new RegExp(sim.routeFor(1).name.replace(/[()]/g, "\\$&")) }).first().waitFor();
        const item = tripItem(page, "الراكب", 1);
        await item.getByText("الراكب قيّمك:").waitFor();
        await item.getByText(COMMENT).waitFor();
        await noPhone(page);
        await rate(page, item, "قيّم الراكب", 5);
        await rated(item, 5);
      });
      d1.broken = false;

      await sim.step("history-rating.rider-sees-his", r1, { title: "The rider sees what the driver gave him", repro: ["Sign in as rider 1 after driver 1 rated him", "Open «رحلاتي السابقة»"], expected: "The trip shows «السوّاق قيّمك:» with five stars, next to the rider's own rating." }, async (page) => {
        await page.goto(`${sim.base}/history`);
        const item = tripItem(page, "السوّاق", 1);
        await item.getByText("السوّاق قيّمك:").waitFor({ timeout: 30_000 });
        if ((await item.getByRole("img", { name: "5 من 5" }).count()) < 2) throw new Error("the item should show two five-star ratings: the rider's and the driver's");
      });
      r1.broken = false;
    }

    // ---- Driver 2: riders who won his seats, and the private trip.
    const winnerStars = [3, 5];
    for (const [index, n] of (d2?.winners ?? []).slice(0, 2).entries()) {
      const rider = await sim.person("rider", n);
      await sim.step("history-rating.rider-rates", rider, { title: "Rider rates the driver of a full vehicle", repro: [`Sign in as rider ${n} after his trip with driver 2 ended`, "Open «رحلاتي السابقة»", `On the trip with «السوّاق محاكاة-2» tap «قيّم السوّاق», pick ${winnerStars[index]} stars, tap «ابعت التقييم»`], expected: `The item shows «تقييمك:» with ${winnerStars[index]} stars.` }, async (page) => {
        await page.goto(`${sim.base}/history`);
        const item = tripItem(page, "السوّاق", 2);
        await rate(page, item, "قيّم السوّاق", winnerStars[index]);
        await rated(item, winnerStars[index]);
        given[2].push(winnerStars[index]);
      });
      rider.broken = false;
    }

    const privateRider = await sim.person("rider", Math.min(5, sim.counts.riders));
    if (d2 && privateRider.accepted) {
      await sim.step("history-rating.private-rider", privateRider, { title: "Rider rates the driver of his private trip", repro: [`Sign in as rider ${privateRider.n} after the private trip was marked done`, "Open «رحلاتي السابقة»", "On «خلص المشوار الخاص» tap «قيّم السوّاق», pick 4 stars, tap «ابعت التقييم»"], expected: "The private trip is in the history with its agreed price, and after rating shows «تقييمك:» with four stars." }, async (page) => {
        await page.goto(`${sim.base}/history`);
        const item = tripItem(page, "السوّاق", 2, "خلص المشوار الخاص");
        await item.getByText("السعر المتفق عليه").waitFor();
        await noPhone(page);
        await rate(page, item, "قيّم السوّاق", 4);
        await rated(item, 4);
        given[2].push(4);
      });
      privateRider.broken = false;

      await sim.step("history-rating.private-driver", d2, { title: "Driver rates the rider of the private trip", repro: ["Sign in as driver 2 after the private trip was marked done", "Open «رحلات سابقة وتقييمات»", `Under «مشاوير خاصة», on rider «محاكاة-${privateRider.n}» tap «قيّم الراكب», pick 4 stars, tap «ابعت التقييم»`], expected: "The item shows «الراكب قيّمك:» (four stars) and then «تقييمك:». No phone number on the screen, although the driver had the rider's number during the trip." }, async (page) => {
        await page.goto(`${sim.base}/history`);
        await page.getByRole("heading", { name: "مشاوير خاصة" }).waitFor();
        const item = tripItem(page, "الراكب", privateRider.n, "خلص المشوار الخاص");
        await item.getByText("الراكب قيّمك:").waitFor();
        await noPhone(page);
        await rate(page, item, "قيّم الراكب", 4);
        await rated(item, 4);
      });
      d2.broken = false;
    }

    // ---- The averages, where riders choose a vehicle.
    const guest = await sim.person("guest", 1);
    for (const [n, driver] of [[1, d1], [2, d2]]) {
      const stars = given[n];
      if (!driver || stars.length === 0) continue;
      const expected = averageText(stars);
      await sim.step("history-rating.average", guest, { title: "The driver's average rating shows on his vehicle, and matches the stars given", repro: [`Riders gave driver ${n} these stars: ${stars.join(", ")}`, "Open the app signed out", `Find the vehicle of «محاكاة-${n}» under «شغّالين هلأ»`], expected: `The card says «${expected}». The same numbers are in /api/sync.` }, async (page) => {
        const vehicle = (await sim.api(driver, "/api/sync")).changes.vehicles.find((v) => v.driverId === driver.userId);
        const want = Math.round((stars.reduce((a, b) => a + b, 0) / stars.length) * 10) / 10;
        if (vehicle.rating !== want || vehicle.ratings !== stars.length) throw new Error(`stars ${stars.join(", ")} should give ${want} from ${stars.length} ratings; /api/sync says ${vehicle.rating} from ${vehicle.ratings}`);
        await page.goto(sim.base);
        const card = page.locator("main section button").filter({ has: page.locator("span", { hasText: new RegExp(`· ${simName(n)}$`) }) });
        await card.waitFor({ timeout: 30_000 });
        await card.getByText(expected).waitFor({ timeout: 45_000 });
      });
      guest.broken = false;
    }

    if (d2 && given[2].length > 0 && privateRider.signedIn) {
      const journey = sim.city.bookings.overbook;
      await sim.step("history-rating.average-planner", privateRider, { title: "The average also shows on the planner's option", repro: [`Sign in as rider ${privateRider.n}`, `Plan ${sim.place(journey.from).nameAr} → ${sim.place(journey.to).nameAr}`, "Open the option driven by «محاكاة-2»"], expected: `The option says «${averageText(given[2])}» next to the driver.` }, async (page) => {
        const sheet = await openBookBox(page, sim, sim.place(journey.from), sim.place(journey.to), 2);
        await sheet.getByText(averageText(given[2])).first().waitFor();
      });
      privateRider.broken = false;
    }
  },
};

export default historyRating;
