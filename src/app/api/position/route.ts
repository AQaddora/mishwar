// POST /api/position: the driving screen's GPS point. Never through the outbox: a
// position that waited offline is stale, and a stale point is worse than none.
// Only the vehicle's own driver, only during an open trip. One row per vehicle,
// overwritten. Coordinates are never logged.
import { prisma } from "@/lib/prisma";
import { canWritePosition } from "@/lib/rider-rules";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const inRange = (n: unknown, min: number, max: number): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });

  let body: { lat?: unknown; lon?: unknown; speed?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!inRange(body.lat, -90, 90) || !inRange(body.lon, -180, 180)) {
    return Response.json({ error: "bad_position" }, { status: 400 });
  }
  const speed = inRange(body.speed, 0, 70) ? body.speed : null;

  const [vehicle, trip] = await Promise.all([
    prisma.vehicle.findUnique({ where: { driverId: user.id }, select: { id: true, driverId: true } }),
    prisma.trip.findFirst({ where: { driverId: user.id, endedAt: null }, select: { id: true } }),
  ]);
  const allowed = canWritePosition({ actorId: user.id, vehicleDriverId: vehicle?.driverId ?? null, hasOpenTrip: trip !== null });
  if (allowed !== "ok" || !vehicle) return Response.json({ error: allowed }, { status: 409 });

  const data = { lat: body.lat, lon: body.lon, speed, at: new Date() };
  await prisma.vehiclePosition.upsert({ where: { vehicleId: vehicle.id }, update: data, create: { vehicleId: vehicle.id, ...data } });
  return Response.json({ ok: true });
}
