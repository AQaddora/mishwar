import { describe, expect, it } from "vitest";
import { GAZA_BBOX, getPlace } from "@/lib/places";
import { distanceKm, inStrip, NEAR_ZOOM, viewAroundMe } from "@/lib/near-me";

// Real places from the gazetteer, never typed coordinates.
const at = (id: string) => {
  const p = getPlace(id)!;
  return { lat: p.lat, lon: p.lon };
};
const GAZA = at("node/504266619");
const NUSEIRAT = at("node/505021826");
const RAFAH = at("node/322022888");

describe("viewAroundMe", () => {
  it("centres on the rider at street zoom when a vehicle is already close", () => {
    expect(viewAroundMe(GAZA, [{ lat: GAZA.lat + 0.002, lon: GAZA.lon }])).toEqual({ center: GAZA, zoom: NEAR_ZOOM });
  });

  it("centres on the rider when nothing is running", () => {
    expect(viewAroundMe(GAZA, [])).toEqual({ center: GAZA, zoom: NEAR_ZOOM });
  });

  it("widens to the nearest vehicle when none would be on screen", () => {
    expect(viewAroundMe(GAZA, [RAFAH, NUSEIRAT])).toEqual({ bounds: [GAZA, NUSEIRAT] });
  });

  it("does not call a vehicle across the Strip 'around me'", () => {
    expect(distanceKm(RAFAH, at("node/3007045042"))).toBeGreaterThan(15);
    expect(viewAroundMe(RAFAH, [at("node/3007045042")])).toEqual({ center: RAFAH, zoom: NEAR_ZOOM });
  });
});

describe("inStrip", () => {
  it("knows the Strip's places and rejects a point far outside", () => {
    for (const p of [GAZA, NUSEIRAT, RAFAH]) expect(inStrip(p)).toBe(true);
    expect(inStrip({ lat: GAZA_BBOX.north + 1, lon: GAZA_BBOX.east + 1 })).toBe(false); // a degree past the box
  });
});
