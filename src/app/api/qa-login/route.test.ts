import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

// No database in unit tests: a stand-in for the two Prisma calls the route makes.
const db = vi.hoisted(() => ({
  upsert: vi.fn(async ({ create }: { create: { role: string } }) => ({ id: `demo-${create.role}` })),
  createSession: vi.fn(async () => ({})),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: { user: { upsert: db.upsert }, session: { create: db.createSession } },
}));

const original = process.env.QA_MODE;
const originalKey = process.env.QA_LOGIN_KEY;

afterEach(() => {
  if (original === undefined) delete process.env.QA_MODE;
  else process.env.QA_MODE = original;
  if (originalKey === undefined) delete process.env.QA_LOGIN_KEY;
  else process.env.QA_LOGIN_KEY = originalKey;
});

describe("GET /api/qa-login", () => {
  it("is a 404 when QA_MODE is not set", async () => {
    delete process.env.QA_MODE;
    const res = await GET(new Request("http://localhost/api/qa-login?role=driver"));
    expect(res.status).toBe(404);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("is a 404 when QA_MODE is anything other than 1", async () => {
    process.env.QA_MODE = "true";
    const res = await GET(new Request("http://localhost/api/qa-login?role=driver"));
    expect(res.status).toBe(404);
  });

  it("signs in the demo driver with a session cookie in QA mode", async () => {
    process.env.QA_MODE = "1";
    const res = await GET(new Request("http://localhost/api/qa-login?role=driver"));
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("/");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^authjs\.session-token=[^;]+; Path=\/;/);
    expect(cookie).toContain("HttpOnly");
    expect(db.createSession).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "demo-driver" }),
    });
  });

  it("rejects an unknown role with 400 in QA mode", async () => {
    process.env.QA_MODE = "1";
    const res = await GET(new Request("http://localhost/api/qa-login?role=bus"));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("signs in a numbered simulation user with ?n=", async () => {
    process.env.QA_MODE = "1";
    const res = await GET(new Request("http://localhost/api/qa-login?role=rider&n=7"));
    expect(res.status).toBe(303);
    expect(db.upsert).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { email: "sim-rider-7@mishwar.test" },
        create: expect.objectContaining({ role: "rider", phone: "0590000207" }),
      }),
    );
    expect((await GET(new Request("http://localhost/api/qa-login?role=rider&n=0"))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/qa-login?role=rider&n=100"))).status).toBe(400);
  });

  it("needs the key when QA_LOGIN_KEY is set, and is a plain 404 without it", async () => {
    process.env.QA_MODE = "1";
    process.env.QA_LOGIN_KEY = "s3cret";
    expect((await GET(new Request("http://localhost/api/qa-login?role=driver"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/api/qa-login?role=driver&key=nope"))).status).toBe(404);
    expect((await GET(new Request("http://localhost/api/qa-login?role=driver&key=s3cret"))).status).toBe(303);
  });
});
