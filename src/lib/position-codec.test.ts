import { describe, expect, it } from "vitest";
import { PLACES } from "@/lib/places";
import type { SyncResponse } from "@/lib/public-data";
import {
  CodecError,
  decodeDriverPoint,
  decodeSharePoint,
  decodeSyncFrame,
  encodeDriverPoint,
  encodeSharePoint,
  encodeSyncFrame,
  fixAgeSec,
  round5,
  worthSending,
  type NumberedPosition,
} from "./position-codec";

const T = new Date("2026-10-06T08:00:00.000Z");
const empty = (vehicles: { id: string; n: number }[] = []): SyncResponse => ({
  cursor: new Date(T.getTime() - 5000).toISOString(),
  serverTime: T.toISOString(),
  changes: {
    routes: [],
    vehicles: vehicles.map((v) => ({ ...v, driverId: `d${v.n}`, driverName: "سوّاق", type: "ajala", seats: 10, free: 10, photos: [] })),
    schedule: [],
    positions: [],
    bookings: [],
    requests: [],
    offers: [],
    messages: [],
  },
  deleted: { routes: [], vehicles: [] },
  more: false,
});

// A small seeded generator, so a failing fuzz case can be replayed.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe("binary sync frame", () => {
  it("round-trips real Gaza places to within half a 1e-5 degree, with speeds and ages", () => {
    const positions: NumberedPosition[] = PLACES.slice(0, 50).map((p, i) => ({
      n: i * 3 + 1,
      lat: p.lat + 1.23456e-7,
      lon: p.lon - 9.8765e-8,
      speed: i % 4 === 0 ? null : (i * 0.37) % 30,
      at: new Date(T.getTime() - i * 7_300),
    }));
    const ids = new Map(positions.map((p) => [p.n, `vehicle-${p.n}`]));
    const { response, unknown } = decodeSyncFrame(encodeSyncFrame(empty(), positions), (n) => ids.get(n));
    expect(unknown).toBe(0);
    expect(response.changes.positions).toHaveLength(50);
    for (const p of positions) {
      const got = response.changes.positions.find((x) => x.id === `vehicle-${p.n}`)!;
      expect(Math.abs(got.lat - p.lat)).toBeLessThanOrEqual(0.5e-5 + 1e-12);
      expect(Math.abs(got.lon - p.lon)).toBeLessThanOrEqual(0.5e-5 + 1e-12);
      if (p.speed == null) expect(got.speed).toBeUndefined();
      else expect(Math.abs(got.speed! - p.speed)).toBeLessThanOrEqual(0.125);
      // Whole seconds: the age on screen is in minutes.
      expect(T.getTime() - Date.parse(got.at)).toBe(Math.floor((T.getTime() - p.at.getTime()) / 1000) * 1000);
    }
  });

  it("keeps the rest of the response exactly as JSON would", () => {
    const body = empty([{ id: "v1", n: 1 }]);
    body.changes.routes.push({ id: "r1", driverId: "d1", name: "خط صلاح الدين", isDefault: true, stops: ["node/1", "node/2"] });
    const { response } = decodeSyncFrame(encodeSyncFrame(body, [{ n: 1, lat: 31.5, lon: 34.45, at: T }]), () => undefined);
    expect({ ...response, changes: { ...response.changes, positions: [] } }).toEqual(body);
    expect(response.changes.positions).toEqual([{ id: "v1", lat: 31.5, lon: 34.45, at: T.toISOString() }]);
  });

  it("names vehicles from the same response first, then from the phone's copy, and counts the unknown", () => {
    const frame = encodeSyncFrame(empty([{ id: "new", n: 9 }]), [
      { n: 2, lat: 31.4, lon: 34.4, at: T },
      { n: 9, lat: 31.41, lon: 34.41, at: T },
      { n: 300, lat: 31.42, lon: 34.42, at: T },
    ]);
    const { response, unknown } = decodeSyncFrame(frame, (n) => (n === 2 ? "old" : undefined));
    expect(response.changes.positions.map((p) => p.id)).toEqual(["old", "new"]);
    expect(unknown).toBe(1);
  });

  it("still carries a point outside the Strip's box (absolute coordinates)", () => {
    const far = [
      { n: 1, lat: 31.9, lon: 35.2, at: T },
      { n: 2, lat: -33.86882, lon: 151.20929, speed: 3, at: T },
      { n: 3, lat: 31.2, lon: 34.2, at: T },
    ];
    const { response } = decodeSyncFrame(encodeSyncFrame(empty(), far), (n) => `v${n}`);
    expect(response.changes.positions.map((p) => [p.lat, p.lon])).toEqual([
      [31.9, 35.2],
      [-33.86882, 151.20929],
      [31.2, 34.2],
    ]);
  });

  it("is small: 50 vehicles on the road cost under 8 bytes each", () => {
    const positions = PLACES.slice(0, 50).map((p, i) => ({ n: i + 1, lat: p.lat, lon: p.lon, speed: 8.3, at: new Date(T.getTime() - 20_000) }));
    const withPositions = encodeSyncFrame(empty(), positions).length;
    const without = encodeSyncFrame(empty(), []).length;
    expect((withPositions - without) / 50).toBeLessThan(8);
  });

  it("refuses broken frames with a CodecError, never anything else", () => {
    const good = encodeSyncFrame(empty(), [{ n: 1, lat: 31.5, lon: 34.4, speed: 2, at: T }]);
    const bad: Uint8Array[] = [
      new Uint8Array(),
      Uint8Array.of(2, ...good.subarray(1)), // unknown version
      good.subarray(0, good.length - 1), // truncated
      Uint8Array.of(...good, 0), // trailing byte
      Uint8Array.of(1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff), // runaway varint
      Uint8Array.of(1, 2, 0x7b, 0x7d, 0), // "{}" is not a sync response
    ];
    for (const bytes of bad) expect(() => decodeSyncFrame(bytes, () => "x")).toThrow(CodecError);
  });

  it("refuses to encode a vehicle number twice or a broken coordinate", () => {
    expect(() => encodeSyncFrame(empty(), [{ n: 1, lat: 31.5, lon: 34.4, at: T }, { n: 1, lat: 31.5, lon: 34.4, at: T }])).toThrow(CodecError);
    expect(() => encodeSyncFrame(empty(), [{ n: 1, lat: Number.NaN, lon: 34.4, at: T }])).toThrow(CodecError);
  });
});

