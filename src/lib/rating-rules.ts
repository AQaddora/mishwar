// The rating rules, as pure functions (no database), so they are unit-tested and the
// screens and the server agree. A rating is 1 to 5 stars with an optional short comment,
// given once by each side after a COMPLETED trip: a completed route booking, or a
// completed private trip (an accepted special request the driver marked done).
import { formatNumber } from "@/lib/time";

export const MAX_COMMENT = 300;

/** The trip being rated, reduced to what the rule needs. */
export type RatedTrip = {
  riderId: string;
  driverId: string;
  /** A route booking: confirmed, ready, rejected or cancelled. A private trip: "accepted". */
  status: string;
  completedAt: Date | string | null;
};

export type RatingDecision =
  | { ok: true; rateeId: string; stars: number; comment: string | null }
  | { ok: false; reason: "invalid" | "not_yours" | "not_completed" | "already" };

export const RATING_REFUSED_AR: Record<Exclude<RatingDecision, { ok: true }>["reason"], string> = {
  invalid: "اختار من نجمة لخمس نجوم",
  not_yours: "هاد المشوار مش إلك",
  not_completed: "بتقدر تقيّم بعد ما يخلص المشوار",
  already: "قيّمت هاد المشوار قبل",
};

export function validStars(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

// Who may rate what:
// - only the two people of the trip, and each rates the OTHER one;
// - only after the trip is completed (a cancelled or rejected booking never is);
// - once per trip per rater: `alreadyRated` is whether this rater has a rating on it.
export function decideRating(trip: RatedTrip | null, raterId: string, input: { stars: unknown; comment?: unknown }, alreadyRated: boolean): RatingDecision {
  if (!validStars(input.stars)) return { ok: false, reason: "invalid" };
  if (input.comment != null && typeof input.comment !== "string") return { ok: false, reason: "invalid" };
  const comment = (input.comment ?? "").trim();
  if (comment.length > MAX_COMMENT) return { ok: false, reason: "invalid" };
  if (!trip || (raterId !== trip.riderId && raterId !== trip.driverId)) return { ok: false, reason: "not_yours" };
  if (!trip.completedAt || trip.status === "cancelled" || trip.status === "rejected") return { ok: false, reason: "not_completed" };
  if (alreadyRated) return { ok: false, reason: "already" };
  return { ok: true, rateeId: raterId === trip.riderId ? trip.driverId : trip.riderId, stars: input.stars, comment: comment || null };
}

/** Average to one decimal place and the count, or null when nobody has rated yet. */
export function averageOf(sum: number, count: number): { rating: number; ratings: number } | null {
  return count > 0 ? { rating: Math.round((sum / count) * 10) / 10, ratings: count } : null;
}

export const NO_RATING = "سوّاق جديد، لسّا ما في تقييم";

/** «4.6 من 5 · 12 تقييم». Wrap in <bdi> inside Arabic text. */
export function ratingText(rating: number | undefined, ratings: number | undefined): string | null {
  if (!rating || !ratings) return null;
  const count = ratings === 1 ? "تقييم واحد" : ratings === 2 ? "تقييمين" : ratings <= 10 ? `${formatNumber(ratings)} تقييمات` : `${formatNumber(ratings)} تقييم`;
  return `★ ${formatNumber(rating)} من ${formatNumber(5)} · ${count}`;
}

export const RATE_PROMPT = "كيف كان مشوارك؟ قيّم";
export const PENDING_RATING = "مستني ينبعت";
