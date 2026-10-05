"use client";

import { NO_RATING, ratingText } from "@/lib/rating-rules";
import Link from "next/link";
import { useState } from "react";
import { DataAge } from "@/components/DataAge";
import { useOutbox } from "@/components/OutboxStatus";
import { PrivateTrips } from "@/components/PrivateTrips";
import { VehiclePhoto } from "@/components/VehicleCards";
import { seatsText, TONE_CLASS, whenText } from "@/lib/booking-copy";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { placeName } from "@/lib/places";
import type { PublicData, SyncOffer } from "@/lib/public-data";
import { priceText, riderRequestStatus } from "@/lib/request-copy";
import { gazaNow } from "@/lib/time";
import { refreshData, usePublicData } from "@/lib/use-public-data";
import { useSeenThreads } from "@/lib/use-requests";

const plain = "flex min-h-11 items-center justify-center rounded-control border border-separator bg-surface px-2 py-2 text-center font-medium disabled:opacity-60";
const solid = "flex min-h-11 items-center justify-center rounded-control bg-accent px-2 py-2 text-center font-bold text-on-accent disabled:opacity-60";

// One driver's offer, as a narrow card: two of them sit side by side on a phone, so the
// rider compares price, driver and vehicle at a glance.
function OfferCard({ offer, data, open, news, download, busy, onAccept }: { offer: SyncOffer; data: PublicData; open: boolean; news: boolean; download: boolean; busy: boolean; onAccept: () => void }) {
  const vehicle = data.vehicles.find((v) => v.driverId === offer.driverId);
  const declined = offer.status === "declined";
  return (
    <li className={`flex min-w-0 flex-col gap-2 rounded-card bg-surface p-3 ${offer.status === "accepted" ? "border-2 border-accent" : ""} ${declined ? "opacity-60" : ""}`}>
      <VehiclePhoto hash={vehicle?.photos[0]} download={download} className="aspect-[4/3] w-full" />
      <p className="text-title text-accent">
        <bdi>{priceText(offer.price)}</bdi>
      </p>
      <p className="truncate font-bold">{offer.name}</p>
      <p className="text-caption text-text-muted">{vehicle ? `${VEHICLE_TYPE_AR[vehicle.type]} · ${seatsText(vehicle.seats)}` : "بدون سيارة مسجّلة"}</p>
      {/* Until a driver has ratings he is simply new: no made-up stars. */}
      <p className="text-caption text-text-muted">{ratingText(offer.rating, offer.ratings) ? <bdi>{ratingText(offer.rating, offer.ratings)}</bdi> : NO_RATING}</p>
      {offer.status === "accepted" && <p className="font-bold text-accent">قبلت هاد العرض</p>}
      {declined && <p className="text-caption text-text-muted">ما اخترته</p>}
      {!declined && (
        <div className="mt-auto flex flex-col gap-2">
          {offer.phone && (
            <a href={`tel:${offer.phone}`} className={plain}>
              <span>
                اتصل <bdi className="block text-caption font-normal text-text-muted">{offer.phone}</bdi>
              </span>
            </a>
          )}
          <Link href={`/chat/${offer.id}`} className={`${plain} gap-2`}>
            احكي مع السوّاق
            {news && <span aria-label="رسالة جديدة" className="size-2 shrink-0 rounded-full bg-danger" />}
          </Link>
          {open && offer.status === "sent" && (
            <button type="button" disabled={busy} onClick={onAccept} className={solid}>
              اقبل العرض
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function RequestClient({ id, downloadPhotos }: { id: string; downloadPhotos: boolean }) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { send } = useOutbox();
  const { unread } = useSeenThreads();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; tone: string } | null>(null);
  const today = gazaNow(new Date(now)).day;
  const request = data.requests.find((r) => r.id === id && r.mine);
  const offers = data.offers.filter((o) => o.requestId === id).sort((a, b) => Number(b.status === "accepted") - Number(a.status === "accepted") || a.price - b.price);

  async function act(kind: string, payload: unknown) {
    setBusy(true);
    const outcome = await send(kind, payload);
    setBusy(false);
    setConfirm(null);
    setNote(outcome.status === "rejected" ? { text: outcome.message ?? "ما زبط", tone: "text-danger" } : outcome.status === "queued" ? { text: outcome.message ?? "", tone: "text-pending" } : null);
    refreshData();
  }

  if (!ready) return <div className="skeleton mt-3 h-[132px] rounded-card" aria-hidden="true" />;
  if (!request) {
    return (
      <div className="mt-3 flex flex-col gap-3">
        <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
        <p className="text-text-muted">هاد الطلب مش على جوالك. ارجع لطلباتك وجرّب كمان مرة.</p>
      </div>
    );
  }
  const status = riderRequestStatus(request, offers.filter((o) => o.status === "sent").length);
  const open = request.status === "open";
  const confirming = offers.find((o) => o.id === confirm);

  return (
    <div className="mt-3 flex flex-col gap-3">
      <section className="flex flex-col gap-1 rounded-card bg-surface p-3">
        <p className={`font-bold ${TONE_CLASS[status.tone]}`}>{status.text}</p>
        <p>
          من {placeName(request.from)} لـ{placeName(request.to)}
        </p>
        <p className="text-caption text-text-muted">
          {whenText(request, today)} · {seatsText(request.seats)}
        </p>
        {request.note && <p className="text-caption text-text-muted">{request.note}</p>}
      </section>
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
      {note && (
        <p role="status" className={`font-medium ${note.tone}`}>
          {note.text}
        </p>
      )}

      {request.status === "accepted" && <PrivateTrips data={{ ...data, offers: offers.filter((o) => o.status === "accepted") }} role="rider" today={today} />}

      {confirming && (
        <div role="alertdialog" aria-label="تأكيد قبول العرض" className="flex flex-col gap-3 rounded-card border-2 border-accent bg-surface p-3">
          <p className="font-bold">
            تقبل عرض {confirming.name} بـ<bdi>{priceText(confirming.price)}</bdi>؟
          </p>
          <p className="text-caption text-text-muted">لما تقبل: بيتسكّر الطلب، منبلّغ باقي السوّاقين إنك اخترت عرض ثاني، ورقم جوالك بيبيّن لهاد السوّاق بس.</p>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" disabled={busy} onClick={() => void act("offer.accept", { id: confirming.id })} className={solid}>
              آه، اقبل
            </button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={plain}>
              لا، استنى
            </button>
          </div>
        </div>
      )}

      <h2 className="text-title">{offers.length > 0 ? "العروض" : "لسّا ما في عروض"}</h2>
      {offers.length === 0 ? (
        <p className="text-text-muted">{open ? "أول ما سوّاق يبعت عرض بتلاقيه هون. بنحدّث لحالنا كل شوي." : "ما وصل عروض على هاد الطلب."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} data={data} open={open} news={unread(o.id, data.messages)} download={downloadPhotos} busy={busy} onAccept={() => setConfirm(o.id)} />
          ))}
        </ul>
      )}
      {offers.length > 0 && <p className="text-caption text-text-muted">السعر من السوّاق نفسه لهاد المشوار. مِشوار ما بيحدد أسعار.</p>}

      {open && (
        <button type="button" disabled={busy} onClick={() => void act("request.close", { id: request.id })} className={`${plain} text-danger`}>
          سكّر الطلب
        </button>
      )}
    </div>
  );
}
