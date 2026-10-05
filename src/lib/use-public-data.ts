"use client";

import { useEffect, useState } from "react";
import { EMPTY_PUBLIC_DATA, type PublicData } from "@/lib/public-data";
import { readLocal, syncNow } from "@/lib/sync";

export type PublicDataState = {
  data: PublicData;
  /** False until the phone's own copy has been read: show skeletons, not "nothing". */
  ready: boolean;
  /** ISO time of the last sync that succeeded, or null when this phone never synced. */
  lastSyncAt: string | null;
  /** The last attempt got no answer: what is on screen is the phone's copy. */
  offline: boolean;
  /** Ticks every 30 seconds, so ages on screen («قبل ٣ دقايق») keep moving. */
  now: number;
};

const REFRESH_MS = 30_000;

// The screens' way to the public data: the phone's copy first, then a refresh in the
// background, again every 30 seconds while the screen is open, and when the app comes
// back to the front or the network returns.
export function usePublicData(): PublicDataState {
  const [state, setState] = useState<PublicDataState>({ data: EMPTY_PUBLIC_DATA, ready: false, lastSyncAt: null, offline: false, now: 0 });

  useEffect(() => {
    let alive = true;
    const show = async (offline: boolean) => {
      const local = await readLocal().catch(() => ({ data: EMPTY_PUBLIC_DATA, lastSyncAt: null }));
      if (alive) setState({ ...local, ready: true, offline, now: Date.now() });
    };
    const refresh = async () => {
      const ok = await syncNow();
      await show(!ok);
    };
    void show(false).then(refresh);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return state;
}
