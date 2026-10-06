"use client";

import { useEffect, useState } from "react";
import { useOutbox } from "@/components/OutboxStatus";
import { Sheet } from "@/components/Sheet";
import { riderStatus } from "@/lib/booking-copy";
import { isLive, shareIsActive, shareIsOpen } from "@/lib/booking-rules";
import { placeName } from "@/lib/places";
import { BINARY_TYPE, encodeSharePoint, fixAgeSec, worthSending } from "@/lib/position-codec";
import type { SyncBooking } from "@/lib/public-data";
import { refreshData } from "@/lib/use-public-data";

const SEND_EVERY_MS = 20_000;
const RECENT_MS = 10 * 60 * 1000;
const row = "flex flex-col gap-2 rounded-card bg-surface p-3";
const solid = "min-h-11 flex-1 rounded-control bg-accent px-4 py-2 font-bold text-on-accent disabled:opacity-60";
const plain = "min-h-11 flex-1 rounded-control border border-separator bg-surface px-4 py-2 font-medium disabled:opacity-60";

const shareOf = (b: SyncBooking) => (b.share ? { answer: b.share.answer ?? null, expiresAt: b.share.expiresAt, endedAt: b.share.ended ? b.share.askedAt : null } : null);
export const askIsOpen = (b: SyncBooking, now: number) => isLive(b) && !b.startedAt && !!b.share && shareIsOpen(shareOf(b)!, now);
export const sharingNow = (b: SyncBooking, now: number) => isLive(b) && !b.startedAt && !!b.share && shareIsActive(shareOf(b)!, now);

// While the rider is sharing: send his position about every 20 seconds (once a minute
// while he stands still), for as long as a screen with this component is open. Never
// queued, never kept on the phone. Binary (24 bytes); JSON if an older server refuses it.
function useShareSender(shareId: string | null) {
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!shareId) return;
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => setProblem("جوالك مش عم يعطينا موقعك هلأ."));
      return;
    }
    let alive = true;
    let latest: { lat: number; lon: number; fixAt: number } | null = null;
    let sent = false;
    let json = false;
    let last: { lat: number; lon: number; sentAt: number } | null = null;
    const send = (point: { lat: number; lon: number; fixAt: number }) =>
      fetch("/api/location-share", {
        method: "POST",
        headers: { "content-type": json ? "application/json" : BINARY_TYPE },
        body: json
          ? JSON.stringify({ id: shareId, lat: point.lat, lon: point.lon })
          : encodeSharePoint(shareId, { lat: point.lat, lon: point.lon, ageSec: fixAgeSec(point.fixAt, Date.now()) }),
      });
    const post = async () => {
      const point = latest;
      if (!point || !worthSending(last, point, Date.now())) return;
      try {
        let response = await send(point);
        if (response.status === 400 && !json) {
          json = true;
          response = await send(point);
        }
        sent = true;
        if (response.ok) last = { lat: point.lat, lon: point.lon, sentAt: Date.now() };
        // 409: the share is over on the server (trip started, time ran out). Show it.
        if (response.status === 409 && alive) refreshData();
      } catch {
        /* no network: the next point will go when it is back */
      }
    };
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        latest = { lat: p.coords.latitude, lon: p.coords.longitude, fixAt: p.timestamp };
        if (alive) setProblem(null);
        if (!sent) void post();
      },
      (error) => {
        if (alive) setProblem(error.code === error.PERMISSION_DENIED ? "اسمح لمِشوار يشوف موقعك من إعدادات الجوال عشان السوّاق يلاقيك." : "جوالك مش عم يعطينا موقعك هلأ.");
      },
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
    );
    const timer = setInterval(() => void post(), SEND_EVERY_MS);
    return () => {
      alive = false;
      navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
    };
  }, [shareId]);
  return problem;
}

