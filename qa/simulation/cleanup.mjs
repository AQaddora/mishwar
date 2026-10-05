#!/usr/bin/env node
// Removes everything the simulation created (the users sim-…@mishwar.test and all that
// belongs to them) from the QA copy at SIM_BASE_URL. Nobody else's data is touched.
const base = (process.env.SIM_BASE_URL || "https://mishwar-sim.apps.taqat.academy").replace(/\/$/, "");
const key = process.env.SIM_KEY || "";
const response = await fetch(`${base}/api/qa-cleanup`, { method: "POST", headers: key ? { "x-qa-key": key } : {} }).catch((error) => ({ ok: false, status: String(error) }));
if (!response.ok) {
  console.error(`cleanup failed: ${base}/api/qa-cleanup answered ${response.status}. It exists only on a QA copy (QA_MODE=1); if that copy has a QA_LOGIN_KEY, set SIM_KEY to it.`);
  process.exit(1);
}
const removed = await response.json();
console.log(`removed from ${base}: ${removed.users} simulated users (${removed.vehicles} vehicles, ${removed.routes} routes, ${removed.trips} trips, ${removed.bookings ?? 0} bookings, and everything else that was theirs)`);
