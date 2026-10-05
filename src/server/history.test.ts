import { describe, expect, it } from "vitest";
import { shapeHistoryBooking, shapeHistoryRequest, type HistoryBookingRow, type HistoryRequestRow } from "./history";

const at = new Date("2026-10-05T10:00:00Z");
const booking: HistoryBookingRow = {
  id: "b1",
  riderId: "rider",
  driverId: "driver",
  day: "2026-10-05",
  time: "09:00",
  fromPlaceId: "node/1",
  toPlaceId: "node/2",
  seats: 2,
  status: "ready",
  cancelReason: null,
  tripId: "t1",
  completedAt: at,
  updatedAt: at,
  rider: { name: "سامر تجريبي" },
  route: { name: "خط تجريبي", driver: { name: "أبو خالد تجريبي", vehicle: { type: "car" } } },
  ratings: [
    { raterId: "rider", stars: 5, comment: "سوّاق محترم" },
    { raterId: "driver", stars: 4, comment: "كان جاهز" },
  ],
};
const request: HistoryRequestRow = {
  id: "r1",
  riderId: "rider",
  day: "2026-10-05",
  time: "11:00",
  fromPlaceId: "node/1",
  toPlaceId: "node/2",
  seats: 1,
  completedAt: at,
  rider: { name: "سامر تجريبي" },
  offers: [{ driverId: "driver", priceAgorot: 3500, driver: { name: "أبو خالد تجريبي", vehicle: { type: "car" } } }],
  ratings: [],
};

describe("history items", () => {
  it("shows each side the other one's first name, and both ratings to the two of them", () => {
    const rider = shapeHistoryBooking(booking, "rider")!;
    expect(rider.name).toBe("أبو خالد");
    expect(rider.mine).toEqual({ stars: 5, comment: "سوّاق محترم" });
    expect(rider.theirs).toEqual({ stars: 4, comment: "كان جاهز" });
    expect(rider.tripId).toBeUndefined();
    const driver = shapeHistoryBooking(booking, "driver")!;
    expect(driver.name).toBe("سامر");
    expect(driver.mine?.stars).toBe(4);
    expect(driver.tripId).toBe("t1");
  });

  it("gives nothing to someone who was not on the trip", () => {
    expect(shapeHistoryBooking(booking, "stranger")).toBeNull();
    expect(shapeHistoryRequest(request, "stranger")).toBeNull();
  });

  it("never carries a phone number or a location", () => {
    const all = JSON.stringify([shapeHistoryBooking(booking, "rider"), shapeHistoryBooking(booking, "driver"), shapeHistoryRequest(request, "rider"), shapeHistoryRequest(request, "driver")]);
    expect(all).not.toMatch(/phone|lat|lon|position/i);
  });

  it("marks cancelled and rejected bookings, with the reason and no ratings", () => {
    const cancelled = shapeHistoryBooking({ ...booking, status: "cancelled", cancelReason: "rider_not_ready", completedAt: null }, "rider")!;
    expect(cancelled.outcome).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("rider_not_ready");
    expect(cancelled.mine).toBeUndefined();
    expect(shapeHistoryBooking({ ...booking, status: "rejected", cancelReason: "seats_gone", completedAt: null }, "rider")!.outcome).toBe("rejected");
  });

  it("leaves out a booking that is still live", () => {
    expect(shapeHistoryBooking({ ...booking, completedAt: null }, "rider")).toBeNull();
  });

  it("shows a completed private trip with its price", () => {
    const item = shapeHistoryRequest(request, "rider")!;
    expect(item).toMatchObject({ kind: "private", price: 3500, outcome: "completed", name: "أبو خالد" });
    expect(shapeHistoryRequest({ ...request, completedAt: null }, "rider")).toBeNull();
  });
});
