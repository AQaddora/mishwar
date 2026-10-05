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

afterEach(() => {
  if (original === undefined) delete process.env.QA_MODE;
  else process.env.QA_MODE = original;
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
});
