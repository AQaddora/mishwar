"use client";

import Link from "next/link";
import { placeName } from "@/lib/places";
import type { PublicData } from "@/lib/public-data";
import { offersCountText } from "@/lib/request-copy";
import { useSeenThreads } from "@/lib/use-requests";

const DAY_MS = 24 * 60 * 60 * 1000;

// What a rider or a driver is told about special requests, in one small list. Built from
// the phone's own copy, so it also shows with no network. There is no push: this list is
// how "the driver is told" and "the rider is told" happen, at the next sync.
export function RequestNotices({ data, role, now }: { data: PublicData; role: "rider" | "driver"; now: number }) {
  const { unread } = useSeenThreads();
  const lines: { key: string; text: string; tone: string; href: string }[] = [];
  const requestOf = (id: string) => data.requests.find((r) => r.id === id);

  for (const o of data.offers) {
    const r = requestOf(o.requestId);
    if (!r || !unread(o.id, data.messages)) continue;
    lines.push({ key: `m-${o.id}`, text: role === "rider" ? `رسالة جديدة من السوّاق ${o.name}` : `رسالة جديدة من الراكب ${r.name ?? ""}`, tone: "text-accent", href: `/chat/${o.id}` });
  }
  if (role === "rider") {
    for (const r of data.requests) {
      if (!r.mine || r.status !== "open") continue;
      const sent = data.offers.filter((o) => o.requestId === r.id && o.status === "sent").length;
      if (sent > 0) lines.push({ key: `o-${r.id}`, text: `${offersCountText(sent)} على طلبك من ${placeName(r.from)} لـ${placeName(r.to)}`, tone: "text-accent", href: `/requests/${r.id}` });
    }
  } else {
    for (const o of data.offers) {
      const r = requestOf(o.requestId);
      if (!r) continue;
      const where = `من ${placeName(r.from)} لـ${placeName(r.to)}`;
      if (o.status === "accepted" && !r.completedAt) lines.push({ key: `a-${o.id}`, text: `الراكب قبل عرضك · ${where}`, tone: "text-accent", href: "/driver/requests" });
      else if (o.status === "declined" && r.status === "accepted" && now - Date.parse(o.updatedAt) < DAY_MS) {
        lines.push({ key: `d-${o.id}`, text: `الراكب اختار عرض ثاني · ${where}`, tone: "text-danger", href: "/driver/requests" });
      }
    }
  }

  if (lines.length === 0) return null;
  return (
    <section aria-label="آخر الأخبار عن الطلبات الخاصة" className="flex flex-col gap-2">
      {lines.map((line) => (
        <Link key={line.key} href={line.href} role="status" className={`flex min-h-11 items-center rounded-card bg-surface p-3 font-medium ${line.tone}`}>
          {line.text}
        </Link>
      ))}
    </section>
  );
}
