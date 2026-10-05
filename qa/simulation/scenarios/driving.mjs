// Every driver who finished his setup opens «أنا سايق» and starts a trip. His phone's
// GPS is faked to the exact OpenStreetMap point of one of his own stops.
const driving = {
  name: "driving",
  needs: ["driver-setup"],
  async run(sim) {
    for (let n = 1; n <= sim.counts.drivers; n++) {
      const driver = await sim.person("driver", n);
      if (!driver.ready) {
        sim.skip("driving.start-trip", "Driver starts a trip and his position reaches riders", "this driver's setup did not finish", driver.label);
        continue;
      }
      const route = sim.routeFor(n);
      const stop = sim.place(route.stops[(n - 1) % route.stops.length].id);
      const who = `Sign in as driver ${n} with a finished setup`;

      await sim.step("driving.start-trip", driver, { title: "Driver starts a trip and his position reaches riders", repro: [who, "Open «اليوم» then «أنا سايق»", "Allow location", "Tap «ابدأ الرحلة» and keep the screen open"], expected: "«خلّي مِشوار مفتوح…» then «الركّاب شايفينك»; the server holds one fresh position for this vehicle." }, async (page) => {
        await driver.context.setGeolocation({ latitude: stop.lat, longitude: stop.lon, accuracy: 10 });
        await page.goto(`${sim.base}/driver/drive`);
        const start = page.getByRole("button", { name: "ابدأ الرحلة" });
        const end = page.getByRole("button", { name: "خلّصت الرحلة" });
        await start.or(end).first().waitFor();
        if (await start.isVisible()) await start.click(); // a trip left open by an earlier run stays open
        await page.getByText("خلّي مِشوار مفتوح").waitFor();
        await page.getByText("الركّاب شايفينك").waitFor({ timeout: 30_000 });
        const sync = await sim.api(driver, "/api/sync");
        const vehicle = sync.changes.vehicles.find((v) => v.driverId === driver.userId);
        const near = sync.changes.positions.find((p) => p.id === vehicle?.id);
        if (!near) throw new Error("no position for this vehicle in /api/sync after the driving screen said riders can see it");
        if (Math.abs(near.lat - stop.lat) > 1e-4 || Math.abs(near.lon - stop.lon) > 1e-4) throw new Error(`the position in /api/sync is not at ${stop.nameAr}, where the phone's GPS is`);
        const age = Date.parse(sync.serverTime) - Date.parse(near.at);
        if (age > 60_000) throw new Error(`the position in /api/sync is ${Math.round(age / 1000)}s old right after it was sent`);
        driver.driving = true;
      });
      driver.broken = false;
    }
  },
};

export default driving;
