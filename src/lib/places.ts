// Places come from OpenStreetMap only (data/gazetteer.json), plus Ahmed's hand-checked
// additions in data/places-extra.json. Never add a place or a coordinate in code.
import gazetteer from "../../data/gazetteer.json";
import extra from "../../data/places-extra.json";

export type Place = {
  /** OSM element, like "node/123456" (or "manual/…" for places-extra.json). */
  id: string;
  nameAr: string;
  nameEn?: string;
  kind: string;
  lat: number;
  lon: number;
  source?: string;
};

/** The Gaza Strip's bounding box: south, west, north, east. */
export const GAZA_BBOX = { south: 31.21, west: 34.21, north: 31.6, east: 34.57 } as const;

export const EXTRACT_DATE: string = gazetteer.extractDate;

export const PLACES: Place[] = [...(gazetteer.places as Place[]), ...(extra as Place[])];

const byId = new Map(PLACES.map((p) => [p.id, p]));

export function getPlace(id: string): Place | undefined {
  return byId.get(id);
}

export function placeName(id: string): string {
  return byId.get(id)?.nameAr ?? "مكان مش معروف";
}

export const KIND_AR: Record<string, string> = {
  city: "مدينة",
  town: "بلدة",
  village: "قرية",
  suburb: "حي",
  neighbourhood: "حي",
  quarter: "حي",
  hamlet: "قرية",
  junction: "مفترق",
  square: "ميدان",
  stand: "موقف",
  hospital: "مستشفى",
  university: "جامعة",
  marketplace: "سوق",
};

// Arabic search that forgives hamza forms, taa marbuta, alef maqsura and diacritics.
export function normalizeArabic(text: string): string {
  return text
    .replace(/[ً-ْـ‎‏]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .trim();
}

export type PickPlace = Pick<Place, "id" | "nameAr" | "kind">;

// Places for a picker list: towns and junctions first, then the rest, each group by name.
const KIND_RANK: Record<string, number> = { city: 0, town: 1, junction: 2, square: 2, stand: 3, village: 4, suburb: 5 };
export function pickerPlaces(): PickPlace[] {
  return PLACES.map(({ id, nameAr, kind }) => ({ id, nameAr, kind })).sort(
    (a, b) => (KIND_RANK[a.kind] ?? 9) - (KIND_RANK[b.kind] ?? 9) || a.nameAr.localeCompare(b.nameAr, "ar"),
  );
}
