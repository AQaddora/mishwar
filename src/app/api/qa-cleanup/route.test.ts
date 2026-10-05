import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const db = vi.hoisted(() => ({
  findMany: vi.fn(async () => [{ id: "u1" }, { id: "u2" }]),
  deleteMany: vi.fn(async () => ({ count: 2 })),
  count: vi.fn(async () => 1),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: db.findMany, deleteMany: db.deleteMany },
    vehicle: { count: db.count },
    route: { count: db.count },
    trip: { count: db.count },
    booking: { count: db.count },
  },
}));

const original = { mode: process.env.QA_MODE, key: process.env.QA_LOGIN_KEY };
afterEach(() => {
  for (const [name, value] of [["QA_MODE", original.mode], ["QA_LOGIN_KEY", original.key]] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  vi.clearAllMocks();
});

const call = (query = "") => POST(new Request(`http://localhost/api/qa-cleanup${query}`, { method: "POST" }));

describe("POST /api/qa-cleanup", () => {
  it("is a 404 when QA_MODE is not set, and deletes nothing", async () => {
    delete process.env.QA_MODE;
    expect((await call()).status).toBe(404);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("is a 404 without the key when QA_LOGIN_KEY is set", async () => {
    process.env.QA_MODE = "1";
    process.env.QA_LOGIN_KEY = "s3cret";
    expect((await call()).status).toBe(404);
    expect((await call("?key=wrong")).status).toBe(404);
    expect(db.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes only users whose email is sim-…@mishwar.test", async () => {
    process.env.QA_MODE = "1";
    delete process.env.QA_LOGIN_KEY;
    const res = await call();
    expect(res.status).toBe(200);
    expect(db.findMany).toHaveBeenCalledWith({
      where: { email: { startsWith: "sim-", endsWith: "@mishwar.test" } },
      select: { id: true },
    });
    expect(db.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ["u1", "u2"] } } });
    expect(await res.json()).toMatchObject({ ok: true, users: 2, bookings: 1 });
  });
});
