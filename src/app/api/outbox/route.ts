// POST /api/outbox: every write in the app. See src/server/outbox.ts.
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { handlers } from "@/server/handlers";
import { isEntry, MAX_BATCH_BYTES, processEntries, type ProcessedStore } from "@/server/outbox";

export const dynamic = "force-dynamic";

const store: ProcessedStore = {
  async find(userId, id) {
    const row = await prisma.outboxEntry.findUnique({ where: { id } });
    // Another account's id is treated as unseen; saving it would then fail, which is right.
    return row && row.userId === userId ? { status: row.status, result: row.result } : null;
  },
  async save(userId, entry) {
    await prisma.outboxEntry.create({
      data: { id: entry.id, userId, kind: entry.kind, status: entry.status, result: entry.result as Prisma.InputJsonValue },
    });
  },
};

export async function POST(request: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "signed_out" }, { status: 401 });

  const text = await request.text();
  if (Buffer.byteLength(text) > MAX_BATCH_BYTES) return Response.json({ error: "too_large" }, { status: 413 });
  let body: { entries?: unknown };
  try {
    body = JSON.parse(text);
  } catch {
    return Response.json({ error: "bad_json" }, { status: 400 });
  }
  if (!Array.isArray(body.entries) || !body.entries.every(isEntry)) {
    return Response.json({ error: "bad_entries" }, { status: 400 });
  }

  const results = await processEntries({ id: user.id, role: user.role }, body.entries, handlers, store);
  return Response.json({ results });
}
