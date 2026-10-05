"use client";

import { RatingNotices } from "@/components/RatingNotices";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { PrivateTrips } from "@/components/PrivateTrips";
import { RequestNotices } from "@/components/RequestNotices";
import { MapView } from "@/components/MapView";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { Sheet } from "@/components/Sheet";
import { driverStatus, seatsText, TONE_CLASS } from "@/lib/booking-copy";
import { canCancelNotReady, canStartTrip, isDue, isLive, shareIsActive, shareIsOpen } from "@/lib/booking-rules";
import { newId, type Outcome } from "@/lib/outbox";
import { placeName } from "@/lib/places";
import type { SyncBooking } from "@/lib/public-data";
import { formatAge, formatTime, gazaNow } from "@/lib/time";
import { refreshData, usePublicData } from "@/lib/use-public-data";

const solid = "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-accent px-3 py-2 font-bold text-on-accent disabled:opacity-60";
const plain = "flex min-h-11 flex-1 items-center justify-center rounded-control border border-separator bg-surface px-3 py-2 font-medium disabled:opacity-60";

const shareOf = (b: SyncBooking) => ({ answer: b.share?.answer ?? null, expiresAt: b.share?.expiresAt ?? "", endedAt: b.share?.ended ? b.share.askedAt : null });

// Where the rider said he is, for his driver only, while sharing is on.
function shareLine(b: SyncBooking, now: number): string | null {
  if (!b.share) return null;
  if (shareIsOpen(shareOf(b), now)) return "مستنيين الراكب يوافق";
  if (shareIsActive(shareOf(b), now)) return b.share.at ? `الراكب عم يشارك موقعه · آخر مكان ${formatAge(b.share.at, now)}` : "الراكب وافق، مستنيين موقعه";
  if (b.share.answer === "no") return "الراكب ما وافق يشارك موقعه";
  if (b.share.answer === "yes") return "خلصت مشاركة الموقع";
  return "الراكب ما جاوب على طلب الموقع";
}

