// Asia/Gaza time helpers. "Today", the weekday and timetable times are always local to
// the Strip, whatever the server's or the phone's own time zone is.

export const GAZA_TZ = "Asia/Gaza";

export type GazaNow = {
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  /** ISO weekday: Monday = 1 … Sunday = 7. */
  weekday: number;
  /** Local time, "HH:MM" (24h). */
  time: string;
};

const WEEKDAY_NUM: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

const partsFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: GAZA_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  weekday: "short",
});

export function gazaNow(at: Date = new Date()): GazaNow {
  const p: Record<string, string> = {};
  for (const part of partsFormat.formatToParts(at)) p[part.type] = part.value;
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: WEEKDAY_NUM[p.weekday], time: `${p.hour}:${p.minute}` };
}

/** The week as riders and drivers see it: Saturday first. */
export const WEEK_ORDER = [6, 7, 1, 2, 3, 4, 5] as const;

export const WEEKDAY_AR: Record<number, string> = {
  6: "السبت",
  7: "الأحد",
  1: "الاثنين",
  2: "الثلاثاء",
  3: "الأربعاء",
  4: "الخميس",
  5: "الجمعة",
};

export function isTime(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function isDay(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// Shared formatters, so digits and dates look the same on every screen.
const numberFormat = new Intl.NumberFormat("ar-u-nu-latn");
export function formatNumber(n: number): string {
  return numberFormat.format(n);
}

const dayFormat = new Intl.DateTimeFormat("ar-u-nu-latn", { timeZone: "UTC", day: "numeric", month: "long" });
/** "2026-10-05" → "5 أكتوبر". */
export function formatDay(day: string): string {
  return dayFormat.format(new Date(`${day}T00:00:00Z`));
}

/** "06:30" → "6:30 الصبح" style is overkill; keep the clock, with Latin digits. */
export function formatTime(time: string): string {
  const [h, m] = time.split(":");
  return `${Number(h)}:${m}`;
}

/** "2026-10-05" + 1 → "2026-10-06". Pure calendar arithmetic, no time zone involved. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO weekday (Monday = 1 … Sunday = 7) of a calendar day. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay() || 7;
}

// «قبل ٣ دقايق»: how old something is, in the words people use. Used for a vehicle's last
// position and for «آخر تحديث».
export function formatAge(at: Date | string | number, now: Date | number = Date.now()): string {
  const minutes = Math.floor((Number(new Date(now)) - Number(new Date(at))) / 60000);
  if (minutes < 1) return "هلأ";
  if (minutes === 1) return "قبل دقيقة";
  if (minutes === 2) return "قبل دقيقتين";
  if (minutes <= 10) return `قبل ${formatNumber(minutes)} دقايق`;
  if (minutes < 60) return `قبل ${formatNumber(minutes)} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours === 1) return "قبل ساعة";
  if (hours === 2) return "قبل ساعتين";
  if (hours <= 10) return `قبل ${formatNumber(hours)} ساعات`;
  if (hours < 48) return `قبل ${formatNumber(hours)} ساعة`;
  return `قبل ${formatNumber(Math.floor(hours / 24))} يوم`;
}
