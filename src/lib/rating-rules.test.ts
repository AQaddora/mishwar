import { describe, expect, it } from "vitest";
import { averageOf, decideRating, MAX_COMMENT, ratingText, type RatedTrip } from "./rating-rules";

const done: RatedTrip = { riderId: "rider", driverId: "driver", status: "ready", completedAt: new Date("2026-10-05T10:00:00Z") };

describe("decideRating", () => {
  it("lets each side rate the other one after a completed trip", () => {
    expect(decideRating(done, "rider", { stars: 5 }, false)).toEqual({ ok: true, rateeId: "driver", stars: 5, comment: null });
    expect(decideRating(done, "driver", { stars: 3, comment: "  كان جاهز عالوقت " }, false)).toEqual({ ok: true, rateeId: "rider", stars: 3, comment: "كان جاهز عالوقت" });
  });

  it("works the same for a completed private trip", () => {
    const priv: RatedTrip = { ...done, status: "accepted" };
    expect(decideRating(priv, "rider", { stars: 4 }, false)).toMatchObject({ ok: true, rateeId: "driver" });
  });

  it("refuses anyone who was not on the trip", () => {
    expect(decideRating(done, "someone-else", { stars: 5 }, false)).toEqual({ ok: false, reason: "not_yours" });
    expect(decideRating(null, "rider", { stars: 5 }, false)).toEqual({ ok: false, reason: "not_yours" });
  });

  it("refuses before the trip is completed", () => {
    expect(decideRating({ ...done, completedAt: null }, "rider", { stars: 5 }, false)).toEqual({ ok: false, reason: "not_completed" });
  });

  it("never rates a cancelled or rejected booking", () => {
    for (const status of ["cancelled", "rejected"]) {
      expect(decideRating({ ...done, status, completedAt: null }, "rider", { stars: 5 }, false)).toEqual({ ok: false, reason: "not_completed" });
      // Even if a completion time were somehow set.
      expect(decideRating({ ...done, status }, "driver", { stars: 1 }, false)).toEqual({ ok: false, reason: "not_completed" });
    }
  });

  it("allows exactly one rating per trip per rater", () => {
    expect(decideRating(done, "rider", { stars: 5 }, true)).toEqual({ ok: false, reason: "already" });
    // The other side has not rated yet, so it still can.
    expect(decideRating(done, "driver", { stars: 5 }, false)).toMatchObject({ ok: true });
  });

  it("takes whole stars from 1 to 5 only", () => {
    for (const stars of [0, 6, 4.5, -1, "5", null, undefined, NaN]) {
      expect(decideRating(done, "rider", { stars }, false)).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("caps the comment and takes text only", () => {
    expect(decideRating(done, "rider", { stars: 5, comment: "ا".repeat(MAX_COMMENT) }, false)).toMatchObject({ ok: true });
    expect(decideRating(done, "rider", { stars: 5, comment: "ا".repeat(MAX_COMMENT + 1) }, false)).toEqual({ ok: false, reason: "invalid" });
    expect(decideRating(done, "rider", { stars: 5, comment: { html: "<b>" } }, false)).toEqual({ ok: false, reason: "invalid" });
    expect(decideRating(done, "rider", { stars: 5, comment: "   " }, false)).toMatchObject({ ok: true, comment: null });
  });
});

describe("averages", () => {
  it("rounds to one decimal and is null with no ratings", () => {
    expect(averageOf(0, 0)).toBeNull();
    expect(averageOf(14, 3)).toEqual({ rating: 4.7, ratings: 3 });
    expect(averageOf(5, 1)).toEqual({ rating: 5, ratings: 1 });
  });

  it("says nothing until somebody has rated", () => {
    expect(ratingText(undefined, undefined)).toBeNull();
    expect(ratingText(4.7, 3)).toContain("3 تقييمات");
    expect(ratingText(5, 1)).toContain("تقييم واحد");
  });
});
