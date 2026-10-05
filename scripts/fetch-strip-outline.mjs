// npm run strip-outline — rewrites data/gaza-strip.json: the outline of the Gaza Strip
// from OpenStreetMap (relation 1473938). The map uses it to cover everything outside
// the Strip. Coordinates are OSM's own, only simplified; nothing is typed by hand.
import fs from "node:fs";

const url =
  "https://nominatim.openstreetmap.org/lookup?osm_ids=R1473938&format=jsonv2&polygon_geojson=1&polygon_threshold=0.0005";
const response = await fetch(url, { headers: { "User-Agent": "mishwar-build/1.0 (github.com/AQaddora/mishwar)" } });
if (!response.ok) throw new Error(`Nominatim answered ${response.status}`);
const [relation] = await response.json();
const geometry = relation?.geojson;
if (geometry?.type !== "Polygon") throw new Error(`expected a Polygon, got ${geometry?.type}`);
const ring = geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);
if (ring.length < 20) throw new Error("the outline is suspiciously short; not writing it");

const body = {
  source: "OpenStreetMap relation/1473938 (قطاع غزة), via Nominatim, simplified to about 50 m. © OpenStreetMap contributors, ODbL.",
  fetched: new Date().toISOString().slice(0, 10),
  note: "The outline includes the Strip's sea area. Regenerate with: npm run strip-outline",
  ring,
};
const text = JSON.stringify(body).replace('"ring":[', '"ring":[\n').replaceAll("],[", "],\n[");
fs.writeFileSync(new URL("../data/gaza-strip.json", import.meta.url), text + "\n");
console.log(`data/gaza-strip.json: ${ring.length} points`);
