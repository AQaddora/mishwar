"use client";

// The one map in the app: Leaflet over OpenStreetMap's own tiles (their labels in the
// Strip are already Arabic). Leaflet touches `window`, so it is imported inside an
// effect and never runs on the server. Markers are our own DOM pins, styled by tokens.
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";
import { useEffect, useRef } from "react";
import { GAZA_BBOX } from "@/lib/places";

export type MapMarker = {
  id: string;
  lat: number;
  lon: number;
  /** Read by screen readers and shown as the pin's tooltip. */
  label: string;
  /** One or two characters inside the pin (a stop number, a vehicle initial). */
  text: string;
  tone?: "accent" | "stale" | "stop";
};

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function MapView({
  markers,
  line,
  fit = "strip",
  onSelect,
  className = "h-72",
}: {
  markers: MapMarker[];
  /** Drawn stop to stop, in the order given. */
  line?: [number, number][];
  /** "strip": the whole Gaza Strip. "markers": zoom to what is drawn. */
  fit?: "strip" | "markers";
  onSelect?: (id: string) => void;
  /** Must set a height, so the page doesn't jump when the map arrives. */
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<{ map: LeafletMap; layer: LayerGroup; tiles: TileLayer; L: typeof import("leaflet") } | null>(null);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  });
  const fitKey = fit === "markers" ? markers.map((m) => m.id).join(",") : "strip";

  useEffect(() => {
    let alive = true;
    let redraw: (() => void) | undefined;
    void import("leaflet").then((mod) => {
      const L = mod.default ?? mod;
      if (!alive || !box.current || map.current) return;
      const strip = L.latLngBounds([GAZA_BBOX.south, GAZA_BBOX.west], [GAZA_BBOX.north, GAZA_BBOX.east]);
      const m = L.map(box.current, {
        zoomControl: false,
        attributionControl: true,
        minZoom: 9,
        maxZoom: 17,
        maxBounds: strip.pad(0.6),
        maxBoundsViscosity: 0.8,
      });
      m.attributionControl.setPrefix(false);
      m.fitBounds(strip);
      const tiles = L.tileLayer(TILE_URL, {
        attribution: "© OpenStreetMap contributors",
        // CORS requests, so the service worker can keep real copies of the tiles viewed.
        crossOrigin: true,
        maxZoom: 17,
      }).addTo(m);
      map.current = { map: m, layer: L.layerGroup().addTo(m), tiles, L };
      // The first time the service worker takes over, load the tiles on screen through it
      // (from the browser's own cache), so they are there when the network is not.
      redraw = () => tiles.redraw();
      navigator.serviceWorker?.addEventListener("controllerchange", redraw);
      box.current.dispatchEvent(new Event("mapready"));
    });
    return () => {
      alive = false;
      if (redraw) navigator.serviceWorker?.removeEventListener("controllerchange", redraw);
      map.current?.map.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const draw = () => {
      const ctx = map.current;
      if (!ctx) return;
      const { L, layer } = ctx;
      layer.clearLayers();
      if (line && line.length > 1) L.polyline(line, { className: "map-line", interactive: false }).addTo(layer);
      for (const marker of markers) {
        const icon = L.divIcon({
          className: "",
          html: `<span class="map-pin map-pin-${marker.tone ?? "accent"}">${escapeHtml(marker.text)}</span>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });
        const pin = L.marker([marker.lat, marker.lon], { icon, title: marker.label, alt: marker.label, keyboard: false });
        pin.on("click", () => onSelectRef.current?.(marker.id));
        pin.addTo(layer);
      }
    };
    const fitNow = () => {
      const ctx = map.current;
      if (!ctx || fit !== "markers") return;
      const points: [number, number][] = [...markers.map((m) => [m.lat, m.lon] as [number, number]), ...(line ?? [])];
      if (points.length > 0) ctx.map.fitBounds(ctx.L.latLngBounds(points).pad(0.2), { maxZoom: 14 });
    };
    const both = () => {
      draw();
      fitNow();
    };
    both();
    el.addEventListener("mapready", both);
    return () => el.removeEventListener("mapready", both);
    // fitKey stands for "which things are drawn": refit only when that changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, line, fitKey]);

  return (
    // dir=ltr: Leaflet lays its panes out left to right. `isolate` keeps Leaflet's high
    // z-indexes inside this box, under the tab bar and the sheets.
    <div dir="ltr" className={`relative isolate w-full overflow-hidden rounded-card bg-separator ${className}`}>
      <div ref={box} className="absolute inset-0" role="application" aria-label="خريطة قطاع غزة" />
    </div>
  );
}
