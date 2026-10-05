// Finds a Chromium to drive, without downloading anything when one is already there:
// SIM_CHROME, then the browser playwright-core expects, then any Chromium that
// Playwright cached earlier, then the Chrome installed on the machine.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright-core";

const exists = (p) => Boolean(p) && fs.existsSync(p);

function cachedChromium() {
  const roots = [
    process.env.PLAYWRIGHT_BROWSERS_PATH,
    path.join(os.homedir(), ".cache", "ms-playwright"),
    path.join(os.homedir(), "Library", "Caches", "ms-playwright"),
    path.join(os.homedir(), "AppData", "Local", "ms-playwright"),
  ].filter(exists);
  const binaries = ["chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win/chrome.exe"];
  const macApps = ["chrome-mac", "chrome-mac-arm64", "chrome-mac-x64"].flatMap((d) => [
    `${d}/Chromium.app/Contents/MacOS/Chromium`,
    `${d}/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  ]);
  for (const root of roots) {
    const builds = fs.readdirSync(root).filter((d) => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const build of builds) {
      for (const bin of [...binaries, ...macApps]) {
        const candidate = path.join(root, build, bin);
        if (exists(candidate)) return candidate;
      }
    }
  }
  return null;
}

const SYSTEM_CHROME = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
];

export async function launchBrowser({ headed = false } = {}) {
  let bundled = null;
  try {
    bundled = chromium.executablePath();
  } catch {
    /* playwright-core has no browser of its own installed */
  }
  const executablePath = [process.env.SIM_CHROME, bundled, cachedChromium(), ...SYSTEM_CHROME].find(exists);
  if (!executablePath) {
    throw new Error(
      "No Chrome or Chromium found. Install Google Chrome, or run:  npx playwright-core install chromium\n" +
        "(or point SIM_CHROME at a Chrome/Chromium binary).",
    );
  }
  return chromium.launch({ executablePath, headless: !headed });
}
