// A compact binary form for live positions: the map's vehicle positions inside the
// routine sync, the driver's GPS point and the rider's shared point. Shared by the
// server and the phone. JSON stays the default; a phone asks for this one with
// `Accept: application/octet-stream` (sync) or sends it with that Content-Type (points).
//
// Why: positions are the part of the sync that is sent whole every 30 seconds, and as
// JSON each one is ~100 bytes (a 25-character id, 15-digit floats, an ISO time) that gzip
// cannot shrink much. Here a vehicle on the road costs about 7 bytes.
//
// Everything is little more than three ideas:
//   - coordinates are whole numbers of 1e-5 degree (about 1.1 m, finer than phone GPS),
//     stored as two u16 offsets from the Gaza Strip's south-west corner (4 bytes);
//     a point outside that box still works, as two zigzag varints of absolute 1e-5 degrees;
//   - vehicles are named by a small number (`n`, Vehicle.seq), which the phone already
//     holds from the vehicles part of the sync, sorted and sent as gaps (1 byte each);
//   - times are ages in whole seconds before the response's serverTime (1–2 bytes).
//
// Layouts (version 1). varint = unsigned LEB128; u16 = big-endian.
//   point:   varint head = age·4 + (outside ? 2 : 0) + (speed ? 1 : 0)
//            inside: u16 dLat, u16 dLon   outside: zigzag lat·1e5, zigzag lon·1e5
//            speed:  u8 quarter metres per second (0–63.75 m/s), only when flagged
//   sync:    u8 version · varint jsonLength · JSON (the usual response, positions: [])
//            · varint count · count × (varint gap in n · point)
//   driver:  u8 version · u8 kind=1 · point (age = how old the GPS fix is)
//   share:   u8 version · u8 kind=2 · u8 idLength · id (ASCII) · point (age = fix age);
//            idLength 0 = a lowercase UUID in 16 bytes
//
// A decoder never trusts its input: every read is bounds-checked, lengths are capped,
// and anything left over or out of range throws CodecError.
import { GAZA_BBOX } from "@/lib/places";
import type { SyncPosition, SyncResponse } from "@/lib/public-data";

export const BINARY_TYPE = "application/octet-stream";
export const CODEC_VERSION = 1;
const KIND_DRIVER = 1;
const KIND_SHARE = 2;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 1e-5 degree units. The origin is the Strip's south-west corner. */
const E5 = 1e5;
const ORIGIN_LAT = Math.round(GAZA_BBOX.south * E5);
const ORIGIN_LON = Math.round(GAZA_BBOX.west * E5);
const SPEED_STEP = 4; // quarter m/s
const MAX_JSON = 4 * 1024 * 1024;
const MAX_POINTS = 100_000;

export class CodecError extends Error {}

export type Point = { lat: number; lon: number; speed?: number | null; ageSec: number };

