// GET /api/qa-login?role=driver|rider — Fleet QA only. Without QA_MODE=1 it is a plain 404.
// No static imports: nothing loads, and nothing runs, unless QA mode is on.

// Read QA_MODE on every request, never at build time.
export const dynamic = "force-dynamic";

const DEMO = {
  driver: { email: "qa-driver@mishwar.test", name: "سوّاق تجريبي", phone: "0590000001" },
  rider: { email: "qa-rider@mishwar.test", name: "راكب تجريبي", phone: "0590000002" },
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// The simulation (qa/simulation) needs many people: ?n=1..99 signs in a numbered one.
// Their emails start with "sim-", which is what /api/qa-cleanup removes, and their first
// name is «محاكاة-N», so nobody mistakes them for real people on a screen.
function simUser(role: "driver" | "rider", n: number) {
  const nn = String(n).padStart(2, "0");
  return role === "driver"
    ? { email: `sim-driver-${n}@mishwar.test`, name: `محاكاة-${n} (سوّاق)`, phone: `05900001${nn}` }
    : { email: `sim-rider-${n}@mishwar.test`, name: `محاكاة-${n} (راكب)`, phone: `05900002${nn}` };
}

export async function GET(request: Request): Promise<Response> {
  if (process.env.QA_MODE !== "1") return new Response("Not Found", { status: 404 });
  // A QA app on the public internet (the simulation's staging copy) sets QA_LOGIN_KEY.
  const { qaKeyOk } = await import("@/server/qa-key");
  if (!qaKeyOk(request)) return new Response("Not Found", { status: 404 });

  const params = new URL(request.url).searchParams;
  const role = params.get("role");
  if (role !== "driver" && role !== "rider") {
    return new Response("role must be driver or rider", { status: 400 });
  }
  const n = params.get("n");
  if (n !== null && !/^[1-9]\d?$/.test(n)) return new Response("n must be 1 to 99", { status: 400 });

  const { prisma } = await import("@/lib/prisma");
  const demo = n === null ? DEMO[role] : simUser(role, Number(n));
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
