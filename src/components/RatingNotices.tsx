"use client";

import Link from "next/link";
import type { PublicData } from "@/lib/public-data";
import { RATE_PROMPT } from "@/lib/rating-rules";
import { usePendingWrites } from "@/lib/use-requests";

const MAX_LINES = 2;

// «كيف كان مشوارك؟ قيّم»: after a trip is completed, each side is asked once to rate the
// other. Built from the phone's own copy (completed and not yet rated), so it also shows
// with no network. A rating still waiting on the phone counts as given.
export function RatingNotices({ data, role, now }: { data: PublicData; role: "rider" | "driver"; now: number }) {
  const waiting = usePendingWrites<{ kind: string; target: string }>("rating.create", now);
  const sent = new Set(waiting.map((w) => `${w.kind}:${w.target}`));
  const lines: { key: string; name: string }[] = [];
  for (const b of data.bookings) {
    if (b.completedAt && !b.rated && (b.status === "confirmed" || b.status === "ready")) lines.push({ key: `booking:${b.id}`, name: b.name });
  }
  for (const r of data.requests) {
    if (!r.completedAt || r.rated || r.status !== "accepted") continue;
    const offer = data.offers.find((o) => o.requestId === r.id && o.status === "accepted");
    if (offer) lines.push({ key: `private:${r.id}`, name: role === "rider" ? offer.name : (r.name ?? "") });
  }
  const open = lines.filter((l) => !sent.has(l.key)).slice(0, MAX_LINES);
  if (open.length === 0) return null;
  return (
    <section aria-label="قيّم مشاويرك" className="flex flex-col gap-2">
      {open.map((line) => (
        <Link key={line.key} href={`/history?rate=${line.key}`} prefetch={false} role="status" className="flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface p-3 font-medium text-accent">
          <span>{RATE_PROMPT}</span>
          <span className="shrink-0 text-caption text-text-muted">{role === "rider" ? `السوّاق ${line.name}` : `الراكب ${line.name}`}</span>
        </Link>
      ))}
    </section>
  );
}
