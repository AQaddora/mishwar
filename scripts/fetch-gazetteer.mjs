// Regenerates data/gazetteer.json from OpenStreetMap (Overpass API).
// Usage: node scripts/fetch-gazetteer.mjs
// Names and coordinates are copied from OSM elements as they are: nothing is typed by
// hand, translated or rounded. See data/README.md.
import fs from "node:fs";

const ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];
// The five governorates of the Gaza Strip, by their ISO 3166-2 codes in OSM.
const QUERY = `
[out:json][timeout:170];
rel(31.2,34.2,31.6,34.6)["ISO3166-2"~"^PS-(NGZ|GZA|DEB|KYS|RFH)$"]->.r;
.r map_to_area->.gov;
(
  node(area.gov)["place"~"^(city|town|village|suburb|neighbourhood|quarter|hamlet)$"]["name"];
  node(area.gov)["highway"~"^(motorway_junction|mini_roundabout)$"]["name"];
  node(area.gov)["junction"]["name"];
  nwr(area.gov)["place"="square"]["name"];
  nwr(area.gov)["amenity"~"^(bus_station|taxi|hospital|university|marketplace)$"]["name"];
  nwr(area.gov)["highway"="bus_stop"]["name"];
  nwr(area.gov)["public_transport"~"^(station|stop_position|platform)$"]["name"];
);
out center tags;
.r out tags;
`;

const KIND = (t) =>
  t.place === "square" ? "square"
  : t.place ? t.place
  : t.junction || t.highway === "motorway_junction" || t.highway === "mini_roundabout" ? "junction"
  : t.amenity === "bus_station" || t.amenity === "taxi" || t.highway === "bus_stop" || t.public_transport ? "stand"
  : t.amenity;

async function overpass() {
  let last;
  for (const url of ENDPOINTS) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "mishwar-gazetteer/1.0" },
        body: "data=" + encodeURIComponent(QUERY),
      });
      console.error(url, r.status);
      if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
      return await r.json();
    } catch (e) {
      last = e;
    }
  }
  throw last;
}

const json = await overpass();
const governorates = [];
const places = [];
const seen = new Set();
for (const el of json.elements) {
  const t = el.tags ?? {};
  if (el.type === "relation" && t["ISO3166-2"]) {
    governorates.push({ code: t["ISO3166-2"], nameAr: t["name:ar"] ?? t.name, nameEn: t["name:en"] });
    continue;
  }
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  const nameAr = t["name:ar"] ?? t.name;
  if (lat == null || lon == null || !nameAr) continue;
  const id = `${el.type}/${el.id}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const p = { id, nameAr, kind: KIND(t), lat, lon };
  if (t["name:en"]) p.nameEn = t["name:en"];
  places.push(p);
}
places.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));
governorates.sort((a, b) => a.code.localeCompare(b.code));

const out = {
  source: "OpenStreetMap via Overpass API. © OpenStreetMap contributors, ODbL.",
  extractDate: (json.osm3s?.timestamp_osm_base ?? new Date().toISOString()).slice(0, 10),
  governorates,
  places,
};
const body =
  "{\n" +
  `"source": ${JSON.stringify(out.source)},\n"extractDate": ${JSON.stringify(out.extractDate)},\n` +
  `"governorates": ${JSON.stringify(out.governorates)},\n"places": [\n` +
  out.places.map((p) => JSON.stringify(p)).join(",\n") +
  "\n]\n}\n";
fs.writeFileSync(new URL("../data/gazetteer.json", import.meta.url), body);
console.log(`${places.length} places, ${governorates.length} governorates, ${body.length} bytes, OSM data of ${out.extractDate}`);
