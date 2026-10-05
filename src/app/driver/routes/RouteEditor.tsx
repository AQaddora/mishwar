"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { MapView } from "@/components/MapView";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { Sheet } from "@/components/Sheet";
import { MAX_STOPS, validateStops } from "@/lib/driver-rules";
import { newId, type Outcome } from "@/lib/outbox";
import { getPlace, KIND_AR, normalizeArabic, type PickPlace } from "@/lib/places";
import { formatNumber } from "@/lib/time";


const field = "min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body";
const primary = "min-h-11 w-full rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-60";
const secondary = "min-h-11 w-full rounded-control border border-separator bg-surface px-4 py-3 font-medium text-accent disabled:opacity-60";
const iconButton = "flex size-11 shrink-0 items-center justify-center rounded-control text-accent disabled:opacity-30";

export function RouteEditor({
  places,
  route,
}: {
  places: PickPlace[];
  route?: { id: string; name: string; isDefault: boolean; stops: string[] };
}) {
  const { send } = useOutbox();
  const router = useRouter();
  // A new route gets its id on the phone, so saving it twice can never make two routes.
  const [id] = useState(() => route?.id ?? newId());
  const [name, setName] = useState(route?.name ?? "");
  const [stops, setStops] = useState<string[]>(route?.stops ?? []);
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p])), [places]);
  const matches = useMemo(() => {
    const q = normalizeArabic(query);
    return places.filter((p) => !stops.includes(p.id) && (!q || normalizeArabic(p.nameAr).includes(q))).slice(0, 60);
  }, [places, stops, query]);

  // The stops on a small map, joined stop to stop in the driver's order. Read-only.
  const preview = useMemo(() => {
    const points = stops.map((placeId) => getPlace(placeId)).filter((p) => p !== undefined);
    return {
      markers: points.map((p, index) => ({ id: p.id, lat: p.lat, lon: p.lon, label: p.nameAr, text: formatNumber(index + 1), tone: "stop" as const })),
      line: points.map((p) => [p.lat, p.lon] as [number, number]),
    };
  }, [stops]);

  function move(index: number, by: number) {
    setStops((old) => {
      const next = [...old];
      [next[index], next[index + by]] = [next[index + by], next[index]];
      return next;
    });
  }

  async function run(kind: string, payload: unknown, leave: boolean) {
    setBusy(true);
    const result = await send(kind, payload);
    setOutcome(result);
    setBusy(false);
    if (leave && result.status !== "rejected") router.push("/driver/routes");
  }

  function save() {
    const problem = validateStops(stops, (placeId) => byId.has(placeId));
    if (problem) return setOutcome({ status: "rejected", message: problem });
    void run("route.save", { id, name, stops }, true);
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <label htmlFor="route-name" className="font-medium">
          اسم الخط (مش ضروري)
        </label>
        <input
          id="route-name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="مثلاً: خط صلاح الدين"
          className={field}
        />
      </div>

      <section className="flex flex-col gap-2">
        <h2 className="font-medium">المواقف بالترتيب</h2>
        {stops.length === 0 ? (
          <p className="text-text-muted">ضيف أول موقف، وبعدين اللي بعده، لآخر الخط.</p>
        ) : (
          <ol className="divide-y divide-separator rounded-card bg-surface">
            {stops.map((placeId, index) => (
              <li key={placeId} className="flex items-center gap-1 ps-4 pe-1">
                <span className="w-6 shrink-0 text-text-muted">
                  <bdi>{formatNumber(index + 1)}</bdi>
                </span>
                <span className="min-w-0 flex-1 py-3">
                  <span className="block truncate">{byId.get(placeId)?.nameAr ?? "مكان مش معروف"}</span>
                  {index === 0 && <span className="block text-caption text-text-muted">أول الخط</span>}
                </span>
                <button type="button" aria-label="طلّعه لفوق" disabled={index === 0} onClick={() => move(index, -1)} className={iconButton}>
                  ↑
                </button>
                <button type="button" aria-label="نزّله لتحت" disabled={index === stops.length - 1} onClick={() => move(index, 1)} className={iconButton}>
                  ↓
                </button>
                <button type="button" aria-label="شيل الموقف" onClick={() => setStops((old) => old.filter((s) => s !== placeId))} className={`${iconButton} text-danger`}>
                  ×
                </button>
              </li>
            ))}
          </ol>
        )}
        {stops.length >= 2 && <MapView markers={preview.markers} line={preview.line} fit="markers" className="h-56" />}
        <p className="text-caption text-text-muted">الخط بيمشي رايح جاي على نفس المواقف.</p>
        {stops.length < MAX_STOPS && (
          <button type="button" onClick={() => setPicking(true)} className={secondary}>
            ضيف موقف
          </button>
        )}
      </section>

      <SaveNote outcome={outcome} />
      <button type="button" disabled={busy} onClick={save} className={primary}>
        احفظ الخط
      </button>

      {route && !route.isDefault && (
        <>
          <button type="button" disabled={busy} onClick={() => void run("route.setDefault", { id }, true)} className={secondary}>
            خلّيه الخط الأساسي
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run("route.delete", { id }, true)}
            className="min-h-11 w-full rounded-control bg-surface px-4 py-3 text-danger disabled:opacity-60"
          >
            امسح الخط
          </button>
        </>
      )}

      <Sheet
        open={picking}
        onClose={() => {
          setPicking(false);
          setQuery("");
        }}
        title="اختار موقف"
      >
        <div className="sticky top-0 bg-surface p-4">
          <label htmlFor="place-search" className="sr-only">
            دوّر على مكان
          </label>
          <input
            id="place-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="دوّر على مكان"
            className={field}
          />
        </div>
        <ul className="divide-y divide-separator pb-4">
          {matches.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setStops((old) => [...old, p.id]);
                  setPicking(false);
                  setQuery("");
                }}
                className="flex min-h-11 w-full items-center justify-between gap-3 px-4 py-3 text-start"
              >
                <span className="min-w-0 truncate">{p.nameAr}</span>
                <span className="shrink-0 text-caption text-text-muted">{KIND_AR[p.kind] ?? ""}</span>
              </button>
            </li>
          ))}
          {matches.length === 0 && <li className="px-4 py-3 text-text-muted">ما لقينا مكان بهالاسم.</li>}
        </ul>
        <p className="px-4 pb-4 text-caption text-text-muted">
          الأماكن من <bdi>© OpenStreetMap contributors</bdi>
        </p>
      </Sheet>
    </div>
  );
}
