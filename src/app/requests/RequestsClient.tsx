"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DataAge } from "@/components/DataAge";
import { ForwardChevron } from "@/components/icons";
import { seatsText, TONE_CLASS, whenText } from "@/lib/booking-copy";
import { placeName } from "@/lib/places";
import { PENDING_SEND, riderRequestStatus } from "@/lib/request-copy";
import type { RequestInput } from "@/lib/request-rules";
import { gazaNow } from "@/lib/time";
import { usePublicData } from "@/lib/use-public-data";
import { usePendingWrites, useSeenThreads } from "@/lib/use-requests";

// The rider's special requests, from the phone's own copy (so it opens with no network),
// plus the ones still waiting on the phone to be sent.
export function RequestsClient() {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const { unread } = useSeenThreads();
  const today = gazaNow(new Date(now)).day;
  const waiting = usePendingWrites<RequestInput & { id: string }>("request.create", now);
  const requests = useMemo(
    () => data.requests.filter((r) => r.mine).sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.createdAt.localeCompare(a.createdAt)),
    [data.requests],
  );
  const known = new Set(requests.map((r) => r.id));

  return (
    <div className="mt-3 flex flex-col gap-3">
      <p className="text-text-muted">ما لقيت مشوار على الخطوط؟ اكتب وين بدك تروح، وأصحاب السيارات ببعتولك عروضهم بالسعر.</p>
      <Link href="/requests/new" className="flex min-h-11 items-center justify-center rounded-control bg-accent px-4 py-3 font-bold text-on-accent">
        طلب جديد
      </Link>
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />
      {!ready ? (
        <div className="skeleton h-[104px] rounded-card" aria-hidden="true" />
      ) : requests.length === 0 && waiting.length === 0 ? (
        <p className="text-text-muted">لسّا ما بعتت أي طلب خاص.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {waiting
            .filter((w) => !known.has(w.id))
            .map((w) => (
              <li key={w.id} className="flex flex-col gap-1 rounded-card border-2 border-pending bg-surface p-3">
                <span className="font-bold text-pending">{PENDING_SEND}</span>
                <span>
                  من {placeName(w.from)} لـ{placeName(w.to)}
                </span>
                <span className="text-caption text-text-muted">
                  {whenText(w, today)} · {seatsText(w.seats)}
                </span>
                <span className="text-caption text-text-muted">انحفظ على جوالك، ورح ينبعت أول ما يرجع النت</span>
              </li>
            ))}
          {requests.map((r) => {
            const offers = data.offers.filter((o) => o.requestId === r.id);
            const status = riderRequestStatus(r, offers.filter((o) => o.status === "sent").length);
            const news = offers.some((o) => unread(o.id, data.messages));
            return (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface p-3">
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className={`flex items-center gap-2 font-bold ${TONE_CLASS[status.tone]}`}>
                      {status.text}
                      {news && <span aria-label="رسالة جديدة" className="size-2 shrink-0 rounded-full bg-danger" />}
                    </span>
                    <span>
                      من {placeName(r.from)} لـ{placeName(r.to)}
                    </span>
                    <span className="text-caption text-text-muted">
                      {whenText(r, today)} · {seatsText(r.seats)}
                    </span>
                  </span>
                  <span className="shrink-0 text-text-muted">
                    <ForwardChevron />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
