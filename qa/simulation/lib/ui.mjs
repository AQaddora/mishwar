// Small helpers for things a person does on many screens.

/** Opens a place sheet with `open()`, types the name, taps the exact match. */
export async function pickPlace(page, open, name, searchBox = "#place-picker-search") {
  await open();
  const sheet = page.getByRole("dialog");
  await sheet.locator(searchBox).fill(name);
  await sheet.locator("li button").filter({ has: page.getByText(name, { exact: true }) }).first().click();
  await sheet.waitFor({ state: "detached" });
}

/**
 * A test photo, drawn in the browser so nothing is downloaded and nothing looks real:
 * a flat colour with «صورة محاكاة» and the label on it. Returns what setInputFiles takes.
 */
export async function makePhoto(page, label, colour = "#0A7D5A") {
  const base64 = await page.evaluate(
    ([text, fill]) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1200;
      canvas.height = 900;
      const c = canvas.getContext("2d");
      c.fillStyle = fill;
      c.fillRect(0, 0, 1200, 900);
      c.fillStyle = "#FFFFFF";
      c.textAlign = "center";
      c.direction = "rtl";
      c.font = "bold 110px sans-serif";
      c.fillText("صورة محاكاة", 600, 420);
      c.font = "60px sans-serif";
      c.fillText(text, 600, 540);
      return canvas.toDataURL("image/png").split(",")[1];
    },
    [label, colour],
  );
  return { name: "sim-photo.png", mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}

/** Waits until the service worker controls the page, so a reload can work offline. */
export async function waitForServiceWorker(page) {
  await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 20_000 });
}
