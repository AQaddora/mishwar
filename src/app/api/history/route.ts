// GET /api/history: the signed-in user's finished trips (see src/server/history.ts).
import { getCurrentUser } from "@/lib/session";
import { buildHistory } from "@/server/history";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user?.role) return Response.json({ error: "sign in first" }, { status: 401 });
  return Response.json(await buildHistory({ id: user.id, role: user.role }), { headers: { "Cache-Control": "no-store" } });
}
