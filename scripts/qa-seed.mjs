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

// More demo drivers, so the rider's map shows a real street: other vehicle types, other
// real roads. Each is on the road right now (an open trip) with a position that sits
// exactly on one of its own stops (the stop's OSM coordinates, never a typed number).
// `ageMinutes` is how old that position is when the seed runs; one is stale on purpose.
export const SEED_FLEET = [
  {
    email: "qa-driver-2@mishwar.test",
    name: "أبو خالد تجريبي",
    phone: "0590000003",
    vehicle: { type: "car", seats: 4 },
    label: "سيارة · ٤ كراسي",
    colour: "#1F5FA8",
    tripId: "00000000-0000-4000-8000-0000000000a2",
    // Far down his road, so the planner has a real wait to show at a change stop.
    at: { stop: 5, ageMinutes: 0 },
    route: {
      id: "00000000-0000-4000-8000-000000000002",
      name: "خط الرشيد (البحر)",
      stops: [
        "node/504259697", // مخيّم الشاطئ
        "node/11300367246", // الرمال الجنوبي
        "node/11300345272", // الشيخ عجلين
        "node/8236983638", // الزهراء
        "node/505021826", // النصيرات
        "node/505041386", // مخيّم دير البلح
        "node/11408821425", // المواصي
      ],
    },
  },
  {
    email: "qa-driver-3@mishwar.test",
    name: "أبو سامي تجريبي",
    phone: "0590000004",
    vehicle: { type: "bus", seats: 20 },
    label: "باص · ٢٠ كرسي",
    colour: "#8A4B00",
    tripId: "00000000-0000-4000-8000-0000000000a3",
    at: { stop: 1, ageMinutes: 1 },
    route: {
      id: "00000000-0000-4000-8000-000000000003",
      name: "خط جباليا - الزيتون",
      stops: [
        "node/3007045042", // جباليا
        "node/773667482", // الشيخ رضوان
        "node/11300372873", // الرمال الشمالي
        "node/11300367246", // الرمال الجنوبي: shared with خط الرشيد, so riders can change here
        "node/504266619", // غزة
        "node/11300200739", // الصبرة
        "node/11298850625", // الزيتون
      ],
    },
  },
  {
    email: "qa-driver-4@mishwar.test",
    name: "أبو يوسف تجريبي",
    phone: "0590000005",
    vehicle: { type: "car", seats: 6 },
    label: "سيارة · ٦ كراسي",
    colour: "#6B2C91",
    tripId: "00000000-0000-4000-8000-0000000000a4",
    at: { stop: 3, ageMinutes: 8 },
    route: {
      id: "00000000-0000-4000-8000-000000000004",
      name: "خط رفح - خان يونس",
      stops: [
        "node/322022888", // رفح
        "node/354672871", // النصر
        "node/8237038221", // الفخاري
        "node/329769893", // بني سهيلا
        "node/299944872", // خان يونس
      ],
    },
  },
];

