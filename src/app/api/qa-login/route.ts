// GET /api/qa-login?role=driver|rider — Fleet QA only. Without QA_MODE=1 it is a plain 404.
// No static imports: nothing loads, and nothing runs, unless QA mode is on.

// Read QA_MODE on every request, never at build time.
export const dynamic = "force-dynamic";

const DEMO = {
  driver: { email: "qa-driver@mishwar.test", name: "سوّاق تجريبي", phone: "0590000001" },
  rider: { email: "qa-rider@mishwar.test", name: "راكب تجريبي", phone: "0590000002" },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function GET(request: Request): Promise<Response> {
  if (process.env.QA_MODE !== "1") return new Response("Not Found", { status: 404 });

  const role = new URL(request.url).searchParams.get("role");
  if (role !== "driver" && role !== "rider") {
    return new Response("role must be driver or rider", { status: 400 });
  }

  const { prisma } = await import("@/lib/prisma");
  const demo = DEMO[role];
  const user = await prisma.user.upsert({
    where: { email: demo.email },
    update: { role, name: demo.name, phone: demo.phone },
    create: { email: demo.email, role, name: demo.name, phone: demo.phone },
  });

  // The same session Auth.js makes for a real login: a database row plus its cookie.
  const sessionToken = crypto.randomUUID();
  const expires = new Date(Date.now() + DAY_MS);
  await prisma.session.create({ data: { sessionToken, userId: user.id, expires } });

  // Auth.js picks secure cookies the same way: x-forwarded-proto first, then the URL.
  const proto = request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol;
  const secure = proto.replace(/:$/, "") === "https";
  const name = secure ? "__Secure-authjs.session-token" : "authjs.session-token";
  const cookie = [
    `${name}=${sessionToken}`,
    "Path=/",
    `Expires=${expires.toUTCString()}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(secure ? ["Secure"] : []),
  ].join("; ");

  console.log(`QA MODE: signed in demo ${role}`);
  // Home sends a driver on to /driver.
  return new Response(null, { status: 303, headers: { Location: "/", "Set-Cookie": cookie } });
}
