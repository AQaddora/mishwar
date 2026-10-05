// One handler per outbox kind. Later milestones add their kinds to this map.
// Each handler checks the actor's role itself and throws Reject with an Arabic message.
import { prisma } from "@/lib/prisma";
import { getPlace, placeName } from "@/lib/places";
import {
  inMaintenance,
  isRunning,
  toRouteStops,
  validateMaintenance,
  validateSchedule,
  validateStops,
  validateVehicle,
  type ScheduleDayInput,
  type VehicleType,
} from "@/lib/driver-rules";
import { gazaNow } from "@/lib/time";
import { bookingHandlers, completeBookedRiders, recheckDriverBookings, startBookedRiders } from "@/server/booking-handlers";
import { Reject, type Actor, type Handler } from "@/server/outbox";
import { requestHandlers } from "@/server/request-handlers";

function requireDriver(actor: Actor) {
  if (actor.role !== "driver") throw new Reject("not_driver", "هاد للسوّاقين بس");
}

function check(message: string | null) {
  if (message) throw new Reject("invalid", message);
}

const vehicleSave: Handler = async (actor, p) => {
  requireDriver(actor);
  check(validateVehicle({ type: p.type, seats: p.seats }));
  const data = { type: p.type as VehicleType, seats: p.seats as number };
  const vehicle = await prisma.vehicle.upsert({
    where: { driverId: actor.id },
    update: data,
    create: { driverId: actor.id, ...data },
  });
  return { id: vehicle.id };
};

const maintenanceSet: Handler = async (actor, p) => {
  requireDriver(actor);
  const from = (p.from ?? null) as string | null;
  const until = (p.until ?? null) as string | null;
  check(validateMaintenance({ from, until }));
  // Riders booked on days the vehicle is now out are cancelled and told why.
  return prisma.$transaction(async (tx) => {
    const done = await tx.vehicle.updateMany({
      where: { driverId: actor.id },
      data: { maintenanceFrom: from, maintenanceUntil: from ? until : null },
    });
    if (done.count === 0) throw new Reject("no_vehicle", "سجّل سيارتك أول");
    return { cancelled: await recheckDriverBookings(tx, actor.id) };
  });
};

const photoRemove: Handler = async (actor, p) => {
  requireDriver(actor);
  await prisma.photo.deleteMany({ where: { hash: String(p.hash), vehicle: { driverId: actor.id } } });
  // Touch the vehicle, so the next sync tells phones its photo list changed.
  await prisma.vehicle.updateMany({ where: { driverId: actor.id }, data: { updatedAt: new Date() } });
  return null;
};

const routeSave: Handler = async (actor, p) => {
  requireDriver(actor);
  const id = String(p.id ?? "");
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) throw new Reject("invalid", "الخط مش مزبوط");
  check(validateStops(p.stops, (placeId) => getPlace(placeId) !== undefined));
  const stops = p.stops as string[];
  const typed = typeof p.name === "string" ? p.name.trim().slice(0, 60) : "";
  const name = typed || `${placeName(stops[0])} ← ${placeName(stops[stops.length - 1])}`;

  await prisma.$transaction(async (tx) => {
    const existing = await tx.route.findUnique({ where: { id } });
    if (existing && (existing.driverId !== actor.id || existing.deletedAt)) {
      throw new Reject("not_yours", "الخط مش من خطوطك");
    }
    const hasDefault = await tx.route.count({ where: { driverId: actor.id, isDefault: true, deletedAt: null } });
    if (existing) {
      await tx.routeStop.deleteMany({ where: { routeId: id } });
      await tx.route.update({ where: { id }, data: { name, stops: { create: toRouteStops(stops) } } });
    } else {
      // The first route a driver saves is their default.
      await tx.route.create({
        data: { id, driverId: actor.id, name, isDefault: hasDefault === 0, stops: { create: toRouteStops(stops) } },
      });
    }
  });
  return { id };
};

async function ownRoute(actor: Actor, id: unknown) {
  const route = await prisma.route.findFirst({ where: { id: String(id), driverId: actor.id, deletedAt: null } });
  if (!route) throw new Reject("not_yours", "الخط مش من خطوطك");
  return route;
}

const routeSetDefault: Handler = async (actor, p) => {
  requireDriver(actor);
  const route = await ownRoute(actor, p.id);
  // Exactly one default: clear the others and set this one together.
  await prisma.$transaction([
    prisma.route.updateMany({ where: { driverId: actor.id, isDefault: true }, data: { isDefault: false } }),
    prisma.route.update({ where: { id: route.id }, data: { isDefault: true } }),
  ]);
  return null;
};

