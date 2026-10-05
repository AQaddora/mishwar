import { describe, expect, it } from "vitest";
import { phoneVisible } from "./booking-rules";
import { canOffer, decideAccept, isParticipant, MAX_MESSAGE, parsePrice, threadIsOpen, validateRequest, validMessage, validPrice } from "./request-rules";

const TODAY = "2026-10-05";
const known = (id: string) => id.startsWith("fake/");
const input = { from: "fake/1", to: "fake/2", day: TODAY, time: "15:00", seats: 3 };

describe("validateRequest", () => {
  it("accepts a plain request for today, and for two weeks ahead", () => {
    expect(validateRequest(input, TODAY, known)).toBeNull();
    expect(validateRequest({ ...input, day: "2026-10-19" }, TODAY, known)).toBeNull();
  });
  it.each([
    ["an unknown place", { from: "nowhere/9" }],
    ["the same place twice", { to: "fake/1" }],
    ["a day in the past", { day: "2026-10-04" }],
    ["a day beyond two weeks", { day: "2026-10-20" }],
    ["a broken time", { time: "25:00" }],
    ["no seats", { seats: 0 }],
    ["too many seats", { seats: 15 }],
    ["a note that is too long", { note: "ن".repeat(201) }],
  ])("refuses %s", (_name, patch) => {
    expect(validateRequest({ ...input, ...patch }, TODAY, known)).not.toBeNull();
  });
});

describe("offer price: the only money in the app, in integer agorot", () => {
  it("reads shekels as the driver types them", () => {
    expect(parsePrice("50")).toBe(5000);
    expect(parsePrice("٥٠")).toBe(5000);
    expect(parsePrice("35.5")).toBe(3550);
    expect(parsePrice(" 120 ")).toBe(12000);
  });
  it("refuses nonsense, zero and huge numbers", () => {
    for (const bad of ["", "abc", "0", "0.5", "-5", "5001", "12.345", "1e3"]) expect(parsePrice(bad), bad).toBeNull();
    expect(validPrice(5000.5)).toBe(false);
    expect(validPrice("5000")).toBe(false);
  });
});

describe("canOffer", () => {
  it("needs a vehicle that is in service today", () => {
    expect(canOffer({ maintenanceFrom: null, maintenanceUntil: null }, TODAY)).toEqual({ ok: true });
    expect(canOffer(null, TODAY)).toEqual({ ok: false, reason: "no_vehicle" });
    expect(canOffer({ maintenanceFrom: "2026-10-01", maintenanceUntil: null }, TODAY)).toEqual({ ok: false, reason: "maintenance" });
    expect(canOffer({ maintenanceFrom: "2026-10-01", maintenanceUntil: "2026-10-03" }, TODAY)).toEqual({ ok: true });
  });
});

// Invariant 10: a special request has at most one accepted offer; accepting one declines the rest.
describe("decideAccept", () => {
  const request = () => ({ riderId: "rider", status: "open", offers: [{ id: "o1", status: "sent" }, { id: "o2", status: "sent" }, { id: "o3", status: "sent" }] });

  it("accepts the chosen offer and declines every other one", () => {
    expect(decideAccept(request(), "o2", "rider")).toEqual({ ok: true, statuses: { o1: "declined", o2: "accepted", o3: "declined" } });
  });
  it("first accept wins: a second accept, of any offer, is refused", () => {
    const r = request();
    const first = decideAccept(r, "o1", "rider");
    expect(first.ok).toBe(true);
    // What the server writes after the first accept, before the second one is looked at.
    if (first.ok) {
      r.status = "accepted";
      r.offers = r.offers.map((o) => ({ ...o, status: first.statuses[o.id] }));
    }
    expect(decideAccept(r, "o2", "rider")).toEqual({ ok: false, reason: "already_accepted" });
    expect(decideAccept(r, "o1", "rider")).toEqual({ ok: false, reason: "already_accepted" });
    expect(r.offers.filter((o) => o.status === "accepted")).toHaveLength(1);
  });
  it("only the rider who posted it can accept", () => {
    expect(decideAccept(request(), "o1", "someone-else")).toEqual({ ok: false, reason: "not_yours" });
    expect(decideAccept(request(), "o1", "driver-of-o1")).toEqual({ ok: false, reason: "not_yours" });
  });
  it("refuses on a closed request, and for an offer that is not on it", () => {
    expect(decideAccept({ ...request(), status: "closed" }, "o1", "rider")).toEqual({ ok: false, reason: "closed" });
    expect(decideAccept(request(), "o9", "rider")).toEqual({ ok: false, reason: "offer_gone" });
  });
});

describe("chat threads", () => {
  const thread = { riderId: "rider", driverId: "driver", offerStatus: "sent", requestStatus: "open", completedAt: null };
  it("belong to the rider and that one driver", () => {
    expect(isParticipant(thread, "rider")).toBe(true);
    expect(isParticipant(thread, "driver")).toBe(true);
    expect(isParticipant(thread, "other-driver")).toBe(false);
  });
  it("can be written to while the offer is in play, and are read-only after", () => {
    expect(threadIsOpen(thread)).toBe(true);
    expect(threadIsOpen({ ...thread, offerStatus: "accepted", requestStatus: "accepted" })).toBe(true);
    expect(threadIsOpen({ ...thread, offerStatus: "declined", requestStatus: "accepted" })).toBe(false);
    expect(threadIsOpen({ ...thread, offerStatus: "declined", requestStatus: "closed" })).toBe(false);
    expect(threadIsOpen({ ...thread, offerStatus: "accepted", requestStatus: "accepted", completedAt: new Date() })).toBe(false);
  });
  it("take plain text up to 500 characters", () => {
    expect(validMessage("مرحبا")).toBe(true);
    expect(validMessage("   ")).toBe(false);
    expect(validMessage("م".repeat(MAX_MESSAGE))).toBe(true);
    expect(validMessage("م".repeat(MAX_MESSAGE + 1))).toBe(false);
    expect(validMessage(42)).toBe(false);
  });
});

// Invariant 11, for offers: the one phoneVisible helper decides.
describe("phoneVisible for an offer", () => {
  const link = (offerStatus: string, requestStatus: string, viewer: "rider" | "driver", completedAt: Date | null = null) => ({ offerStatus, requestStatus, viewer, completedAt });
  it("shows the driver's phone to the rider with the offer, while it is in play", () => {
    expect(phoneVisible(link("sent", "open", "rider"))).toBe(true);
    expect(phoneVisible(link("accepted", "accepted", "rider"))).toBe(true);
    expect(phoneVisible(link("declined", "accepted", "rider"))).toBe(false);
    expect(phoneVisible(link("declined", "closed", "rider"))).toBe(false);
  });
  it("shows the rider's phone to a driver only after the rider accepted his offer", () => {
    expect(phoneVisible(link("sent", "open", "driver"))).toBe(false);
    expect(phoneVisible(link("declined", "accepted", "driver"))).toBe(false);
    expect(phoneVisible(link("accepted", "accepted", "driver"))).toBe(true);
  });
  it("hides both again once the private trip is done", () => {
    expect(phoneVisible(link("accepted", "accepted", "driver", new Date()))).toBe(false);
    expect(phoneVisible(link("accepted", "accepted", "rider", new Date()))).toBe(false);
  });
});
