// No internet: a rider still opens the app and sees the last-known vehicles; a driver's
// change is kept on the phone and sent when the network returns.
import { waitForServiceWorker } from "../lib/ui.mjs";

const offline = {
  name: "offline",
  needs: ["driver-setup", "driving"],
  async run(sim) {
    const rider = await sim.person("rider", 1);
    await sim.step("offline.rider-home", rider, { title: "Rider reopens the app with no internet", repro: ["Sign in as rider 1", "Open the home screen once with internet, wait for the vehicles", "Turn on airplane mode", "Reload the app"], expected: "The app opens: «ما في نت · آخر تحديث …» and the same vehicles as before." }, async (page) => {
      await sim.signIn(rider);
      await page.goto(sim.base);
      await page.getByRole("heading", { name: "شغّالين هلأ" }).waitFor();
      await page.locator("section button", { hasText: /كراسي|كرسي/ }).first().waitFor();
      const online = await page.locator("section button", { hasText: /كراسي|كرسي/ }).count();
      await waitForServiceWorker(page);
      await page.reload(); // one visit under the service worker, so the screen is on the phone
      await page.locator("section button", { hasText: /كراسي|كرسي/ }).first().waitFor();
      await rider.context.setOffline(true);
      try {
        await page.reload();
        await page.getByText(/ما في نت/).first().waitFor({ timeout: 45_000 });
        await page.locator("section button", { hasText: /كراسي|كرسي/ }).first().waitFor();
        const offline = await page.locator("section button", { hasText: /كراسي|كرسي/ }).count();
        if (offline < online) throw new Error(`online the home listed ${online} vehicles, offline it lists ${offline}`);
      } finally {
        await rider.context.setOffline(false);
      }
    });
    rider.broken = false;

    const driver = await sim.person("driver", 1);
    if (!driver.ready) return sim.skip("offline.driver-save", "Driver changes his seats with no internet", "driver 1's setup did not finish", driver.label);
    const seats = sim.city.vehicles[0].seats + 1;
    await sim.step("offline.driver-save", driver, { title: "Driver changes his seats with no internet", repro: ["Sign in as driver 1", "Open «سيارتي»", "Turn on airplane mode", `Change the seats to ${seats} and tap «احفظ»`, "Turn airplane mode off and wait"], expected: "«انحفظ على جوالك، ورح ينبعت أول ما يرجع النت» while offline; when the network returns it is sent by itself and a reload shows the new number." }, async (page) => {
      await page.goto(`${sim.base}/driver/vehicle`);
      await page.locator("#seats").waitFor();
      await driver.context.setOffline(true);
      try {
        await page.locator("#seats").fill(String(seats));
        await page.getByRole("button", { name: "احفظ", exact: true }).first().click();
        await page.getByText("انحفظ على جوالك").first().waitFor();
      } finally {
        await driver.context.setOffline(false);
      }
      await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await page.getByText(/محفوظة على جوالك/).waitFor({ state: "detached", timeout: 30_000 });
      await page.reload();
      const shown = await page.locator("#seats").inputValue();
      if (shown !== String(seats)) throw new Error(`after the network came back the seats field shows ${shown}, not ${seats}`);
      const sync = await sim.api(driver, "/api/sync");
      if (!sync.changes.vehicles.some((v) => v.driverId === driver.userId && v.seats === seats)) throw new Error("the server never got the seat change that was saved offline");
    });
    driver.broken = false;
  },
};

export default offline;
