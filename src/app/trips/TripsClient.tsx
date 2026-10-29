"use client";
// «رحلاتي» and its pieces: the rider's bookings, where the vehicle is now, cancelling, and
// the location-consent flow. Everything is drawn from the phone's own copy.

import Link from "next/link";
import { RatingNotices } from "@/components/RatingNotices";
import { ForwardChevron } from "@/components/icons";
import { useEffect, useMemo, useState } from "react";
import { BookingNotices, sharingNow } from "@/components/BookingNotices";
import { DataAge } from "@/components/DataAge";
import { useOutbox } from "@/components/OutboxStatus";
import { PrivateTrips } from "@/components/PrivateTrips";
import { Sheet } from "@/components/Sheet";
import { VehiclePhoto } from "@/components/VehicleCards";
import { PENDING_BOOKING, riderStatus, seatsText, TONE_CLASS, whenText } from "@/lib/booking-copy";
import { isLive } from "@/lib/booking-rules";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { pendingEntries, type OutboxEntry } from "@/lib/outbox";
import { getPlace, placeName } from "@/lib/places";
import { aboutMinutes } from "@/lib/plan-copy";
import { minutesToStop } from "@/lib/planner";
import type { PublicData, SyncBooking } from "@/lib/public-data";
import { gazaNow } from "@/lib/time";
import { refreshData, usePublicData } from "@/lib/use-public-data";
import { positionText } from "@/lib/vehicle-copy";

type PendingShow = { id: string; day: string; time: string; seats: number; show?: { routeName?: string; from?: string; to?: string; name?: string } };
const plain = "flex min-h-11 flex-1 items-center justify-center rounded-control border border-separator bg-surface px-4 py-2 font-medium disabled:opacity-60";

// «وين السيارة هلأ؟»: the vehicle's last position with its age, and when it reaches the
// rider's own stop. From a fresh position only; otherwise it says there is none.
function WhereNow({ booking, data, now }: { booking: SyncBooking; data: PublicData; now: number }) {
  const vehicle = data.vehicles.find((v) => v.driverId === booking.driverId);
  const route = data.routes.find((r) => r.id === booking.routeId);
  const position = (vehicle && data.positions.find((p) => p.id === vehicle.id)) ?? null;
  const where = positionText(position, now);
  const minutes = route ? minutesToStop(route, position, booking.fromPosition, now, (id) => getPlace(id)) : null;
  return (
    <div className="flex flex-col gap-1 rounded-control bg-bg px-3 py-2">
      <p className="text-caption text-text-muted">وين السيارة هلأ؟</p>
      {minutes !== null && !booking.startedAt && (
        <p className="font-bold text-accent">
          بتوصلك بعد {aboutMinutes(minutes)} <span className="text-caption font-normal text-text-muted">تقريباً</span>
        </p>
      )}
      <p className={where.fresh ? "text-accent" : "text-text-muted"}>{where.text}</p>
    </div>
  );
}

function BookingCard({ booking, data, now, today, onOpen }: { booking: SyncBooking; data: PublicData; now: number; today: string; onOpen: () => void }) {
  const status = riderStatus(booking);
  const vehicle = data.vehicles.find((v) => v.driverId === booking.driverId);
  return (
    <li className="flex flex-col gap-3 rounded-card bg-surface p-3">
      <button type="button" onClick={onOpen} className="flex min-h-11 items-start gap-3 text-start">
        <VehiclePhoto hash={vehicle?.photos[0]} download={false} className="size-16" />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={`font-bold ${TONE_CLASS[status.tone]}`}>{status.text}</span>
          <span>
            من {placeName(booking.from)} لـ{placeName(booking.to)}
          </span>
          <span className="text-caption text-text-muted">
            {whenText(booking, today)} · {seatsText(booking.seats)}
          </span>
          <span className="truncate text-caption text-text-muted">
            {vehicle ? `${VEHICLE_TYPE_AR[vehicle.type]} · ` : ""}
            {booking.name} · {booking.routeName}
          </span>
        </span>
      </button>
      {isLive(booking) && (
        <>
          <WhereNow booking={booking} data={data} now={now} />
          {booking.phone && (
            <a href={`tel:${booking.phone}`} className="flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-2 font-bold text-on-accent">
              اتصل بالسوّاق
            </a>
          )}
        </>
      )}
    </li>
  );
}

