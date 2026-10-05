"use client";

import { useEffect, useMemo, useState } from "react";
import { MapView, type MapMarker } from "@/components/MapView";
import { Sheet } from "@/components/Sheet";
import { VehiclePhoto } from "@/components/VehicleCards";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { PHOTO_CACHE, photoUrl } from "@/lib/photos";
import { getPlace, placeName } from "@/lib/places";
import { aboutMinutes, NO_TIME_NOW, stopsText } from "@/lib/plan-copy";
import type { PlanLeg, PlanOption } from "@/lib/planner";
import { isStale, stopsBetween } from "@/lib/rider-rules";
import { formatTime } from "@/lib/time";
import { freeSeatsText, positionText, VEHICLE_PIN } from "@/lib/vehicle-copy";

const Approx = () => <span className="text-caption font-normal text-text-muted">تقريباً</span>;

// What the top of an option says: when the rider gets there, if that can be known.
function Arrival({ option, isNow }: { option: PlanOption; isNow: boolean }) {
  if (option.arriveInMinutes !== null) {
    return (
      <span className="flex flex-wrap items-baseline gap-x-2 font-bold text-accent">
        بتوصل بعد {aboutMinutes(option.arriveInMinutes)} <Approx />
      </span>
    );
  }
  if (!isNow) return <span className="font-bold">{option.legs.length > 1 ? "مشوار بسيارتين" : "مشوار مباشر"}</span>;
  return <span className="text-caption text-text-muted">{NO_TIME_NOW}</span>;
}

function LegRow({ leg, now, isNow, download }: { leg: PlanLeg; now: number; isNow: boolean; download: boolean }) {
  const position = positionText(leg.position, now);
  return (
    <span className="flex items-start gap-3">
      <VehiclePhoto hash={leg.vehicle.photos[0]} download={download} className="size-16" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">
            {VEHICLE_TYPE_AR[leg.vehicle.type]} · {leg.vehicle.driverName}
          </span>
          <span className={`shrink-0 text-caption ${leg.vehicle.free > 0 ? "text-accent" : "text-danger"}`}>{freeSeatsText(leg.vehicle.free)}</span>
        </span>
        <span className="truncate text-caption text-text-muted">{leg.route.name}</span>
        <span>
          من {placeName(leg.from)} لـ{placeName(leg.to)} · {stopsText(leg.stopCount)}
        </span>
        {isNow ? (
          <span className={`text-caption ${position.fresh ? "text-accent" : "text-text-muted"}`}>
            {leg.boardInMinutes !== null ? `بتوصلك بعد ${aboutMinutes(leg.boardInMinutes)} · ` : ""}
            {position.text}
          </span>
        ) : (
          <span className="text-caption text-text-muted">
            شغّال من الساعة <bdi>{formatTime(leg.startTime)}</bdi> للساعة <bdi>{formatTime(leg.endTime)}</bdi>
          </span>
        )}
      </span>
    </span>
  );
}

function ChangeRow({ option }: { option: PlanOption }) {
  if (!option.changeAt) return null;
  return (
    <span className="rounded-control bg-bg px-3 py-2 text-caption">
      <span className="font-bold">بدّل السيارة في {placeName(option.changeAt)}</span>
      {option.waitMinutes !== null && (
        <>
          {" · "}بتستنى {aboutMinutes(option.waitMinutes)} <Approx />
        </>
      )}
    </span>
  );
}

export function PlanOptionCard({ option, now, isNow, onOpen }: { option: PlanOption; now: number; isNow: boolean; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full flex-col gap-3 rounded-card bg-surface p-3 text-start">
      <Arrival option={option} isNow={isNow} />
      <LegRow leg={option.legs[0]} now={now} isNow={isNow} download={false} />
      {option.legs[1] && (
        <>
          <ChangeRow option={option} />
          <LegRow leg={option.legs[1]} now={now} isNow={isNow} download={false} />
        </>
      )}
    </button>
  );
}

