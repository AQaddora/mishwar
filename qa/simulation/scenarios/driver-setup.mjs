// Every driver sets himself up the way a real one would on his phone: vehicle, a photo,
// his route stop by stop, the week, and then the today screen says he is running.
import { makePhoto, pickPlace } from "../lib/ui.mjs";

const TYPE_AR = { car: "سيارة", bus: "باص", ajala: "عجلة" };
const COLOURS = ["#0A7D5A", "#1F5FA8", "#8A4B00", "#6A3FA0", "#A8323E", "#2F6F7A"];

const driverSetup = {
  name: "driver-setup",
  needs: [],
  async run(sim) {
    for (let n = 1; n <= sim.counts.drivers; n++) {
      const driver = await sim.person("driver", n);
      const vehicle = sim.city.vehicles[(n - 1) % sim.city.vehicles.length];
      const route = sim.routeFor(n);
      const stopNames = route.stops.map((s) => sim.place(s.id).nameAr);
      const who = `Sign in as driver ${n} (on a QA copy: /api/qa-login?role=driver&n=${n})`;

      await sim.step("driver-setup.sign-in", driver, { title: "Driver signs in and lands on «اليوم»", repro: [who, "Open /driver"], expected: "The driver's «اليوم» screen with the four driver tabs." }, async (page) => {
        await sim.signIn(driver);
        await page.goto(`${sim.base}/driver`);
        await page.getByRole("heading", { name: "اليوم" }).waitFor();
      });

      await sim.step("driver-setup.vehicle", driver, { title: "Driver saves the vehicle type and seats", repro: [who, "Open «سيارتي»", `Choose «${TYPE_AR[vehicle.type]}», type ${vehicle.seats} seats, tap «احفظ»`], expected: "«انحفظ» appears under the form and the values stay after a reload." }, async (page) => {
        await page.goto(`${sim.base}/driver/vehicle`);
        await page.locator("label").filter({ hasText: new RegExp(`^${TYPE_AR[vehicle.type]}$`) }).click();
        await page.locator("#seats").fill(String(vehicle.seats));
        await page.getByRole("button", { name: "احفظ", exact: true }).first().click();
        await page.getByRole("status").filter({ hasText: /^انحفظ$/ }).waitFor();
        await page.reload();
        const seats = await page.locator("#seats").inputValue();
        if (seats !== String(vehicle.seats)) throw new Error(`after a reload the seats field shows ${seats}, not ${vehicle.seats}`);
      });

      await sim.step("driver-setup.photo", driver, { title: "Driver adds a vehicle photo and sends it", repro: [who, "Open «سيارتي»", "Tap «ضيف صورة» and pick a photo", "Tap «ابعت الصور هلأ»"], expected: "The photo first shows «مستنية تنبعت», then it is saved: the label goes away and the photo stays." }, async (page) => {
        const input = page.locator('input[type="file"]');
        if ((await input.count()) === 0) return; // already four photos from an earlier run
        const before = await page.locator('img[alt="صورة السيارة"]').count();
        await input.setInputFiles(await makePhoto(page, `${TYPE_AR[vehicle.type]} · ${vehicle.seats}`, COLOURS[(n - 1) % COLOURS.length]));
        // On Wi-Fi the photo goes by itself; anywhere else it waits for the tap.
        const sendNow = page.getByRole("button", { name: "ابعت الصور هلأ" });
        await Promise.race([sendNow.waitFor(), page.waitForFunction((count) => document.querySelectorAll('img[alt="صورة السيارة"]').length > count && !document.body.innerText.includes("مستنية تنبعت"), before)]);
        if (await sendNow.isVisible()) await sendNow.click();
        await page.getByText("مستنية تنبعت").waitFor({ state: "detached" });
        await page.reload();
        const sync = await sim.api(driver, "/api/sync");
        const mine = sync.changes.vehicles.find((v) => v.driverId === driver.userId);
        if (!mine || mine.photos.length === 0) throw new Error("the photo was sent, but the server lists no photo for this vehicle");
      });

      await sim.step("driver-setup.route", driver, { title: "Driver builds his route stop by stop", repro: [who, "Open «خطوطي» then «خط جديد»", `Add these stops in order: ${stopNames.join("، ")}`, "Tap «احفظ الخط»"], expected: `The routes list shows «${route.name}» with ${stopNames.length} stops, marked «الخط الأساسي».` }, async (page) => {
        await page.goto(`${sim.base}/driver/routes/new`);
        await page.locator("#route-name").fill(route.name);
        for (const name of stopNames) {
          await pickPlace(page, () => page.getByRole("button", { name: "ضيف موقف" }).click(), name, "#place-search");
        }
        const listed = await page.locator("main ol > li").count();
        if (listed !== stopNames.length) throw new Error(`picked ${stopNames.length} stops but the editor lists ${listed}`);
        await page.getByRole("button", { name: "احفظ الخط" }).click();
        await page.waitForURL(/\/driver\/routes$/);
        await page.getByText(route.name).first().waitFor();
        await page.getByText("الخط الأساسي").first().waitFor();
      });

      await sim.step("driver-setup.schedule", driver, { title: "Driver sets the week: working every day, all day", repro: [who, "Open «اليوم» then «أيام وساعات الشغل»", "Switch every day to «شغّال», from 00:00 to 23:59", "Tap «احفظ»"], expected: "«انحفظ» appears; after a reload all seven days are still «شغّال»." }, async (page) => {
        await page.goto(`${sim.base}/driver/schedule`);
        const days = page.locator("main ul > li");
        if ((await days.count()) !== 7) throw new Error(`the week shows ${await days.count()} days, not 7`);
        for (let i = 0; i < 7; i++) {
          const day = days.nth(i);
          await day.locator('input[type="checkbox"]').check();
          await day.locator('input[type="time"]').nth(0).fill("00:00");
          await day.locator('input[type="time"]').nth(1).fill("23:59");
        }
        await page.getByRole("button", { name: "احفظ", exact: true }).click();
        await page.getByRole("status").filter({ hasText: /^انحفظ$/ }).waitFor();
        await page.reload();
        const working = await page.locator('main ul > li input[type="checkbox"]:checked').count();
        if (working !== 7) throw new Error(`after a reload ${working} of 7 days are «شغّال»`);
      });

      await sim.step("driver-setup.today", driver, { title: "The today screen says the driver is running now", repro: [who, "Finish the vehicle, the route and the week", "Open «اليوم»"], expected: `«شغّال هلأ» with «${route.name}».` }, async (page) => {
        // "All day" is 00:00 to 23:59, so during the minute 23:59 (Gaza time) nobody is
        // running. Give the clock that one minute before calling it a failure.
        for (let attempt = 0; ; attempt++) {
          await page.goto(`${sim.base}/driver`);
          const running = await page.getByText("شغّال هلأ").waitFor({ timeout: 10_000 }).then(() => true, () => false);
          if (running) break;
          if (attempt >= 6) throw new Error("the today screen does not say «شغّال هلأ» after the vehicle, the route and the week were saved");
        }
        await page.getByText(route.name).waitFor();
      });
      driver.ready = !driver.broken;
      driver.broken = false; // a later scenario may still use what did work
    }
  },
};

export default driverSetup;
