// POST /api/qa-cleanup — removes everything the simulation created. QA only: without
// QA_MODE=1 (and the key, when QA_LOGIN_KEY is set) it is a plain 404, like /api/qa-login.
// No static imports: nothing loads unless QA mode is on.

export const dynamic = "force-dynamic";

// Simulated people are exactly the users /api/qa-login?n=… creates. Nobody else matches.
export const SIM_EMAIL = { startsWith: "sim-", endsWith: "@mishwar.test" } as const;

export async function POST(request: Request): Promise<Response> {
  if (process.env.QA_MODE !== "1") return new Response("Not Found", { status: 404 });
  const { qaKeyOk } = await import("@/server/qa-key");
  if (!qaKeyOk(request)) return new Response("Not Found", { status: 404 });

  const { prisma } = await import("@/lib/prisma");
  const users = await prisma.user.findMany({ where: { email: SIM_EMAIL }, select: { id: true } });
  const ids = users.map((u) => u.id);
  // Every table that belongs to a user hangs off User with ON DELETE CASCADE (vehicle,
  // photos, routes, stops, schedule, trips, positions, outbox entries, sessions), so
  // deleting the users removes it all. A later table that does NOT cascade from User must
  // be deleted here first, before the users.
  const [vehicles, routes, trips] = await Promise.all([
    prisma.vehicle.count({ where: { driverId: { in: ids } } }),
    prisma.route.count({ where: { driverId: { in: ids } } }),
    prisma.trip.count({ where: { driverId: { in: ids } } }),
  ]);
  const deleted = await prisma.user.deleteMany({ where: { id: { in: ids } } });

  console.log(`QA MODE: cleanup removed ${deleted.count} simulated users`);
  return Response.json({ ok: true, users: deleted.count, vehicles, routes, trips });
}
