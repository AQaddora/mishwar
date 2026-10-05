import { iconResponse } from "../mark";

// Rendered once at build time.
export const dynamic = "force-static";

export function GET() {
  return iconResponse(192, 0.75);
}
