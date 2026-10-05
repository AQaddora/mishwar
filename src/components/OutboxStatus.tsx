"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { enqueue, ensureAccount, flush, pendingCount, subscribe, type Outcome } from "@/lib/outbox";
import { formatNumber } from "@/lib/time";
import { refreshData } from "@/lib/use-public-data";

type Send = (kind: string, payload: unknown) => Promise<Outcome>;
const OutboxContext = createContext<{ accountId: string | null; pending: number; send: Send }>({
  accountId: null,
  pending: 0,
  send: async () => ({ status: "rejected", message: "سجّل دخولك أول" }),
});

/** send(kind, payload): the only way a screen writes. See src/lib/outbox.ts. */
export function useOutbox() {
  return useContext(OutboxContext);
}

// Lives once in the root layout. Owns the replay triggers (app start, network back, app
// back in front) and the small "waiting to send" line above the tab bar.
export function OutboxProvider({ accountId, children }: { accountId: string | null; children: ReactNode }) {
  const router = useRouter();
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const replay = async () => {
      const outcomes = await flush().catch(() => new Map<string, Outcome>());
      // Something reached the server in the background: show the fresh state.
      if (alive && outcomes.size > 0) {
        router.refresh();
        // The phone's own copy too: a booking made offline now shows as confirmed or refused.
        refreshData();
      }
    };
    const unsubscribe = subscribe((event) => {
      if (!alive) return;
      setPending(event.pending);
      if (event.rejected?.message) setNotice(event.rejected.message);
    });
    ensureAccount(accountId)
      .then(pendingCount)
      .then((n) => {
        if (!alive) return;
        setPending(n);
        if (n > 0) void replay();
      })
      .catch(() => {});
    const onVisible = () => {
      if (document.visibilityState === "visible") void replay();
    };
    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      unsubscribe();
      window.removeEventListener("online", replay);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [accountId, router]);

  const send = useCallback<Send>(
    async (kind, payload) => {
      if (!accountId) return { status: "rejected", message: "سجّل دخولك أول" };
      await ensureAccount(accountId);
      const outcome = await enqueue(accountId, kind, payload);
      if (outcome.status === "applied" || outcome.status === "duplicate") router.refresh();
      return outcome;
    },
    [accountId, router],
  );

  return (
    <OutboxContext.Provider value={{ accountId, pending, send }}>
      {children}
      {(pending > 0 || notice) && (
        <div
          role="status"
          className="fixed inset-x-0 bottom-(--tab-bar-space) z-10 flex flex-col gap-1 px-4 pb-2"
        >
          {notice && (
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="min-h-11 rounded-card bg-danger px-4 py-2 text-start text-on-accent"
            >
              {notice}
            </button>
          )}
          {pending > 0 && (
            <p className="rounded-card bg-pending px-4 py-2 text-caption text-on-accent">
              <bdi>{formatNumber(pending)}</bdi> محفوظة على جوالك، رح تنبعت أول ما يرجع النت
            </p>
          )}
        </div>
      )}
    </OutboxContext.Provider>
  );
}

/** The line a form shows after a save: saved, waiting for the network, or refused. */
export function SaveNote({ outcome }: { outcome: Outcome | null }) {
  const { pending } = useOutbox();
  if (!outcome) return null;
  // A queued write that has since left the phone is no longer "waiting".
  const waiting = outcome.status === "queued" && pending > 0;
  const tone = outcome.status === "rejected" ? "text-danger" : waiting ? "text-pending" : "text-accent";
  const text = outcome.status === "rejected" || waiting ? outcome.message : outcome.status === "queued" ? "انبعت" : "انحفظ";
  // A schedule or maintenance change that hit bookings: say how many riders were told.
  const cancelled = (outcome.result as { cancelled?: number } | null | undefined)?.cancelled ?? 0;
  return (
    <p role="status" className={`font-medium ${tone}`}>
      {text}
      {cancelled > 0 && outcome.status !== "rejected" && (
        <span className="block text-pending">
          انلغى حجز <bdi>{formatNumber(cancelled)}</bdi> من الركّاب بسبب هالتغيير، وبلّغناهم.
        </span>
      )}
    </p>
  );
}
