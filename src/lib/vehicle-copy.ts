// The words riders read about a vehicle. One place, so every screen says it the same way.
import { isStale } from "@/lib/rider-rules";
import type { SyncPosition } from "@/lib/public-data";
import { formatAge, formatNumber } from "@/lib/time";

export function freeSeatsText(free: number): string {
  if (free <= 0) return "ما في كراسي فاضية";
  if (free === 1) return "كرسي واحد فاضي";
  if (free === 2) return "كرسيين فاضيين";
  if (free <= 10) return `${formatNumber(free)} كراسي فاضية`;
  return `${formatNumber(free)} كرسي فاضي`;
}

export const NO_FRESH_POSITION = "ما في مكان جديد للسيارة هلأ";

// «آخر مكان قبل ٣ دقايق» while the point is fresh. Older than five minutes, or no point
// at all: say plainly that there is no fresh position. Never a guess.
export function positionText(position: SyncPosition | null, now: number): { text: string; fresh: boolean } {
  if (!position) return { text: NO_FRESH_POSITION, fresh: false };
  if (isStale(position.at, now)) return { text: `${NO_FRESH_POSITION} (آخر مكان ${formatAge(position.at, now)})`, fresh: false };
  return { text: `آخر مكان ${formatAge(position.at, now)}`, fresh: true };
}

/** The letter inside a vehicle's map pin: سيارة، باص، عجلة. */
export const VEHICLE_PIN: Record<string, string> = { car: "س", bus: "ب", ajala: "ع" };
