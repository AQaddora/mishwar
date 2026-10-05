// Before the trip, the driver confirms every rider: call, then ready, or not ready and
// cancel. «ابدأ الرحلة» stays locked until all are decided. Starting the trip ends any
// location sharing. Ending it completes the riders' bookings. By the end of this scenario
// every driver has finished his trips, so the day is over.
import { myBookings, riderRow } from "../lib/ui.mjs";

const trip = {
  name: "trip",
  needs: ["driver-setup", "driving", "booking", "location-share"],
  async run(sim) {
    const driver = await sim.person("driver", 1);
    const riders = [];
    for (let n = 1; n <= Math.min(sim.counts.riders, 3); n++) riders.push(await sim.person("rider", n));
    const [r1, r2, r3] = riders;
    const start = (page) => page.getByRole("button", { name: "ابدأ الرحلة" });
    const call = (row) => row.getByRole("link", { name: /اتصل بالراكب/ }).click({ noWaitAfter: true });
    const who = "Sign in as driver 1 with booked riders and open «اليوم»";

    if (!r1?.booked) sim.skip("trip.ready", "Driver confirms a rider is ready", "rider 1 has no booking with driver 1", driver.label);
    else {
      if (r3?.booked) {
        await sim.step("trip.call-first", driver, { title: "A rider can be cancelled as not ready only after a call", repro: [who, "Look at rider 3 before tapping «اتصل بالراكب»"], expected: "No «مش جاهز، الغي الحجز» button yet; the row says «اتصل فيه أول…». After the call tap, the button appears." }, async (page) => {
          await page.goto(`${sim.base}/driver`);
          const row = riderRow(page, 3);
          await row.getByText("اتصل فيه أول").waitFor();
          if ((await row.getByRole("button", { name: "مش جاهز، الغي الحجز" }).count()) > 0) throw new Error("«مش جاهز، الغي الحجز» is offered before the driver called the rider");
          await call(row);
          await row.getByRole("button", { name: "مش جاهز، الغي الحجز" }).waitFor();
        });
        driver.broken = false;
      }

      await sim.step("trip.ready", driver, { title: "Driver confirms a rider is ready; start stays locked for the rest", repro: [who, "On rider 1: tap «اتصل بالراكب», then «جاهز»"], expected: "Rider 1's row says «جاهز». While other riders are undecided, «ابدأ الرحلة» is still locked." }, async (page) => {
        await page.goto(`${sim.base}/driver`);
        const row = riderRow(page, 1);
        await call(row);
        // The call is recorded and the row redraws (the cancel button appears beside
        // «جاهز»). A person taps after that, not in the same instant.
        await row.getByRole("button", { name: "مش جاهز، الغي الحجز" }).waitFor();
        await row.getByRole("button", { name: "جاهز", exact: true }).click();
        await row.getByText("جاهز", { exact: true }).waitFor();
        await row.getByRole("button", { name: "جاهز", exact: true }).waitFor({ state: "detached" });
        if ([r2, r3].some((r) => r?.booked) && (await start(page).isEnabled())) throw new Error("«ابدأ الرحلة» unlocked while a rider is still neither ready nor cancelled");
        r1.ready = true;
      });
      driver.broken = false;

      if (r3?.booked) {
        await sim.step("trip.not-ready", driver, { title: "Driver cancels a rider who is not ready", repro: [who, "On rider 3: tap «اتصل بالراكب», then «مش جاهز، الغي الحجز»"], expected: "Rider 3's row says «انلغى حجزه» and his phone number is gone. His seat is free again." }, async (page) => {
          const row = riderRow(page, 3);
          await row.getByRole("button", { name: "مش جاهز، الغي الحجز" }).click();
          await row.getByText("انلغى حجزه").waitFor();
          if (/05\d{8}/.test(await row.innerText())) throw new Error("the booking is cancelled, but the driver still sees the rider's phone number");
          r3.booked = false;
          r3.notReady = true;
        });
        driver.broken = false;
        if (r3.notReady) {
          await sim.step("trip.rider-told", r3, { title: "The cancelled rider is told why", repro: ["Sign in as rider 3 after the driver cancelled him as not ready", "Open the home screen"], expected: "«السوّاق لغى حجزك: اتصل فيك وما كنت جاهز» on the home screen and on the booking in «رحلاتي»." }, async (page) => {
            await page.goto(sim.base);
            await page.getByText("السوّاق لغى حجزك: اتصل فيك وما كنت جاهز").first().waitFor({ timeout: 30_000 });
            await page.goto(`${sim.base}/trips`);
            await page.getByText("السوّاق لغى حجزك: اتصل فيك وما كنت جاهز").first().waitFor();
          });
          r3.broken = false;
        }
      }

      if (r2?.booked) {
        await sim.step("trip.ready", driver, { title: "Driver confirms the last rider; start unlocks", repro: [who, "On rider 2: tap «جاهز»"], expected: "Every rider is ready or cancelled, so «ابدأ الرحلة» is enabled and «ضل ركّاب ما تأكدت منهم» is gone." }, async (page) => {
          const row = riderRow(page, 2);
          await row.getByRole("button", { name: "جاهز", exact: true }).click();
          await row.getByRole("button", { name: "جاهز", exact: true }).waitFor({ state: "detached" });
          await page.getByText("ضل ركّاب ما تأكدت منهم").waitFor({ state: "detached" });
          if (!(await start(page).isEnabled())) throw new Error("every rider is decided, but «ابدأ الرحلة» is still locked");
          r2.ready = true;
        });
        driver.broken = false;
      }

      await sim.step("trip.rider-ready-notice", r1, { title: "The rider sees that the driver confirmed him", repro: ["Sign in as rider 1 after the driver tapped «جاهز»", "Open the home screen"], expected: "«السوّاق أكّد إنك جاهز» with the journey." }, async (page) => {
        await page.goto(sim.base);
        await page.getByText(/السوّاق أكّد إنك جاهز/).first().waitFor({ timeout: 30_000 });
      });
      r1.broken = false;

      await sim.step("trip.start", driver, { title: "Driver starts the trip with his confirmed riders", repro: [who, "Confirm or cancel every rider", "Tap «ابدأ الرحلة»"], expected: "The driving screen opens («خلّي مِشوار مفتوح…», then «الركّاب شايفينك»)." }, async (page) => {
        const stop = sim.place(sim.routeFor(1).stops[0].id);
        await driver.context.setGeolocation({ latitude: stop.lat, longitude: stop.lon, accuracy: 10 });
        await page.goto(`${sim.base}/driver`);
        await start(page).click();
        await page.waitForURL(/\/driver\/drive/);
        await page.getByText("خلّي مِشوار مفتوح").waitFor();
        await page.getByText("الركّاب شايفينك").waitFor({ timeout: 30_000 });
        driver.driving = true;
      });

      if (driver.driving) {
        await sim.step("trip.share-ended", r1, { title: "Location sharing ends by itself when the trip starts", repro: ["Rider 1 said yes to the driver's location ask", "The driver taps «ابدأ الرحلة»", "As rider 1 open the home screen; as driver 1 open «اليوم»"], expected: "Rider: no «عم تشارك موقعك» banner any more, and the booking says «الرحلة بلّشت». Driver: no «وين الراكب؟» button and no rider position in his data." }, async (page) => {
          await page.goto(`${sim.base}/trips`);
          await page.locator("main ul > li").filter({ hasText: "الرحلة بلّشت" }).first().waitFor({ timeout: 30_000 });
          await page.goto(sim.base);
          await page.getByRole("heading", { name: "شغّالين هلأ" }).waitFor();
          if (await page.getByText(/عم تشارك موقعك/).first().waitFor({ state: "detached", timeout: 20_000 }).then(() => false, () => true)) throw new Error("the trip started, but the rider's screen still says he is sharing his location");
          const held = (await myBookings(sim, driver)).filter((b) => b.share && (b.share.lat !== undefined || b.share.lon !== undefined));
          if (held.length > 0) throw new Error(`the trip started, but the driver's data still holds a position for ${held.length} rider(s)`);
          const driverPage = await driver.context.newPage();
          try {
            await driverPage.goto(`${sim.base}/driver`);
            await riderRow(driverPage, 1).getByText("معك بالرحلة").waitFor();
            if ((await driverPage.getByRole("button", { name: "وين الراكب؟" }).count()) > 0) throw new Error("the trip started, but the driver still has a «وين الراكب؟» button");
          } finally {
            await driverPage.close();
          }
        });
        r1.broken = false;

        await sim.step("trip.end", driver, { title: "Driver ends the trip", repro: ["Sign in as driver 1 on an open trip with riders", "Open «أنا سايق»", "Tap «خلّصت الرحلة»"], expected: "Back to «ابدأ الرحلة». His riders' bookings are complete and their seats are free again." }, async (page) => {
          await page.goto(`${sim.base}/driver/drive`);
          await page.getByRole("button", { name: "خلّصت الرحلة" }).click();
          await page.getByRole("button", { name: "ابدأ الرحلة" }).waitFor();
          const mine = await myBookings(sim, driver);
          const open = mine.filter((b) => b.startedAt && !b.completedAt);
          if (open.length > 0) throw new Error(`the trip ended, but ${open.length} of its bookings are not complete`);
          if (!mine.some((b) => b.completedAt)) throw new Error("the trip ended, but the driver has no completed booking");
          driver.driving = false;
        });

        await sim.step("trip.completed", r1, { title: "The rider's booking shows the trip is over", repro: ["Sign in as rider 1 after the driver ended the trip", "Open «رحلاتي»"], expected: "The booking says «خلصت الرحلة», with no call button and no cancel button." }, async (page) => {
          await page.goto(`${sim.base}/trips`);
          const card = page.locator("main ul > li").filter({ hasText: "خلصت الرحلة" }).first();
          await card.waitFor({ timeout: 30_000 });
          if ((await card.getByRole("link", { name: "اتصل بالسوّاق" }).count()) > 0) throw new Error("the trip is over, but the rider still has the driver's call button");
        });
        r1.broken = false;
      }
      driver.broken = false;
    }

    // ---- Driver 2 takes the riders who won his seats: ready, start, end.
    const second = sim.counts.drivers >= 2 ? await sim.person("driver", 2) : null;
    if (second?.winners?.length) {
      await sim.step("trip.second-driver", second, { title: "A full vehicle: confirm every rider, drive, finish", repro: ["Sign in as driver 2 with a full vehicle", "Open «اليوم», tap «جاهز» on every rider", "Tap «ابدأ الرحلة», then «خلّصت الرحلة» on the driving screen"], expected: "The trip starts only after the last «جاهز»; ending it completes every booking and frees all seats." }, async (page) => {
        const stop = sim.place(sim.routeFor(2).stops[0].id);
        await second.context.setGeolocation({ latitude: stop.lat, longitude: stop.lon, accuracy: 10 });
        await page.goto(`${sim.base}/driver`);
        for (const n of second.winners) {
          if (await start(page).isEnabled()) throw new Error("«ابدأ الرحلة» unlocked before every rider was confirmed");
          const ready = riderRow(page, n).getByRole("button", { name: "جاهز", exact: true });
          await ready.click();
          await ready.waitFor({ state: "detached" });
        }
        await start(page).click();
        await page.waitForURL(/\/driver\/drive/);
        await page.getByRole("button", { name: "خلّصت الرحلة" }).click();
        await page.getByRole("button", { name: "ابدأ الرحلة" }).waitFor();
        const sync = await sim.api(second, "/api/sync");
        const vehicle = sync.changes.vehicles.find((v) => v.driverId === second.userId);
        if (vehicle.free !== vehicle.seats) throw new Error(`the trip is over, but the vehicle shows ${vehicle.free} free of ${vehicle.seats} seats`);
        const done = (sync.changes.bookings ?? []).filter((b) => b.completedAt).length;
        if (done !== second.winners.length) throw new Error(`${second.winners.length} riders rode, but ${done} bookings are complete`);
      });
      second.broken = false;
    }

    // ---- End of the day: everyone still on the road finishes.
    for (let n = 3; n <= sim.counts.drivers; n++) {
      const other = await sim.person("driver", n);
      if (!other.driving) continue;
      await sim.step("trip.end-of-day", other, { title: "Driver finishes his day", repro: [`Sign in as driver ${n} on an open trip`, "Open «أنا سايق»", "Tap «خلّصت الرحلة»"], expected: "Back to «ابدأ الرحلة»; the vehicle leaves the map." }, async (page) => {
        await page.goto(`${sim.base}/driver/drive`);
        await page.getByRole("button", { name: "خلّصت الرحلة" }).click();
        await page.getByRole("button", { name: "ابدأ الرحلة" }).waitFor();
        other.driving = false;
      });
      other.broken = false;
    }
  },
};

export default trip;
