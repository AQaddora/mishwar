// The server side of the outbox (offline-first-pwa skill, references/sync-protocol.md).
// Every write in the app arrives here as an entry with an id the phone made up. That id
// is the idempotency key: an entry is applied once, and a replay gets the first answer.

export type OutboxEntryInput = {
  id: string;
  kind: string;
  accountId: string;
  createdAt?: string;
  payload: unknown;
};

export type EntryResult = {
  id: string;
  status: "applied" | "duplicate" | "rejected";
  result?: unknown;
  /** Stable code for tests and logs. */
  reason?: string;
  /** What to tell the user, in Arabic. */
  message?: string;
};

export type Actor = { id: string; role: "rider" | "driver" | null };

/** A handler throws this to refuse a write; the phone shows `message` and drops the entry. */
export class Reject extends Error {
  constructor(
    public reason: string,
    message: string,
  ) {
    super(message);
  }
}

export type Handler = (actor: Actor, payload: Record<string, unknown>) => Promise<unknown>;

/** Where processed entries are remembered. Prisma in production, a Map in tests. */
export type ProcessedStore = {
  find(userId: string, id: string): Promise<{ status: string; result: unknown } | null>;
  save(userId: string, entry: { id: string; kind: string; status: string; result: unknown }): Promise<void>;
};

export const MAX_BATCH_BYTES = 20 * 1024;
const GENERIC_ERROR = "صار في مشكلة عندنا، جرّب بعد شوي";

export function isEntry(value: unknown): value is OutboxEntryInput {
  const e = value as OutboxEntryInput;
  return (
    !!e &&
    typeof e.id === "string" &&
    /^[0-9a-f-]{16,64}$/i.test(e.id) &&
    typeof e.kind === "string" &&
    typeof e.accountId === "string" &&
    typeof e.payload === "object" &&
    e.payload !== null
  );
}

// Applies entries one by one, oldest first, exactly once each.
// A rejection is an answer too: it is stored, so the same entry is never retried.
// An unexpected error is NOT stored; it bubbles up so the phone keeps the entry and retries.
export async function processEntries(
  actor: Actor,
  entries: OutboxEntryInput[],
  handlers: Record<string, Handler>,
  store: ProcessedStore,
): Promise<EntryResult[]> {
  const results: EntryResult[] = [];
  for (const entry of entries) {
    // Never apply account A's writes as account B.
    if (entry.accountId !== actor.id) {
      results.push({ id: entry.id, status: "rejected", reason: "wrong_account", message: GENERIC_ERROR });
      continue;
    }
    const before = await store.find(actor.id, entry.id);
    if (before) {
      const stored = (before.result ?? {}) as { result?: unknown; reason?: string; message?: string };
      results.push(
        before.status === "rejected"
          ? { id: entry.id, status: "rejected", reason: stored.reason, message: stored.message }
          : { id: entry.id, status: "duplicate", result: stored.result },
      );
      continue;
    }
    const handler = Object.hasOwn(handlers, entry.kind) ? handlers[entry.kind] : undefined;
    let outcome: EntryResult;
    if (!handler) {
      outcome = { id: entry.id, status: "rejected", reason: "unknown_kind", message: GENERIC_ERROR };
    } else {
      try {
        const result = await handler(actor, entry.payload as Record<string, unknown>);
        outcome = { id: entry.id, status: "applied", result: result ?? null };
      } catch (error) {
        if (!(error instanceof Reject)) throw error;
        outcome = { id: entry.id, status: "rejected", reason: error.reason, message: error.message };
      }
    }
    await store.save(actor.id, {
      id: entry.id,
      kind: entry.kind,
      status: outcome.status,
      result: { result: outcome.result ?? null, reason: outcome.reason, message: outcome.message },
    });
    results.push(outcome);
  }
  return results;
}