// An obviously fake photo: a flat colour and the words «صورة تجريبية». Never a stock image.
const placeholderSvg = (colour, label) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="800" height="600">
<rect width="800" height="600" fill="${colour}"/>
<text x="400" y="290" text-anchor="middle" font-family="sans-serif" font-size="72" font-weight="700" fill="#FFFFFF" direction="rtl">صورة تجريبية</text>
<text x="400" y="370" text-anchor="middle" font-family="sans-serif" font-size="36" fill="#FFFFFF" direction="rtl">${label}</text>
</svg>`;
const PLACEHOLDER_SVG = placeholderSvg("#0A7D5A", "عجلة · ١٠ كراسي");

const ALL_DAY = { working: true, startTime: "00:00", endTime: "23:59", routeId: null };
const profile = ({ email, ...rest }) => ({ where: { email }, update: rest, create: { email, ...rest } });

async function savePhoto(vehicleId, svg) {
  const bytes = Buffer.from(svg);
  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  await prisma.photo.upsert({
    where: { vehicleId_hash: { vehicleId, hash } },
    update: {},
    create: { vehicleId, hash, mime: "image/svg+xml", bytes },
  });
}

async function saveRoute(driverId, route) {
  const stops = route.stops.map((placeId, position) => ({ position, placeId }));
  await prisma.$transaction([
    prisma.routeStop.deleteMany({ where: { routeId: route.id } }),
    prisma.route.updateMany({ where: { driverId, id: { not: route.id } }, data: { isDefault: false } }),
    prisma.route.upsert({
      where: { id: route.id },
      update: { name: route.name, isDefault: true, deletedAt: null, stops: { create: stops } },
      create: { id: route.id, driverId, name: route.name, isDefault: true, stops: { create: stops } },
    }),
  ]);
}

async function saveWeek(driverId) {
  for (let weekday = 1; weekday <= 7; weekday++) {
    await prisma.scheduleDay.upsert({
      where: { driverId_weekday: { driverId, weekday } },
      update: ALL_DAY,
      create: { driverId, weekday, ...ALL_DAY },
    });
  }
}

const gazaDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Gaza" }).format(new Date());

// One demo driver who is on the road: vehicle, photo, route, week, open trip, position.
async function seedFleetDriver(d) {
  const driver = await prisma.user.upsert(profile({ email: d.email, name: d.name, phone: d.phone, role: "driver" }));
  const vehicle = await prisma.vehicle.upsert({
    where: { driverId: driver.id },
    update: { ...d.vehicle, maintenanceFrom: null, maintenanceUntil: null },
    create: { driverId: driver.id, ...d.vehicle },
  });
  await savePhoto(vehicle.id, placeholderSvg(d.colour, d.label));
  await saveRoute(driver.id, d.route);
  await saveWeek(driver.id);
  await prisma.trip.upsert({
    where: { id: d.tripId },
    update: { endedAt: null, routeId: d.route.id, day: gazaDay() },
    create: { id: d.tripId, driverId: driver.id, routeId: d.route.id, day: gazaDay() },
  });
  const place = gazetteer.places.find((p) => p.id === d.route.stops[d.at.stop]);
  const position = { lat: place.lat, lon: place.lon, speed: null, at: new Date(Date.now() - d.at.ageMinutes * 60_000) };
  await prisma.vehiclePosition.upsert({ where: { vehicleId: vehicle.id }, update: position, create: { vehicleId: vehicle.id, ...position } });
}

async function main() {
  for (const id of [SEED_ROUTE, ...SEED_FLEET.map((d) => d.route)].flatMap((r) => r.stops)) {
    if (!known.has(id)) throw new Error(`seed stop ${id} is not in data/gazetteer.json`);
  }

  const driver = await prisma.user.upsert(profile(DRIVER));
  await prisma.user.upsert(profile(RIDER));

  const vehicle = await prisma.vehicle.upsert({
    where: { driverId: driver.id },
    update: { type: "ajala", seats: 10, maintenanceFrom: null, maintenanceUntil: null },
    create: { driverId: driver.id, type: "ajala", seats: 10 },
  });
  await savePhoto(vehicle.id, PLACEHOLDER_SVG);
  await saveRoute(driver.id, SEED_ROUTE);
  // Working every day, all day, on the default route: the demo drivers must be running
  // whenever Fleet QA takes its screenshots, at any hour.
  await saveWeek(driver.id);
  // The driver Fleet QA signs in as is NOT on a trip: his «أنا سايق» screen shows the
  // start button, and on the rider's map he is the "running, no position yet" case.
  await prisma.trip.updateMany({ where: { driverId: driver.id, endedAt: null }, data: { endedAt: new Date() } });
  await prisma.vehiclePosition.deleteMany({ where: { vehicleId: vehicle.id } });

  for (const d of SEED_FLEET) await seedFleetDriver(d);
  console.log(`qa:seed done: demo driver (ajala, 10 seats, photo, route, week), ${SEED_FLEET.length} drivers on the road, demo rider`);
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
