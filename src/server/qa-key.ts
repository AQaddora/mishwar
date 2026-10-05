// The extra lock on the QA-only routes. With QA_LOGIN_KEY unset (Fleet QA on a private
// port) every caller passes. With it set (a QA copy reachable from the internet) the
// request must carry the same value as ?key=… or in the x-qa-key header.
import { createHash, timingSafeEqual } from "node:crypto";

export function qaKeyOk(request: Request): boolean {
  const expected = process.env.QA_LOGIN_KEY;
  if (!expected) return true;
  const given = new URL(request.url).searchParams.get("key") ?? request.headers.get("x-qa-key") ?? "";
  // Hash both sides so the comparison takes the same time whatever the lengths are.
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}
