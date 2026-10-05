// npm run qa:seed — idempotent demo data for Fleet QA and local work.
// Everything it creates belongs to users with @mishwar.test emails, so it is easy to
// recognise and to remove. Places are real rows of data/gazetteer.json (OSM ids).
import { createHash } from "node:crypto";
import fs from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const gazetteer = JSON.parse(fs.readFileSync(new URL("../data/gazetteer.json", import.meta.url), "utf8"));
const known = new Set(gazetteer.places.map((p) => p.id));

// Same demo users as /api/qa-login.
const DRIVER = { email: "qa-driver@mishwar.test", name: "سوّاق تجريبي", phone: "0590000001", role: "driver" };
const RIDER = { email: "qa-rider@mishwar.test", name: "راكب تجريبي", phone: "0590000002", role: "rider" };

// The demo driver's daily route, north to south along Salah al-Din Road.
// The list is also read by src/lib/seed-data.test.ts, which checks every id against the gazetteer.
export const SEED_ROUTE = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "خط صلاح الدين",
  stops: [
    "node/13354378801", // الشجاعية
    "node/11331930581", // مفترق نتساريم
    "node/505015391", // البريج
    "node/8237029171", // المغازي
    "node/505035532", // دير البلح
    "node/505115716", // القرارة
    "node/299944872", // خان يونس
  ],
};

// An obviously fake photo: a flat colour and the words «صورة تجريبية». Never a stock image.
const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect width="800" height="600" fill="#0A7D5A"/>
<text x="400" y="290" text-anchor="middle" font-family="sans-serif" font-size="72" font-weight="700" fill="#FFFFFF" direction="rtl">صورة تجريبية</text>
<text x="400" y="370" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#FFFFFF" direction="rtl">عجلة · ١٠ كراسي</text>
</svg>`;

async function main() {
  for (const id of SEED_ROUTE.stops) {
    if (!known.has(id)) throw new Error(`seed stop ${id} is not in data/gazetteer.json`);
  }

  const profile = ({ email, ...rest }) => ({ where: { email }, update: rest, create: { email, ...rest } });
  const driver = await prisma.user.upsert(profile(DRIVER));
  await prisma.user.upsert(profile(RIDER));

  const vehicle = await prisma.vehicle.upsert({
    where: { driverId: driver.id },
    update: { type: "ajala", seats: 10, maintenanceFrom: null, maintenanceUntil: null },
    create: { driverId: driver.id, type: "ajala", seats: 10 },
  });

  const bytes = Buffer.from(PLACEHOLDER_SVG);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  await prisma.photo.upsert({
    where: { vehicleId_hash: { vehicleId: vehicle.id, hash } },
    update: {},
    create: { vehicleId: vehicle.id, hash, mime: "image/svg+xml", bytes },
  });

  const stops = SEED_ROUTE.stops.map((placeId, position) => ({ position, placeId }));
  await prisma.$transaction([
    prisma.routeStop.deleteMany({ where: { routeId: SEED_ROUTE.id } }),
    prisma.route.updateMany({ where: { driverId: driver.id, id: { not: SEED_ROUTE.id } }, data: { isDefault: false } }),
    prisma.route.upsert({
      where: { id: SEED_ROUTE.id },
      update: { name: SEED_ROUTE.name, isDefault: true, deletedAt: null, stops: { create: stops } },
      create: { id: SEED_ROUTE.id, driverId: driver.id, name: SEED_ROUTE.name, isDefault: true, stops: { create: stops } },
    }),
  ]);

  // Working every day, all day, on the default route: the demo driver must be running
  // whenever Fleet QA takes its screenshots, at any hour.
  for (let weekday = 1; weekday <= 7; weekday++) {
    const data = { working: true, startTime: "00:00", endTime: "23:59", routeId: null };
    await prisma.scheduleDay.upsert({
      where: { driverId_weekday: { driverId: driver.id, weekday } },
      update: data,
      create: { driverId: driver.id, weekday, ...data },
    });
  }
  console.log("qa:seed done: demo driver (ajala, 10 seats, 1 photo, route, week) and demo rider");
}

// Only when run directly: the unit test imports SEED_ROUTE without touching a database.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main()
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
