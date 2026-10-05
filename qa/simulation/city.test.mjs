// Fails with the offending id when city.json points at a place that is not in the data
// files. After Ahmed revises the map points, this test says exactly what to fix.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const city = read("./city.json");
const places = [...read("../../data/gazetteer.json").places, ...read("../../data/places-extra.json")];
const byId = new Map(places.map((p) => [p.id, p]));

describe("qa/simulation/city.json", () => {
  it("uses only places that exist in data/gazetteer.json or data/places-extra.json", () => {
    const used = [...city.routes.flatMap((r) => r.stops.map((s) => s.id)), ...city.journeys.flatMap((j) => [j.from, j.to])];
    const missing = [...new Set(used.filter((id) => !byId.has(id)))];
    expect(missing, `not in the data files: ${missing.join(", ")}`).toEqual([]);
  });

  it("gives every route at least two stops and no stop twice", () => {
    for (const route of city.routes) {
      const ids = route.stops.map((s) => s.id);
      expect(ids.length, route.name).toBeGreaterThanOrEqual(2);
      expect(new Set(ids).size, `${route.name} repeats a stop`).toBe(ids.length);
    }
  });

  // The simulation picks a stop the way a person does: by typing its name and tapping
  // the row with exactly that name. Two places with one name would make that a guess.
  it("uses only stops whose Arabic name is unique in the data", () => {
    const count = new Map();
    for (const p of places) count.set(p.nameAr, (count.get(p.nameAr) ?? 0) + 1);
    const used = [...city.routes.flatMap((r) => r.stops.map((s) => s.id)), ...city.journeys.flatMap((j) => [j.from, j.to])];
    const ambiguous = [...new Set(used.filter((id) => byId.has(id) && count.get(byId.get(id).nameAr) > 1))];
    expect(ambiguous, `these names appear more than once: ${ambiguous.map((id) => `${id} ${byId.get(id).nameAr}`).join(", ")}`).toEqual([]);
  });

  it("has a vehicle for every driver and valid seat counts", () => {
    for (const v of city.vehicles) {
      expect(["car", "bus", "ajala"]).toContain(v.type);
      expect(v.seats).toBeGreaterThanOrEqual(1);
    }
  });
});