// The driver's pre-trip check: every rider booked for today, with call, then ready or
// not ready. «ابدأ الرحلة» stays locked until every rider due now is decided.
export function TodayRiders({ hasOpenTrip, canDrive, openLocation }: { hasOpenTrip: boolean; /** A vehicle and a route exist. */ canDrive: boolean; openLocation: string | null }) {
  const router = useRouter();
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { send } = useOutbox();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [locating, setLocating] = useState<string | null>(openLocation);
  const clock = gazaNow(new Date(now));

  const riders = useMemo(
    () => data.bookings.filter((b) => b.day === clock.day && (isLive(b) || b.status === "cancelled")).sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || a.time.localeCompare(b.time)),
    [data.bookings, clock.day],
  );
  const waiting = riders.filter((b) => isLive(b) && !b.startedAt);
  const due = waiting.filter((b) => isDue(b, clock));
  const locked = !canStartTrip(due);
  const located = riders.find((b) => b.id === locating && b.share) ?? null;
  const point = located?.share && shareIsActive(shareOf(located), now) && located.share.lat !== undefined ? located.share : null;

  async function act(kind: string, payload: unknown): Promise<Outcome> {
    setBusy(true);
    const result = await send(kind, payload);
    setOutcome(result.status === "applied" || result.status === "duplicate" ? null : result);
    setBusy(false);
    refreshData();
    return result;
  }

  async function start() {
    const result = await act("trip.start", { id: newId() });
    if (result.status === "applied" || result.status === "duplicate") router.push("/driver/drive");
  }

  return (
    <section className="mt-4 flex flex-col gap-3">
      {ready && <RequestNotices data={data} role="driver" now={now} />}
      {ready && <RatingNotices data={data} role="driver" now={now} />}
      <h2 className="text-title">ركّاب اليوم</h2>
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
      {!ready ? (
        <div className="skeleton h-[132px] rounded-card" aria-hidden="true" />
      ) : riders.length === 0 ? (
        <p className="text-text-muted">ما في حجوزات اليوم لسّا.</p>
      ) : (
        <>
          {waiting.length > 0 && <p className="font-medium">قبل ما تطلع، تأكد من كل الركّاب</p>}
          <ul className="flex flex-col gap-3">
            {riders.map((b) => {
              const status = driverStatus(b);
              const live = isLive(b);
              const before = live && !b.startedAt;
              const share = shareLine(b, now);
              const canAsk = before && !(b.share && (shareIsOpen(shareOf(b), now) || shareIsActive(shareOf(b), now)));
              return (
                <li key={b.id} className="flex flex-col gap-3 rounded-card bg-surface p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-bold">
                      {b.name} · {seatsText(b.seats)}
                    </p>
                    <p className={`shrink-0 text-caption font-medium ${TONE_CLASS[status.tone]}`}>{status.text}</p>
                  </div>
                  <p>
                    من {placeName(b.from)} لـ{placeName(b.to)} · الساعة <bdi>{formatTime(b.time)}</bdi>
                  </p>
                  {live && b.phone && (
                    <a href={`tel:${b.phone}`} onClick={() => void act("booking.called", { id: b.id })} className={solid}>
                      اتصل بالراكب <bdi className="font-normal">{b.phone}</bdi>
                    </a>
                  )}
                  {before && (
                    <div className="flex gap-2">
                      {b.status === "confirmed" && (
                        <button type="button" disabled={busy} onClick={() => void act("booking.decide", { id: b.id, decision: "ready" })} className={plain}>
                          جاهز
                        </button>
                      )}
                      {canCancelNotReady({ status: b.status, calledAt: b.called ? "called" : null }) && (
                        <button type="button" disabled={busy} onClick={() => void act("booking.decide", { id: b.id, decision: "not_ready" })} className={`${plain} text-danger`}>
                          مش جاهز، الغي الحجز
                        </button>
                      )}
                    </div>
                  )}
                  {before && !b.called && b.status === "confirmed" && <p className="text-caption text-text-muted">اتصل فيه أول. إذا مش جاهز، بتقدر تلغي حجزه بعد الاتصال.</p>}
                  {share && <p className="text-caption text-text-muted">{share}</p>}
                  {before && (
                    <div className="flex gap-2">
                      {canAsk && (
                        <button type="button" disabled={busy} onClick={() => void act("share.ask", { id: newId(), bookingId: b.id })} className={plain}>
                          اطلب موقع الراكب
                        </button>
                      )}
                      {b.share && shareIsActive(shareOf(b), now) && (
                        <button type="button" onClick={() => setLocating(b.id)} className={plain}>
                          وين الراكب؟
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <SaveNote outcome={outcome} />
      {hasOpenTrip ? (
        <Link href="/driver/drive" className={solid}>
          إنت طالع هلأ · افتح «أنا سايق»
        </Link>
      ) : (
        ready &&
        waiting.length > 0 && (
          <>
            <button type="button" disabled={busy || locked || !canDrive} onClick={() => void start()} className={`${solid} py-3 text-title`}>
              ابدأ الرحلة
            </button>
            {locked && <p className="text-center font-medium text-pending">ضل ركّاب ما تأكدت منهم</p>}
          </>
        )
      )}

      {ready && <PrivateTrips data={data} role="driver" today={clock.day} />}

      <Sheet open={located !== null} onClose={() => setLocating(null)} title="وين الراكب؟">
        {located && (
          <div className="flex flex-col gap-3 p-4">
            <p className="font-bold">{located.name}</p>
            {point ? (
              <>
                <MapView markers={[{ id: "rider", lat: point.lat!, lon: point.lon!, text: "ر", label: `الراكب ${located.name}` }]} fit="markers" className="h-64" />
                <p className="text-accent">آخر مكان {formatAge(point.at!, now)}</p>
              </>
            ) : (
              <p className="text-text-muted">{shareLine(located, now)}</p>
            )}
            <p className="text-caption text-text-muted">الموقع بيبيّن إلك بس لحد ما تبلّش الرحلة، أو ربع ساعة من طلبك. بعدها بينمسح.</p>
            {located.phone && (
              <a href={`tel:${located.phone}`} className={solid}>
                اتصل بالراكب
              </a>
            )}
          </div>
        )}
      </Sheet>
    </section>
  );
}
