import { describe, expect, it } from "vitest";
import { validateStops } from "./driver-rules";
import { EXTRACT_DATE, GAZA_BBOX, getPlace, PLACES } from "./places";
import { SEED_FLEET, SEED_REQUESTS, SEED_ROUTE } from "../../scripts/qa-seed.mjs";

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
  it("puts every other demo driver on a valid route of real places, standing on one of its stops", () => {
    for (const d of SEED_FLEET as { route: { stops: string[] }; at: { stop: number } }[]) {
      expect(validateStops(d.route.stops, (id) => getPlace(id) !== undefined)).toBeNull();
      expect(getPlace(d.route.stops[d.at.stop])).toBeDefined();
    }
  });
  it("asks for special requests between real places, with one open request carrying two offers and a chat", () => {
    const requests = SEED_REQUESTS as { from: string; to: string; status: string; offers: { status: string; price: number; chat: unknown[] }[] }[];
    for (const r of requests) {
      expect(getPlace(r.from), r.from).toBeDefined();
      expect(getPlace(r.to), r.to).toBeDefined();
      // Invariant 10: at most one accepted offer, and only on an accepted request.
      expect(r.offers.filter((o) => o.status === "accepted")).toHaveLength(r.status === "accepted" ? 1 : 0);
      for (const o of r.offers) expect(Number.isInteger(o.price)).toBe(true);
    }
    const open = requests.find((r) => r.status === "open" && r.offers.length === 2)!;
    expect(open.offers.some((o) => o.chat.length >= 3)).toBe(true);
  });
});
