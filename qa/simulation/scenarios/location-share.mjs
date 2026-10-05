// The driver asks two riders where they are. One says yes: he sees a "you are sharing"
// banner, and the driver sees his point with its age. One says no: the driver sees
// nothing. (That sharing ends when the trip starts is checked in the trip scenario.)
import { myBookings, riderRow } from "../lib/ui.mjs";

const locationShare = {
  name: "location-share",
  needs: ["driver-setup", "driving", "booking"],
  async run(sim) {
    const driver = await sim.person("driver", 1);
    const yes = await sim.person("rider", 1);
    const no = sim.counts.riders >= 2 ? await sim.person("rider", 2) : null;
    if (!yes.booked) return sim.skip("location-share.ask", "Driver asks a rider for his location", "rider 1 has no booking with driver 1", driver.label);
    const asked = [yes, no].filter((r) => r?.booked);
    // The rider stands at the stop he booked from: its exact OpenStreetMap point.
    const standsAt = (n) => sim.place(sim.city.bookings.main[(n - 1) % sim.city.bookings.main.length].from);

    await sim.step("location-share.ask", driver, { title: "Driver asks riders for their location", repro: ["Sign in as driver 1 with booked riders", "Open «اليوم»", `Tap «اطلب موقع الراكب» on ${asked.map((r) => `«محاكاة-${r.n}»`).join(" and ")}`], expected: "Each row says «مستنيين الراكب يوافق». Nothing about where the rider is yet." }, async (page) => {
      await page.goto(`${sim.base}/driver`);
      for (const rider of asked) {
        const row = riderRow(page, rider.n);
        await row.getByRole("button", { name: "اطلب موقع الراكب" }).click();
        await row.getByText("مستنيين الراكب يوافق").waitFor();
      }
      const shares = (await myBookings(sim, driver)).map((b) => b.share).filter(Boolean);
      if (shares.some((s) => s.lat !== undefined)) throw new Error("the driver's data holds a rider position before any rider said yes");
    });
    if (driver.broken) return void (driver.broken = false);

    await sim.step("location-share.yes", yes, { title: "Rider agrees to share his location for this trip", repro: ["Sign in as rider 1 after the driver asked", "Open the home screen", "Tap «جاوب» on «السوّاق … بيطلب يشوف موقعك»", "Tap «آه، شارك» and allow location"], expected: "The sheet asks «بدك تشارك موقعك مع السوّاق لهاي الرحلة؟». After yes, a banner says «عم تشارك موقعك مع السوّاق …» with «وقّف المشاركة»." }, async (page) => {
      const stop = standsAt(1);
      await yes.context.setGeolocation({ latitude: stop.lat, longitude: stop.lon, accuracy: 15 });
      await page.goto(sim.base);
      await page.getByText("بيطلب يشوف موقعك").waitFor({ timeout: 30_000 });
      await page.getByRole("button", { name: "جاوب" }).click();
      const sheet = page.getByRole("dialog", { name: "مشاركة موقعك" });
      await sheet.getByText("بدك تشارك موقعك مع السوّاق لهاي الرحلة؟").waitFor();
      await sheet.getByRole("button", { name: "آه، شارك" }).click();
      await page.getByText(/عم تشارك موقعك مع السوّاق/).first().waitFor();
      await page.getByRole("button", { name: "وقّف المشاركة" }).waitFor();
      yes.sharing = true;
    });
    yes.broken = false;

    if (no?.booked) {
      await sim.step("location-share.no", no, { title: "Rider refuses to share his location", repro: ["Sign in as rider 2 after the driver asked", "Open the home screen", "Tap «جاوب», then «لا»"], expected: "No sharing banner. The ask is gone. The booking itself is untouched." }, async (page) => {
        await page.goto(sim.base);
        await page.getByText("بيطلب يشوف موقعك").waitFor({ timeout: 30_000 });
        await page.getByRole("button", { name: "جاوب" }).click();
        await page.getByRole("dialog", { name: "مشاركة موقعك" }).getByRole("button", { name: "لا", exact: true }).click();
        await page.getByText("بيطلب يشوف موقعك").waitFor({ state: "detached" });
        if ((await page.getByText(/عم تشارك موقعك/).count()) > 0) throw new Error("the rider said no, and the screen says he is sharing his location");
        const mine = (await myBookings(sim, no)).find((b) => b.share);
        if (mine?.status !== "confirmed") throw new Error("saying no to the location ask changed the booking");
      });
      no.broken = false;
    }

    await sim.step("location-share.driver-sees", driver, { title: "Driver sees only the rider who said yes", repro: ["Sign in as driver 1 after rider 1 said yes and rider 2 said no", "Open «اليوم»", "Tap «وين الراكب؟» on rider 1"], expected: "Rider 1: «الراكب عم يشارك موقعه · آخر مكان …», and a map with his point and its age. Rider 2: «الراكب ما وافق يشارك موقعه», no map button, no position anywhere." }, async (page) => {
      const row = riderRow(page, 1);
      // The rider's phone sends its first point a moment after the yes.
      for (let attempt = 0; ; attempt++) {
        await page.goto(`${sim.base}/driver`);
        if (await row.getByText(/الراكب عم يشارك موقعه · آخر مكان/).waitFor({ timeout: 8000 }).then(() => true, () => false)) break;
        if (attempt >= 5) throw new Error("rider 1 said yes and keeps the app open, but the driver's list never shows «الراكب عم يشارك موقعه · آخر مكان …»");
      }
      await row.getByRole("button", { name: "وين الراكب؟" }).click();
      const sheet = page.getByRole("dialog", { name: "وين الراكب؟" });
      await sheet.locator(".leaflet-marker-icon").first().waitFor();
      await sheet.getByText(/آخر مكان/).waitFor();
      const bookings = await myBookings(sim, driver);
      const stop = standsAt(1);
      const shared = bookings.find((b) => b.name === "محاكاة-1" && b.share)?.share;
      if (!shared || Math.abs(shared.lat - stop.lat) > 1e-4 || Math.abs(shared.lon - stop.lon) > 1e-4) throw new Error(`the driver's data does not hold rider 1's point at ${stop.nameAr}`);
      await sheet.getByRole("button", { name: "سكّر" }).last().click();
      if (no?.booked) {
        const refused = riderRow(page, 2);
        await refused.getByText("الراكب ما وافق يشارك موقعه").waitFor();
        if ((await refused.getByRole("button", { name: "وين الراكب؟" }).count()) > 0) throw new Error("rider 2 said no, but the driver has a «وين الراكب؟» button for him");
        if (bookings.find((b) => b.name === "محاكاة-2" && b.share)?.share.lat !== undefined) throw new Error("rider 2 said no, but the driver's data holds a position for him");
      }
    });
    driver.broken = false;
  },
};

export default locationShare;
