import { afterEach, describe, expect, it, vi } from "vitest";
import { closeMap } from "./map-close";

// Leaflet needs a page to load. This is the least of one it accepts; the code under test
// is Leaflet's own zoom-end handler, the one its 250ms timer calls.
async function loadLeaflet() {
  const el = () => ({ style: {}, getContext: () => null, appendChild() {}, setAttribute() {} });
  vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, screen: {}, location: {} });
  vi.stubGlobal("document", { documentElement: el(), createElement: el, createElementNS: el, addEventListener() {} });
  const mod = await import("leaflet");
  return mod.default ?? mod;
}

afterEach(() => vi.unstubAllGlobals());

describe("closeMap", () => {
  it("lets a zoom that was still animating end quietly after the map is closed", async () => {
    const L = await loadLeaflet();
    // A map in the middle of an animated zoom, as fitBounds leaves it for 250ms.
    const midZoom = () => {
      const map = Object.create(L.Map.prototype);
      Object.assign(map, {
        options: { crs: L.CRS.EPSG3857 },
        _size: L.point(375, 300),
        _zoom: 11,
        _mapPane: {} as object | undefined,
        _animatingZoom: true,
        _animateToCenter: L.latLng(31.5, 34.45),
        _animateToZoom: 12,
        // What Leaflet's remove() does to the pane the timer reads.
        remove() {
          this._mapPane = undefined;
        },
      });
      return map;
    };

    // Leaflet's remove() alone leaves the timer armed: this is the error of issue #13.
    const removed = midZoom();
    removed.remove();
    expect(() => removed._onZoomTransitionEnd()).toThrow("_leaflet_pos");

    const closed = midZoom();
    closeMap(closed);
    expect(() => closed._onZoomTransitionEnd()).not.toThrow();
  });
});
