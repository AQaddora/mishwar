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

// M5: bookings, so the driver's pre-trip check and the rider's «رحلاتي» have something to
// show. All between @mishwar.test users, with obviously fake phones.
const RIDER_2 = { email: "qa-rider-2@mishwar.test", name: "سامر تجريبي", phone: "0590000006", role: "rider" };
export const SEED_BOOKINGS = {
  // The demo rider on the demo driver's route: confirmed, and the driver has asked for his location.
  first: { id: "00000000-0000-4000-8000-0000000000b1", share: "00000000-0000-4000-8000-0000000000c1", from: 0, to: 4, seats: 2 },
  // A second rider on the same route: already called, and sharing his location.
  second: { id: "00000000-0000-4000-8000-0000000000b2", share: "00000000-0000-4000-8000-0000000000c2", from: 2, to: 6, seats: 1 },
  // The demo rider on the bus, which is on the road with a fresh position.
  bus: { id: "00000000-0000-4000-8000-0000000000b3", from: 3, to: 6, seats: 1 },
  // The demo rider's cancelled booking, with its reason.
  cancelled: { id: "00000000-0000-4000-8000-0000000000b4", from: 0, to: 4, seats: 1 },
};

// M6: special requests, so both sides of «طلب خاص» have something to show: an open
// request with two offers and a short chat, an agreed trip on each side, and an open
// request the demo driver has not answered. Real gazetteer places, @mishwar.test users.
const U = (n) => `00000000-0000-4000-8000-0000000000${n}`;
export const SEED_REQUESTS = [
  // The demo rider's open request: two offers to compare, and a chat with the demo driver.
  {
    id: U("d1"), rider: RIDER.email, from: "node/299944872" /* خان يونس */, to: "node/504266619" /* غزة */, inDays: 1, time: "15:00", seats: 3, note: "معنا شنطتين كبار", status: "open",
    offers: [
      { id: U("e1"), driver: DRIVER.email, price: 6000, status: "sent", chat: [
        ["rider", U("f1"), "مرحبا، بتقدر تاخدنا من عند الدوّار؟"],
        ["driver", U("f2"), "أهلين، آه أكيد. الساعة ثلاثة بكون عندكم."],
        ["rider", U("f3"), "تمام. والشنط إلها مكان؟"],
        ["driver", U("f4"), "ولا يهمك، العجلة واسعة وبتوسع الكل."],
      ] },
      { id: U("e2"), driver: "qa-driver-2@mishwar.test", price: 5000, status: "sent", chat: [] },
    ],
  },
  // The demo rider's agreed trip: he took the bus driver's offer; the demo driver's was declined.
  {
    id: U("d2"), rider: RIDER.email, from: "node/505035532" /* دير البلح */, to: "node/322022888" /* رفح */, inDays: 1, time: "09:00", seats: 2, status: "accepted",
    offers: [
      { id: U("e3"), driver: "qa-driver-3@mishwar.test", price: 4000, status: "accepted", chat: [] },
      { id: U("e4"), driver: DRIVER.email, price: 4500, status: "declined", chat: [] },
    ],
  },
  // The second rider's open request: nobody has offered yet.
  { id: U("d3"), rider: RIDER_2.email, from: "node/3007045042" /* جباليا */, to: "node/505021826" /* النصيرات */, inDays: 2, time: "07:30", seats: 4, status: "open", offers: [] },
  // The second rider took the demo driver's offer: the driver's agreed private trip.
  {
    id: U("d4"), rider: RIDER_2.email, from: "node/505015391" /* البريج */, to: "node/504266619" /* غزة */, inDays: 1, time: "11:00", seats: 1, status: "accepted",
    offers: [{ id: U("e5"), driver: DRIVER.email, price: 3500, status: "accepted", chat: [] }],
  },
];