class Writer {
  private bytes: number[] = [];
  u8(n: number) {
    this.bytes.push(n & 0xff);
  }
  u16(n: number) {
    this.bytes.push((n >>> 8) & 0xff, n & 0xff);
  }
  varint(n: number) {
    if (!Number.isSafeInteger(n) || n < 0) throw new CodecError(`varint out of range: ${n}`);
    while (n >= 0x80) {
      this.bytes.push((n % 0x80) | 0x80);
      n = Math.floor(n / 0x80);
    }
    this.bytes.push(n);
  }
  zigzag(n: number) {
    this.varint(n >= 0 ? n * 2 : -n * 2 - 1);
  }
  raw(b: Uint8Array) {
    for (const x of b) this.bytes.push(x);
  }
  done(): Uint8Array<ArrayBuffer> {
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private off = 0;
  constructor(private readonly b: Uint8Array) {}
  private need(n: number) {
    if (this.off + n > this.b.length) throw new CodecError("truncated");
  }
  u8(): number {
    this.need(1);
    return this.b[this.off++];
  }
  u16(): number {
    this.need(2);
    const v = (this.b[this.off] << 8) | this.b[this.off + 1];
    this.off += 2;
    return v;
  }
  varint(): number {
    let value = 0;
    let scale = 1;
    for (let i = 0; i < 8; i++) {
      const byte = this.u8();
      value += (byte & 0x7f) * scale;
      if (byte < 0x80) {
        if (!Number.isSafeInteger(value)) break;
        return value;
      }
      scale *= 0x80;
    }
    throw new CodecError("varint too long");
  }
  zigzag(): number {
    const z = this.varint();
    return z % 2 === 0 ? z / 2 : -(z + 1) / 2;
  }
  bytes(n: number): Uint8Array {
    this.need(n);
    const out = this.b.subarray(this.off, this.off + n);
    this.off += n;
    return out;
  }
  end() {
    if (this.off !== this.b.length) throw new CodecError("trailing bytes");
  }
}

const validLatLon = (lat: number, lon: number) => Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;

function writePoint(w: Writer, p: Point) {
  if (!validLatLon(p.lat, p.lon)) throw new CodecError("bad coordinates");
  const lat = Math.round(p.lat * E5);
  const lon = Math.round(p.lon * E5);
  const dLat = lat - ORIGIN_LAT;
  const dLon = lon - ORIGIN_LON;
  const inside = dLat >= 0 && dLat <= 0xffff && dLon >= 0 && dLon <= 0xffff;
  const hasSpeed = p.speed != null && Number.isFinite(p.speed) && p.speed >= 0;
  const age = Math.max(0, Math.floor(p.ageSec));
  w.varint(age * 4 + (inside ? 0 : 2) + (hasSpeed ? 1 : 0));
  if (inside) {
    w.u16(dLat);
    w.u16(dLon);
  } else {
    w.zigzag(lat);
    w.zigzag(lon);
  }
  if (hasSpeed) w.u8(Math.min(255, Math.round((p.speed as number) * SPEED_STEP)));
}

function readPoint(r: Reader): Point {
  const head = r.varint();
  const hasSpeed = head % 2 === 1;
  const outside = Math.floor(head / 2) % 2 === 1;
  const ageSec = Math.floor(head / 4);
  const lat = outside ? r.zigzag() : ORIGIN_LAT + r.u16();
  const lon = outside ? r.zigzag() : ORIGIN_LON + r.u16();
  if (!validLatLon(lat / E5, lon / E5)) throw new CodecError("bad coordinates");
  const point: Point = { lat: lat / E5, lon: lon / E5, ageSec };
  if (hasSpeed) point.speed = r.u8() / SPEED_STEP;
  return point;
}

function readVersion(r: Reader) {
  const version = r.u8();
  if (version !== CODEC_VERSION) throw new CodecError(`unknown version ${version}`);
}

// ---- The routine sync ----

/** A position with the vehicle's small number, ready for the binary sync. */
export type NumberedPosition = { n: number; lat: number; lon: number; speed?: number | null; at: Date };

export function encodeSyncFrame(response: SyncResponse, positions: NumberedPosition[]): Uint8Array<ArrayBuffer> {
  const serverTime = Date.parse(response.serverTime);
  const json = new TextEncoder().encode(JSON.stringify({ ...response, changes: { ...response.changes, positions: [] } }));
  const w = new Writer();
  w.u8(CODEC_VERSION);
  w.varint(json.length);
  w.raw(json);
  const sorted = [...positions].sort((a, b) => a.n - b.n);
  w.varint(sorted.length);
  let previous = 0;
  for (const [i, p] of sorted.entries()) {
    if (!Number.isSafeInteger(p.n) || p.n < 0 || (i > 0 && p.n <= previous)) throw new CodecError(`bad vehicle number ${p.n}`);
    w.varint(p.n - previous);
    previous = p.n;
    writePoint(w, { lat: p.lat, lon: p.lon, speed: p.speed, ageSec: Math.max(0, (serverTime - p.at.getTime()) / 1000) });
  }
  return w.done();
}

/**
 * Decodes a binary sync. `idOf` turns a vehicle's small number into its id: from the
 * vehicles in this same response first, then the phone's own copy. Positions of vehicles
 * the phone does not know are left out and counted in `unknown`.
 */
export function decodeSyncFrame(bytes: Uint8Array, idOf: (n: number) => string | undefined): { response: SyncResponse; unknown: number } {
  const r = new Reader(bytes);
  readVersion(r);
  const length = r.varint();
  if (length > MAX_JSON) throw new CodecError("json too long");
  let response: SyncResponse;
  try {
    response = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(r.bytes(length)));
  } catch (error) {
    throw error instanceof CodecError ? error : new CodecError("bad json part");
  }
  if (!response || typeof response !== "object" || !response.changes || typeof response.serverTime !== "string") throw new CodecError("bad json part");
  const serverTime = Date.parse(response.serverTime);
  if (!Number.isFinite(serverTime)) throw new CodecError("bad serverTime");
  const fromResponse = new Map((response.changes.vehicles ?? []).flatMap((v) => (typeof v.n === "number" ? [[v.n, v.id] as const] : [])));
  const count = r.varint();
  if (count > MAX_POINTS) throw new CodecError("too many positions");
  const positions: SyncPosition[] = [];
  let n = 0;
  let unknown = 0;
  for (let i = 0; i < count; i++) {
    n += r.varint();
    const p = readPoint(r);
    const id = fromResponse.get(n) ?? idOf(n);
    if (!id) {
      unknown++;
      continue;
    }
    positions.push({ id, lat: p.lat, lon: p.lon, ...(p.speed != null ? { speed: p.speed } : {}), at: new Date(serverTime - p.ageSec * 1000).toISOString() });
  }
  r.end();
  response.changes.positions = positions;
  return { response, unknown };
}

