"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { MAX_PHOTOS, VEHICLE_TYPE_AR, VEHICLE_TYPES, type VehicleType } from "@/lib/driver-rules";
import type { Outcome } from "@/lib/outbox";
import {
  autoTransferAllowed,
  compressPhoto,
  getWifiOnly,
  loadPhoto,
  queuedPhotos,
  queuePhoto,
  removeQueuedPhoto,
  setWifiOnly,
  uploadQueuedPhotos,
  type QueuedPhoto,
} from "@/lib/photos";
import { formatDay, formatNumber } from "@/lib/time";
import type { DriverVehicle } from "@/server/driver";

const field = "min-h-11 w-full rounded-control border border-separator bg-surface px-3 py-2 text-body";
const primary = "min-h-11 w-full rounded-control bg-accent px-4 py-3 font-bold text-on-accent disabled:opacity-60";
const secondary = "min-h-11 w-full rounded-control border border-separator bg-surface px-4 py-3 font-medium text-accent disabled:opacity-60";

export function VehicleForm({ vehicle }: { vehicle: DriverVehicle | null }) {
  const { send } = useOutbox();
  const [type, setType] = useState<VehicleType>(vehicle?.type ?? "ajala");
  const [seats, setSeats] = useState(String(vehicle?.seats ?? ""));
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setOutcome(await send("vehicle.save", { type, seats: Number(seats) }));
    setBusy(false);
  }

  return (
    <form onSubmit={save} className="mt-4 flex flex-col gap-4 rounded-card bg-surface p-4">
      <fieldset>
        <legend className="mb-2 font-medium">نوع السيارة</legend>
        <div className="grid grid-cols-3 gap-2">
          {VEHICLE_TYPES.map((t) => (
            <label
              key={t}
              className="flex min-h-11 cursor-pointer items-center justify-center rounded-control border-2 border-separator px-2 font-medium has-checked:border-accent has-checked:text-accent"
            >
              <input
                type="radio"
                name="type"
                value={t}
                checked={type === t}
                onChange={() => setType(t)}
                className="sr-only"
              />
              {VEHICLE_TYPE_AR[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-2">
        <label htmlFor="seats" className="font-medium">
          كم كرسي؟
        </label>
        <input
          id="seats"
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          required
          dir="ltr"
          value={seats}
          onChange={(e) => setSeats(e.target.value)}
          className={`${field} text-end`}
        />
      </div>
      <SaveNote outcome={outcome} />
      <button type="submit" disabled={busy} className={primary}>
        احفظ
      </button>
    </form>
  );
}

function Thumb({ src, label, onRemove }: { src: string | null; label?: string; onRemove?: () => void }) {
  return (
    <li className="relative aspect-4/3 overflow-hidden rounded-control bg-bg">
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- a blob from the phone's own cache
        <img src={src} alt="صورة السيارة" className="size-full object-cover" />
      ) : (
        <span className="flex size-full items-center justify-center p-2 text-center text-caption text-text-muted">
          الصورة مش على جوالك
        </span>
      )}
      {label && (
        <span className="absolute inset-x-0 bottom-0 bg-pending px-2 py-1 text-center text-caption text-on-accent">
          {label}
        </span>
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label="امسح الصورة"
          className="absolute end-0 top-0 flex size-11 items-center justify-center"
        >
          <span className="flex size-7 items-center justify-center rounded-full bg-black/60 text-white" aria-hidden="true">
            ×
          </span>
        </button>
      )}
    </li>
  );
}

export function PhotoSection({ hashes, downloadNow }: { hashes: string[]; downloadNow: boolean }) {
  const { send, accountId } = useOutbox();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [queued, setQueued] = useState<(QueuedPhoto & { url: string })[]>([]);
  const [shown, setShown] = useState<Record<string, string | null>>({});
  const [wifiOnly, setWifiOnlyState] = useState(true);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refreshQueue = useCallback(async () => {
    const list = await queuedPhotos();
    setQueued((old) => {
      old.forEach((q) => URL.revokeObjectURL(q.url));
      return list.map((q) => ({ ...q, url: URL.createObjectURL(q.blob) }));
    });
  }, []);

  const upload = useCallback(async () => {
    setBusy(true);
    const result = await uploadQueuedPhotos();
    setNote(result.message ?? null);
    await refreshQueue();
    setBusy(false);
    if (result.uploaded.length > 0) router.refresh();
  }, [refreshQueue, router]);

  // On open: show what is queued, and send it without asking only if the Wi-Fi rule allows.
  useEffect(() => {
    void (async () => {
      setWifiOnlyState(await getWifiOnly());
      await refreshQueue();
      if ((await queuedPhotos()).length > 0 && (await autoTransferAllowed())) await upload();
    })();
  }, [refreshQueue, upload]);

  // Saved photos: from the phone's cache; from the network only on Wi-Fi or after a tap.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const download = downloadNow || (await autoTransferAllowed());
      const entries = await Promise.all(hashes.map(async (h) => [h, await loadPhoto(h, download)] as const));
      if (alive) setShown(Object.fromEntries(entries));
    })();
    return () => {
      alive = false;
    };
  }, [hashes, downloadNow, wifiOnly]);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (!accountId || files.length === 0) return;
    const room = MAX_PHOTOS - hashes.length - queued.length;
    if (room <= 0) return setNote("بتقدر تحط ٤ صور بس");
    setBusy(true);
    try {
      for (const file of files.slice(0, room)) await queuePhoto(accountId, await compressPhoto(file));
      await refreshQueue();
      if (await autoTransferAllowed()) await upload();
      else setNote("الصور انحفظت على جوالك. بتنبعت لحالها على الواي فاي، أو اكبس «ابعت الصور هلأ»");
    } catch {
      setNote("الصورة ما زبطت، جرّب صورة ثانية");
    }
    setBusy(false);
  }

  const missing = hashes.filter((h) => shown[h] === null).length;
  const total = hashes.length + queued.length;

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-card bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-title">الصور</h2>
        <span className="text-caption text-text-muted">
          <bdi>{formatNumber(total)}</bdi> من <bdi>{formatNumber(MAX_PHOTOS)}</bdi>
        </span>
      </div>
      <p className="text-caption text-text-muted">صوّر سيارتك إنت، عشان الركّاب يعرفوها بالشارع.</p>
      {total > 0 && (
        <ul className="grid grid-cols-2 gap-2">
          {hashes.map((h) => (
            <Thumb key={h} src={shown[h] ?? null} onRemove={() => void send("photo.remove", { hash: h })} />
          ))}
          {queued.map((q) => (
            <Thumb
              key={q.id}
              src={q.url}
              label="مستنية تنبعت"
              onRemove={() => void removeQueuedPhoto(q.id).then(refreshQueue)}
            />
          ))}
        </ul>
      )}
      {note && (
        <p role="status" className="font-medium text-pending">
          {note}
        </p>
      )}
      {missing > 0 && (
        // A link, so the choice is one tap and survives a reload.
        <Link href="?photos=now" replace className={`${secondary} text-center`}>
          نزّل الصور هلأ
        </Link>
      )}
      {queued.length > 0 && (
        <button type="button" disabled={busy} onClick={() => void upload()} className={secondary}>
          ابعت الصور هلأ
        </button>
      )}
      {total < MAX_PHOTOS && (
        <>
          <input ref={input} type="file" accept="image/*" multiple onChange={pick} className="sr-only" tabIndex={-1} aria-hidden="true" />
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={primary}>
            ضيف صورة
          </button>
        </>
      )}
      <label className="flex min-h-11 items-center justify-between gap-3">
        <span>الصور بس على الواي فاي</span>
        <input
          type="checkbox"
          checked={wifiOnly}
          onChange={(e) => {
            setWifiOnlyState(e.target.checked);
            void setWifiOnly(e.target.checked);
          }}
          className="size-6 accent-accent"
        />
      </label>
    </section>
  );
}