// M7: finished trips and ratings, so history, the star sheet and the averages have
// something to show. Yesterday: the demo driver's ended trip carried the demo rider (who
// rated him; the driver has not rated back) and the second rider (rated by the driver),
// and the demo rider finished a private trip with أبو خالد that he has not rated yet.
// Older: a few rated trips on the other drivers, so their cards show an average.
const RIDER_3 = { email: "qa-rider-3@mishwar.test", name: "منى تجريبي", phone: "0590000007", role: "rider" };
export const SEED_HISTORY = {
  trip: U("a5"),
  demoRider: { id: U("b5"), from: 0, to: 6, seats: 1 },
  secondRider: { id: U("b6"), from: 2, to: 4, seats: 2 },
  privateTrip: { request: U("d5"), offer: U("e6"), driver: "qa-driver-2@mishwar.test", from: "node/504266619" /* غزة */, to: "node/505035532" /* دير البلح */, time: "17:30", seats: 2, price: 4500 },
  ratings: { riderOnTrip: U("71"), driverOnSecond: U("72") },
  // [fleet index, trip id, [booking id, rating id, rider email, stars, comment]...]
  fleet: [
    [0, U("a6"), [[U("b7"), U("73"), RIDER.email, 5, "سيارة نظيفة ووصلنا عالوقت"], [U("b8"), U("74"), RIDER_2.email, 4, null], [U("b9"), U("75"), RIDER_3.email, 5, null]]],
    [1, U("a7"), [[U("ba"), U("76"), RIDER_2.email, 4, null], [U("bb"), U("77"), RIDER_3.email, 5, "الله يعطيه العافية"]]],
    [2, U("a8"), [[U("bc"), U("78"), RIDER.email, 3, null], [U("bd"), U("79"), RIDER_3.email, 4, null]]],
  ],
};

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

async function seedBookings(driverId) {
  const rider = await prisma.user.findUniqueOrThrow({ where: { email: RIDER.email } });
  const rider2 = await prisma.user.upsert(profile(RIDER_2));
  const day = gazaDay();
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Gaza", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
  const fleet = async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const fresh = { calledAt: null, readyAt: null, tripId: null, startedAt: null, completedAt: null, offRouteNotifiedAt: null, cancelReason: null };
  const save = async (b, riderId, drvId, route, extra) => {
    const data = { riderId, driverId: drvId, routeId: route.id, day, time, fromPosition: b.from, toPosition: b.to, fromPlaceId: route.stops[b.from], toPlaceId: route.stops[b.to], seats: b.seats, status: "confirmed", ...fresh, ...extra };
    await prisma.booking.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  };
  const B = SEED_BOOKINGS;
  await save(B.first, rider.id, driverId, SEED_ROUTE, {});
  await save(B.second, rider2.id, driverId, SEED_ROUTE, { calledAt: new Date() });
  await save(B.bus, rider.id, await fleet(SEED_FLEET[1].email), SEED_FLEET[1].route, {});
  await save(B.cancelled, rider.id, await fleet(SEED_FLEET[2].email), SEED_FLEET[2].route, { status: "cancelled", cancelReason: "rider_not_ready", calledAt: new Date() });

  // Location asks: one waiting for the demo rider's answer (the consent sheet), one the
  // second rider said yes to, standing at his own boarding stop (its OSM coordinates).
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  const open = { bookingId: B.first.id, riderId: rider.id, askedAt: new Date(), expiresAt, answer: null, endedAt: null, endReason: null, lat: null, lon: null, at: null };
  await prisma.locationShare.upsert({ where: { id: B.first.share }, update: open, create: { id: B.first.share, ...open } });
  const stop = gazetteer.places.find((p) => p.id === SEED_ROUTE.stops[B.second.from]);
  const yes = { bookingId: B.second.id, riderId: rider2.id, askedAt: new Date(), expiresAt, answer: "yes", endedAt: null, endReason: null, lat: stop.lat, lon: stop.lon, at: new Date() };
  await prisma.locationShare.upsert({ where: { id: B.second.share }, update: yes, create: { id: B.second.share, ...yes } });
  // Free seats travel with the vehicle: touch them so phones get the new numbers.
  await prisma.vehicle.updateMany({ data: { updatedAt: new Date() } });
}

