// Read GIT_REV at request time, not at build time.
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ ok: true, commit: process.env.GIT_REV ?? null });
}
