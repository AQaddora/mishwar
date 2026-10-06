"use client";

// The one map in the app: Leaflet over OpenStreetMap's own tiles. Inside the Strip their
// labels are Arabic; around it they are not, so everything outside the Strip's outline
// (data/gaza-strip.json, from OSM) is covered by a plain mask. Riders see their own map
// and nothing they can't read.
// Leaflet touches `window`, so it is imported inside an effect and never runs on the
// server. Markers are our own DOM pins, styled by tokens.
import "leaflet/dist/leaflet.css";
import type { LayerGroup, Map as LeafletMap, TileLayer } from "leaflet";
import { useEffect, useRef, useState } from "react";
import { LocateIcon } from "@/components/icons";
import { closeMap } from "@/lib/map-close";
import { inStrip, NEAR_ZOOM, readLastPosition, saveLastPosition, viewAroundMe, type Fix, type Point } from "@/lib/near-me";
import { GAZA_BBOX, PLACES } from "@/lib/places";
import outline from "../../data/gaza-strip.json";

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

// What the locate button says when it can't put the rider on the map.
const LOCATE_NOTE = {
  looking: "عم ندوّر على مكانك…",
  denied: "مِشوار مش مسموحله يعرف مكانك. اسمحله من إعدادات الجوال، أو دوّر على مشوار من فوق.",
  unknown: "ما قدرنا نعرف مكانك هلأ. جرّب كمان شوي.",
  outside: "مكانك مش جوّا قطاع غزة، فالخريطة بتورجيك القطاع.",
} as const;
type LocateNote = keyof typeof LOCATE_NOTE;
const GPS_OPTIONS: PositionOptions = { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 };
const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function MapView({
  markers,
  line,
  fit = "strip",
  onSelect,
  locate = false,
  className = "h-72",
}: {
  markers: MapMarker[];
  /** Drawn stop to stop, in the order given. */
  line?: [number, number][];
  /** "strip": the whole Gaza Strip. "markers": zoom to what is drawn. */
  fit?: "strip" | "markers";
  onSelect?: (id: string) => void;
  /**
   * The home map: ask for the phone's position when the map opens, zoom in on it with a
   * "you are here" dot and the vehicles around, and show a button to come back to it.
   * Before the GPS answers: the last place this phone was, else the whole Strip.
   */
  locate?: boolean;
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
  const markersRef = useRef(markers);
  useEffect(() => {
    markersRef.current = markers;
  });
  // Locate: the latest fix inside the Strip; whether the map still follows the app's own
  // choice of view (until the rider drags or zooms it); the "you are here" layer.
  const fix = useRef<Fix | null>(null);
  const auto = useRef(true);
  const placing = useRef(false);
  const fittedToVehicles = useRef(false);
  const me = useRef<LayerGroup | null>(null);
  const [note, setNote] = useState<LocateNote | null>(null);

  const showAroundMe = (at: Point) => {
    const ctx = map.current;
    if (!ctx) return;
    const view = viewAroundMe(at, markersRef.current.filter((m) => m.tone !== "stop"));
    placing.current = true;
    if ("center" in view) ctx.map.setView([view.center.lat, view.center.lon], view.zoom);
    else ctx.map.fitBounds(ctx.L.latLngBounds(view.bounds.map((p) => [p.lat, p.lon] as [number, number])).pad(0.3), { maxZoom: NEAR_ZOOM });
    placing.current = false;
  };
  // One GPS answer: draw it; the first one inside the Strip also moves the map there.
  const onFix = (position: GeolocationPosition): boolean => {
    const ctx = map.current;
    const next: Fix = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy, at: position.timestamp };
    if (!ctx || !inStrip(next)) return false;
    const first = fix.current === null;
    fix.current = next;
    saveLastPosition(next);
    me.current?.clearLayers();
    if (me.current) {
      if (next.accuracy < 1000) ctx.L.circle([next.lat, next.lon], { radius: next.accuracy, className: "map-me-accuracy", interactive: false }).addTo(me.current);
      ctx.L.circleMarker([next.lat, next.lon], { radius: 8, className: "map-me", interactive: false }).addTo(me.current);
    }
    if (first && auto.current) showAroundMe(next);
    return true;
  };
  const onLocateTap = () => {
    auto.current = true;
    if (fix.current) {
      setNote(null);
      return showAroundMe(fix.current);
    }
    if (!("geolocation" in navigator)) return setNote("unknown");
    setNote("looking");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!onFix(position)) return setNote("outside");
        setNote(null);
        if (fix.current) showAroundMe(fix.current);
      },
      (error) => setNote(error.code === error.PERMISSION_DENIED ? "denied" : "unknown"),
      GPS_OPTIONS,
    );
  };

  useEffect(() => {
    let alive = true;
    let redraw: (() => void) | undefined;
    let watch: number | undefined;
    // Asked when the map opens (the browser shows its own question the first time); never
    // asked again by itself once the rider said no: the button explains instead.
    const startWatch = async () => {
      if (!("geolocation" in navigator)) return;
      const permission = await navigator.permissions?.query({ name: "geolocation" }).catch(() => null);
      if (!alive || permission?.state === "denied") return;
      watch = navigator.geolocation.watchPosition(onFix, () => {}, GPS_OPTIONS);
    };
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
      // The first view fits the Strip's land (where the places are), not its sea area.
      m.fitBounds(L.latLngBounds(PLACES.map((p) => [p.lat, p.lon] as [number, number])));
      const tiles = L.tileLayer(TILE_URL, {
        attribution: "© OpenStreetMap contributors",
        // CORS requests, so the service worker can keep real copies of the tiles viewed.
        crossOrigin: true,
        maxZoom: 17,
      }).addTo(m);
      // The mask: one big rectangle with the Strip cut out of it, drawn over the tiles
      // and under the route line and the pins.
      const world: [number, number][] = [[20, 20], [20, 50], [45, 50], [45, 20]];
      L.polygon([world, outline.ring as [number, number][]], { className: "map-mask", interactive: false }).addTo(m);
      map.current = { map: m, layer: L.layerGroup().addTo(m), tiles, L };
      if (locate) {
        me.current = L.layerGroup().addTo(m);
        // The rider moved the map: from now on only the button moves it.
        m.on("movestart", () => {
          if (!placing.current) auto.current = false;
        });
        const last = readLastPosition();
        if (last && inStrip(last)) {
          placing.current = true;
          m.setView([last.lat, last.lon], NEAR_ZOOM);
          placing.current = false;
        }
        startWatch();
      }
      // The first time the service worker takes over, load the tiles on screen through it
      // (from the browser's own cache), so they are there when the network is not.
      redraw = () => tiles.redraw();
      navigator.serviceWorker?.addEventListener("controllerchange", redraw);
      box.current.dispatchEvent(new Event("mapready"));
    });
    return () => {
      alive = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      if (redraw) navigator.serviceWorker?.removeEventListener("controllerchange", redraw);
      if (map.current) closeMap(map.current.map);
      map.current = null;
    };
    // The map is made once per mount: `locate` is fixed for a screen, and onFix reads refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Located before the vehicles arrived: widen once to show the nearest one too.
      if (ctx && locate && fix.current && auto.current && !fittedToVehicles.current && markers.length > 0) {
        fittedToVehicles.current = true;
        showAroundMe(fix.current);
      }
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
      {locate && (
        <>
          <button
            type="button"
            onClick={onLocateTap}
            aria-label="وين أنا؟"
            data-locate
            className="absolute bottom-3 left-3 z-[1000] flex size-11 items-center justify-center rounded-full border border-separator bg-surface text-accent shadow-md"
          >
            <LocateIcon />
          </button>
          {note && (
            <p dir="rtl" role="status" className="absolute inset-x-3 top-3 z-[1000] rounded-control bg-surface px-3 py-2 text-caption shadow-md">
              {LOCATE_NOTE[note]}
            </p>
          )}
        </>
      )}
    </div>
  );
}
