import { iconResponse } from "../mark";

// Rendered once at build time.
export const dynamic = "force-static";

export function GET() {
  return iconResponse(512, 0.5);
}
