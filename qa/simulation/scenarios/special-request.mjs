// A special request (طلب خاص): a rider posts a private trip, two drivers send prices, they
// chat, the rider accepts one. The other driver is told. The rider's phone number is shown
// to a driver only after his offer is accepted: checked on each driver's screen AND in the
// data his phone receives.
import { expectedPlan, pickPlace, planTrip, simName } from "../lib/ui.mjs";

const riderPhone = (n) => `05900002${String(n).padStart(2, "0")}`;
const driverPhone = (n) => `05900001${String(n).padStart(2, "0")}`;
const PRICES = { 1: 60, 2: 45 };
const TAGGED = "كم شنطة بتوسع؟ <b>مهم</b>";
const REPLY = "بتوسع ثلاث شنط";

const specialRequest = {
  name: "special-request",
  needs: ["driver-setup"],
  async run(sim) {
    const title = "Rider posts a special request";
    if (sim.counts.drivers < 2) return sim.skip("special-request.post", title, "needs two drivers to compare offers");
    const riderN = Math.min(5, sim.counts.riders);
    const rider = await sim.person("rider", riderN);
    const first = await sim.person("driver", 1);
    const chosen = await sim.person("driver", 2);
    if (!first.ready || !chosen.ready) return sim.skip("special-request.post", title, "drivers 1 and 2 need a finished setup");
    const journey = sim.city.journeys.find((j) => j.kind === "none");
    const from = sim.place(journey.from);
    const to = sim.place(journey.to);
    const where = `من ${from.nameAr} لـ${to.nameAr}`;
    const who = `Sign in as rider ${riderN} (on a QA copy: /api/qa-login?role=rider&n=${riderN})`;
    const requestRow = (page) => page.locator("main ul > li").filter({ hasText: where }).filter({ hasText: `الراكب ${simName(riderN)}` });
    const offerCard = (page, n) => page.locator("main ul.grid > li").filter({ has: page.locator("p", { hasText: new RegExp(`^${simName(n)}$`) }) });
    const seesPhone = async (driver) => JSON.stringify(await sim.api(driver, "/api/sync")).includes(riderPhone(riderN));

    await sim.step("special-request.post", rider, { title, repro: [who, `Plan ${from.nameAr} → ${to.nameAr}; the planner finds no route`, "Tap «نزّل طلب خاص» in the no-route line", "Choose «بكرة», 15:00, 2 seats, write a note", "Tap «ابعت الطلب»"], expected: "The form opens with both places already filled. After sending, the request's own screen opens and says «لسّا ما في عروض»." }, async (page) => {
      await sim.signIn(rider);
      if (expectedPlan(await sim.api(rider, "/api/sync"), from.id, to.id) === "none") {
        await planTrip(page, sim, from, to);
        await page.getByRole("link", { name: "نزّل طلب خاص" }).click();
        await page.waitForURL(/\/requests\/new/);
        await page.getByRole("button", { name: /من وين؟/ }).filter({ hasText: from.nameAr }).waitFor();
        await page.getByRole("button", { name: /لوين؟/ }).filter({ hasText: to.nameAr }).waitFor();
      } else {
        await page.goto(`${sim.base}/requests/new`);
        await pickPlace(page, () => page.getByRole("button", { name: /من وين؟/ }).click(), from.nameAr);
        await pickPlace(page, () => page.getByRole("button", { name: /لوين؟/ }).click(), to.nameAr);
      }
      await page.locator("form select").selectOption({ index: 1 });
      await page.locator('form input[type="time"]').fill("15:00");
      await page.locator("#request-seats").fill("2");
      await page.locator("#request-note").fill("معنا شنطتين كبار");
      await page.getByRole("button", { name: "ابعت الطلب" }).click();
      await page.waitForURL(/\/requests\/[0-9a-f-]{16,}$/);
      await page.getByRole("heading", { name: "لسّا ما في عروض" }).waitFor();
      rider.requestUrl = page.url();
    });
    if (!rider.requestUrl) return void (rider.broken = false);

    for (const driver of [first, chosen]) {
      const price = PRICES[driver.n];
      await sim.step("special-request.offer", driver, { title: "Driver sends a priced offer on an open request", repro: [`Sign in as driver ${driver.n}`, "Open «الطلبات»", `On the request ${where}: tap «ابعت عرض», type ${price}, tap «ابعت عرض»`], expected: `The request moves under «عروضك» with ${price} ₪. The rider's first name is shown; his phone number is not, on the screen or in the data the phone received.` }, async (page) => {
        await page.goto(`${sim.base}/driver/requests`);
        await requestRow(page).getByRole("button", { name: "ابعت عرض" }).click();
        const sheet = page.getByRole("dialog", { name: "ابعت عرض" });
        await sheet.locator("#offer-price").fill(String(price));
        await sheet.getByRole("button", { name: "ابعت عرض" }).click();
        await sheet.waitFor({ state: "detached" });
        await requestRow(page).filter({ hasText: `${price} ₪` }).waitFor();
        if ((await page.locator("main").innerText()).includes(riderPhone(riderN))) throw new Error("the driver's requests screen shows the rider's phone before any offer was accepted");
        if (await seesPhone(driver)) throw new Error("the rider's phone number is in the driver's /api/sync data before any offer was accepted");
      });
      driver.broken = false;
    }

    if (sim.counts.drivers >= 3 && (await sim.person("driver", 3)).ready) {
      const third = await sim.person("driver", 3);
      await sim.step("special-request.maintenance", third, { title: "A driver whose vehicle is in maintenance cannot send offers", repro: ["Sign in as driver 3 (no bookings)", "Open «سيارتي», tap «السيارة بالتصليح», then «احفظ» under it", "Open «الطلبات»"], expected: "«السيارة بالتصليح، ما بتقدر تبعت عروض هلأ», and «ابعت عرض» is disabled on every open request. Back on «سيارتي», «رجعت السيارة» undoes it." }, async (page) => {
        await page.goto(`${sim.base}/driver/vehicle`);
        const section = page.locator("section").filter({ has: page.getByRole("heading", { name: "التصليح" }) });
        await section.getByRole("button", { name: "السيارة بالتصليح" }).click();
        await section.getByRole("button", { name: "احفظ", exact: true }).click();
        await section.getByText(/السيارة بالتصليح من/).waitFor();
        try {
          await page.goto(`${sim.base}/driver/requests`);
          await page.getByText("السيارة بالتصليح، ما بتقدر تبعت عروض هلأ").waitFor();
          const send = requestRow(page).getByRole("button", { name: "ابعت عرض" });
          await send.waitFor();
          if (await send.isEnabled()) throw new Error("the vehicle is in maintenance, but «ابعت عرض» is enabled");
        } finally {
          await page.goto(`${sim.base}/driver/vehicle`);
          await section.getByRole("button", { name: "رجعت السيارة" }).click();
          await section.getByText("السيارة شغّالة").waitFor();
        }
      });
      third.broken = false;
    }

    await sim.step("special-request.compare", rider, { title: "Rider compares the offers side by side", repro: [who, "Open «طلب خاص» and tap the request"], expected: `Two offer cards, cheapest first (${PRICES[2]} ₪ then ${PRICES[1]} ₪), each with the driver's first name, vehicle, phone with «اتصل», «احكي مع السوّاق» and «اقبل العرض».` }, async (page) => {
      await page.goto(rider.requestUrl);
      await offerCard(page, 2).waitFor({ timeout: 30_000 });
      await offerCard(page, 1).waitFor();
      const cards = page.locator("main ul.grid > li");
      if ((await cards.count()) !== 2) throw new Error(`two drivers sent offers, but the request shows ${await cards.count()} offer cards`);
      if (!(await cards.first().innerText()).includes(`${PRICES[2]} ₪`)) throw new Error("the cheapest offer is not the first card");
      for (const n of [1, 2]) {
        const text = await offerCard(page, n).innerText();
        if (!text.includes(`${PRICES[n]} ₪`)) throw new Error(`driver ${n}'s card does not show his price ${PRICES[n]} ₪`);
        if (!text.includes(driverPhone(n))) throw new Error(`driver ${n}'s card does not show his phone number`);
        await offerCard(page, n).getByRole("button", { name: "اقبل العرض" }).waitFor();
      }
    });
    if (rider.broken) return void (rider.broken = false);

    await sim.step("special-request.chat-rider", rider, { title: "Rider writes to a driver inside the app", repro: [who, "Open the request", "On driver 2's offer tap «احكي مع السوّاق»", `Send: ${TAGGED}`], expected: "The message appears in the thread exactly as typed: the <b> is shown as text, not as bold." }, async (page) => {
      await offerCard(page, 2).getByRole("link", { name: /احكي مع السوّاق/ }).click();
      await page.waitForURL(/\/chat\//);
      await page.locator("#chat-text").fill(TAGGED);
      await page.getByRole("button", { name: "ابعت", exact: true }).click();
      const thread = page.getByRole("list", { name: "الرسائل" });
      await thread.getByText(TAGGED, { exact: true }).waitFor();
      if ((await thread.locator("b").count()) > 0) throw new Error("a message containing <b> was rendered as HTML");
      await thread.getByText("مستني ينبعت").waitFor({ state: "detached" });
    });

    await sim.step("special-request.chat-driver", chosen, { title: "Driver is told about the message and answers", repro: ["Sign in as driver 2 after the rider wrote", "Open «الطلبات»: a line says «رسالة جديدة من الراكب …»", "Tap «احكي مع الراكب» on the offer", `Send: ${REPLY}`], expected: "The rider's message is there as text. The reply appears in the thread. Still no phone number of the rider anywhere." }, async (page) => {
      await page.goto(`${sim.base}/driver/requests`);
      await page.getByText(`رسالة جديدة من الراكب ${simName(riderN)}`).waitFor({ timeout: 30_000 });
      await requestRow(page).getByRole("link", { name: /احكي مع الراكب/ }).click();
      await page.waitForURL(/\/chat\//);
      const thread = page.getByRole("list", { name: "الرسائل" });
      await thread.getByText(TAGGED, { exact: true }).waitFor();
      if ((await thread.locator("b").count()) > 0) throw new Error("the rider's message containing <b> was rendered as HTML on the driver's phone");
      await page.locator("#chat-text").fill(REPLY);
      await page.getByRole("button", { name: "ابعت", exact: true }).click();
      await thread.getByText(REPLY, { exact: true }).waitFor();
      if ((await page.locator("main").innerText()).includes(riderPhone(riderN))) throw new Error("the chat shows the rider's phone before the offer was accepted");
    });
    chosen.broken = false;

    await sim.step("special-request.chat-arrives", rider, { title: "The driver's answer reaches the rider's open thread by itself", repro: [who, "Keep the chat with driver 2 open after he answered", "Wait about ten seconds"], expected: `«${REPLY}» appears without reloading.` }, async (page) => {
      await page.getByRole("list", { name: "الرسائل" }).getByText(REPLY, { exact: true }).waitFor({ timeout: 30_000 });
    });
    rider.broken = false;

    await sim.step("special-request.accept", rider, { title: "Rider accepts one offer", repro: [who, "Open the request", "On driver 2's offer tap «اقبل العرض», then «آه، اقبل»"], expected: "Driver 2's card says «قبلت هاد العرض»; driver 1's says «ما اخترته» and loses its buttons; «مشاوير خاصة متفق عليها» shows the agreed price with «اتصل بالسوّاق»." }, async (page) => {
      await page.goto(rider.requestUrl);
      await offerCard(page, 2).getByRole("button", { name: "اقبل العرض" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "آه، اقبل" }).click();
      await offerCard(page, 2).getByText("قبلت هاد العرض").waitFor();
      await offerCard(page, 1).getByText("ما اخترته").waitFor();
      if ((await page.getByRole("button", { name: "اقبل العرض" }).count()) > 0) throw new Error("an offer was accepted, but another «اقبل العرض» button is still there");
      const agreed = page.locator("section").filter({ has: page.getByRole("heading", { name: "مشاوير خاصة متفق عليها" }) });
      await agreed.getByText(`${PRICES[2]} ₪`).waitFor();
      await agreed.getByRole("link", { name: /اتصل بالسوّاق/ }).waitFor();
      rider.accepted = true;
    });
    rider.broken = false;
    if (!rider.accepted) return;

    await sim.step("special-request.chosen-driver", chosen, { title: "Only now does the chosen driver see the rider's phone", repro: ["Sign in as driver 2 after the rider accepted his offer", "Open «الطلبات»"], expected: "«الراكب قبل عرضك» under «مشاوير خاصة متفق عليها», with «اتصل بالراكب» and the rider's number." }, async (page) => {
      await page.goto(`${sim.base}/driver/requests`);
      const agreed = page.locator("section").filter({ has: page.getByRole("heading", { name: "مشاوير خاصة متفق عليها" }) });
      await agreed.getByText("الراكب قبل عرضك").first().waitFor({ timeout: 30_000 });
      await agreed.getByRole("link", { name: /اتصل بالراكب/ }).filter({ hasText: riderPhone(riderN) }).waitFor();
      if (!(await seesPhone(chosen))) throw new Error("the offer was accepted, but the chosen driver's data has no phone number for the rider");
    });
    chosen.broken = false;

    await sim.step("special-request.other-driver-told", first, { title: "The other driver is told, and never gets the rider's phone", repro: ["Sign in as driver 1 after the rider accepted driver 2's offer", "Open «الطلبات»"], expected: "«الراكب اختار عرض ثاني» for this request. No «ابعت عرض» or chat for it any more. The rider's number is not on the screen and not in the data the phone received." }, async (page) => {
      await page.goto(`${sim.base}/driver/requests`);
      await page.getByText(new RegExp(`الراكب اختار عرض ثاني · ${where}`)).first().waitFor({ timeout: 30_000 });
      if ((await page.locator("main").innerText()).includes(riderPhone(riderN))) throw new Error("the driver whose offer was NOT accepted sees the rider's phone number");
      if (await seesPhone(first)) throw new Error("the rider's phone number is in the /api/sync data of the driver whose offer was NOT accepted");
      if ((await requestRow(page).getByRole("button", { name: /ابعت عرض|غيّر السعر/ }).count()) > 0) throw new Error("the request is closed, but the other driver can still send or change an offer");
    });
    first.broken = false;

    await sim.step("special-request.complete", chosen, { title: "The chosen driver marks the private trip done", repro: ["Sign in as driver 2 with an accepted offer", "Open «الطلبات»", "Tap «خلّصت المشوار»"], expected: "The trip says «خلص المشوار» and its call, chat and done buttons are gone." }, async (page) => {
      await page.goto(`${sim.base}/driver/requests`);
      await page.getByRole("button", { name: "خلّصت المشوار" }).click();
      const agreed = page.locator("section").filter({ has: page.getByRole("heading", { name: "مشاوير خاصة متفق عليها" }) });
      await agreed.getByText("خلص المشوار").first().waitFor();
      await page.getByRole("button", { name: "خلّصت المشوار" }).waitFor({ state: "detached" });
    });
    chosen.broken = false;
  },
};

export default specialRequest;
