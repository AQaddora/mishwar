import { describe, expect, it } from "vitest";
import { SYNC_MESSAGES_PER_THREAD } from "@/lib/request-rules";
import { shapeRequest, type OfferRow, type RequestRow } from "./request-view";

const T = new Date("2026-10-05T08:00:00Z");
const RIDER_PHONE = "0590000002";
const offer = (n: number, patch: Partial<OfferRow> = {}): OfferRow => ({
  id: `o${n}`,
  driverId: `driver${n}`,
  priceAgorot: 5000 + n * 500,
  status: "sent",
  createdAt: T,
  updatedAt: T,
  driver: { name: `أبو خالد تجريبي ${n}`, phone: `059000010${n}` },
  messages: [
    { id: `m${n}a`, senderId: "rider", body: `سؤال للسوّاق ${n}`, sentAt: new Date(T.getTime() + 1000) },
    { id: `m${n}b`, senderId: `driver${n}`, body: `جواب السوّاق ${n}`, sentAt: new Date(T.getTime() + 2000) },
  ],
  ...patch,
});
const row = (patch: Partial<RequestRow> = {}): RequestRow => ({
  id: "r1",
  riderId: "rider",
  fromPlaceId: "fake/1",
  toPlaceId: "fake/2",
  day: "2026-10-06",
  time: "15:00",
  seats: 3,
  note: null,
  status: "open",
  completedAt: null,
  createdAt: T,
  rider: { name: "راكب تجريبي كامل", phone: RIDER_PHONE },
  offers: [offer(1), offer(2)],
  ...patch,
});
const accepted = () => row({ status: "accepted", offers: [offer(1, { status: "accepted" }), offer(2, { status: "declined" })] });
const text = (value: unknown) => JSON.stringify(value);

describe("shapeRequest: what each person is sent", () => {
  it("gives the rider every offer, each driver's phone, and every thread", () => {
    const mine = shapeRequest(row(), { id: "rider", role: "rider" })!;
    expect(mine.request.mine).toBe(true);
    expect(mine.offers.map((o) => [o.id, o.price, o.phone])).toEqual([
      ["o1", 5500, "0590000101"],
      ["o2", 6000, "0590000102"],
    ]);
    expect(mine.messages).toHaveLength(4);
    expect(mine.messages.filter((m) => m.mine).map((m) => m.id)).toEqual(["m1a", "m2a"]);
    // His own phone is not echoed back in his request.
    expect(text(mine)).not.toContain(RIDER_PHONE);
  });

  it("never gives another rider anything", () => {
    expect(shapeRequest(row(), { id: "another-rider", role: "rider" })).toBeNull();
    expect(shapeRequest(row(), { id: "nobody", role: null })).toBeNull();
  });

  it("gives a driver who has not offered the open request with a first name only", () => {
    const seen = shapeRequest(row(), { id: "driver9", role: "driver" })!;
    expect(seen.request.name).toBe("راكب");
    expect(seen.offers).toEqual([]);
    expect(seen.messages).toEqual([]);
    expect(text(seen)).not.toContain(RIDER_PHONE);
    expect(text(seen)).not.toContain("0590000101");
  });

  it("gives a driver only his own offer and his own thread, never another driver's", () => {
    const seen = shapeRequest(row(), { id: "driver1", role: "driver" })!;
    expect(seen.offers.map((o) => o.id)).toEqual(["o1"]);
    expect(seen.messages.map((m) => [m.id, m.mine])).toEqual([
      ["m1a", false],
      ["m1b", true],
    ]);
    expect(text(seen)).not.toContain("السوّاق 2");
    expect(text(seen)).not.toContain("0590000102");
  });

  // Invariant 11: the rider's phone reaches a driver only through an accepted offer.
  it("before an accept, no driver is sent the rider's phone", () => {
    for (const id of ["driver1", "driver2", "driver9"]) {
      expect(text(shapeRequest(row(), { id, role: "driver" })), id).not.toContain(RIDER_PHONE);
    }
  });
  it("after the accept, only the chosen driver is sent the rider's phone", () => {
    expect(shapeRequest(accepted(), { id: "driver1", role: "driver" })!.request.phone).toBe(RIDER_PHONE);
    const declined = shapeRequest(accepted(), { id: "driver2", role: "driver" })!;
    expect(declined.offers[0].status).toBe("declined");
    expect(text(declined)).not.toContain(RIDER_PHONE);
    // A driver who never offered no longer sees the request at all.
    expect(shapeRequest(accepted(), { id: "driver9", role: "driver" })).toBeNull();
  });
  it("after the accept, the rider keeps the chosen driver's phone and loses the declined one's", () => {
    const mine = shapeRequest(accepted(), { id: "rider", role: "rider" })!;
    expect(mine.offers.map((o) => o.phone)).toEqual(["0590000101", undefined]);
  });
  it("hides both phones once the private trip is done", () => {
    const done = { ...accepted(), completedAt: T };
    expect(text(shapeRequest(done, { id: "driver1", role: "driver" }))).not.toContain(RIDER_PHONE);
    expect(text(shapeRequest(done, { id: "rider", role: "rider" }))).not.toContain("0590000101");
  });

  it("sends only the newest messages of a long thread, oldest first", () => {
    const many = Array.from({ length: SYNC_MESSAGES_PER_THREAD + 12 }, (_, i) => ({ id: `x${i}`, senderId: "rider", body: `رسالة ${i}`, sentAt: new Date(T.getTime() + i * 1000) }));
    const mine = shapeRequest(row({ offers: [offer(1, { messages: [...many].reverse() })] }), { id: "rider", role: "rider" })!;
    expect(mine.messages).toHaveLength(SYNC_MESSAGES_PER_THREAD);
    expect(mine.messages[0].id).toBe("x12");
    expect(mine.messages.at(-1)!.id).toBe(`x${SYNC_MESSAGES_PER_THREAD + 11}`);
  });
});
