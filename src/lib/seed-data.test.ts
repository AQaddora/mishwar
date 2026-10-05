import { describe, expect, it } from "vitest";
import { validateStops } from "./driver-rules";
import { EXTRACT_DATE, GAZA_BBOX, getPlace, PLACES } from "./places";
import { SEED_ROUTE } from "../../scripts/qa-seed.mjs";

describe("gazetteer (data/gazetteer.json)", () => {
  it("has places, each traceable to an OSM element", () => {
    expect(PLACES.length).toBeGreaterThan(100);
    for (const p of PLACES) {
      expect(p.id).toMatch(/^(node|way|relation|manual)\/[\w-]+$/);
      expect(p.nameAr.length).toBeGreaterThan(0);
    }
    expect(new Set(PLACES.map((p) => p.id)).size).toBe(PLACES.length);
  });

  it("keeps every coordinate inside the Gaza Strip's bounding box", () => {
    for (const p of PLACES) {
      expect(p.lat, p.id).toBeGreaterThanOrEqual(GAZA_BBOX.south);
      expect(p.lat, p.id).toBeLessThanOrEqual(GAZA_BBOX.north);
      expect(p.lon, p.id).toBeGreaterThanOrEqual(GAZA_BBOX.west);
      expect(p.lon, p.id).toBeLessThanOrEqual(GAZA_BBOX.east);
    }
  });

  it("records how old the map data is", () => {
    expect(EXTRACT_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("QA seed route", () => {
  it("uses only real gazetteer places and is a valid route", () => {
    expect(validateStops(SEED_ROUTE.stops, (id) => getPlace(id) !== undefined)).toBeNull();
  });
  it("runs north to south, as Salah al-Din Road does", () => {
    const lats = (SEED_ROUTE.stops as string[]).map((id) => getPlace(id)!.lat);
    expect([...lats].sort((a, b) => b - a)).toEqual(lats);
  });
});
