"use client";

import { useMemo, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { PlacePicker } from "@/components/PlacePicker";
import { VehicleCard, VehicleCardSkeleton, VehicleSheet } from "@/components/VehicleCards";
import { placeName, type PickPlace } from "@/lib/places";
import { searchVehicles } from "@/lib/rider-rules";
import { addDays, gazaNow, weekdayOf } from "@/lib/time";
import { usePublicData } from "@/lib/use-public-data";

type When = "now" | "today" | "tomorrow";
const field = "min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body";

export function SearchClient({
  places,
  initial,
}: {
  places: PickPlace[];
  initial: { from: string | null; to: string | null; when: When; time: string | null };
}) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [when, setWhen] = useState<When>(initial.when);
  const [time, setTime] = useState(initial.time ?? "08:00");
  const [openId, setOpenId] = useState<string | null>(null);

  const isNow = when === "now";
  const results = useMemo(() => {
    if (!ready || !from || !to) return null;
    const current = gazaNow(new Date(now));
    const day = when === "tomorrow" ? addDays(current.day, 1) : current.day;
    const at = isNow ? current : { day, weekday: weekdayOf(day), time };
    return searchVehicles(data, { from, to, at, isNow });
  }, [data, ready, now, from, to, when, time, isNow]);
  const open = results?.find((v) => v.vehicle.id === openId) ?? null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <PlacePicker label="من وين؟" places={places} value={from} onChange={setFrom} exclude={[to]} />
      <PlacePicker label="لوين؟" places={places} value={to} onChange={setTo} exclude={[from]} />
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <label htmlFor="search-when" className="text-caption text-text-muted">
            إمتى؟
          </label>
          <select id="search-when" value={when} onChange={(e) => setWhen(e.target.value as When)} className={field}>
            <option value="now">هلأ</option>
            <option value="today">اليوم</option>
            <option value="tomorrow">بكرة</option>
          </select>
        </div>
        {!isNow && (
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <label htmlFor="search-time" className="text-caption text-text-muted">
              الساعة
            </label>
            <input id="search-time" type="time" value={time} onChange={(e) => setTime(e.target.value || "08:00")} className={field} />
          </div>
        )}
      </div>
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />

      <section className="flex flex-col gap-2" aria-live="polite">
        {!from || !to ? (
          <p className="text-text-muted">اختار من وين ولوين، وبنفرجيك مين ماشي على هالطريق.</p>
        ) : results === null ? (
          <>
            <VehicleCardSkeleton />
            <VehicleCardSkeleton />
          </>
        ) : (
          <>
            <h2 className="text-title">
              من {placeName(from)} لـ{placeName(to)}
            </h2>
            {!isNow && results.length > 0 && <p className="text-caption text-text-muted">هدول اللي بيكونوا شغّالين بهالوقت. مكان السيارة بيبيّن بس وهي ماشية.</p>}
            {results.length === 0 ? (
              <p className="text-text-muted">{isNow ? "ما في حدا ماشي على هالطريق هلأ. جرّب وقت ثاني." : "ما في حدا شغّال على هالطريق بهالوقت. جرّب وقت ثاني."}</p>
            ) : (
              results.map((item) => <VehicleCard key={item.vehicle.id} item={item} now={now} showPosition={isNow} onOpen={() => setOpenId(item.vehicle.id)} />)
            )}
          </>
        )}
      </section>

      <VehicleSheet item={open} now={now} showPosition={isNow} onClose={() => setOpenId(null)} />
    </div>
  );
}
