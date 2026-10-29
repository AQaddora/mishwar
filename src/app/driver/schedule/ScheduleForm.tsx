"use client";
// The week, Saturday first: for each day, working or not, hours, and which route. Saved
// through the outbox (schedule.save); the server cancels the bookings the change makes
// impossible and the driver is told how many.

import { useState } from "react";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { validateSchedule, type ScheduleDayInput } from "@/lib/driver-rules";
import type { Outcome } from "@/lib/outbox";
import { WEEKDAY_AR } from "@/lib/time";

const field = "min-h-11 w-full min-w-0 rounded-control border border-separator bg-surface px-2 py-2 text-body";

export function ScheduleForm({
  days: initial,
  routes,
  today,
}: {
  days: ScheduleDayInput[];
  routes: { id: string; name: string; isDefault: boolean }[];
  today: number;
}) {
  const { send } = useOutbox();
  const [days, setDays] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  function change(weekday: number, patch: Partial<ScheduleDayInput>) {
    setDays((old) => old.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)));
    setOutcome(null);
  }

  async function save() {
    const problem = validateSchedule(days, routes.map((r) => r.id));
    if (problem) return setOutcome({ status: "rejected", message: problem });
    setBusy(true);
    setOutcome(await send("schedule.save", { days }));
    setBusy(false);
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <p className="text-caption text-text-muted">
        تغيير مستعجل؟ عدّل اليوم نفسه من هون: مش شغّال، ساعات ثانية، أو خط ثاني.
      </p>
      <ul className="flex flex-col gap-3">
        {days.map((day) => (
          <li
            key={day.weekday}
            className={`flex flex-col gap-3 rounded-card bg-surface p-4 ${day.weekday === today ? "border-2 border-accent" : ""}`}
          >
            <label className="flex min-h-11 items-center justify-between gap-3">
              <span className="flex items-baseline gap-2">
                <span className="text-title">{WEEKDAY_AR[day.weekday]}</span>
                {day.weekday === today && <span className="text-caption text-accent">اليوم</span>}
              </span>
              <span className="flex items-center gap-2">
                <span className={day.working ? "text-accent" : "text-text-muted"}>{day.working ? "شغّال" : "مش شغّال"}</span>
                <input
                  type="checkbox"
                  checked={day.working}
                  onChange={(e) => change(day.weekday, { working: e.target.checked })}
                  className="size-6 accent-accent"
                />
              </span>
            </label>
            {day.working && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-caption text-text-muted">من الساعة</span>
                    <input type="time" required value={day.startTime} onChange={(e) => change(day.weekday, { startTime: e.target.value })} className={field} />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-caption text-text-muted">للساعة</span>
                    <input type="time" required value={day.endTime} onChange={(e) => change(day.weekday, { endTime: e.target.value })} className={field} />
                  </label>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-caption text-text-muted">خط هاد اليوم</span>
                  <select value={day.routeId ?? ""} onChange={(e) => change(day.weekday, { routeId: e.target.value || null })} className={field}>
                    <option value="">الخط الأساسي</option>
                    {routes
                      .filter((r) => !r.isDefault)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                  </select>
                </label>
              </>
            )}
          </li>
        ))}
      </ul>
      <SaveNote outcome={outcome} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void save()}
        className="min-h-11 w-full rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-60"
      >
        احفظ
      </button>
    </div>
  );
}
