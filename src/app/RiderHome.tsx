"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookingNotices } from "@/components/BookingNotices";
import { RequestNotices } from "@/components/RequestNotices";
import { DataAge } from "@/components/DataAge";
import { ForwardChevron } from "@/components/icons";
import { MapView, type MapMarker } from "@/components/MapView";
import { VehicleCard, VehicleCardSkeleton, VehicleSheet } from "@/components/VehicleCards";
import { VEHICLE_TYPE_AR } from "@/lib/driver-rules";
import { autoTransferAllowed } from "@/lib/photos";
import { isStale, vehiclesRunningAt } from "@/lib/rider-rules";
import { gazaNow } from "@/lib/time";
import { usePublicData } from "@/lib/use-public-data";
import { positionText, VEHICLE_PIN } from "@/lib/vehicle-copy";

// The rider's and the guest's home: who is running now, on the map and in a list.
// Everything is drawn from the phone's own copy of the data, so it also opens offline.
export function RiderHome({ signedIn, downloadPhotos }: { signedIn: boolean; /** «نزّل الصور هلأ» was tapped. */ downloadPhotos: boolean }) {
  const { data, ready, lastSyncAt, offline, now } = usePublicData();
  const [openId, setOpenId] = useState<string | null>(null);
  // On Wi-Fi photos arrive by themselves, so there is nothing to offer.
  const [photosAuto, setPhotosAuto] = useState(true);
  useEffect(() => {
    void autoTransferAllowed().then(setPhotosAuto);
  }, []);

  const running = useMemo(() => (ready ? vehiclesRunningAt(data, gazaNow(new Date(now)), true) : []), [data, ready, now]);
  const markers = useMemo<MapMarker[]>(
    () =>
      running
        .filter((v) => v.position)
        .map((v) => ({
          id: v.vehicle.id,
          lat: v.position!.lat,
          lon: v.position!.lon,
          text: VEHICLE_PIN[v.vehicle.type] ?? "•",
          label: `${VEHICLE_TYPE_AR[v.vehicle.type]}، ${v.route.name}، ${positionText(v.position, now).text}`,
          tone: isStale(v.position!.at, now) ? "stale" : "accent",
        })),
    [running, now],
  );
  const open = running.find((v) => v.vehicle.id === openId) ?? null;

  return (
    <div className="mt-3 flex flex-col gap-3">
      <Link href="/search" className="flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface px-4 py-3">
        <span className="font-medium">لوين رايح؟ دوّر على مشوار</span>
        <span className="text-text-muted">
          <ForwardChevron />
        </span>
      </Link>

      {signedIn && ready && <BookingNotices bookings={data.bookings} now={now} today={gazaNow(new Date(now)).day} />}
      {signedIn && ready && <RequestNotices data={data} role="rider" now={now} />}

      <MapView markers={markers} onSelect={setOpenId} className="h-72" />
      <DataAge lastSyncAt={lastSyncAt} offline={offline} now={now} />

      <section className="flex flex-col gap-2">
        <h2 className="text-title">شغّالين هلأ</h2>
        {!ready ? (
          <>
            <VehicleCardSkeleton />
            <VehicleCardSkeleton />
          </>
        ) : running.length === 0 ? (
          <p className="text-text-muted">{lastSyncAt ? "ما في سيارات شغّالة هلأ." : offline ? "افتح مِشوار مرة والنت شغّال عشان تنزل المعلومات." : "ما في سيارات شغّالة هلأ."}</p>
        ) : (
          running.map((item) => <VehicleCard key={item.vehicle.id} item={item} now={now} showPosition download={downloadPhotos} onOpen={() => setOpenId(item.vehicle.id)} />)
        )}
        {ready && !downloadPhotos && !photosAuto && running.some((v) => v.vehicle.photos.length > 0) && (
          // Photos move by themselves only on Wi-Fi; anywhere else, only on this tap.
          <Link href="/?photos=now" replace className="flex min-h-11 items-center justify-center rounded-control border border-separator bg-surface px-4 py-2 font-medium text-accent">
            نزّل الصور هلأ
          </Link>
        )}
      </section>

      {!signedIn && (
        <Link href="/login" className="flex min-h-11 items-center justify-between gap-3 rounded-card bg-surface p-4">
          <span>سجّل دخولك عشان تحجز</span>
          <span className="text-text-muted">
            <ForwardChevron />
          </span>
        </Link>
      )}

      <VehicleSheet item={open} now={now} showPosition onClose={() => setOpenId(null)} />
    </div>
  );
}
