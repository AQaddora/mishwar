// What the driver's own screens read. Server only.
import { prisma } from "@/lib/prisma";
import { placeName } from "@/lib/places";
import type { ScheduleDayInput, VehicleType } from "@/lib/driver-rules";

export type DriverVehicle = {
  type: VehicleType;
  seats: number;
  maintenanceFrom: string | null;
  maintenanceUntil: string | null;
  photos: string[];
};
export type DriverRoute = { id: string; name: string; isDefault: boolean; stops: { placeId: string; name: string }[] };
export type DriverSetup = { vehicle: DriverVehicle | null; routes: DriverRoute[]; schedule: ScheduleDayInput[] };

export async function getDriverSetup(driverId: string): Promise<DriverSetup> {
  const [vehicle, routes, schedule] = await Promise.all([
    prisma.vehicle.findUnique({
      where: { driverId },
      select: {
        type: true,
        seats: true,
        maintenanceFrom: true,
        maintenanceUntil: true,
        photos: { select: { hash: true }, orderBy: { createdAt: "asc" } },
      },
    }),
    prisma.route.findMany({
      where: { driverId, deletedAt: null },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      select: { id: true, name: true, isDefault: true, stops: { orderBy: { position: "asc" }, select: { placeId: true } } },
    }),
    prisma.scheduleDay.findMany({
      where: { driverId },
      select: { weekday: true, working: true, startTime: true, endTime: true, routeId: true },
    }),
  ]);
  return {
    vehicle: vehicle && { ...vehicle, photos: vehicle.photos.map((p) => p.hash) },
    routes: routes.map((r) => ({
      ...r,
      stops: r.stops.map((s) => ({ placeId: s.placeId, name: placeName(s.placeId) })),
    })),
    schedule,
  };
}
