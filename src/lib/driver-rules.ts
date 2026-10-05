// The driver-side rules of the domain, as pure functions (see the gaza-transit-domain
// skill, references/data-model.md). The server uses them to accept or refuse writes,
// and the screens use them to say what will happen.
import { isDay, isTime, type GazaNow } from "@/lib/time";

export const VEHICLE_TYPES = ["car", "bus", "ajala"] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];
export const VEHICLE_TYPE_AR: Record<VehicleType, string> = { car: "سيارة", bus: "باص", ajala: "عجلة" };
export const MAX_SEATS = 60;
export const MAX_PHOTOS = 4;
export const MAX_STOPS = 30;

export type Maintenance = { maintenanceFrom: string | null; maintenanceUntil: string | null };
export type ScheduleDayInput = {
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
  routeId: string | null;
};
export type RouteRef = { id: string; isDefault: boolean };

export type Running =
  | { running: true; routeId: string; startTime: string; endTime: string }
  | { running: false; reason: "no_vehicle" | "maintenance" | "day_off" | "outside_hours" | "no_route" };

export function inMaintenance(m: Maintenance, day: string): boolean {
  if (!m.maintenanceFrom || day < m.maintenanceFrom) return false;
  return m.maintenanceUntil === null || day <= m.maintenanceUntil;
}

// Who is running right now. One function decides, in this order:
// maintenance → not a working day → outside hours → running today's route.
export function isRunning(
  input: { vehicle: Maintenance | null; schedule: ScheduleDayInput[]; routes: RouteRef[] },
  now: GazaNow,
): Running {
  if (!input.vehicle) return { running: false, reason: "no_vehicle" };
  if (inMaintenance(input.vehicle, now.day)) return { running: false, reason: "maintenance" };
  const today = input.schedule.find((d) => d.weekday === now.weekday);
  if (!today || !today.working) return { running: false, reason: "day_off" };
  // The end minute itself is already outside: a day 06:00–14:00 stops at 14:00.
  if (now.time < today.startTime || now.time >= today.endTime) return { running: false, reason: "outside_hours" };
  const route = today.routeId
    ? input.routes.find((r) => r.id === today.routeId)
    : input.routes.find((r) => r.isDefault);
  if (!route) return { running: false, reason: "no_route" };
  return { running: true, routeId: route.id, startTime: today.startTime, endTime: today.endTime };
}

export const NOT_RUNNING_AR: Record<Exclude<Running, { running: true }>["reason"], string> = {
  no_vehicle: "سجّل سيارتك عشان الركّاب يشوفوك",
  maintenance: "السيارة بالتصليح",
  day_off: "مش شغّال اليوم",
  outside_hours: "برّا ساعات شغلك اليوم",
  no_route: "ضيف خط عشان تبلّش",
};

/** Returns an Arabic message for the driver, or null when the input is fine. */
export function validateVehicle(input: { type: unknown; seats: unknown }): string | null {
  if (!VEHICLE_TYPES.includes(input.type as VehicleType)) return "اختار نوع السيارة";
  if (!Number.isInteger(input.seats) || (input.seats as number) < 1) return "عدد الكراسي لازم يكون ١ عالأقل";
  if ((input.seats as number) > MAX_SEATS) return "عدد الكراسي كبير كتير";
  return null;
}

export function validateMaintenance(input: { from: unknown; until: unknown }): string | null {
  if (input.from === null) return input.until === null ? null : "حدّد من أي يوم السيارة بالتصليح";
  if (!isDay(input.from)) return "تاريخ البداية مش مزبوط";
  if (input.until !== null) {
    if (!isDay(input.until)) return "تاريخ الرجعة مش مزبوط";
    if (input.until < input.from) return "تاريخ الرجعة لازم يكون بعد تاريخ البداية";
  }
  return null;
}

// Stops: at least two, in the order given (never re-sorted), no place twice, and every
// one a real place from the gazetteer.
export function validateStops(placeIds: unknown, isKnownPlace: (id: string) => boolean): string | null {
  if (!Array.isArray(placeIds) || placeIds.some((id) => typeof id !== "string")) return "المواقف مش مزبوطة";
  if (placeIds.length < 2) return "الخط بدّه موقفين عالأقل";
  if (placeIds.length > MAX_STOPS) return "المواقف كتيرة على خط واحد";
  if (new Set(placeIds).size !== placeIds.length) return "في موقف مكرر بالخط";
  if (!placeIds.every((id) => isKnownPlace(id))) return "في موقف مش موجود عنا";
  return null;
}

/** Positions 0..n-1, contiguous, in the order the driver chose. */
export function toRouteStops(placeIds: string[]): { position: number; placeId: string }[] {
  return placeIds.map((placeId, position) => ({ position, placeId }));
}

// The weekly schedule: at most one row per weekday; on a working day the end is after
// the start; a day's route must be one of the driver's own.
export function validateSchedule(days: unknown, ownRouteIds: string[]): string | null {
  if (!Array.isArray(days) || days.length === 0 || days.length > 7) return "أيام الشغل مش مزبوطة";
  const seen = new Set<number>();
  for (const d of days as Partial<ScheduleDayInput>[]) {
    if (!d || !Number.isInteger(d.weekday) || d.weekday! < 1 || d.weekday! > 7) return "أيام الشغل مش مزبوطة";
    if (seen.has(d.weekday!)) return "في يوم مكرر";
    seen.add(d.weekday!);
    if (typeof d.working !== "boolean") return "أيام الشغل مش مزبوطة";
    if (!isTime(d.startTime) || !isTime(d.endTime)) return "الساعات مش مزبوطة";
    if (d.working && d.endTime! <= d.startTime!) return "ساعة النهاية لازم تكون بعد ساعة البداية";
    if (d.routeId != null && !ownRouteIds.includes(d.routeId)) return "الخط مش من خطوطك";
  }
  return null;
}
