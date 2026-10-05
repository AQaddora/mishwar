// POST /api/search-log — one anonymous row per planner search. The session is never
// read here and no header is stored: see src/server/search-log.ts for the whole row.
import { prisma } from "@/lib/prisma";
import { searchLogRow } from "@/server/search-log";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const text = await request.text().catch(() => "");
  if (text.length > 500) return new Response(null, { status: 413 });
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* handled below */
  }
  const row = searchLogRow(body);
  if (!row) return new Response(null, { status: 400 });
  await prisma.searchLog.create({ data: row });
  return new Response(null, { status: 204 });
}