// The option on the map: the stops the rider passes, numbered in travel order, the line
// between them, and each vehicle where it was last seen.
function optionMap(option: PlanOption, now: number): { markers: MapMarker[]; line: [number, number][] } {
  const stops: string[] = [];
  for (const leg of option.legs) for (const id of stopsBetween(leg.route, leg.from, leg.to)) if (stops[stops.length - 1] !== id) stops.push(id);
  const markers: MapMarker[] = [];
  const line: [number, number][] = [];
  stops.forEach((id, index) => {
    const place = getPlace(id);
    if (!place) return;
    line.push([place.lat, place.lon]);
    markers.push({ id: `stop-${index}`, lat: place.lat, lon: place.lon, text: String(index + 1), label: place.nameAr, tone: "stop" });
  });
  for (const leg of option.legs) {
    if (!leg.position) continue;
    markers.push({
      id: `vehicle-${leg.vehicle.id}`,
      lat: leg.position.lat,
      lon: leg.position.lon,
      text: VEHICLE_PIN[leg.vehicle.type] ?? "•",
      label: `${VEHICLE_TYPE_AR[leg.vehicle.type]}، ${positionText(leg.position, now).text}`,
      tone: isStale(leg.position.at, now) ? "stale" : "accent",
    });
  }
  return { markers, line };
}

export function PlanSheet({ option, now, isNow, onClose }: { option: PlanOption | null; now: number; isNow: boolean; onClose: () => void }) {
  const [download, setDownload] = useState(false);
  const [allCached, setAllCached] = useState(false);
  const hashes = option?.legs.flatMap((l) => l.vehicle.photos).join(",") ?? "";
  useEffect(() => {
    let alive = true;
    void (async () => {
      const cache = await caches.open(PHOTO_CACHE).catch(() => null);
      const hits = await Promise.all(hashes.split(",").filter(Boolean).map((h) => cache?.match(photoUrl(h))));
      if (alive) setAllCached(hits.length > 0 && hits.every(Boolean));
    })();
    return () => {
      alive = false;
    };
  }, [hashes]);
  // The map is drawn from the option's shape, not from the clock, so it doesn't refit
  // every time the ages on screen tick.
  const optionId = option?.id ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const drawn = useMemo(() => (option ? optionMap(option, now) : null), [optionId]);

  return (
    <Sheet
      open={option !== null}
      onClose={() => {
        setDownload(false);
        onClose();
      }}
      title={option && option.legs.length > 1 ? "مشوار بسيارتين" : "مشوار مباشر"}
    >
      {option && drawn && (
        <div className="flex flex-col gap-4 p-4">
          <Arrival option={option} isNow={isNow} />
          <MapView markers={drawn.markers} line={drawn.line} fit="markers" className="h-56" />
          {option.legs.map((leg, index) => (
            <section key={leg.vehicle.id} className="flex flex-col gap-2">
              {index === 1 && <ChangeRow option={option} />}
              <LegRow leg={leg} now={now} isNow={isNow} download={download} />
              <ol className="divide-y divide-separator rounded-card bg-bg">
                {stopsBetween(leg.route, leg.from, leg.to).map((placeId, i, all) => (
                  <li key={placeId} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="min-w-0 truncate">{placeName(placeId)}</span>
                    <span className="shrink-0 text-caption text-text-muted">{i === 0 ? "بتركب من هون" : i === all.length - 1 ? "بتنزل هون" : ""}</span>
                  </li>
                ))}
              </ol>
              {leg.vehicle.photos.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  {leg.vehicle.photos.slice(1).map((hash) => (
                    <VehiclePhoto key={hash} hash={hash} download={download} className="aspect-4/3 w-full" />
                  ))}
                </div>
              )}
            </section>
          ))}
          {hashes && !download && !allCached && (
            <button type="button" onClick={() => setDownload(true)} className="min-h-11 w-full rounded-control border border-separator bg-surface px-4 py-2 font-medium text-accent">
              نزّل الصور هلأ
            </button>
          )}
          <p className="text-caption text-text-muted">الأجرة بتتفق عليها مع السوّاق. مِشوار ما بيحدد أسعار.</p>
        </div>
      )}
    </Sheet>
  );
}

/** Reserved space while the phone's copy is being read. */
export function PlanCardSkeleton() {
  return <div className="skeleton h-[132px] rounded-card" aria-hidden="true" />;
}