const routeDelete: Handler = async (actor, p) => {
  requireDriver(actor);
  const route = await ownRoute(actor, p.id);
  if (route.isDefault) throw new Reject("is_default", "هاد خطك الأساسي. اختار خط أساسي ثاني قبل ما تمسحه");
  // Days that used this route fall back to the default route.
  await prisma.$transaction([
    prisma.scheduleDay.updateMany({ where: { driverId: actor.id, routeId: route.id }, data: { routeId: null } }),
    prisma.route.update({ where: { id: route.id }, data: { deletedAt: new Date() } }),
  ]);
  return null;
};

const scheduleSave: Handler = async (actor, p) => {
  requireDriver(actor);
  const routes = await prisma.route.findMany({ where: { driverId: actor.id, deletedAt: null }, select: { id: true } });
  check(validateSchedule(p.days, routes.map((r) => r.id)));
  const days = p.days as ScheduleDayInput[];
  // A change that hits existing bookings cancels them, frees the seats and tells each rider.
  return prisma.$transaction(async (tx) => {
    for (const d of days) {
      const data = { working: d.working, startTime: d.startTime, endTime: d.endTime, routeId: d.routeId ?? null };
      await tx.scheduleDay.upsert({
        where: { driverId_weekday: { driverId: actor.id, weekday: d.weekday } },
        update: data,
        create: { driverId: actor.id, weekday: d.weekday, ...data },
      });
    }
    return { cancelled: await recheckDriverBookings(tx, actor.id) };
  });
};

// «ابدأ الرحلة»: opens the driver's trip. One open trip per driver: starting again while
// one is open returns the open one. The route is today's route from the schedule, or the
// default route when the driver starts outside the schedule.
const tripStart: Handler = async (actor, p) => {
  requireDriver(actor);
  const id = String(p.id ?? "");
  if (!/^[0-9a-f-]{16,64}$/i.test(id)) throw new Reject("invalid", "الرحلة مش مزبوطة");
  const now = gazaNow();
  const [vehicle, routes, schedule, open] = await Promise.all([
    prisma.vehicle.findUnique({ where: { driverId: actor.id } }),
    prisma.route.findMany({ where: { driverId: actor.id, deletedAt: null }, select: { id: true, isDefault: true } }),
    prisma.scheduleDay.findMany({ where: { driverId: actor.id } }),
    prisma.trip.findFirst({ where: { driverId: actor.id, endedAt: null } }),
  ]);
  if (open) return { id: open.id };
  if (!vehicle) throw new Reject("no_vehicle", "سجّل سيارتك أول");
  if (inMaintenance(vehicle, now.day)) throw new Reject("maintenance", "السيارة بالتصليح");
  const state = isRunning({ vehicle, schedule, routes }, now);
  const routeId = state.running ? state.routeId : routes.find((r) => r.isDefault)?.id;
  if (!routeId) throw new Reject("no_route", "ضيف خط عشان تبلّش");
  // Locked until every rider due on this trip is ready or cancelled. Riders who are ready
  // are on the trip from this moment, and any location sharing with them ends.
  await prisma.$transaction(async (tx) => {
    await tx.trip.create({ data: { id, driverId: actor.id, routeId, day: now.day } });
    await startBookedRiders(tx, actor.id, id, now);
  });
  return { id };
};

// «خلّصت الرحلة»: closes the trip and deletes the vehicle's position. No history is kept.
const tripEnd: Handler = async (actor) => {
  requireDriver(actor);
  await prisma.$transaction(async (tx) => {
    await completeBookedRiders(tx, actor.id);
    await tx.trip.updateMany({ where: { driverId: actor.id, endedAt: null }, data: { endedAt: new Date() } });
    await tx.vehiclePosition.deleteMany({ where: { vehicle: { driverId: actor.id } } });
  });
  return null;
};

export const handlers: Record<string, Handler> = {
  ...bookingHandlers,
  ...requestHandlers,
  "trip.start": tripStart,
  "trip.end": tripEnd,
  "vehicle.save": vehicleSave,
  "maintenance.set": maintenanceSet,
  "photo.remove": photoRemove,
  "route.save": routeSave,
  "route.setDefault": routeSetDefault,
  "route.delete": routeDelete,
  "schedule.save": scheduleSave,
};
