"use client";

import { useEffect, useState } from "react";
import { getMeta } from "@/lib/idb";
import { SYNC_FAILED_EVENT, SYNCED_EVENT, syncNow } from "@/lib/sync";
import { formatAge } from "@/lib/time";

const PROBE_AFTER_MS = 2000;

// One calm line on every screen while there is no network: the screen is the phone's own
// copy, and this says how old it is. Shown when the browser says it is offline, or when
// the last pull of the data got no answer (navigator.onLine alone is not trusted to say
// we ARE online; a failed request is the proof we are not).
export function OfflineBanner() {
  const [state, setState] = useState<{ offline: boolean; lastSyncAt: string | null; now: number }>({ offline: false, lastSyncAt: null, now: 0 });

  useEffect(() => {
    let failed = false;
    let heard = false;
    const show = async () => {
      const lastSyncAt = (await getMeta<string | null>("lastSyncAt").catch(() => null)) ?? null;
      setState({ offline: failed || !navigator.onLine, lastSyncAt, now: Date.now() });
    };
    const onFailed = () => {
      heard = true;
      failed = true;
      void show();
    };
    const onSynced = () => {
      heard = true;
      failed = false;
      void show();
    };
    const onChange = () => {
      if (!navigator.onLine) failed = true;
      void show();
    };
    void show();
    // Screens drawn by the server (the driver's) don't pull data by themselves: if no pull
    // was heard soon after opening, make one, so a page the worker served from the phone
    // still says it is the phone's copy.
    const probe = setTimeout(() => {
      if (!heard) void syncNow();
    }, PROBE_AFTER_MS);
    const timer = setInterval(() => void show(), 30_000);
    window.addEventListener(SYNC_FAILED_EVENT, onFailed);
    window.addEventListener(SYNCED_EVENT, onSynced);
    window.addEventListener("offline", onChange);
    window.addEventListener("online", onChange);
    return () => {
      clearTimeout(probe);
      clearInterval(timer);
      window.removeEventListener(SYNC_FAILED_EVENT, onFailed);
      window.removeEventListener(SYNCED_EVENT, onSynced);
      window.removeEventListener("offline", onChange);
      window.removeEventListener("online", onChange);
    };
  }, []);

  if (!state.offline) return null;
  return (
    <div className="sticky top-0 z-20 bg-bg px-4 pt-[env(safe-area-inset-top)]">
      <p role="status" data-offline-banner className="mt-2 rounded-control border border-separator bg-surface px-3 py-2 text-caption font-medium text-pending">
        ما في نت · بتشوف آخر نسخة على جوالك
        {state.lastSyncAt ? ` · آخر تحديث ${formatAge(state.lastSyncAt, state.now)}` : ""}
      </p>
    </div>
  );
}
