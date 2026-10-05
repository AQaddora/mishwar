// The words riders read in the trip planner. Numbers go through the shared formatter.
import { formatNumber } from "@/lib/time";

/** «حوالي ٧ دقايق»: always rounded up to a whole minute, never "0 minutes". */
export function aboutMinutes(minutes: number): string {
  const m = Math.max(1, Math.ceil(minutes));
  if (m === 1) return "حوالي دقيقة";
  if (m === 2) return "حوالي دقيقتين";
  if (m <= 10) return `حوالي ${formatNumber(m)} دقايق`;
  if (m < 60) return `حوالي ${formatNumber(m)} دقيقة`;
  const hours = Math.floor(m / 60);
  const rest = m % 60;
  const h = hours === 1 ? "ساعة" : hours === 2 ? "ساعتين" : `${formatNumber(hours)} ساعات`;
  return rest === 0 ? `حوالي ${h}` : `حوالي ${h} و${formatNumber(rest)} دقيقة`;
}

export function stopsText(count: number): string {
  if (count === 1) return "موقف واحد";
  if (count === 2) return "موقفين";
  if (count <= 10) return `${formatNumber(count)} مواقف`;
  return `${formatNumber(count)} موقف`;
}

export const NO_TIME_NOW = "ما في مكان جديد للسيارة هلأ، فما بنقدر نقول إمتى بتوصل";