async function seedRequests() {
  const userId = async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  const plusDays = (n) => new Date(Date.parse(`${gazaDay()}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  for (const r of SEED_REQUESTS) {
    const riderId = await userId(r.rider);
    const data = { riderId, fromPlaceId: r.from, toPlaceId: r.to, day: plusDays(r.inDays), time: r.time, seats: r.seats, note: r.note ?? null, status: r.status, completedAt: null };
    await prisma.specialRequest.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
    for (const o of r.offers) {
      const driverId = await userId(o.driver);
      const offer = { requestId: r.id, driverId, priceAgorot: o.price, status: o.status };
      await prisma.offer.upsert({ where: { id: o.id }, update: offer, create: { id: o.id, ...offer } });
      for (const [i, [who, id, body]] of o.chat.entries()) {
        const message = { offerId: o.id, senderId: who === "rider" ? riderId : driverId, body, sentAt: new Date(Date.now() - (o.chat.length - i) * 3 * 60_000) };
        await prisma.message.upsert({ where: { id }, update: message, create: { id, ...message } });
      }
    }
  }
}

async function seedHistory(driverId) {
  const userId = async (email) => (await prisma.user.findUniqueOrThrow({ where: { email } })).id;
  await prisma.user.upsert(profile(RIDER_3));
  const H = SEED_HISTORY;
  const dayBack = (n) => new Date(Date.parse(`${gazaDay()}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);
  // Mid-morning Gaza time on that day, as real moments.
  const moment = (n, hour) => new Date(Date.parse(`${dayBack(n)}T00:00:00Z`) + (hour - 3) * 3_600_000);
  const endedTrip = async (id, drvId, route, n) => {
    const data = { driverId: drvId, routeId: route.id, day: dayBack(n), startedAt: moment(n, 8), endedAt: moment(n, 9.25) };
    await prisma.trip.upsert({ where: { id }, update: data, create: { id, ...data } });
  };
  const carried = async (b, riderId, drvId, route, tripId, n) => {
    const data = {
      riderId, driverId: drvId, routeId: route.id, day: dayBack(n), time: "08:00", fromPosition: b.from, toPosition: b.to,
      fromPlaceId: route.stops[b.from], toPlaceId: route.stops[b.to], seats: b.seats, status: "ready", cancelReason: null,
      calledAt: moment(n, 7.75), readyAt: moment(n, 7.8), tripId, startedAt: moment(n, 8), completedAt: moment(n, 9.25), offRouteNotifiedAt: null,
    };
    await prisma.booking.upsert({ where: { id: b.id }, update: data, create: { id: b.id, ...data } });
  };
  const rate = async (id, raterId, rateeId, target, stars, comment) => {
    const data = { raterId, rateeId, bookingId: null, requestId: null, ...target, stars, comment };
    await prisma.rating.upsert({ where: { id }, update: data, create: { id, ...data } });
  };
  const rider = await userId(RIDER.email);
  const rider2 = await userId(RIDER_2.email);

  await endedTrip(H.trip, driverId, SEED_ROUTE, 1);
  await carried(H.demoRider, rider, driverId, SEED_ROUTE, H.trip, 1);
  await carried(H.secondRider, rider2, driverId, SEED_ROUTE, H.trip, 1);
  await rate(H.ratings.riderOnTrip, rider, driverId, { bookingId: H.demoRider.id }, 5, "سوّاق محترم والعجلة مريحة");
  await rate(H.ratings.driverOnSecond, driverId, rider2, { bookingId: H.secondRider.id }, 4, "كان جاهز عالموقف");

  const P = H.privateTrip;
  const privateDriver = await userId(P.driver);
  const request = { riderId: rider, fromPlaceId: P.from, toPlaceId: P.to, day: dayBack(1), time: P.time, seats: P.seats, note: null, status: "accepted", completedAt: moment(1, 18.5) };
  await prisma.specialRequest.upsert({ where: { id: P.request }, update: request, create: { id: P.request, ...request } });
  const offer = { requestId: P.request, driverId: privateDriver, priceAgorot: P.price, status: "accepted" };
  await prisma.offer.upsert({ where: { id: P.offer }, update: offer, create: { id: P.offer, ...offer } });
  // Left unrated on purpose: this is the trip the star sheet is photographed on.
  await prisma.rating.deleteMany({ where: { requestId: P.request } });
  await prisma.rating.deleteMany({ where: { bookingId: H.demoRider.id, raterId: driverId } });

  for (const [index, tripId, riders] of H.fleet) {
    const d = SEED_FLEET[index];
    const drv = await userId(d.email);
    await endedTrip(tripId, drv, d.route, 3);
    for (const [bookingId, ratingId, email, stars, comment] of riders) {
      const who = await userId(email);
      await carried({ id: bookingId, from: 0, to: d.route.stops.length - 1, seats: 1 }, who, drv, d.route, tripId, 3);
      await rate(ratingId, who, drv, { bookingId }, stars, comment);
    }
  }
  // Averages travel with the vehicle: touch them so phones get the new numbers.
  await prisma.vehicle.updateMany({ data: { updatedAt: new Date() } });
}

async function main() {
  for (const id of [...[SEED_ROUTE, ...SEED_FLEET.map((d) => d.route)].flatMap((r) => r.stops), ...SEED_REQUESTS.flatMap((r) => [r.from, r.to]), SEED_HISTORY.privateTrip.from, SEED_HISTORY.privateTrip.to]) {
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
  await seedBookings(driver.id);
  await seedRequests();
  await seedHistory(driver.id);
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
