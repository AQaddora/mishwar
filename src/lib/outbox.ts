// The outbox: every write in the app goes through enqueue(). It is saved on the phone
// first, then sent to POST /api/outbox, oldest first. No network? It waits, and the
// screen says «انحفظ على جوالك، ورح ينبعت أول ما يرجع النت».
// Browser only.
import { getMeta, idbClear, idbDelete, idbGetAll, idbPut, setMeta } from "@/lib/idb";

export const SAVED_OFFLINE = "انحفظ على جوالك، ورح ينبعت أول ما يرجع النت";

export type OutboxEntry = { id: string; kind: string; accountId: string; createdAt: string; payload: unknown };
export type Outcome = {
  /** queued = still on the phone, waiting for the network. */
  status: "applied" | "duplicate" | "rejected" | "queued";
  result?: unknown;
  reason?: string;
  message?: string;
};

type Listener = (event: { pending: number; rejected?: Outcome & { kind: string } }) => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function sorted(): Promise<OutboxEntry[]> {
  const all = await idbGetAll<OutboxEntry>("outbox");
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function pendingCount(): Promise<number> {
  return (await idbGetAll<OutboxEntry>("outbox")).length;
}

async function notify(rejected?: Outcome & { kind: string }) {
  const pending = await pendingCount();
  for (const listener of listeners) listener({ pending, rejected });
}

// On logout or an account switch: purge. Never send account A's entries as account B.
export async function ensureAccount(accountId: string | null): Promise<void> {
  const stored = (await getMeta<string | null>("accountId")) ?? null;
  if (stored === accountId) return;
  if (stored !== null) {
    await Promise.all([idbClear("outbox"), idbClear("photos"), idbClear("data")]);
    await Promise.all([setMeta("cursor", null), setMeta("lastSyncAt", null)]);
  }
  await setMeta("accountId", accountId);
  await notify();
}

let flushing: Promise<Map<string, Outcome>> | null = null;

// Replays serially, oldest first. Stops at the first network (or server) failure and
// leaves the rest queued. An answered entry — applied, duplicate or rejected — is removed.
export function flush(): Promise<Map<string, Outcome>> {
  flushing ??= (async () => {
    const outcomes = new Map<string, Outcome>();
    try {
      const accountId = (await getMeta<string | null>("accountId")) ?? null;
      for (const entry of await sorted()) {
        if (entry.accountId !== accountId) {
          await idbDelete("outbox", entry.id);
          continue;
        }
        let response: Response;
        try {
          response = await fetch("/api/outbox", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ entries: [entry] }),
          });
        } catch {
          break; // no network: don't trust navigator.onLine, the failed request is the proof
        }
        if (!response.ok) break; // signed out or server trouble: keep it for later
        const body = (await response.json()) as { results: (Outcome & { id: string })[] };
        const outcome = body.results.find((r) => r.id === entry.id);
        if (!outcome) break;
        await idbDelete("outbox", entry.id);
        outcomes.set(entry.id, outcome);
        if (outcome.status === "rejected") await notify({ ...outcome, kind: entry.kind });
      }
    } finally {
      flushing = null;
      await notify();
    }
    return outcomes;
  })();
  return flushing;
}

function uuid(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // Older iPhones (before iOS 15.4) have getRandomValues but not randomUUID.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export const newId = uuid;

// Save on the phone first, then try to send. Resolves with what happened to THIS write.
export async function enqueue(accountId: string, kind: string, payload: unknown): Promise<Outcome> {
  const entry: OutboxEntry = { id: uuid(), kind, accountId, createdAt: new Date().toISOString(), payload };
  await idbPut("outbox", entry);
  // Ask the browser not to evict our data now that it holds something that matters.
  void navigator.storage?.persist?.().catch(() => {});
  await notify();
  // A flush may already be running without this entry; run again until it is answered or stuck.
  let outcome = (await flush()).get(entry.id);
  if (!outcome && (await idbGetAll<OutboxEntry>("outbox")).some((e) => e.id === entry.id)) {
    outcome = (await flush()).get(entry.id);
  }
  return outcome ?? { status: "queued", message: SAVED_OFFLINE };
}
