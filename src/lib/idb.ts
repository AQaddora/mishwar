// The phone's local database (offline-first-pwa skill, sync-protocol.md).
// Browser only: call these from effects and event handlers, never during render.
//
// Stores:
//   data    [entity, id]  last-known records (filled by sync, from M3)
//   outbox  id            pending writes, replayed oldest first
//   meta    name          cursor, lastSyncAt, accountId, settings
//   photos  id            the separate photo queue (never the data outbox)

const DB_NAME = "mishwar";
const DB_VERSION = 1;
export type StoreName = "data" | "outbox" | "meta" | "photos";

let opening: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("data")) db.createObjectStore("data", { keyPath: ["entity", "id"] });
      if (!db.objectStoreNames.contains("outbox")) {
        db.createObjectStore("outbox", { keyPath: "id" }).createIndex("createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "name" });
      if (!db.objectStoreNames.contains("photos")) db.createObjectStore("photos", { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error);
    };
  });
  return opening;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, work: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const request = work(tx.objectStore(store));
        tx.oncomplete = () => resolve(request.result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      }),
  );
}

export const idbGetAll = <T>(store: StoreName) => run<T[]>(store, "readonly", (s) => s.getAll());
export const idbGet = <T>(store: StoreName, key: IDBValidKey) => run<T | undefined>(store, "readonly", (s) => s.get(key));
export const idbPut = (store: StoreName, value: unknown) => run(store, "readwrite", (s) => s.put(value));
export const idbDelete = (store: StoreName, key: IDBValidKey) => run(store, "readwrite", (s) => s.delete(key));
export const idbClear = (store: StoreName) => run(store, "readwrite", (s) => s.clear());

export async function getMeta<T>(name: string): Promise<T | undefined> {
  return (await idbGet<{ name: string; value: T }>("meta", name))?.value;
}
export async function setMeta(name: string, value: unknown): Promise<void> {
  await idbPut("meta", { name, value });
}
