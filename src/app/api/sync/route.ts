// GET /api/sync?since=<cursor>: see src/server/sync.ts. Open to guests: it is public data.
// JSON by default. A phone that sends `Accept: application/octet-stream` gets the same
// response with the positions in binary (src/lib/position-codec.ts), gzipped when that
// is smaller: a vehicle on the road then costs ~7 bytes instead of ~45 gzipped.
import { gzipSync } from "node:zlib";
import { getCurrentUser } from "@/lib/session";
import { BINARY_TYPE, encodeSyncFrame, wantsBinary } from "@/lib/position-codec";
import { buildSync, parseCursor } from "@/server/sync";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const since = parseCursor(new URL(request.url).searchParams.get("since"));
  const user = await getCurrentUser();
  const { response, positions } = await buildSync(user, since);
  if (!wantsBinary(request)) {
    return Response.json(response, { headers: { "Cache-Control": "no-store", Vary: "Accept" } });
  }
  const frame = encodeSyncFrame(response, positions);
  const headers: Record<string, string> = { "Content-Type": BINARY_TYPE, "Cache-Control": "no-store", Vary: "Accept, Accept-Encoding" };
  // Next.js and nginx leave application/octet-stream uncompressed, so gzip here when it
  // helps: always for a first sync (names, routes), rarely for positions alone.
  if (/\bgzip\b/.test(request.headers.get("accept-encoding") ?? "")) {
    const zipped = gzipSync(frame);
    if (zipped.length < frame.length) {
      return new Response(new Uint8Array(zipped), { headers: { ...headers, "Content-Encoding": "gzip" } });
    }
  }
  return new Response(new Uint8Array(frame), { headers });
}
