// POST /api/location-share: the rider's own position, for the driver of one booking.
// Accepted only after the rider said yes to THAT ask, and only until the trip starts or
// 15 minutes after the ask. Never through the outbox (a queued point is a stale point),
// never logged. One point per share, overwritten; deleted when sharing ends.
import { canWriteSharedPosition } from "@/lib/booking-rules";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const inRange = (n: unknown, min: number, max: number): n is number => typeof n === "number" && Number.isFinite(n) && n >= min && n <= max;

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  let body: { id?: unknown; lat?: unknown; lon?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (typeof body.id !== "string" || !inRange(body.lat, -90, 90) || !inRange(body.lon, -180, 180)) {
    return Response.json({ error: "bad_position" }, { status: 400 });
  }

  const share = await prisma.locationShare.findUnique({ where: { id: body.id }, include: { booking: { select: { startedAt: true, status: true, completedAt: true } } } });
  const now = Date.now();
  const allowed = canWriteSharedPosition({
    share,
    shareRiderId: share?.riderId ?? null,
    actorId: user.id,
    tripStarted: Boolean(share?.booking.startedAt) || (share ? share.booking.status === "cancelled" || share.booking.completedAt !== null : false),
    now,
  });
  if (allowed !== "ok" || !share) {
    // Over (expired, trip started, booking gone): make sure nothing of it is left behind.
    if (allowed === "ended" && share && !share.endedAt) {
      await prisma.locationShare.update({ where: { id: share.id }, data: { endedAt: new Date(), endReason: share.booking.startedAt ? "trip_started" : "expired", lat: null, lon: null, at: null } });
    }
    return Response.json({ error: allowed }, { status: 409 });
  }
  await prisma.locationShare.update({ where: { id: share.id }, data: { lat: body.lat, lon: body.lon, at: new Date() } });
  // Touch nothing else: the driver reads the point from his own sync.
  return Response.json({ ok: true });
}
