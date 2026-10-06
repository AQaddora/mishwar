import { formatAge } from "@/lib/time";

// «آخر تحديث قبل ٥ دقايق»: how old the data on screen is. Stale data looks stale.
export function DataAge({ lastSyncAt, offline, now }: { lastSyncAt: string | null; offline: boolean; now: number }) {
  if (!lastSyncAt) {
    return <p className="text-caption text-text-muted">{offline ? "ما في نت، ولسّا ما نزلت المعلومات على جوالك" : " "}</p>;
  }
  const old = offline || now - Date.parse(lastSyncAt) > 5 * 60 * 1000;
  return (
    <p role="status" className={`text-caption ${old ? "font-medium text-pending" : "text-text-muted"}`}>
      {/* "No network" itself is said once, by the OfflineBanner at the top of the screen. */}
      آخر تحديث {formatAge(lastSyncAt, now)}
    </p>
  );
}
