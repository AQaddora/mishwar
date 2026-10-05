"use client";

import Link from "next/link";
import { useState } from "react";
import { useOutbox } from "@/components/OutboxStatus";
import { seatsText, whenText } from "@/lib/booking-copy";
import { placeName } from "@/lib/places";
import type { PublicData } from "@/lib/public-data";
import { priceText } from "@/lib/request-copy";
import { refreshData } from "@/lib/use-public-data";

const call = "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-control bg-accent px-4 py-2 font-bold text-on-accent";
const plain = "flex min-h-11 flex-1 items-center justify-center rounded-control border border-separator bg-surface px-4 py-2 font-medium disabled:opacity-60";

// «مشاوير خاصة متفق عليها»: an accepted offer is the booked private trip. Both sides see
// it, with the price, a call button and the chat. The driver marks it done.
export function PrivateTrips({ data, role, today }: { data: PublicData; role: "rider" | "driver"; today: string }) {
  const { send } = useOutbox();
  const [busy, setBusy] = useState(false);
  const trips = data.offers
    .filter((o) => o.status === "accepted")
    .flatMap((o) => {
      const r = data.requests.find((x) => x.id === o.requestId);
      return r && r.status === "accepted" ? [{ o, r }] : [];
    })
    .sort((a, b) => Number(!!a.r.completedAt) - Number(!!b.r.completedAt) || a.r.day.localeCompare(b.r.day) || a.r.time.localeCompare(b.r.time));
  if (trips.length === 0) return null;

  async function done(id: string) {
    setBusy(true);
    await send("request.complete", { id });
    setBusy(false);
    refreshData();
  }

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-title">مشاوير خاصة متفق عليها</h2>
      <ul className="flex flex-col gap-3">
        {trips.map(({ o, r }) => {
          const phone = role === "rider" ? o.phone : r.phone;
          return (
            <li key={o.id} className="flex flex-col gap-3 rounded-card bg-surface p-3">
              <div className="flex flex-col gap-1">
                <span className={`font-bold ${r.completedAt ? "text-text-muted" : "text-accent"}`}>{r.completedAt ? "خلص المشوار" : role === "rider" ? "اتفقت مع السوّاق" : "الراكب قبل عرضك"}</span>
                <span>
                  من {placeName(r.from)} لـ{placeName(r.to)}
                </span>
                <span className="text-caption text-text-muted">
                  {whenText(r, today)} · {seatsText(r.seats)} · {role === "rider" ? `السوّاق ${o.name}` : `الراكب ${r.name ?? ""}`}
                </span>
                <span className="font-medium">
                  السعر المتفق عليه: <bdi>{priceText(o.price)}</bdi>
                </span>
              </div>
              {!r.completedAt && (
                <div className="flex flex-wrap gap-3">
                  {phone && (
                    <a href={`tel:${phone}`} className={call}>
                      {role === "rider" ? "اتصل بالسوّاق" : "اتصل بالراكب"} <bdi className="font-normal">{phone}</bdi>
                    </a>
                  )}
                  <Link href={`/chat/${o.id}`} className={plain}>
                    {role === "rider" ? "احكي مع السوّاق" : "احكي مع الراكب"}
                  </Link>
                  {role === "driver" && (
                    <button type="button" disabled={busy} onClick={() => void done(r.id)} className={`${plain} basis-full`}>
                      خلّصت المشوار
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
