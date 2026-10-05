// POST /api/photos: one vehicle photo, already resized on the phone. Photos never ride
// in the outbox or in sync; the phone sends them from its own queue under the Wi-Fi rule.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { MAX_PHOTOS } from "@/lib/driver-rules";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = 600 * 1024;

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });
  if (user.role !== "driver") return Response.json({ error: "not_driver" }, { status: 403 });

  const bytes = Buffer.from(await request.arrayBuffer());
  // JPEG only: the phone always re-encodes to JPEG before queueing.
  const isJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isJpeg || bytes.length > MAX_BYTES) return Response.json({ error: "bad_photo" }, { status: 400 });

  const vehicle = await prisma.vehicle.findUnique({
    where: { driverId: user.id },
    select: { id: true, photos: { select: { hash: true } } },
  });
  // The vehicle itself may still be waiting in the outbox: the phone keeps the photo and retries.
  if (!vehicle) return Response.json({ error: "no_vehicle" }, { status: 409 });

  const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 32);
  if (vehicle.photos.some((p) => p.hash === hash)) return Response.json({ hash });
  if (vehicle.photos.length >= MAX_PHOTOS) return Response.json({ error: "too_many" }, { status: 422 });

  await prisma.photo.create({ data: { vehicleId: vehicle.id, hash, mime: "image/jpeg", bytes } });
  // Touch the vehicle, so the next sync tells phones about the new photo hash.
  await prisma.vehicle.update({ where: { id: vehicle.id }, data: { updatedAt: new Date() } });
  return Response.json({ hash });
}
