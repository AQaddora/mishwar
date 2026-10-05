"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataAge } from "@/components/DataAge";
import { useOutbox } from "@/components/OutboxStatus";
import { PrivateTrips } from "@/components/PrivateTrips";
import { RequestNotices } from "@/components/RequestNotices";
import { Sheet } from "@/components/Sheet";
import { seatsText, TONE_CLASS, whenText } from "@/lib/booking-copy";
import { newId } from "@/lib/outbox";
import { placeName } from "@/lib/places";
import type { SyncOffer, SyncRequest } from "@/lib/public-data";
import { driverOfferStatus, PENDING_SEND, priceText } from "@/lib/request-copy";
import { canOffer, CANT_OFFER_AR, parsePrice } from "@/lib/request-rules";
import { gazaNow } from "@/lib/time";
import { refreshData, usePublicData } from "@/lib/use-public-data";
import { usePendingWrites, useSeenThreads } from "@/lib/use-requests";

const plain = "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control border border-separator bg-surface px-4 py-2 font-medium disabled:opacity-60";
const solid = "flex min-h-11 flex-1 items-center justify-center rounded-control bg-accent px-4 py-2 font-bold text-on-accent disabled:opacity-60";

function RequestLines({ r, today }: { r: SyncRequest; today: string }) {
  return (
    <>
      <span className="font-bold">
        من {placeName(r.from)} لـ{placeName(r.to)}
      </span>
      <span className="text-caption text-text-muted">
        {whenText(r, today)} · {seatsText(r.seats)} · الراكب {r.name ?? ""}
      </span>
      {r.note && <span className="text-caption text-text-muted">{r.note}</span>}
    </>
  );
}

// The driver's side of special requests: the open ones, with «ابعت عرض», and what
// happened to the offers he already sent. From the phone's own copy, so it opens offline.
export function DriverRequestsClient({ driverId, openOffer }: { driverId: string; openOffer: string | null }) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { send } = useOutbox();
  const { unread } = useSeenThreads();
  const [offering, setOffering] = useState<string | null>(openOffer);
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const today = gazaNow(new Date(now)).day;
  const waiting = usePendingWrites<{ requestId: string; price: number }>("offer.send", now);

  const mine = useMemo(() => new Map(data.offers.filter((o) => o.driverId === driverId).map((o) => [o.requestId, o])), [data.offers, driverId]);
  const open = data.requests.filter((r) => r.status === "open" && !r.mine).sort((a, b) => a.day.localeCompare(b.day) || a.time.localeCompare(b.time));
  const fresh = open.filter((r) => !mine.has(r.id));
  const sent = data.requests.flatMap((r) => {
    const o = mine.get(r.id);
    return o && !(o.status === "accepted" && r.status === "accepted") ? [{ r, o }] : [];
  });
  const vehicle = data.vehicles.find((v) => v.driverId === driverId);
  const can = canOffer(ready ? (vehicle ? { maintenanceFrom: vehicle.maintenanceFrom ?? null, maintenanceUntil: vehicle.maintenanceUntil ?? null } : null) : { maintenanceFrom: null, maintenanceUntil: null }, today);
  const target = open.find((r) => r.id === offering) ?? null;
  const targetOffer: SyncOffer | undefined = target ? mine.get(target.id) : undefined;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target) return;
    const agorot = parsePrice(price);
    if (agorot === null) return setProblem("اكتب السعر بالشيكل، مثلاً 50");
    setBusy(true);
    const outcome = await send("offer.send", { id: targetOffer?.id ?? newId(), requestId: target.id, price: agorot });
    setBusy(false);
    if (outcome.status === "rejected") return setProblem(outcome.message ?? "ما انبعت العرض");
    setProblem(null);
    setPrice("");
    setOffering(null);
    refreshData();
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <RequestNotices data={data} role="driver" now={now} />
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
      {!can.ok && <p className="rounded-card bg-surface p-3 font-medium text-pending">{CANT_OFFER_AR[can.reason]}</p>}

      <PrivateTrips data={data} role="driver" today={today} />

      <section className="flex flex-col gap-3">
        <h2 className="text-title">طلبات مفتوحة</h2>
        {!ready ? (
          <div className="skeleton h-[104px] rounded-card" aria-hidden="true" />
        ) : fresh.length === 0 ? (
          <p className="text-text-muted">ما في طلبات خاصة جديدة هلأ.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {fresh.map((r) => {
              const queued = waiting.find((w) => w.requestId === r.id);
              return (
                <li key={r.id} className="flex flex-col gap-2 rounded-card bg-surface p-3">
                  <RequestLines r={r} today={today} />
                  {queued ? (
                    <span className="font-medium text-pending">
                      عرضك <bdi>{priceText(queued.price)}</bdi> · {PENDING_SEND}
                    </span>
                  ) : (
                    <button type="button" disabled={!can.ok} onClick={() => setOffering(r.id)} className={solid}>
                      ابعت عرض
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {sent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-title">عروضك</h2>
          <ul className="flex flex-col gap-3">
            {sent.map(({ r, o }) => {
              const status = driverOfferStatus(o, r);
              return (
                <li key={o.id} className="flex flex-col gap-2 rounded-card bg-surface p-3">
                  <span className={`font-bold ${TONE_CLASS[status.tone]}`}>
                    {status.text} · <bdi>{priceText(o.price)}</bdi>
                  </span>
                  <RequestLines r={r} today={today} />
                  {o.status === "sent" && r.status === "open" && (
                    <div className="flex flex-wrap gap-3">
                      <Link href={`/chat/${o.id}`} className={plain}>
                        احكي مع الراكب
                        {unread(o.id, data.messages) && <span aria-label="رسالة جديدة" className="size-2 shrink-0 rounded-full bg-danger" />}
                      </Link>
                      <button type="button" disabled={!can.ok} onClick={() => setOffering(r.id)} className={plain}>
                        غيّر السعر
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <Sheet
        open={target !== null}
        onClose={() => {
          setOffering(null);
          setProblem(null);
        }}
        title={targetOffer ? "غيّر السعر" : "ابعت عرض"}
      >
        {target && (
          <form onSubmit={submit} className="flex flex-col gap-4 p-4">
            <p className="flex flex-col gap-1">
              <RequestLines r={target} today={today} />
            </p>
            <label className="flex flex-col gap-1">
              <span className="font-medium">سعرك لكل المشوار، بالشيكل</span>
              <input id="offer-price" type="text" inputMode="decimal" dir="ltr" required value={price} onChange={(e) => setPrice(e.target.value)} placeholder={targetOffer ? String(targetOffer.price / 100) : "50"} className="min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-end text-body" />
            </label>
            {problem && (
              <p role="alert" className="font-medium text-danger">
                {problem}
              </p>
            )}
            <button type="submit" disabled={busy} className={solid}>
              {targetOffer ? "غيّر السعر" : "ابعت عرض"}
            </button>
            <p className="text-caption text-text-muted">الراكب بيشوف اسمك، سيارتك وصورها، سعرك ورقم جوالك. رقمه هو بيبيّنلك بس إذا قبل عرضك.</p>
          </form>
        )}
      </Sheet>
    </div>
  );
}