export function MaintenanceForm({ from, until, today }: { from: string | null; until: string | null; today: string }) {
  const { send } = useOutbox();
  const [open, setOpen] = useState(false);
  const [fromDay, setFromDay] = useState(today);
  const [untilDay, setUntilDay] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  async function set(payload: { from: string | null; until: string | null }) {
    setBusy(true);
    const result = await send("maintenance.set", payload);
    setOutcome(result);
    if (result.status !== "rejected") setOpen(false);
    setBusy(false);
  }

  return (
    <section className="mt-6 flex flex-col gap-3 rounded-card bg-surface p-4">
      <h2 className="text-title">التصليح</h2>
      {from ? (
        <>
          <p className="font-medium text-danger">
            السيارة بالتصليح من {formatDay(from)}
            {until ? ` لـ ${formatDay(until)}` : ""}
          </p>
          <p className="text-caption text-text-muted">طول ما هي بالتصليح، الركّاب ما بيشوفوك.</p>
          <button type="button" disabled={busy} onClick={() => void set({ from: null, until: null })} className={primary}>
            رجعت السيارة
          </button>
        </>
      ) : open ? (
        <>
          <div className="flex flex-col gap-2">
            <label htmlFor="m-from" className="font-medium">
              من يوم
            </label>
            <input id="m-from" type="date" required value={fromDay} onChange={(e) => setFromDay(e.target.value)} className={field} />
          </div>
          <div className="flex flex-col gap-2">
            <label htmlFor="m-until" className="font-medium">
              لحد يوم (خلّيه فاضي إذا مش عارف)
            </label>
            <input id="m-until" type="date" min={fromDay} value={untilDay} onChange={(e) => setUntilDay(e.target.value)} className={field} />
          </div>
          <button type="button" disabled={busy} onClick={() => void set({ from: fromDay, until: untilDay || null })} className={primary}>
            احفظ
          </button>
          <button type="button" onClick={() => setOpen(false)} className={secondary}>
            رجوع
          </button>
        </>
      ) : (
        <>
          <p className="text-text-muted">السيارة شغّالة.</p>
          <button type="button" onClick={() => setOpen(true)} className={secondary}>
            السيارة بالتصليح
          </button>
        </>
      )}
      <SaveNote outcome={outcome} />
    </section>
  );
}