// «رحلاتي»: the rider's bookings, from the phone's own copy (so it opens with no network),
// plus the ones still waiting on the phone to be sent.
export function TripsClient({ openId, autoAsk }: { openId: string | null; autoAsk: boolean }) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { send, pending } = useOutbox();
  const [opened, setOpened] = useState<string | null>(openId);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState<PendingShow[]>([]);
  const today = gazaNow(new Date(now)).day;

  // Bookings still in the outbox: «مستني ينبعت».
  useEffect(() => {
    let alive = true;
    void pendingEntries()
      .then((entries: OutboxEntry[]) => {
        if (alive) setWaiting(entries.filter((e) => e.kind === "booking.create").map((e) => e.payload as PendingShow));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [pending, now]);

  const bookings = useMemo(() => [...data.bookings].sort((a, b) => Number(isLive(b)) - Number(isLive(a)) || b.day.localeCompare(a.day) || b.time.localeCompare(a.time)), [data.bookings]);
  const open = bookings.find((b) => b.id === opened) ?? null;
  const hasPrivate = data.offers.some((o) => o.status === "accepted");

  async function cancel(id: string) {
    setBusy(true);
    await send("booking.cancel", { id });
    setBusy(false);
    setConfirmCancel(false);
    setOpened(null);
    refreshData();
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <BookingNotices bookings={data.bookings} now={now} today={today} autoAsk={autoAsk} statusLines={false} />
      {ready && <RatingNotices data={data} role="rider" now={now} />}
      <Link href="/history" className="flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface px-4 py-3">
        <span>رحلاتي السابقة</span>
        <span className="text-text-muted">
          <ForwardChevron />
        </span>
      </Link>
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
      {!ready ? (
        <div className="skeleton h-[132px] rounded-card" aria-hidden="true" />
      ) : bookings.length === 0 && waiting.length === 0 && !hasPrivate ? (
        <p className="text-text-muted">لسّا ما حجزت أي مشوار. دوّر على مشوار من الرئيسية واحجز كرسيك.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {waiting.map((w) => (
            <li key={w.id} className="flex flex-col gap-1 rounded-card border-2 border-pending bg-surface p-3">
              <span className="font-bold text-pending">{PENDING_BOOKING}</span>
              {w.show?.from && w.show.to && (
                <span>
                  من {placeName(w.show.from)} لـ{placeName(w.show.to)}
                </span>
              )}
              <span className="text-caption text-text-muted">
                {whenText(w, today)} · {seatsText(w.seats)}
                {w.show?.name ? ` · ${w.show.name}` : ""}
              </span>
              <span className="text-caption text-text-muted">انحفظ على جوالك، ورح ينبعت أول ما يرجع النت</span>
            </li>
          ))}
          {bookings.map((b) => (
            <BookingCard key={b.id} booking={b} data={data} now={now} today={today} onOpen={() => setOpened(b.id)} />
          ))}
        </ul>
      )}

      {ready && <PrivateTrips data={data} role="rider" today={today} />}

      <Sheet
        open={open !== null}
        onClose={() => {
          setOpened(null);
          setConfirmCancel(false);
        }}
        title="حجزك"
      >
        {open && (
          <div className="flex flex-col gap-4 p-4">
            <p className={`text-title ${TONE_CLASS[riderStatus(open).tone]}`}>{riderStatus(open).text}</p>
            <dl className="divide-y divide-separator rounded-card bg-bg">
              {[
                ["من", placeName(open.from)],
                ["لـ", placeName(open.to)],
                ["إمتى", whenText(open, today)],
                ["الكراسي", seatsText(open.seats)],
                ["السوّاق", open.name],
                ["الخط", open.routeName],
              ].map(([label, value]) => (
                <div key={label} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2">
                  <dt className="shrink-0 text-text-muted">{label}</dt>
                  <dd className="min-w-0 truncate text-end">{value}</dd>
                </div>
              ))}
            </dl>
            {isLive(open) && <WhereNow booking={open} data={data} now={now} />}
            {open.offRoute && isLive(open) && <p className="font-medium text-danger">السيارة طالعة عن خطها، احكي مع السوّاق</p>}
            {sharingNow(open, now) && <p className="font-medium text-pending">عم تشارك موقعك مع السوّاق</p>}
            {isLive(open) && open.phone && (
              <a href={`tel:${open.phone}`} className="flex min-h-11 items-center justify-center gap-2 rounded-control bg-accent px-4 py-3 font-bold text-on-accent">
                اتصل بالسوّاق <bdi className="font-normal">{open.phone}</bdi>
              </a>
            )}
            {isLive(open) &&
              !open.startedAt &&
              (confirmCancel ? (
                <div className="flex gap-3">
                  <button type="button" disabled={busy} onClick={() => void cancel(open.id)} className={`${plain} text-danger`}>
                    آه، الغي الحجز
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmCancel(false)} className={plain}>
                    خلّيه
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmCancel(true)} className={`${plain} text-danger`}>
                  الغي الحجز
                </button>
              ))}
            <p className="text-caption text-text-muted">الأجرة بتتفق عليها مع السوّاق. مِشوار ما بيحدد أسعار.</p>
          </div>
        )}
      </Sheet>
    </div>
  );
}
