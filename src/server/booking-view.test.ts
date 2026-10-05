import { describe, expect, it } from "vitest";
import { shapeBooking, type BookingRow } from "./booking-view";

const NOW = Date.parse("2026-10-05T08:00:00Z");
const RIDER_PHONE = "0590000002";
const DRIVER_PHONE = "0590000001";
const row = (patch: Partial<BookingRow> = {}): BookingRow => ({
  id: "b1",
  riderId: "rider",
  driverId: "driver",
  routeId: "r1",
  day: "2026-10-05",
  time: "08:00",
  fromPosition: 0,
  toPosition: 2,
  fromPlaceId: "fake/1",
  toPlaceId: "fake/3",
  seats: 1,
  status: "confirmed",
  cancelReason: null,
  calledAt: null,
  startedAt: null,
  completedAt: null,
  offRouteNotifiedAt: null,
  createdAt: new Date(NOW),
  rider: { name: "راكب تجريبي", phone: RIDER_PHONE },
  route: { name: "خط تجريبي", driver: { name: "أبو خالد تجريبي", phone: DRIVER_PHONE } },
  shares: [],
  ...patch,
});
const share = (patch = {}) => ({ id: "s1", askedAt: new Date(NOW), expiresAt: new Date(NOW + 15 * 60_000), answer: "yes" as string | null, endedAt: null as Date | null, endReason: null as string | null, lat: 31.4, lon: 34.4, at: new Date(NOW), ...patch });
const has = (value: unknown, text: string) => JSON.stringify(value).includes(text);

describe("a booking as its rider and its driver see it", () => {
  it("is not shown to anyone else", () => {
    expect(shapeBooking(row(), "stranger", NOW)).toBeNull();
  });
  it("shows each side the other's first name and phone while the booking is live", () => {
    const forDriver = shapeBooking(row(), "driver", NOW)!;
    expect(forDriver).toMatchObject({ name: "راكب", phone: RIDER_PHONE });
    expect(has(forDriver, DRIVER_PHONE)).toBe(false);
    const forRider = shapeBooking(row(), "rider", NOW)!;
    expect(forRider).toMatchObject({ name: "أبو خالد", phone: DRIVER_PHONE });
    expect(has(forRider, RIDER_PHONE)).toBe(false);
  });
  it("hides the rider's phone from the driver once the booking is cancelled, rejected or completed", () => {
    for (const patch of [{ status: "cancelled" }, { status: "rejected" }, { status: "ready", completedAt: new Date(NOW) }]) {
      expect(has(shapeBooking(row(patch), "driver", NOW), RIDER_PHONE)).toBe(false);
      expect(has(shapeBooking(row(patch), "rider", NOW), DRIVER_PHONE)).toBe(false);
    }
  });
});

describe("a rider's shared location", () => {
  it("reaches the driver only after a yes, while sharing is on", () => {
    expect(shapeBooking(row({ shares: [share()] }), "driver", NOW)!.share).toMatchObject({ answer: "yes", lat: 31.4, lon: 34.4 });
    expect(shapeBooking(row({ shares: [share({ answer: null })] }), "driver", NOW)!.share).not.toHaveProperty("lat");
    expect(shapeBooking(row({ shares: [share({ answer: "no", endedAt: new Date(NOW), endReason: "declined" })] }), "driver", NOW)!.share).not.toHaveProperty("lat");
  });
  it("is never sent back to the rider's own phone", () => {
    expect(shapeBooking(row({ shares: [share()] }), "rider", NOW)!.share).not.toHaveProperty("lat");
  });
  it("is gone after 15 minutes even if nothing has cleaned the row yet", () => {
    const late = shapeBooking(row({ shares: [share()] }), "driver", NOW + 15 * 60_000)!.share!;
    expect(late).not.toHaveProperty("lat");
    expect(late.ended).toBe("expired");
  });
  it("is gone once sharing ended (trip started, or the rider stopped)", () => {
    const ended = shapeBooking(row({ shares: [share({ endedAt: new Date(NOW), endReason: "trip_started" })] }), "driver", NOW + 1000)!.share!;
    expect(ended).not.toHaveProperty("lat");
    expect(ended.ended).toBe("trip_started");
  });
});