describe("fuzz", () => {
  it("random positions anywhere on earth round-trip (2,000 frames)", () => {
    const r = rng(42);
    for (let round = 0; round < 2000; round++) {
      const count = Math.floor(r() * 12);
      const used = new Set<number>();
      const positions: NumberedPosition[] = [];
      for (let i = 0; i < count; i++) {
        const n = r() < 0.1 ? Math.floor(r() * 2 ** 40) : Math.floor(r() * 500);
        if (used.has(n)) continue;
        used.add(n);
        const inGaza = r() < 0.8;
        positions.push({
          n,
          lat: inGaza ? 31.21 + r() * 0.39 : (r() - 0.5) * 180,
          lon: inGaza ? 34.21 + r() * 0.36 : (r() - 0.5) * 360,
          speed: r() < 0.3 ? null : r() * 80,
          at: new Date(T.getTime() - Math.floor(r() * (r() < 0.1 ? 1e10 : 600_000))),
        });
      }
      const { response, unknown } = decodeSyncFrame(encodeSyncFrame(empty(), positions), (n) => `v${n}`);
      expect(unknown).toBe(0);
      expect(response.changes.positions).toHaveLength(positions.length);
      for (const p of positions) {
        const got = response.changes.positions.find((x) => x.id === `v${p.n}`)!;
        expect(got.lat).toBeCloseTo(round5(p.lat), 9);
        expect(got.lon).toBeCloseTo(round5(p.lon), 9);
        if (p.speed == null) expect(got.speed).toBeUndefined();
        else expect(got.speed).toBeCloseTo(Math.min(63.75, Math.round(p.speed * 4) / 4), 9);
      }
    }
  });

  it("random bytes and mutated frames never crash the decoder with anything but a CodecError (20,000 inputs)", () => {
    const r = rng(7);
    const good = encodeSyncFrame(empty([{ id: "a", n: 1 }]), PLACES.slice(0, 8).map((p, i) => ({ n: i + 1, lat: p.lat, lon: p.lon, speed: i, at: T })));
    const point = encodeDriverPoint({ lat: 31.5, lon: 34.4, speed: 3, ageSec: 2 });
    const share = encodeSharePoint("cmuwxo0pw0003npyq8vi3ojyf", { lat: 31.5, lon: 34.4, ageSec: 0 });
    for (let i = 0; i < 20_000; i++) {
      const source = [good, point, share][i % 3];
      const bytes = r() < 0.2 ? Uint8Array.from({ length: Math.floor(r() * 40) }, () => Math.floor(r() * 256)) : Uint8Array.from(source);
      for (let k = 0, flips = 1 + Math.floor(r() * 3); k < flips && bytes.length; k++) bytes[Math.floor(r() * bytes.length)] = Math.floor(r() * 256);
      const cut = r() < 0.2 ? bytes.subarray(0, Math.floor(r() * bytes.length)) : bytes;
      for (const decode of [(b: Uint8Array) => decodeSyncFrame(b, () => "x"), decodeDriverPoint, decodeSharePoint]) {
        try {
          const out = decode(cut);
          // Whatever decodes is still a valid point.
          const pts = "response" in out ? out.response.changes.positions : [out];
          for (const p of pts) {
            expect(Math.abs(p.lat)).toBeLessThanOrEqual(90);
            expect(Math.abs(p.lon)).toBeLessThanOrEqual(180);
          }
        } catch (error) {
          expect(error).toBeInstanceOf(CodecError);
        }
      }
    }
  });
});

