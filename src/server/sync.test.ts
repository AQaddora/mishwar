import { gzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";
import { PLACES } from "@/lib/places";
import { SEED_FLEET, SEED_ROUTE } from "../../scripts/qa-seed.mjs";

// shapeSync is pure; the database client it sits next to is never touched here.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
const { CURSOR_OVERLAP_MS, firstName, PAGE_SIZE, parseCursor, shapeSync } = await import("./sync");
type SyncRows = import("./sync").SyncRows;

const T0 = new Date("2026-10-05T08:00:00Z");
const gz = (value: unknown) => gzipSync(JSON.stringify(value)).byteLength;

type SeedDriver = { name: string; vehicle: { type: "car" | "bus" | "ajala"; seats: number }; route: { id: string; name: string; stops: string[] } };
const seedDrivers: SeedDriver[] = [
  { name: "سوّاق تجريبي", vehicle: { type: "ajala", seats: 10 }, route: SEED_ROUTE },
  ...(SEED_FLEET as SeedDriver[]),
];

// The rows the database would return for the QA seed, plus `extra` more drivers shaped
// like them on other real places, to stand for a busy day.
function rowsFor(extra = 0, at = T0): SyncRows {
  const rows: SyncRows = { routes: [], vehicles: [], schedule: [], positions: [] };
  const drivers = [...seedDrivers];
  for (let i = 0; i < extra; i++) {
    const stops = Array.from({ length: 7 }, (_, k) => PLACES[(i * 7 + k * 3) % PLACES.length].id);
    drivers.push({ name: `سوّاق ${i}`, vehicle: { type: "ajala", seats: 10 }, route: { id: `11111111-0000-4000-8000-${String(i).padStart(12, "0")}`, name: `خط ${i}`, stops: [...new Set(stops)] } });
  }
  drivers.forEach((d, i) => {
    const driverId = `cmg${String(i).padStart(22, "0")}`;
    const vehicleId = `cmv${String(i).padStart(22, "0")}`;
    rows.routes.push({ id: d.route.id, driverId, name: d.route.name, isDefault: true, updatedAt: at, deletedAt: null, stops: d.route.stops.map((placeId) => ({ placeId })) });
    rows.vehicles.push({
      id: vehicleId,
      driverId,
      ...d.vehicle,
      maintenanceFrom: null,
      maintenanceUntil: null,
      updatedAt: at,
      driver: { name: d.name },
      photos: [{ hash: `${"0123456789abcdef".repeat(2)}`.slice(0, 28) + String(i).padStart(4, "0") }],
    });
    for (let weekday = 1; weekday <= 7; weekday++) {
      rows.schedule.push({ driverId, weekday, working: true, startTime: "06:00", endTime: "18:00", routeId: null, updatedAt: at });
    }
    const place = PLACES.find((p) => p.id === d.route.stops[0])!;
    rows.positions.push({ vehicleId, lat: place.lat, lon: place.lon, speed: 8.33, at });
  });
  return rows;
}

describe("sync byte budgets (offline-first-pwa skill)", () => {
  it("first sync of the seed data fits 150 KB gzipped", () => {
    const size = gz(shapeSync(rowsFor(), T0));
    process.stdout.write("\n" + `first sync, QA seed (4 drivers): ${size} bytes gzipped`);
    expect(size).toBeLessThanOrEqual(150 * 1024);
  });

  it("first sync of a busy Strip (300 drivers) still fits 150 KB, in pages of at most 50 KB", () => {
    const rows = rowsFor(296);
    const first = shapeSync(rows, T0);
    const whole = gz({ ...first, changes: { ...first.changes, routes: rows.routes, vehicles: rows.vehicles, schedule: rows.schedule } });
    process.stdout.write("\n" + `first sync, 300 drivers: page 1 is ${gz(first)} bytes gzipped`);
    expect(gz(first)).toBeLessThanOrEqual(50 * 1024);
    expect(whole).toBeLessThanOrEqual(150 * 1024);
  });

  it("a routine sync (nothing changed, 100 vehicles on the road) fits 10 KB gzipped", () => {
    const quiet = shapeSync({ routes: [], vehicles: [], schedule: [], positions: rowsFor(96).positions }, T0);
    const size = gz(quiet);
    process.stdout.write("\n" + `routine sync, 100 positions: ${size} bytes gzipped`);
    expect(size).toBeLessThanOrEqual(10 * 1024);
  });

  it("a routine sync of the seed (4 drivers, one route edited) is tiny", () => {
    const rows = rowsFor();
    const size = gz(shapeSync({ routes: [rows.routes[0]], vehicles: [], schedule: [], positions: rows.positions }, T0));
    process.stdout.write("\n" + `routine sync, QA seed: ${size} bytes gzipped`);
    expect(size).toBeLessThanOrEqual(1024);
  });
});

describe("what a sync carries", () => {
  const out = shapeSync(rowsFor(), T0);
  it("sends photo hashes, never photo bytes, and no phone numbers", () => {
    const text = JSON.stringify(out);
    expect(out.changes.vehicles[0].photos[0]).toMatch(/^[0-9a-f]+$/);
    expect(text).not.toMatch(/059\d{7}/);
    expect(text).not.toContain("bytes");
  });
  it("sends the driver's first name only", () => {
    expect(out.changes.vehicles[0].driverName).toBe("سوّاق");
    expect(firstName("أبو خالد تجريبي")).toBe("أبو خالد");
    expect(firstName("عبد الله محمد")).toBe("عبد الله");
    expect(firstName(null)).toBe("سوّاق");
  });
  it("keeps the stop order the driver chose", () => {
    expect(out.changes.routes.find((r) => r.id === SEED_ROUTE.id)!.stops).toEqual(SEED_ROUTE.stops);
  });
  it("leaves nulls out", () => {
    expect(JSON.stringify(out)).not.toContain("null");
  });
  it("moves the cursor to the server time minus the overlap", () => {
    expect(out.cursor).toBe(new Date(T0.getTime() - CURSOR_OVERLAP_MS).toISOString());
    expect(out.more).toBe(false);
  });
  it("reports a deleted route as deleted, not as a change", () => {
    const rows = rowsFor();
    rows.routes[0].deletedAt = T0;
    const gone = shapeSync(rows, T0);
    expect(gone.deleted.routes).toEqual([SEED_ROUTE.id]);
    expect(gone.changes.routes.some((r) => r.id === SEED_ROUTE.id)).toBe(false);
  });
});

describe("pagination", () => {
  it("cuts a large change set into pages and never loses a record between them", () => {
    const rows = rowsFor(150);
    // Give every record its own time, as real edits have.
    let tick = 0;
    for (const list of [rows.routes, rows.vehicles, rows.schedule]) for (const r of list) r.updatedAt = new Date(T0.getTime() + tick++);
    const total = rows.routes.length + rows.vehicles.length + rows.schedule.length;
    const seen = new Set<string>();
    let since: Date | null = null;
    for (let page = 0; page < 20; page++) {
      const from: Date | null = since;
      const pick = <R extends { updatedAt: Date }>(list: R[]) => list.filter((r) => from === null || r.updatedAt >= from);
      const out = shapeSync({ routes: pick(rows.routes), vehicles: pick(rows.vehicles), schedule: pick(rows.schedule), positions: [] }, new Date(T0.getTime() + 60_000));
      const count = out.changes.routes.length + out.changes.vehicles.length + out.changes.schedule.length;
      expect(count).toBeLessThanOrEqual(PAGE_SIZE);
      for (const r of out.changes.routes) seen.add(`r${r.id}`);
      for (const v of out.changes.vehicles) seen.add(`v${v.id}`);
      for (const d of out.changes.schedule) seen.add(`s${d.id}`);
      since = parseCursor(out.cursor);
      if (!out.more) break;
    }
    expect(seen.size).toBe(total);
  });

  it("reads a cursor, and treats a bad one as a first sync", () => {
    expect(parseCursor("2026-10-05T08:00:00.000Z")?.getTime()).toBe(T0.getTime());
    expect(parseCursor("not-a-date")).toBeNull();
    expect(parseCursor(null)).toBeNull();
  });
});
