"use client";

import { useCallback, useEffect, useState } from "react";
import { useOutbox } from "@/components/OutboxStatus";
import { pendingEntries, type OutboxEntry } from "@/lib/outbox";
import type { SyncMessage } from "@/lib/public-data";

/** Writes of these kinds still waiting on the phone: shown as «مستني ينبعت». */
export function usePendingWrites<T>(kind: string, tick: number): T[] {
  const { pending } = useOutbox();
  const [waiting, setWaiting] = useState<T[]>([]);
  useEffect(() => {
    let alive = true;
    void pendingEntries()
      .then((entries: OutboxEntry[]) => {
        if (alive) setWaiting(entries.filter((e) => e.kind === kind).map((e) => e.payload as T));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [kind, pending, tick]);
  return waiting;
}

// Which messages has this phone already shown? One time per thread, kept on the phone
// only. It is a convenience (the unread dot), so losing it is harmless.
const KEY = "mishwar:seen-threads";
function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export function useSeenThreads() {
  const [seen, setSeen] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    queueMicrotask(() => setSeen(readSeen()));
  }, []);
  const markSeen = useCallback((offerId: string, at: string) => {
    const all = readSeen();
    if ((all[offerId] ?? "") >= at) return;
    all[offerId] = at;
    try {
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {}
    setSeen(all);
  }, []);
  /** True when the thread's newest message is from the other side and newer than what was shown. */
  const unread = useCallback(
    (offerId: string, messages: SyncMessage[]) => {
      if (!seen) return false;
      const theirs = messages.filter((m) => m.offerId === offerId && !m.mine);
      const newest = theirs.reduce((max, m) => (m.at > max ? m.at : max), "");
      return newest !== "" && newest > (seen[offerId] ?? "");
    },
    [seen],
  );
  return { unread, markSeen };
}
