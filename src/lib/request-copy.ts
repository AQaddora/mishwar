// The words riders and drivers read about special requests and offers. One place, so
// every screen agrees.
import type { Tone } from "@/lib/booking-copy";
import type { SyncOffer, SyncRequest } from "@/lib/public-data";
import { formatNumber } from "@/lib/time";

/** 5000 agorot → "50 ₪". Wrap it in <bdi> inside Arabic text. */
export function priceText(agorot: number): string {
  return `${formatNumber(agorot / 100)} ₪`;
}

export function offersCountText(n: number): string {
  if (n === 0) return "لسّا ما وصلك عروض";
  if (n === 1) return "وصلك عرض واحد";
  if (n === 2) return "وصلك عرضين";
  if (n <= 10) return `وصلك ${formatNumber(n)} عروض`;
  return `وصلك ${formatNumber(n)} عرض`;
}

/** What the rider is told about his own request, in one line. */
export function riderRequestStatus(r: SyncRequest, sentOffers: number): { text: string; tone: Tone } {
  if (r.completedAt) return { text: "خلص المشوار", tone: "muted" };
  if (r.status === "accepted") return { text: "اتفقت مع سوّاق", tone: "accent" };
  if (r.status === "closed") return { text: "سكّرت الطلب", tone: "muted" };
  return sentOffers > 0 ? { text: offersCountText(sentOffers), tone: "accent" } : { text: "مستنيين عروض السوّاقين", tone: "pending" };
}

/** What a driver is told about his own offer. */
export function driverOfferStatus(o: SyncOffer, r: SyncRequest | undefined): { text: string; tone: Tone } {
  if (o.status === "accepted") return r?.completedAt ? { text: "خلص المشوار", tone: "muted" } : { text: "الراكب قبل عرضك", tone: "accent" };
  if (o.status === "declined") return r?.status === "closed" ? { text: "الراكب سكّر الطلب", tone: "muted" } : { text: "الراكب اختار عرض ثاني", tone: "danger" };
  return { text: "عرضك عند الراكب", tone: "pending" };
}

export const PENDING_SEND = "مستني ينبعت";
