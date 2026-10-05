// The public data every phone holds after a sync (offline-first-pwa skill,
// references/sync-protocol.md): routes, vehicles, the week schedules and the latest
// positions. Guests get exactly the same. No phone number and no rider data is in here.
import type { VehicleType } from "@/lib/driver-rules";

export type SyncRoute = { id: string; driverId: string; name: string; isDefault: boolean; stops: string[] };
export type SyncVehicle = {
  id: string;
  driverId: string;
  /** First name only. */
  driverName: string;
  type: VehicleType;
  seats: number;
  /** Seats nobody has booked. Equal to seats until bookings exist (M5). */
  free: number;
  photos: string[];
  maintenanceFrom?: string;
  /** Present only with maintenanceFrom. Absent = until the driver says it's back. */
  maintenanceUntil?: string;
};
export type SyncScheduleDay = {
  /** "<driverId>:<weekday>" */
  id: string;
  driverId: string;
  weekday: number;
  working: boolean;
  startTime: string;
  endTime: string;
  routeId?: string;
};
/** The latest point only, with its own time. id is the vehicle id. */
export type SyncPosition = { id: string; lat: number; lon: number; speed?: number; at: string };

export type SyncChanges = {
  routes: SyncRoute[];
  vehicles: SyncVehicle[];
  schedule: SyncScheduleDay[];
  /** Always the COMPLETE current set, not a diff: a vehicle missing here has no position. */
  positions: SyncPosition[];
};
export type SyncResponse = {
  cursor: string;
  serverTime: string;
  changes: SyncChanges;
  deleted: { routes: string[]; vehicles: string[] };
  more: boolean;
};

export type PublicData = SyncChanges;
export const EMPTY_PUBLIC_DATA: PublicData = { routes: [], vehicles: [], schedule: [], positions: [] };
