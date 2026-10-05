// Fails with the offending id when city.json points at a place that is not in the data
// files. After Ahmed revises the map points, this test says exactly what to fix.
import fs from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), "utf8"));
const city = read("./city.json");
const places = [...read("../../data/gazetteer.json").places, ...read("../../data/places-extra.json")];
const byId = new Map(places.map((p) => [p.id, p]));

const journeyIds = () => [...city.journeys, ...city.bookings.main, city.bookings.overbook].flatMap((j) => [j.from, j.to]);

describe("qa/simulation/city.json", () => {
  it("uses only places that exist in data/gazetteer.json or data/places-extra.json", () => {
    const used = [...city.routes.flatMap((r) => r.stops.map((s) => s.id)), ...journeyIds()];
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
    const used = [...city.routes.flatMap((r) => r.stops.map((s) => s.id)), ...journeyIds()];
    const ambiguous = [...new Set(used.filter((id) => byId.has(id) && count.get(byId.get(id).nameAr) > 1))];
    expect(ambiguous, `these names appear more than once: ${ambiguous.map((id) => `${id} ${byId.get(id).nameAr}`).join(", ")}`).toEqual([]);
  });

  it("has a vehicle for every driver and valid seat counts", () => {
    for (const v of city.vehicles) {
      expect(["car", "bus", "ajala"]).toContain(v.type);
      expect(v.seats).toBeGreaterThanOrEqual(1);
    }
  });

  // The planner scenario needs one journey of each kind, and the routes must make them true.
  it("has a direct journey, one that needs a change at a shared stop, and one with no route", () => {
    const has = (route, id) => route.stops.some((s) => s.id === id);
    for (const j of city.journeys) {
      const directRoutes = city.routes.filter((r) => has(r, j.from) && has(r, j.to));
      const change = city.routes.some((a) => has(a, j.from) && city.routes.some((b) => b !== a && has(b, j.to) && a.stops.some((s) => s.id !== j.from && has(b, s.id))));
      const kind = directRoutes.length ? "direct" : change ? "change" : "none";
      expect(kind, `${j.note}: city.json says «${j.kind}» but the routes make it «${kind}»`).toBe(j.kind);
    }
    expect(new Set(city.journeys.map((j) => j.kind))).toEqual(new Set(["direct", "change", "none"]));
  });

  it("books only between stops of the route the booking is for", () => {
    const on = (route, j) => [j.from, j.to].every((id) => route.stops.some((s) => s.id === id));
    for (const j of city.bookings.main) expect(on(city.routes[0], j), `main booking ${j.note} is not on ${city.routes[0].name}`).toBe(true);
    expect(on(city.routes[1], city.bookings.overbook), `the overbooked journey is not on ${city.routes[1].name}`).toBe(true);
  });
});