describe("the points a phone sends", () => {
  it("a driver's point is 7 bytes in the Strip, 8 with a speed", () => {
    expect(encodeDriverPoint({ lat: 31.51234567891234, lon: 34.45678912345678, ageSec: 3 }).length).toBe(7);
    const bytes = encodeDriverPoint({ lat: 31.51234567891234, lon: 34.45678912345678, speed: 8.329999923706055, ageSec: 3.9 });
    expect(bytes.length).toBe(8);
    expect(decodeDriverPoint(bytes)).toEqual({ lat: 31.51235, lon: 34.45679, speed: 8.25, ageSec: 3 });
  });

  it("a rider's shared point carries a UUID share id in 16 bytes (24 bytes in all)", () => {
    const id = "00000000-0000-4000-8000-0000000000c2";
    const bytes = encodeSharePoint(id, { lat: 31.52, lon: 34.44, ageSec: 2 });
    expect(bytes.length).toBe(3 + 16 + 5);
    expect(decodeSharePoint(bytes)).toEqual({ id, lat: 31.52, lon: 34.44, ageSec: 2 });
    // Upper case is not what the app makes: it travels as text, so it comes back unchanged.
    expect(decodeSharePoint(encodeSharePoint(id.toUpperCase(), { lat: 31.52, lon: 34.44, ageSec: 0 })).id).toBe(id.toUpperCase());
  });

  it("a rider's shared point carries any other share id as text", () => {
    const id = "cmuwxo0pw0003npyq8vi3ojyf";
    const bytes = encodeSharePoint(id, { lat: 31.52, lon: 34.44, ageSec: 0 });
    expect(bytes.length).toBe(3 + id.length + 5);
    expect(decodeSharePoint(bytes)).toEqual({ id, lat: 31.52, lon: 34.44, ageSec: 0 });
  });

  it("a driver's point is not a share point, and the other way round", () => {
    expect(() => decodeSharePoint(encodeDriverPoint({ lat: 31.5, lon: 34.4, ageSec: 0 }))).toThrow(CodecError);
    expect(() => decodeDriverPoint(encodeSharePoint("abc", { lat: 31.5, lon: 34.4, ageSec: 0 }))).toThrow(CodecError);
    expect(() => encodeSharePoint("no spaces allowed", { lat: 31.5, lon: 34.4, ageSec: 0 })).toThrow(CodecError);
  });

  it("standing still sends once a minute; moving 15 m sends at once", () => {
    const at = { lat: 31.5, lon: 34.45 };
    expect(worthSending(null, at, 0)).toBe(true);
    const last = { ...at, sentAt: 0 };
    expect(worthSending(last, { lat: 31.50005, lon: 34.45 }, 15_000)).toBe(false); // ~5.6 m
    expect(worthSending(last, { lat: 31.5002, lon: 34.45 }, 15_000)).toBe(true); // ~22 m
    expect(worthSending(last, { lat: 31.5, lon: 34.45012 }, 15_000)).toBe(false); // ~11 m east
    expect(worthSending(last, at, 59_999)).toBe(false);
    expect(worthSending(last, at, 60_000)).toBe(true);
  });

  it("a fix's age is 0–60 seconds", () => {
    expect(fixAgeSec(1000, 4500)).toBe(3.5);
    expect(fixAgeSec(5000, 1000)).toBe(0);
    expect(fixAgeSec(0, 10_000_000)).toBe(60);
    expect(fixAgeSec(Number.NaN, 1)).toBe(0);
  });
});
