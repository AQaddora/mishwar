"use client";

import { useEffect, useRef, useState } from "react";
import { SaveNote, useOutbox } from "@/components/OutboxStatus";
import { newId, type Outcome } from "@/lib/outbox";
import { BINARY_TYPE, encodeDriverPoint, fixAgeSec, worthSending } from "@/lib/position-codec";
import { formatAge } from "@/lib/time";

const SEND_EVERY_MS = 15_000;
const primary = "min-h-11 w-full rounded-control bg-accent px-4 py-4 text-title text-on-accent disabled:opacity-60";

type Gps = "waiting" | "sending" | "denied" | "unavailable" | "offline";
const GPS_TEXT: Record<Exclude<Gps, "sending">, string> = {
  waiting: "بنستنى موقعك من الجوال…",
  denied: "ما قدرنا نعرف موقعك. اسمح لمِشوار يشوف موقعك من إعدادات الجوال، وبعدين افتح هالشاشة مرة ثانية.",
  unavailable: "جوالك مش عم يعطينا موقعك هلأ. الرحلة شغّالة، بس الركّاب مش رح يشوفوا مكانك.",
  offline: "ما في نت، فموقعك مش عم ينبعت. بيرجع ينبعت لحاله أول ما يرجع النت.",
};

export function DriveClient({
  trip,
  routeName,
  blocked,
  outsideSchedule,
}: {
  trip: { id: string; routeName: string; startedAt: string } | null;
  routeName: string | null;
  blocked: string | null;
  outsideSchedule: boolean;
}) {
  const { send } = useOutbox();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [gps, setGps] = useState<Gps>("waiting");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const latest = useRef<{ lat: number; lon: number; speed: number | null; at: number; fixAt: number } | null>(null);
  const lastPosted = useRef(0);
  const lastSent = useRef<{ lat: number; lon: number; sentAt: number } | null>(null);

  async function run(kind: string, payload: unknown) {
    setBusy(true);
    setOutcome(await send(kind, payload));
    setBusy(false);
  }

  // While a trip is open and this screen is open: read the GPS, send the newest point
  // about every 15 seconds, and keep the display awake. Positions are never queued: a
  // point that could not be sent is simply replaced by the next one. Standing still, one
  // point a minute is enough (worthSending). The point goes as 8 bytes of binary; an older
  // server that refuses it (400) gets JSON for the rest of the trip.
  const tripId = trip?.id ?? null;
  useEffect(() => {
    if (!tripId) return;
    let alive = true;
    let json = false;
    const send = (point: NonNullable<typeof latest.current>) =>
      fetch("/api/position", {
        method: "POST",
        headers: { "content-type": json ? "application/json" : BINARY_TYPE },
        body: json
          ? JSON.stringify({ lat: point.lat, lon: point.lon, speed: point.speed })
          : encodeDriverPoint({ lat: point.lat, lon: point.lon, speed: point.speed, ageSec: fixAgeSec(point.fixAt, Date.now()) }),
      });
    const post = async () => {
      const point = latest.current;
      if (!point || point.at <= lastPosted.current) return;
      if (!worthSending(lastSent.current, point, Date.now())) return;
      lastPosted.current = point.at;
      try {
        let response = await send(point);
        if (response.status === 400 && !json) {
          json = true;
          response = await send(point);
        }
        if (!alive) return;
        if (response.ok) {
          lastSent.current = { lat: point.lat, lon: point.lon, sentAt: Date.now() };
          setGps("sending");
          setSentAt(Date.now());
        }
      } catch {
        if (alive) setGps("offline");
      }
    };

    let watch: number | undefined;
    if (!("geolocation" in navigator)) {
      queueMicrotask(() => alive && setGps("unavailable"));
    } else {
      watch = navigator.geolocation.watchPosition(
        (p) => {
          const first = latest.current === null;
          latest.current = { lat: p.coords.latitude, lon: p.coords.longitude, speed: p.coords.speed, at: Date.now(), fixAt: p.timestamp };
          if (first) void post();
        },
        (error) => {
          if (alive) setGps(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
        },
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 },
      );
    }
    const timer = setInterval(() => {
      setNow(Date.now());
      void post();
    }, SEND_EVERY_MS);

    // Keep the screen awake; the lock is dropped whenever the app goes to the background.
    let lock: { release: () => Promise<void> } | null = null;
    const wake = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        lock = (await (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
      } catch {
        /* low battery or no support: the note on screen asks the driver to keep it open */
      }
    };
    void wake();
    document.addEventListener("visibilitychange", wake);

    return () => {
      alive = false;
      if (watch !== undefined) navigator.geolocation.clearWatch(watch);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      void lock?.release().catch(() => {});
      latest.current = null;
      lastSent.current = null;
    };
  }, [tripId]);

  if (!trip) {
    return (
      <div className="mt-4 flex flex-col gap-4">
        <section className="flex flex-col gap-2 rounded-card bg-surface p-4">
          {blocked ? (
            <p className="text-title">{blocked}</p>
          ) : (
            <>
              <p className="text-caption text-text-muted">خطك هلأ</p>
              <p className="text-title">{routeName}</p>
              {outsideSchedule && <p className="text-pending">إنت برّا أيام وساعات شغلك، فالركّاب مش رح يشوفوك بالبحث.</p>}
            </>
          )}
        </section>
        <p className="text-text-muted">لما تبدأ الرحلة، الركّاب بيشوفوا مكان سيارتك عالخريطة. موقعك بينبعت بس وهالشاشة مفتوحة، وبيوقف أول ما تخلّص.</p>
        <SaveNote outcome={outcome} />
        <button type="button" disabled={busy || blocked !== null} onClick={() => void run("trip.start", { id: newId() })} className={primary}>
          ابدأ الرحلة
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded-card bg-surface p-4">
        <p className="text-caption text-text-muted">إنت طالع هلأ على</p>
        <p className="text-title text-accent">{trip.routeName}</p>
        <p suppressHydrationWarning className="text-caption text-text-muted">
          بدأت {formatAge(trip.startedAt, now)}
        </p>
      </section>
      <p className="rounded-card bg-surface p-4 font-medium">خلّي مِشوار مفتوح وإنت سايق عشان الركّاب يشوفوك</p>
      <p role="status" className={gps === "sending" ? "text-accent" : gps === "waiting" ? "text-text-muted" : "text-pending"}>
        {gps === "sending" ? `الركّاب شايفينك · آخر مكان انبعت ${formatAge(sentAt ?? now, now)}` : GPS_TEXT[gps]}
      </p>
      <SaveNote outcome={outcome} />
      <button
        type="button"
        disabled={busy}
        onClick={() => void run("trip.end", {})}
        className="min-h-11 w-full rounded-control bg-surface px-4 py-4 text-title text-danger disabled:opacity-60"
      >
        خلّصت الرحلة
      </button>
    </div>
  );
}