// ---- The two points a phone sends ----

export function encodeDriverPoint(p: Point): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.u8(CODEC_VERSION);
  w.u8(KIND_DRIVER);
  writePoint(w, p);
  return w.done();
}

export function decodeDriverPoint(bytes: Uint8Array): Point {
  const r = new Reader(bytes);
  readVersion(r);
  if (r.u8() !== KIND_DRIVER) throw new CodecError("not a driver point");
  const p = readPoint(r);
  r.end();
  return p;
}

export function encodeSharePoint(id: string, p: Point): Uint8Array<ArrayBuffer> {
  const w = new Writer();
  w.u8(CODEC_VERSION);
  w.u8(KIND_SHARE);
  if (UUID.test(id)) {
    // The ids the app makes are UUIDs: 16 bytes instead of 36 characters (as Otlob Li's SMS code did).
    w.u8(0);
    for (let i = 0, hex = id.replace(/-/g, ""); i < 32; i += 2) w.u8(parseInt(hex.slice(i, i + 2), 16));
  } else {
    if (!/^[\x21-\x7e]{1,64}$/.test(id)) throw new CodecError("bad share id");
    w.u8(id.length);
    w.raw(new TextEncoder().encode(id));
  }
  writePoint(w, p);
  return w.done();
}

export function decodeSharePoint(bytes: Uint8Array): { id: string } & Point {
  const r = new Reader(bytes);
  readVersion(r);
  if (r.u8() !== KIND_SHARE) throw new CodecError("not a share point");
  const length = r.u8();
  let id: string;
  if (length === 0) {
    const hex = Array.from(r.bytes(16), (b) => b.toString(16).padStart(2, "0")).join("");
    id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } else {
    if (length > 64) throw new CodecError("bad share id");
    id = String.fromCharCode(...r.bytes(length));
    if (!/^[\x21-\x7e]+$/.test(id)) throw new CodecError("bad share id");
  }
  const p = readPoint(r);
  r.end();
  return { id, ...p };
}

/** True when the request asks for (Accept) the binary sync. */
export function wantsBinary(request: Request): boolean {
  return (request.headers.get("accept") ?? "").toLowerCase().includes(BINARY_TYPE);
}

/** True when the request body is binary (Content-Type). */
export function sentBinary(request: Request): boolean {
  return (request.headers.get("content-type") ?? "").toLowerCase().startsWith(BINARY_TYPE);
}

/** Coordinates rounded to 1e-5 degree (about 1 m), for the JSON form too. */
export const round5 = (n: number) => Math.round(n * E5) / E5;

// ---- When a phone sends its next point ----

/** Moved at least this far since the last point sent: send now. */
export const SEND_MIN_METERS = 15;
/** Standing still: still send this often, so the point never looks lost (stale is 5 min). */
export const SEND_HEARTBEAT_MS = 60_000;

/**
 * A parked ajala waiting for riders sends one point a minute instead of four: the same
 * place again tells nobody anything new. Rough metres are plenty for a 15 m threshold.
 */
export function worthSending(last: { lat: number; lon: number; sentAt: number } | null, next: { lat: number; lon: number }, now: number): boolean {
  if (!last || now - last.sentAt >= SEND_HEARTBEAT_MS) return true;
  const dy = (next.lat - last.lat) * 111_320;
  const dx = (next.lon - last.lon) * 111_320 * Math.cos((next.lat * Math.PI) / 180);
  return Math.hypot(dx, dy) >= SEND_MIN_METERS;
}

/** How old a GPS fix is, in seconds, from the phone's own timestamp (0–60). */
export function fixAgeSec(fixAt: number, now: number): number {
  return Number.isFinite(fixAt) ? Math.min(60, Math.max(0, (now - fixAt) / 1000)) : 0;
}
