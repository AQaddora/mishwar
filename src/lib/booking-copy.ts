// The words riders and drivers read about a booking. One place, so every screen agrees.
import { CANCEL_REASON_AR } from "@/lib/booking-rules";
import type { SyncBooking } from "@/lib/public-data";
import { addDays, formatDay, formatNumber, formatTime } from "@/lib/time";

export function seatsText(n: number): string {
  if (n === 1) return "كرسي واحد";
  if (n === 2) return "كرسيين";
  if (n <= 10) return `${formatNumber(n)} كراسي`;
  return `${formatNumber(n)} كرسي`;
}

export function dayText(day: string, today: string): string {
  if (day === today) return "اليوم";
  if (day === addDays(today, 1)) return "بكرة";
  if (day === addDays(today, -1)) return "مبارح";
  return formatDay(day);
}

export const whenText = (b: { day: string; time: string }, today: string) => `${dayText(b.day, today)} الساعة ${formatTime(b.time)}`;

export type Tone = "accent" | "danger" | "pending" | "muted";
export const TONE_CLASS: Record<Tone, string> = { accent: "text-accent", danger: "text-danger", pending: "text-pending", muted: "text-text-muted" };

/** What the rider is told about his booking, in one line. */
export function riderStatus(b: SyncBooking): { text: string; tone: Tone } {
  if (b.status === "cancelled" || b.status === "rejected") {
    return { text: CANCEL_REASON_AR[b.cancelReason ?? ""] ?? "انلغى الحجز", tone: b.cancelReason === "by_rider" ? "muted" : "danger" };
  }
  if (b.completedAt) return { text: "خلصت الرحلة", tone: "muted" };
  if (b.startedAt) return { text: "الرحلة بلّشت", tone: "accent" };
  if (b.status === "ready") return { text: "السوّاق أكّد إنك جاهز", tone: "accent" };
  return { text: "تأكد حجزك", tone: "accent" };
}

/** What the driver sees next to a rider before the trip. */
export function driverStatus(b: SyncBooking): { text: string; tone: Tone } {
  if (b.status === "cancelled") return { text: b.cancelReason === "by_rider" ? "الراكب لغى حجزه" : "انلغى حجزه", tone: "muted" };
  if (b.completedAt) return { text: "وصل", tone: "muted" };
  if (b.startedAt) return { text: "معك بالرحلة", tone: "accent" };
  if (b.status === "ready") return { text: "جاهز", tone: "accent" };
  return { text: "لسّا ما تأكدت منه", tone: "pending" };
}

export const PENDING_BOOKING = "مستني ينبعت";
