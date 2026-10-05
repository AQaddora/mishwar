"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { PlacePicker } from "@/components/PlacePicker";
import { PlanCardSkeleton, PlanOptionCard, PlanSheet } from "@/components/PlanCards";
import { getPlace, placeName, type PickPlace } from "@/lib/places";
import { planTrips, type PlanOption } from "@/lib/planner";
import { addDays, gazaNow, isTime, weekdayOf } from "@/lib/time";
import { usePublicData } from "@/lib/use-public-data";

type When = "now" | "today" | "tomorrow";
const field = "min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body";

// What the optional AI step is told about an option: place ids, vehicle types and
// numbers only. The server checks every one of them again.
const forExplain = (o: PlanOption) => ({
  legs: o.legs.map((l) => ({ type: l.vehicle.type, from: l.from, to: l.to, stops: l.stopCount })),
  arrive: o.arriveInMinutes,
  wait: o.waitMinutes,
});

// The trip planner. Everything is computed on the phone from its own copy of the data
// (src/lib/planner.ts), so it works with no network. Guests can use it.
export function SearchClient({
  places,
  initial,
  aiAvailable,
}: {
  places: PickPlace[];
  initial: { from: string | null; to: string | null; when: When; time: string | null; /** Open the first option's sheet straight away. */ open?: boolean };
  /** The server has a key for the optional AI step. The planner never needs it. */
  aiAvailable: boolean;
}) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [when, setWhen] = useState<When>(initial.when);
  const [time, setTime] = useState(initial.time ?? "08:00");
  const [openId, setOpenId] = useState<string | null>(null);

  const isNow = when === "now";
  const asked = useMemo(() => {
    const current = gazaNow(new Date(now));
    const day = when === "tomorrow" ? addDays(current.day, 1) : current.day;
    return isNow ? current : { day, weekday: weekdayOf(day), time };
  }, [now, when, time, isNow]);
  const options = useMemo(() => {
    if (!ready || !from || !to) return null;
    return planTrips(data, { from, to, at: asked, isNow, now }, (id) => getPlace(id));
  }, [data, ready, now, from, to, asked, isNow]);
  const open = options?.find((o) => o.id === openId) ?? null;
  // A link can ask for the first option's sheet (/search?...&open=1), once.
  const autoOpened = useRef(!initial.open);
  const firstId = options?.[0]?.id;
  useEffect(() => {
    if (autoOpened.current || !firstId) return;
    autoOpened.current = true;
    setOpenId(firstId);
  }, [firstId]);

  // The anonymised search log: place ids, the weekday and hour asked about, and how many
  // options came out. Sent once per search, only when online; a failure is silent and
  // nothing is queued.
  const logged = useRef("");
  const optionCount = options?.length ?? null;
  const askedHour = Number(asked.time.slice(0, 2));
  useEffect(() => {
    if (optionCount === null || !from || !to || !lastSyncAt) return;
    const key = `${from}|${to}|${asked.weekday}|${askedHour}`;
    if (logged.current === key) return;
    logged.current = key;
    void fetch("/api/search-log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from, to, weekday: asked.weekday, hour: askedHour, options: optionCount }),
      keepalive: true,
    }).catch(() => {});
  }, [optionCount, from, to, asked.weekday, askedHour, lastSyncAt]);

  // ---- The optional AI step: free text in, the same three fields out, then a short
  // explanation of the options this phone computed.
  const [text, setText] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiNote, setAiNote] = useState<string | null>(null);
  // Set when the text was understood: the next computed options get explained, once.
  const wantExplain = useRef(false);
  const [explainTick, setExplainTick] = useState(0);
  const [explained, setExplained] = useState<{ key: string; text: string } | null>(null);
  const planKey = options && from && to ? `${from}|${to}|${when}|${options.map((o) => o.id).join(",")}` : "";

  async function understand() {
    setAiBusy(true);
    setAiNote(null);
    try {
      const res = await fetch("/api/plan-ai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
      const out = res.ok ? await res.json() : { ok: false };
      if (!out.ok || (!out.from && !out.to)) {
        setAiNote("ما فهمنا عليك. اختار من وين ولوين من القوائم تحت.");
        return;
      }
      if (out.from) setFrom(out.from);
      if (out.to) setTo(out.to);
      setWhen(out.when);
      if (isTime(out.time)) setTime(out.time);
      wantExplain.current = true;
      setExplainTick((t) => t + 1);
      if (!out.from || !out.to) setAiNote("فهمنا جزء من طلبك. كمّل الباقي من القوائم تحت.");
    } catch {
      setAiNote("ما في نت هلأ. اختار من وين ولوين من القوائم تحت.");
    } finally {
      setAiBusy(false);
    }
  }

  useEffect(() => {
    if (!wantExplain.current || !options || options.length === 0 || !from || !to) return;
    const key = planKey;
    wantExplain.current = false;
    void fetch("/api/plan-ai", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ explain: { from, to, options: options.map(forExplain) } }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((out) => {
        if (out?.ok && typeof out.text === "string") setExplained({ key, text: out.text });
      })
      .catch(() => {});
  }, [options, from, to, planKey, explainTick]);

  return (
    <div className="mt-3 flex flex-col gap-3">
      {aiAvailable && (
        <form
          className="flex flex-col gap-2 rounded-card bg-surface p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim() && !aiBusy) void understand();
          }}
        >
          <label htmlFor="plan-text" className="font-medium">
            اكتب مشوارك بكلامك
          </label>
          <textarea
            id="plan-text"
            rows={2}
            maxLength={300}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="مثلاً: بدي أروح من غزة عخانيونس بكرة الساعة تلاتة"
            className="w-full rounded-control border border-separator bg-surface px-3 py-2 text-body"
          />
          <button type="submit" disabled={aiBusy || !text.trim()} className="min-h-11 rounded-control border border-separator bg-surface px-4 py-2 font-medium text-accent disabled:opacity-60">
            {aiBusy ? "لحظة…" : "عبّي الخانات"}
          </button>
          <p className="text-caption text-text-muted">مساعد بيفهم كلامك وبيعبّي الخانات. الطريق نفسه بيحسبه جوالك.</p>
          {aiNote && (
            <p role="status" className="text-caption text-pending">
              {aiNote}
            </p>
          )}
        </form>
      )}

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
          <p className="text-text-muted">اختار من وين ولوين، وبنفرجيك كيف توصل: مباشر، أو بتبديل سيارة.</p>
        ) : options === null ? (
          <>
            <PlanCardSkeleton />
            <PlanCardSkeleton />
          </>
        ) : (
          <>
            <h2 className="text-title">
              من {placeName(from)} لـ{placeName(to)}
            </h2>
            {explained && explained.key === planKey && <p className="rounded-card bg-surface p-3">{explained.text}</p>}
            {!isNow && options.length > 0 && <p className="text-caption text-text-muted">هدول اللي بيكونوا شغّالين بهالوقت. وقت الوصول بيبيّن بس والسيارة ماشية.</p>}
            {options.length === 0 ? (
              <p className="text-text-muted">
                ما لقينا طريق من {placeName(from)} لـ{placeName(to)} {isNow ? "هلأ" : "بهالوقت"}، حتى بتبديل سيارة. جرّب وقت ثاني، أو نزّل طلب خاص وأصحاب السيارات بيقدّموا عليك.
              </p>
            ) : (
              options.map((option) => <PlanOptionCard key={option.id} option={option} now={now} isNow={isNow} onOpen={() => setOpenId(option.id)} />)
            )}
          </>
        )}
      </section>

      <PlanSheet option={open} now={now} isNow={isNow} time={asked.time} onClose={() => setOpenId(null)} />
    </div>
  );
}
