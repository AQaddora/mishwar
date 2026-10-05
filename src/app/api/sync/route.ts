// GET /api/sync?since=<cursor>: see src/server/sync.ts. Open to guests: it is public data.
import { getCurrentUser } from "@/lib/session";
import { buildSyncResponse, parseCursor } from "@/server/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const since = parseCursor(new URL(request.url).searchParams.get("since"));
  const user = await getCurrentUser();
  return Response.json(await buildSyncResponse(user, since), { headers: { "Cache-Control": "no-store" } });
}
