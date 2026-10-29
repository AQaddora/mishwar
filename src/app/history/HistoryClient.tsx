"use client";
// «رحلات سابقة»: finished trips for either role, with the star sheet. The list comes from
// GET /api/history and the last answer is kept on the phone per account.

import { useCallback, useEffect, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { Sheet } from "@/components/Sheet";
import { Stars } from "@/components/Stars";
import { dayText, seatsText } from "@/lib/booking-copy";
import { CANCEL_REASON_AR } from "@/lib/booking-rules";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { canRate, rateKey, type HistoryItem, type HistoryResponse, type HistoryTrip } from "@/lib/history";
import { getMeta, setMeta } from "@/lib/idb";
import { newId, type Outcome } from "@/lib/outbox";
import { placeName } from "@/lib/places";
import { MAX_COMMENT, PENDING_RATING } from "@/lib/rating-rules";
import { priceText } from "@/lib/request-copy";
import { formatTime, gazaNow } from "@/lib/time";
import { refreshData } from "@/lib/use-public-data";
import { usePendingWrites } from "@/lib/use-requests";

type Role = "rider" | "driver";
type Cached = { data: HistoryResponse; at: string };
type PendingRating = { kind: string; target: string; stars: number };

const solid = "flex min-h-11 w-full items-center justify-center rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-60";
const plain = "flex min-h-11 items-center justify-center rounded-control border border-separator bg-surface px-4 py-2 font-medium text-accent";
const clock = (iso: string) => formatTime(gazaNow(new Date(iso)).time);

// The history is asked for once per visit, and the last answer is kept on the phone (per
// account), so the screen still shows with no network, with its age.
function useHistory(accountId: string) {
  const [state, setState] = useState<{ cached: Cached | null; ready: boolean; offline: boolean; now: number }>({ cached: null, ready: false, offline: false, now: 0 });
  const load = useCallback(async () => {
    const key = `history:${accountId}`;
    try {
      const response = await fetch("/api/history", { cache: "no-store" });
      if (!response.ok) throw new Error(String(response.status));
      const cached: Cached = { data: (await response.json()) as HistoryResponse, at: new Date().toISOString() };
      await setMeta(key, cached).catch(() => {});
      setState({ cached, ready: true, offline: false, now: Date.now() });
    } catch {
      const cached = (await getMeta<Cached>(key).catch(() => undefined)) ?? null;
      setState({ cached, ready: true, offline: true, now: Date.now() });
    }
  }, [accountId]);
  useEffect(() => {
    queueMicrotask(() => void load());
    window.addEventListener("online", load);
    return () => window.removeEventListener("online", load);
  }, [load]);
  return { ...state, reload: load };
}

function ItemCard({ item, role, today, waiting, onRate }: { item: HistoryItem; role: Role; today: string; waiting: PendingRating | undefined; onRate: () => void }) {
  const done = item.outcome === "completed";
  const who = role === "rider" ? `السوّاق ${item.name}${item.vehicleType ? ` · ${VEHICLE_TYPE_AR[item.vehicleType]}` : ""}` : `الراكب ${item.name}`;
  const status = done ? (item.kind === "private" ? "خلص المشوار الخاص" : "خلصت الرحلة") : (CANCEL_REASON_AR[item.cancelReason ?? ""] ?? "انلغى الحجز");
  return (
    <li className={`flex flex-col gap-2 rounded-card bg-surface p-3 ${done ? "" : "opacity-70"}`}>
      <div className="flex flex-col gap-1">
        <span className={`font-bold ${done ? "text-text-muted" : "text-danger"}`}>{status}</span>
        <span>
          من {placeName(item.from)} لـ{placeName(item.to)}
        </span>
        <span className="text-caption text-text-muted">
          {dayText(item.day, today)} الساعة <bdi>{formatTime(item.time)}</bdi> · {seatsText(item.seats)} · {who}
        </span>
        {item.routeName && role === "rider" && <span className="text-caption text-text-muted">{item.routeName}</span>}
        {item.price !== undefined && (
          <span className="font-medium">
            السعر المتفق عليه: <bdi>{priceText(item.price)}</bdi>
          </span>
        )}
      </div>
      {item.mine && (
        <p className="flex flex-wrap items-center gap-2 text-caption">
          <span className="text-text-muted">تقييمك:</span> <Stars value={item.mine.stars} />
          {item.mine.comment && <span className="basis-full">{item.mine.comment}</span>}
        </p>
      )}
      {item.theirs && (
        <p className="flex flex-wrap items-center gap-2 text-caption">
          <span className="text-text-muted">{role === "rider" ? "السوّاق قيّمك:" : "الراكب قيّمك:"}</span> <Stars value={item.theirs.stars} />
          {item.theirs.comment && <span className="basis-full">{item.theirs.comment}</span>}
        </p>
      )}
      {canRate(item) &&
        (waiting ? (
          <p role="status" className="flex items-center gap-2 text-caption font-medium text-pending">
            <Stars value={waiting.stars} /> {PENDING_RATING}
          </p>
        ) : (
          <button type="button" onClick={onRate} className={plain}>
            {role === "rider" ? "قيّم السوّاق" : "قيّم الراكب"}
          </button>
        ))}
    </li>
  );
}

function RateForm({ item, role, onSent }: { item: HistoryItem; role: Role; onSent: (outcome: Outcome) => void }) {
  const { send } = useOutbox();
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function submit() {
    setBusy(true);
    const result = await send("rating.create", { id: newId(), kind: item.kind, target: item.id, stars, ...(comment.trim() ? { comment: comment.trim() } : {}) });
    setBusy(false);
    setOutcome(result);
    if (result.status !== "rejected") onSent(result);
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <p>
        {role === "rider" ? `كيف كان مشوارك مع السوّاق ${item.name}؟` : `كيف كان الراكب ${item.name}؟`}
        <span className="block text-caption text-text-muted">
          من {placeName(item.from)} لـ{placeName(item.to)}
        </span>
      </p>
      <div role="radiogroup" aria-label="كم نجمة؟" className="flex justify-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={stars === n}
            aria-label={n === 1 ? "نجمة واحدة" : n === 2 ? "نجمتين" : `${n} نجوم`}
            onClick={() => setStars(n)}
            className={`flex size-12 items-center justify-center text-large-title ${n <= stars ? "text-accent" : "text-separator"}`}
          >
            ★
          </button>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="rating-comment" className="font-medium">
          بدك تكتب إشي؟ (مش ضروري)
        </label>
        <textarea
          id="rating-comment"
          rows={3}
          maxLength={MAX_COMMENT}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-control border border-separator bg-surface px-3 py-2 text-body"
        />
        <p className="text-caption text-text-muted">{role === "rider" ? "السوّاق بس اللي بيقرا كلامك." : "الراكب بس اللي بيقرا كلامك."} النجوم بتدخل بالمعدّل.</p>
      </div>
      <SaveNote outcome={outcome} />
      <button type="button" disabled={busy || stars === 0} onClick={() => void submit()} className={solid}>
        ابعت التقييم
      </button>
    </div>
  );
}

export function HistoryClient({ role, accountId, openRate }: { role: Role; accountId: string; openRate: string | null }) {
  const { cached, ready, offline, now, reload } = useHistory(accountId);
  const waiting = usePendingWrites<PendingRating>("rating.create", now);
  // null = follow the link (?rate=…); "" = closed by hand; otherwise the trip being rated.
  const [picked, setPicked] = useState<string | null>(null);
  const today = gazaNow(new Date(now)).day;
  const items = cached?.data.items ?? [];
  const trips = cached?.data.trips ?? [];
  const pendingFor = (item: HistoryItem) => waiting.find((w) => w.kind === item.kind && w.target === item.id);
  const rating = items.find((i) => rateKey(i) === (picked ?? openRate) && canRate(i) && !pendingFor(i)) ?? null;

  const card = (item: HistoryItem) => <ItemCard key={rateKey(item)} item={item} role={role} today={today} waiting={pendingFor(item)} onRate={() => setPicked(rateKey(item))} />;
  const privates = items.filter((i) => i.kind === "private");
  const ridersOf = (trip: HistoryTrip) => items.filter((i) => i.tripId === trip.id);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <DataAge lastSyncAt={cached?.at ?? null} offline={offline} now={now} />
      {!ready ? (
        <div className="skeleton h-[132px] rounded-card" aria-hidden="true" />
      ) : items.length === 0 && trips.length === 0 ? (
        <p className="text-text-muted">{offline && !cached ? "افتح هاي الصفحة مرة والنت شغّال، وبعدها بتفتح معك بدون نت." : "لسّا ما في رحلات خلصت. بعد أول مشوار بتلاقيه هون وبتقدر تقيّمه."}</p>
      ) : role === "rider" ? (
        <ul className="flex flex-col gap-3">{items.map(card)}</ul>
      ) : (
        <>
          {trips.map((trip) => (
            <section key={trip.id} className="flex flex-col gap-2">
              <h2 className="font-bold">
                {trip.routeName}
                <span className="block text-caption font-normal text-text-muted">
                  {dayText(trip.day, today)} · من الساعة <bdi>{clock(trip.startedAt)}</bdi> للساعة <bdi>{clock(trip.endedAt)}</bdi>
                </span>
              </h2>
              {ridersOf(trip).length === 0 ? <p className="text-caption text-text-muted">بدون ركّاب حاجزين.</p> : <ul className="flex flex-col gap-3">{ridersOf(trip).map(card)}</ul>}
            </section>
          ))}
          {privates.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-title">مشاوير خاصة</h2>
              <ul className="flex flex-col gap-3">{privates.map(card)}</ul>
            </section>
          )}
        </>
      )}
      <Sheet open={rating !== null} onClose={() => setPicked("")} title={role === "rider" ? "قيّم السوّاق" : "قيّم الراكب"}>
        {rating && (
          <RateForm
            key={rateKey(rating)}
            item={rating}
            role={role}
            onSent={() => {
              setPicked("");
              void reload();
              refreshData();
            }}
          />
        )}
      </Sheet>
    </div>
  );
}
