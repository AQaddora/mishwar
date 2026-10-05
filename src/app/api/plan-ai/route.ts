// POST /api/plan-ai — the optional AI step of the planner. Without ANTHROPIC_API_KEY it
// is a plain 404, exactly like a route that doesn't exist. See src/server/plan-ai.ts.

// Read the key on every request, never at build time.
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!process.env.ANTHROPIC_API_KEY) return new Response("Not Found", { status: 404 });

  const { MAX_TEXT, explainOptions, parseRequest, underLimit, validateExplain } = await import("@/server/plan-ai");
  const raw = await request.text().catch(() => "");
  if (raw.length > 4000) return new Response(null, { status: 413 });
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  if (!underLimit()) return Response.json({ ok: false }, { status: 429 });

  if (typeof body.text === "string") {
    if (body.text.length > MAX_TEXT) return new Response(null, { status: 413 });
    const parsed = await parseRequest(body.text);
    return Response.json(parsed ? { ok: true, ...parsed } : { ok: false });
  }
  const input = validateExplain(body.explain);
  if (!input) return new Response(null, { status: 400 });
  const text = await explainOptions(input);
  return Response.json(text ? { ok: true, text } : { ok: false });
}