// What the rider is told, in one small list: on the home screen and on «رحلاتي». Built
// from the phone's own copy of his bookings, so it also shows with no network. It also
// owns the consent sheet and the "you are sharing" state, wherever the rider is.
export function BookingNotices({
  bookings,
  now,
  today,
  autoAsk = false,
  statusLines = true,
}: {
  bookings: SyncBooking[];
  now: number;
  today: string;
  /** Open the consent sheet straight away. */
  autoAsk?: boolean;
  /** False on «رحلاتي», where each booking's own card already says its status. */
  statusLines?: boolean;
}) {
  const { send } = useOutbox();
  const [asking, setAsking] = useState<string | null>(null);
  const [dismissedAuto, setDismissedAuto] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const open = bookings.filter((b) => askIsOpen(b, now));
  const sharing = bookings.find((b) => sharingNow(b, now)) ?? null;
  const problem = useShareSender(sharing?.share?.id ?? null);
  const askBooking = open.find((b) => b.id === asking) ?? (autoAsk && !dismissedAuto ? open[0] : undefined) ?? null;

  async function act(kind: string, payload: unknown) {
    setBusy(true);
    const outcome = await send(kind, payload);
    setBusy(false);
    setAsking(null);
    setDismissedAuto(true);
    setNote(outcome.status === "rejected" || outcome.status === "queued" ? (outcome.message ?? null) : null);
    refreshData();
  }

  const lines: { key: string; text: string; tone: string; phone?: string }[] = [];
  for (const b of bookings) {
    if (b.day < today) continue;
    const where = `من ${placeName(b.from)} لـ${placeName(b.to)}`;
    if (b.offRoute && isLive(b)) lines.push({ key: `off-${b.id}`, text: "السيارة طالعة عن خطها، احكي مع السوّاق", tone: "text-danger", phone: b.phone });
    const status = riderStatus(b);
    if (!statusLines) {
      /* the cards say it */
    } else if (b.status === "cancelled" || b.status === "rejected") {
      if (b.cancelReason !== "by_rider") lines.push({ key: b.id, text: `${status.text} · ${where}`, tone: "text-danger" });
    } else if (b.status === "ready" && !b.startedAt) {
      lines.push({ key: b.id, text: `${status.text} · ${where}`, tone: "text-accent" });
    } else if (b.status === "confirmed" && now - Date.parse(b.createdAt) < RECENT_MS) {
      lines.push({ key: b.id, text: `${status.text} · ${where}`, tone: "text-accent" });
    }
    if (b.share?.answer === "yes" && b.share.ended && isLive(b)) lines.push({ key: `ended-${b.id}`, text: "وقفنا مشاركة موقعك", tone: "text-text-muted" });
  }

  if (open.length === 0 && !sharing && lines.length === 0 && !note) return null;
  return (
    <section aria-label="آخر الأخبار عن حجوزاتك" className="flex flex-col gap-2">
      {sharing && (
        <div role="status" className="flex flex-col gap-2 rounded-card border-2 border-pending bg-surface p-3">
          <p className="font-bold text-pending">عم تشارك موقعك مع السوّاق {sharing.name}</p>
          <p className="text-caption text-text-muted">بتوقف لحالها أول ما تبلّش الرحلة، أو بعد ربع ساعة من طلب السوّاق.</p>
          {problem && <p className="text-caption text-danger">{problem}</p>}
          <button type="button" disabled={busy} onClick={() => void act("share.stop", { id: sharing.share!.id })} className={plain}>
            وقّف المشاركة
          </button>
        </div>
      )}
      {open.map((b) => (
        <div key={b.id} className={row}>
          <p className="font-bold">السوّاق {b.name} بيطلب يشوف موقعك</p>
          <button type="button" onClick={() => setAsking(b.id)} className={solid}>
            جاوب
          </button>
        </div>
      ))}
      {note && (
        <p role="status" className="rounded-card bg-surface p-3 text-pending">
          {note}
        </p>
      )}
      {lines.map((line) => (
        <div key={line.key} role="status" className="flex items-center justify-between gap-3 rounded-card bg-surface p-3">
          <p className={`min-w-0 font-medium ${line.tone}`}>{line.text}</p>
          {line.phone && (
            <a href={`tel:${line.phone}`} className="flex min-h-11 shrink-0 items-center rounded-control bg-accent px-4 font-bold text-on-accent">
              اتصل
            </a>
          )}
        </div>
      ))}

      <Sheet
        open={askBooking !== null}
        onClose={() => {
          setAsking(null);
          setDismissedAuto(true);
        }}
        title="مشاركة موقعك"
      >
        {askBooking && (
          <div className="flex flex-col gap-4 p-4">
            <p className="text-title">بدك تشارك موقعك مع السوّاق لهاي الرحلة؟</p>
            <p className="text-text-muted">
              السوّاق {askBooking.name} بيطلب يشوف وينك عشان يلاقيك. موقعك بيبيّن إله هو بس، وبتوقف المشاركة أول ما تبلّش الرحلة أو بعد ربع ساعة، وما بنحفظ وين كنت.
            </p>
            <div className="flex gap-3">
              <button type="button" disabled={busy} onClick={() => void act("share.answer", { id: askBooking.share!.id, answer: "yes" })} className={solid}>
                آه، شارك
              </button>
              <button type="button" disabled={busy} onClick={() => void act("share.answer", { id: askBooking.share!.id, answer: "no" })} className={plain}>
                لا
              </button>
            </div>
          </div>
        )}
      </Sheet>
    </section>
  );
}
