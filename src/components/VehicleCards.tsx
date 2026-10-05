"use client";

import { useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { autoTransferAllowed, loadPhoto, PHOTO_CACHE, photoUrl } from "@/lib/photos";
import { placeName } from "@/lib/places";
import type { VehicleNow } from "@/lib/rider-rules";
import { formatTime } from "@/lib/time";
import { freeSeatsText, positionText } from "@/lib/vehicle-copy";

// A vehicle photo under the photo rules: from the phone's cache when it is there; from
// the network only on Wi-Fi, or after the user taps «نزّل الصور هلأ».
export function VehiclePhoto({ hash, download, className }: { hash: string | undefined; download: boolean; className: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    if (!hash) return;
    void (async () => {
      const url = await loadPhoto(hash, download || (await autoTransferAllowed()));
      made = url;
      if (alive) setSrc(url);
    })();
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [hash, download]);
  return (
    <span className={`flex shrink-0 items-center justify-center overflow-hidden rounded-control bg-bg text-center text-caption text-text-muted ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob from the phone's own cache */}
      {src ? <img src={src} alt="صورة السيارة" className="size-full object-cover" /> : <span className="px-1">{hash ? "الصورة مش على جوالك" : "بدون صورة"}</span>}
    </span>
  );
}

export function VehicleCard({
  item,
  now,
  showPosition,
  download = false,
  onOpen,
}: {
  item: VehicleNow;
  now: number;
  /** The user asked for photos now («نزّل الصور هلأ»). */
  download?: boolean;
  /** False for a search about a later time: no position, only the working hours. */
  showPosition: boolean;
  onOpen: () => void;
}) {
  const { vehicle, route } = item;
  const position = positionText(item.position, now);
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center gap-3 rounded-card bg-surface p-3 text-start">
      <VehiclePhoto hash={vehicle.photos[0]} download={download} className="size-16" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-bold">
            {VEHICLE_TYPE_AR[vehicle.type]} · {vehicle.driverName}
          </span>
          <span className={`shrink-0 text-caption ${vehicle.free > 0 ? "text-accent" : "text-danger"}`}>{freeSeatsText(vehicle.free)}</span>
        </span>
        <span className="truncate">{route.name}</span>
        {showPosition ? (
          <span className={`text-caption ${position.fresh ? "text-accent" : "text-text-muted"}`}>{position.text}</span>
        ) : (
          <span className="text-caption text-text-muted">
            شغّال من الساعة <bdi>{formatTime(item.startTime)}</bdi> للساعة <bdi>{formatTime(item.endTime)}</bdi>
          </span>
        )}
      </span>
    </button>
  );
}

export function VehicleSheet({ item, now, showPosition, onClose }: { item: VehicleNow | null; now: number; showPosition: boolean; onClose: () => void }) {
  const [download, setDownload] = useState(false);
  // Nothing to offer when every photo is already on this phone.
  const [allCached, setAllCached] = useState(false);
  const hashes = item?.vehicle.photos.join(",") ?? "";
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
  const title = item ? `${VEHICLE_TYPE_AR[item.vehicle.type]} · ${item.vehicle.driverName}` : "";
  return (
    <Sheet
      open={item !== null}
      onClose={() => {
        setDownload(false);
        onClose();
      }}
      title={title}
    >
      {item && (
        <div className="flex flex-col gap-4 p-4">
          <p className="flex items-baseline justify-between gap-3">
            <span className="font-medium">{freeSeatsText(item.vehicle.free)}</span>
            <span className="text-caption text-text-muted">
              من أصل <bdi>{item.vehicle.seats}</bdi>
            </span>
          </p>
          {showPosition && (
            <p className={positionText(item.position, now).fresh ? "text-accent" : "text-text-muted"}>{positionText(item.position, now).text}</p>
          )}
          {item.vehicle.photos.length > 0 ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                {item.vehicle.photos.map((hash) => (
                  <VehiclePhoto key={hash} hash={hash} download={download} className="aspect-4/3 w-full" />
                ))}
              </div>
              {!download && !allCached && (
                <button type="button" onClick={() => setDownload(true)} className="min-h-11 w-full rounded-control border border-separator bg-surface px-4 py-2 font-medium text-accent">
                  نزّل الصور هلأ
                </button>
              )}
            </div>
          ) : (
            <p className="text-text-muted">السوّاق لسّا ما حط صور لسيارته.</p>
          )}
          <section className="flex flex-col gap-2">
            <h3 className="font-bold">{item.route.name}</h3>
            <p className="text-caption text-text-muted">
              شغّال من الساعة <bdi>{formatTime(item.startTime)}</bdi> للساعة <bdi>{formatTime(item.endTime)}</bdi>، رايح جاي
            </p>
            <ol className="divide-y divide-separator rounded-card bg-bg">
              {item.route.stops.map((placeId, index) => (
                <li key={placeId} className="flex items-center gap-3 px-3 py-2">
                  <span className="w-6 shrink-0 text-text-muted">
                    <bdi>{index + 1}</bdi>
                  </span>
                  <span className="min-w-0 truncate">{placeName(placeId)}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>
      )}
    </Sheet>
  );
}

/** Reserved space while the phone's copy is being read: same height as a card. */
export function VehicleCardSkeleton() {
  return <div className="skeleton h-[88px] rounded-card" aria-hidden="true" />;
}
