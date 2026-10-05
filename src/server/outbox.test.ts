import { describe, expect, it, vi } from "vitest";
import { isEntry, processEntries, Reject, type Actor, type Handler, type ProcessedStore } from "./outbox";

function memoryStore(): ProcessedStore {
  const rows = new Map<string, { status: string; result: unknown }>();
  return {
    find: async (userId, id) => rows.get(`${userId}:${id}`) ?? null,
    save: async (userId, entry) => void rows.set(`${userId}:${entry.id}`, { status: entry.status, result: entry.result }),
  };
}

const driver: Actor = { id: "user-driver", role: "driver" };
const entry = (id: string, kind = "seat.take", accountId = driver.id) => ({ id, kind, accountId, payload: { n: 1 } });
const ID_1 = "11111111-1111-4111-8111-111111111111";
const ID_2 = "22222222-2222-4222-8222-222222222222";

describe("processEntries: each entry is applied exactly once", () => {
  it("applies a new entry and returns the handler's result", async () => {
    const handler: Handler = vi.fn(async () => ({ seat: 3 }));
    const results = await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, memoryStore());
    expect(results).toEqual([{ id: ID_1, status: "applied", result: { seat: 3 } }]);
  });

  it("a replay returns the original result as a duplicate and never runs the handler again", async () => {
    const handler: Handler = vi.fn(async () => ({ seat: 3 }));
    const store = memoryStore();
    await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store);
    const again = await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store);
    expect(again).toEqual([{ id: ID_1, status: "duplicate", result: { seat: 3 } }]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("a rejection is remembered too, with its message", async () => {
    const handler: Handler = vi.fn(async () => {
      throw new Reject("seats_gone", "الكراسي خلصت قبل ما يوصل طلبك");
    });
    const store = memoryStore();
    const first = await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store);
    const again = await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store);
    expect(first[0]).toMatchObject({ status: "rejected", reason: "seats_gone" });
    expect(again[0]).toEqual(first[0]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("an unexpected error is not stored, so the phone can retry", async () => {
    const handler = vi
      .fn<Handler>()
      .mockRejectedValueOnce(new Error("database down"))
      .mockResolvedValueOnce({ ok: true });
    const store = memoryStore();
    await expect(processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store)).rejects.toThrow("database down");
    const retry = await processEntries(driver, [entry(ID_1)], { "seat.take": handler }, store);
    expect(retry[0].status).toBe("applied");
  });

  it("never applies another account's entry", async () => {
    const handler: Handler = vi.fn(async () => null);
    const results = await processEntries(driver, [entry(ID_1, "seat.take", "user-someone-else")], { "seat.take": handler }, memoryStore());
    expect(results[0]).toMatchObject({ status: "rejected", reason: "wrong_account" });
    expect(handler).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind, including names from Object.prototype", async () => {
    const results = await processEntries(driver, [entry(ID_1, "nope"), entry(ID_2, "constructor")], {}, memoryStore());
    expect(results.map((r) => r.reason)).toEqual(["unknown_kind", "unknown_kind"]);
  });

  it("keeps the order of the batch", async () => {
    const seen: string[] = [];
    const handler: Handler = async (_actor, payload) => void seen.push(String(payload.tag));
    await processEntries(
      driver,
      [
        { ...entry(ID_1), payload: { tag: "first" } },
        { ...entry(ID_2), payload: { tag: "second" } },
      ],
      { "seat.take": handler },
      memoryStore(),
    );
    expect(seen).toEqual(["first", "second"]);
  });
});

describe("isEntry", () => {
  it("needs an id, a kind, an account and an object payload", () => {
    expect(isEntry(entry(ID_1))).toBe(true);
    expect(isEntry({ ...entry(ID_1), id: "x" })).toBe(false);
    expect(isEntry({ ...entry(ID_1), payload: null })).toBe(false);
    expect(isEntry(null)).toBe(false);
  });
});
