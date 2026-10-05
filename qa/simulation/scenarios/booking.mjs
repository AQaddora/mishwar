// Booking seats. Riders 1 to 4 book on driver 1's route from the planner (one of them
// with no internet, one cancels afterwards). Then more riders than there are seats ask
// for driver 2's vehicle at the same moment: the first bookings win, the rest are told.
import { freeSeats, myBookings, openBookBox, riderRow } from "../lib/ui.mjs";

const SEATS_GONE = "الكراسي خلصت قبل ما يوصل طلبك";
const riderPhone = (n) => `05900002${String(n).padStart(2, "0")}`;

const booking = {
  name: "booking",
  needs: ["driver-setup", "driving"],
  async run(sim) {
    const riders = sim.counts.riders;
    const drivers = [await sim.person("driver", 1), sim.counts.drivers >= 2 ? await sim.person("driver", 2) : null];
    if (!drivers[0].ready) return sim.skip("booking.book-seat", "Rider books a seat", "driver 1's setup did not finish", drivers[0].label);

    // The morning run is over: the two drivers who take bookings today end their trips.
    for (const driver of drivers.filter((d) => d?.driving)) {
      await sim.step("booking.end-morning-trip", driver, { title: "Driver ends his trip and leaves the map", repro: [`Sign in as driver ${driver.n}, on an open trip`, "Open «أنا سايق»", "Tap «خلّصت الرحلة»"], expected: "The screen goes back to «ابدأ الرحلة», and the server no longer holds a position for this vehicle." }, async (page) => {
        await page.goto(`${sim.base}/driver/drive`);
        await page.getByRole("button", { name: "خلّصت الرحلة" }).click();
        await page.getByRole("button", { name: "ابدأ الرحلة" }).waitFor();
        const sync = await sim.api(driver, "/api/sync");
        const vehicle = sync.changes.vehicles.find((v) => v.driverId === driver.userId);
        if (sync.changes.positions.some((p) => p.id === vehicle?.id)) throw new Error("the trip ended, but the vehicle's position is still in /api/sync");
        driver.driving = false;
      });
      driver.broken = false;
    }

    // ---- Driver 1: ordinary bookings from the planner.
    const main = sim.city.bookings.main;
    const book = async (n, { offline = false } = {}) => {
      const rider = await sim.person("rider", n);
      const journey = main[(n - 1) % main.length];
      const from = sim.place(journey.from);
      const to = sim.place(journey.to);
      const who = [`Sign in as rider ${n} (on a QA copy: /api/qa-login?role=rider&n=${n})`, "Tap «لوين رايح؟ دوّر على مشوار»", `«من وين؟»: ${from.nameAr}, «لوين؟»: ${to.nameAr}`, "Tap the option driven by «محاكاة-1», then «احجز مع محاكاة-1»"];
      if (!offline) {
        await sim.step("booking.book-seat", rider, { title: "Rider books a seat from the planner", repro: [...who, "Tap «أكّد الحجز»", "Open «رحلاتي»"], expected: "«تأكد حجزك» in the sheet. «رحلاتي» lists the booking with «تأكد حجزك» and an «اتصل بالسوّاق» button. The driver's phone was not shown before booking." }, async (page) => {
          await sim.signIn(rider);
          const before = await freeSeats(sim, drivers[0]);
          const sheet = await openBookBox(page, sim, from, to, 1);
          if (/05\d{8}/.test(await sheet.innerText())) throw new Error("the planner sheet shows a phone number before any booking");
          await sheet.getByRole("button", { name: "أكّد الحجز" }).click();
          await sheet.getByRole("status").getByText("تأكد حجزك").waitFor();
          const after = await freeSeats(sim, drivers[0]);
          if (after !== before - 1) throw new Error(`one seat was booked, but the vehicle's free seats went from ${before} to ${after}`);
          await page.goto(`${sim.base}/trips`);
          await page.locator("main ul > li").filter({ hasText: "تأكد حجزك" }).first().waitFor();
          await page.getByRole("link", { name: "اتصل بالسوّاق" }).first().waitFor();
          rider.booked = true;
        });
      } else {
        await sim.step("booking.book-offline", rider, { title: "Rider books with no internet, and is told when it goes through", repro: [...who, "Turn on airplane mode", "Tap «أكّد الحجز»", "Turn airplane mode off, wait, open «رحلاتي»"], expected: "Offline: «مستني ينبعت» and «انحفظ على جوالك…». Back online it is sent by itself and «رحلاتي» says «تأكد حجزك»." }, async (page) => {
          await sim.signIn(rider);
          const sheet = await openBookBox(page, sim, from, to, 1);
          await rider.context.setOffline(true);
          try {
            await sheet.getByRole("button", { name: "أكّد الحجز" }).click();
            await sheet.getByRole("status").getByText("مستني ينبعت").waitFor();
            if ((await myBookings(sim, drivers[0])).some((b) => b.name === `محاكاة-${n}` && b.status === "confirmed" && b.from === from.id)) throw new Error("the server already has the booking while the phone is offline");
          } finally {
            await rider.context.setOffline(false);
          }
          await page.evaluate(() => window.dispatchEvent(new Event("online")));
          await page.getByText(/محفوظة على جوالك/).waitFor({ state: "detached", timeout: 30_000 });
          await page.goto(`${sim.base}/trips`);
          await page.locator("main ul > li").filter({ hasText: "تأكد حجزك" }).first().waitFor({ timeout: 30_000 });
          if ((await page.getByText("مستني ينبعت").count()) > 0) throw new Error("the booking is confirmed, but «رحلاتي» still shows it as «مستني ينبعت»");
          rider.booked = true;
        });
      }
      rider.broken = false;
      return rider;
    };

    await book(1);
    if (riders >= 2) await book(2, { offline: true });
    if (riders >= 3) await book(3);
    if (riders >= 4) {
      const rider = await book(4);
      if (rider.booked) {
        await sim.step("booking.cancel", rider, { title: "Rider cancels his own booking", repro: ["Sign in as rider 4, with a confirmed booking", "Open «رحلاتي» and tap the booking", "Tap «الغي الحجز», then «آه، الغي الحجز»"], expected: "The booking says «لغيت الحجز», the call button is gone, and the seat is free again." }, async (page) => {
          const before = await freeSeats(sim, drivers[0]);
          await page.goto(`${sim.base}/trips`);
          await page.locator("main ul > li button").filter({ hasText: "تأكد حجزك" }).first().click();
          const sheet = page.getByRole("dialog", { name: "حجزك" });
          await sheet.getByRole("button", { name: "الغي الحجز", exact: true }).click();
          await sheet.getByRole("button", { name: "آه، الغي الحجز" }).click();
          await page.locator("main ul > li").filter({ hasText: "لغيت الحجز" }).first().waitFor();
          const after = await freeSeats(sim, drivers[0]);
          if (after !== before + 1) throw new Error(`the booking was cancelled, but the vehicle's free seats went from ${before} to ${after}`);
          rider.booked = false;
          rider.cancelled = true;
        });
        rider.broken = false;
      }
    }

    await sim.step("booking.driver-list", drivers[0], { title: "Driver sees who booked, with phone numbers, and cannot start yet", repro: ["Sign in as driver 1 after riders booked", "Open «اليوم»"], expected: "«ركّاب اليوم» lists each rider with a live booking and his phone to call. A rider who cancelled shows «الراكب لغى حجزه» and no phone. «ابدأ الرحلة» is locked: «ضل ركّاب ما تأكدت منهم»." }, async (page) => {
      await page.goto(`${sim.base}/driver`);
      await page.getByRole("heading", { name: "ركّاب اليوم" }).waitFor();
      for (let n = 1; n <= Math.min(riders, 4); n++) {
        const rider = await sim.person("rider", n);
        const row = riderRow(page, n);
        if (rider.booked) {
          await row.waitFor();
          if (!(await row.innerText()).includes(riderPhone(n))) throw new Error(`rider ${n} has a live booking, but the driver's list does not show his phone`);
        } else if (rider.cancelled) {
          await row.getByText("الراكب لغى حجزه").waitFor();
          if ((await row.innerText()).includes(riderPhone(n))) throw new Error(`rider ${n} cancelled, but the driver still sees his phone number`);
        }
      }
      const start = page.getByRole("button", { name: "ابدأ الرحلة" });
      await start.waitFor();
      if (await start.isEnabled()) throw new Error("«ابدأ الرحلة» is enabled while no rider has been confirmed ready or cancelled");
      await page.getByText("ضل ركّاب ما تأكدت منهم").waitFor();
    });
    drivers[0].broken = false;

    // ---- Driver 2: more riders than seats, at the same moment.
    const overbook = async () => {
      const driver = drivers[1];
      const title = "First booking wins when more riders than seats book at once";
      if (!driver?.ready) return sim.skip("booking.first-wins", title, "needs driver 2 with a finished setup");
      const group = [];
      for (let n = 3; n <= riders; n++) group.push(await sim.person("rider", n));
      const capacity = await freeSeats(sim, driver);
      const seatsEach = Math.min(6, Math.max(1, Math.ceil((capacity + 1) / Math.max(group.length, 1))));
      if (group.length < 2 || group.length * seatsEach <= capacity) return sim.skip("booking.first-wins", title, `needs more riders: ${group.length} riders cannot ask for more than ${capacity} seats`);
      const winnersExpected = Math.floor(capacity / seatsEach);
      const from = sim.place(sim.city.bookings.overbook.from);
      const to = sim.place(sim.city.bookings.overbook.to);
      const repro = [`Driver 2 has ${capacity} free seats`, `Sign in as riders 3 to ${riders} on ${group.length} phones`, `On each: plan ${from.nameAr} → ${to.nameAr}, open the option driven by «محاكاة-2», «احجز مع محاكاة-2», choose ${seatsEach} seat(s)`, "Tap «أكّد الحجز» on all phones at the same moment"];

      for (const rider of group) {
        await sim.step("booking.overbook-ready", rider, { title: "Rider gets to the last tap before booking", repro: repro.slice(0, 3), expected: "The seat picker is open with «أكّد الحجز»." }, async (page) => {
          await sim.signIn(rider);
          await openBookBox(page, sim, from, to, 2, seatsEach);
        });
      }
      const racing = group.filter((r) => !r.broken);
      await Promise.all(racing.map((r) => r.page.getByRole("dialog").getByRole("button", { name: "أكّد الحجز" }).click().catch(() => {})));
      for (const rider of racing) {
        await sim.step("booking.overbook-result", rider, { title: "Rider is told at once whether he got the seats", repro, expected: `Either «تأكد حجزك», or «${SEATS_GONE}» with a hint to look at the other options.` }, async (page) => {
          const sheet = page.getByRole("dialog");
          const won = sheet.getByRole("status").getByText("تأكد حجزك");
          const lost = sheet.getByRole("alert").filter({ hasText: SEATS_GONE });
          const full = sheet.getByText("ما في كراسي فاضية بهالسيارة هلأ");
          await won.or(lost).or(full).first().waitFor({ timeout: 30_000 });
          rider.won = await won.isVisible();
          rider.lost = !rider.won;
          // Give a message that is about to be replaced the time to be replaced.
          await page.waitForTimeout(1500);
          if (rider.lost && !(await lost.isVisible())) throw new Error(`the rider lost the race for the seats, but the sheet does not say «${SEATS_GONE}»; it only says «ما في كراسي فاضية بهالسيارة هلأ»`);
        });
      }
      group.forEach((r) => (r.broken = false));

      await sim.step("booking.first-wins", driver, { title, repro: [...repro, "Sign in as driver 2 and open «اليوم»"], expected: `Exactly ${winnersExpected} booking(s) are confirmed (${winnersExpected * seatsEach} of ${capacity} seats), every other rider saw «${SEATS_GONE}», the vehicle is never oversold, and the driver's list shows only the riders who got seats.` }, async (page) => {
        const winners = group.filter((r) => r.won);
        if (winners.length !== winnersExpected) throw new Error(`${group.length} riders asked for ${seatsEach} seat(s) each on ${capacity} free seats: ${winners.length} were confirmed, expected ${winnersExpected}`);
        const free = await freeSeats(sim, driver);
        if (free !== capacity - winners.length * seatsEach) throw new Error(`/api/sync says ${free} free seats; it should be ${capacity - winners.length * seatsEach}`);
        const held = (await myBookings(sim, driver)).filter((b) => b.status === "confirmed" && !b.completedAt).reduce((sum, b) => sum + b.seats, 0);
        if (held > capacity) throw new Error(`oversold: live bookings hold ${held} seats on a vehicle with ${capacity}`);
        for (const loser of group.filter((r) => r.lost)) {
          const mine = (await myBookings(sim, loser)).find((b) => b.driverId === driver.userId);
          if (mine && mine.status !== "rejected") throw new Error(`rider ${loser.n} was told the seats were gone, but the server holds his booking as ${mine.status}`);
        }
        // Wherever the sheet left him, the loser's own list must say why.
        const loser = group.find((r) => r.lost);
        if (loser) {
          await loser.page.goto(`${sim.base}/trips`);
          await loser.page.locator("main ul > li").filter({ hasText: SEATS_GONE }).first().waitFor({ timeout: 30_000 });
        }
        await page.goto(`${sim.base}/driver`);
        await page.getByRole("heading", { name: "ركّاب اليوم" }).waitFor();
        await page.locator("main ul > li").first().waitFor();
        const rows = await page.locator("main ul > li").count();
        if (rows !== winners.length) throw new Error(`the driver's list shows ${rows} riders; ${winners.length} got seats`);
        driver.winners = winners.map((r) => r.n);
      });
      driver.broken = false;
    };
    await overbook();
  },
};

export default booking;
