"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOutbox } from "@/components/OutboxStatus";
import { PlacePicker } from "@/components/PlacePicker";
import { newId } from "@/lib/outbox";
import { getPlace, type PickPlace } from "@/lib/places";
import { MAX_NOTE, MAX_REQUEST_DAYS_AHEAD, MAX_REQUEST_SEATS, validateRequest } from "@/lib/request-rules";
import { addDays, formatDay, gazaNow, WEEKDAY_AR, weekdayOf } from "@/lib/time";
import { refreshData } from "@/lib/use-public-data";

const field = "min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body";

export function NewRequestForm({ places, initialFrom, initialTo }: { places: PickPlace[]; initialFrom: string | null; initialTo: string | null }) {
  const router = useRouter();
  const { send } = useOutbox();
  const [today] = useState(() => gazaNow().day);
  const [from, setFrom] = useState<string | null>(initialFrom);
  const [to, setTo] = useState<string | null>(initialTo);
  const [day, setDay] = useState(today);
  const [time, setTime] = useState("08:00");
  const [seats, setSeats] = useState("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const days = Array.from({ length: MAX_REQUEST_DAYS_AHEAD + 1 }, (_, i) => addDays(today, i));
  const dayLabel = (d: string, i: number) => (i === 0 ? "اليوم" : i === 1 ? "بكرة" : `${WEEKDAY_AR[weekdayOf(d)]} ${formatDay(d)}`);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const input = { from: from ?? "", to: to ?? "", day, time, seats: Number(seats), note: note.trim() };
    const invalid = validateRequest(input, today, (id) => getPlace(id) !== undefined);
    if (invalid) return setProblem(invalid);
    setBusy(true);
    setProblem(null);
    const id = newId();
    const outcome = await send("request.create", { id, ...input });
    setBusy(false);
    if (outcome.status === "rejected") return setProblem(outcome.message ?? "ما زبط الطلب");
    refreshData();
    // Sent: straight to the request, where the offers will show. Still on the phone: the list says so.
    router.push(outcome.status === "queued" ? "/requests" : `/requests/${id}`);
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
      <PlacePicker label="من وين؟" places={places} value={from} onChange={setFrom} exclude={[to]} />
      <PlacePicker label="لوين؟" places={places} value={to} onChange={setTo} exclude={[from]} />
      <div className="flex gap-3">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-caption text-text-muted">أي يوم؟</span>
          <select value={day} onChange={(e) => setDay(e.target.value)} className={field}>
            {days.map((d, i) => (
              <option key={d} value={d}>
                {dayLabel(d, i)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-caption text-text-muted">الساعة</span>
          <input type="time" required value={time} onChange={(e) => setTime(e.target.value)} className={field} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">كم كرسي؟</span>
        <input id="request-seats" type="number" inputMode="numeric" min={1} max={MAX_REQUEST_SEATS} required value={seats} onChange={(e) => setSeats(e.target.value)} className={field} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-muted">ملاحظة للسوّاق (مش ضروري)</span>
        <textarea id="request-note" rows={2} maxLength={MAX_NOTE} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: معنا شنطتين كبار" className={field} />
      </label>
      {problem && (
        <p role="alert" className="font-medium text-danger">
          {problem}
        </p>
      )}
      <button type="submit" disabled={busy} className="min-h-11 rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-60">
        ابعت الطلب
      </button>
      <p className="text-caption text-text-muted">السوّاقين بيشوفوا اسمك الأول والطلب بس. رقم جوالك بيبيّن بس للسوّاق اللي بتقبل عرضه.</p>
    </form>
  );
}
