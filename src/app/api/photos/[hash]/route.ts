// GET /api/photos/<hash>: the URL carries the content hash, so the answer never changes
// and phones may cache it forever.
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ hash: string }> }): Promise<Response> {
  const { hash } = await params;
  if (!/^[0-9a-f]{16,64}$/.test(hash)) return new Response("Not Found", { status: 404 });
  const photo = await prisma.photo.findFirst({ where: { hash }, select: { mime: true, bytes: true } });
  if (!photo) return new Response("Not Found", { status: 404 });
  return new Response(new Uint8Array(photo.bytes), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      // The QA seed's placeholder is an SVG: never let an image run anything.
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}
