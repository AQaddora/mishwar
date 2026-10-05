// Vehicle photos on the phone (offline-first-pwa skill, "Photos in practice").
// Photos never travel in the outbox or in sync. They wait in their own queue and move
// only on Wi-Fi, or when the user taps «ابعت الصور هلأ» / «نزّل الصور هلأ».
// Browser only.
import { getMeta, idbDelete, idbGetAll, idbPut, setMeta } from "@/lib/idb";

export const PHOTO_CACHE = "photos-v1";
const TARGET_BYTES = 200 * 1024;
const MAX_SIDE = 1280;

export type QueuedPhoto = { id: string; accountId: string; blob: Blob; createdAt: string };

export const photoUrl = (hash: string) => `/api/photos/${hash}`;

// wifi or ethernet: yes. cellular: no. Missing (iPhone Safari, Firefox, desktop): unknown.
// saveData: never automatic.
export function connectionKind(): "unmetered" | "metered" | "unknown" {
  const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
  if (!c || c.saveData) return c?.saveData ? "metered" : "unknown";
  if (c.type === "wifi" || c.type === "ethernet") return "unmetered";
  if (c.type === undefined || c.type === "unknown") return "unknown";
  return "metered";
}

/** «الصور بس على الواي فاي»: on by default. */
export async function getWifiOnly(): Promise<boolean> {
  return (await getMeta<boolean>("photosWifiOnly")) ?? true;
}
export const setWifiOnly = (value: boolean) => setMeta("photosWifiOnly", value);

// May photos move without the user asking? Unknown is treated as not allowed: we never guess.
export async function autoTransferAllowed(): Promise<boolean> {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (c?.saveData) return false;
  if (!(await getWifiOnly())) return true;
  return connectionKind() === "unmetered";
}

// Resize and re-encode on the phone before anything is stored: about 200 KB per photo.
export async function compressPhoto(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  let width = Math.round(bitmap.width * scale);
  let height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  let best: Blob | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
    for (const quality of [0.8, 0.65, 0.5]) {
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
      if (!blob) continue;
      best = blob;
      if (blob.size <= TARGET_BYTES) return blob;
    }
    width = Math.round(width * 0.75);
    height = Math.round(height * 0.75);
  }
  if (!best) throw new Error("could not encode the photo");
  return best;
}

export async function queuePhoto(accountId: string, blob: Blob): Promise<QueuedPhoto> {
  const photo: QueuedPhoto = { id: crypto.randomUUID(), accountId, blob, createdAt: new Date().toISOString() };
  await idbPut("photos", photo);
  return photo;
}

export const queuedPhotos = async () =>
  (await idbGetAll<QueuedPhoto>("photos")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
export const removeQueuedPhoto = (id: string) => idbDelete("photos", id);

export type UploadResult = { uploaded: string[]; left: number; message?: string };

// Sends the queue, oldest first. Stops at the first failure and keeps the rest.
export async function uploadQueuedPhotos(): Promise<UploadResult> {
  const uploaded: string[] = [];
  const queue = await queuedPhotos();
  let message: string | undefined;
  for (const photo of queue) {
    let response: Response;
    try {
      response = await fetch("/api/photos", { method: "POST", headers: { "content-type": "image/jpeg" }, body: photo.blob });
    } catch {
      message = "ما في نت. الصور محفوظة على جوالك";
      break;
    }
    if (response.status === 422 || response.status === 400) {
      // Refused for good (too many photos, or not a photo): drop it and say so.
      await removeQueuedPhoto(photo.id);
      message = response.status === 422 ? "بتقدر تحط ٤ صور بس" : "الصورة ما زبطت، جرّب صورة ثانية";
      continue;
    }
    if (!response.ok) {
      message = response.status === 409 ? "احفظ معلومات السيارة أول" : "ما قدرنا نبعت، رح نجرب لما يرجع النت";
      break;
    }
    const { hash } = (await response.json()) as { hash: string };
    // Keep our own copy, so the photo shows offline without downloading it again.
    try {
      const cache = await caches.open(PHOTO_CACHE);
      await cache.put(photoUrl(hash), new Response(photo.blob, { headers: { "content-type": "image/jpeg" } }));
    } catch {}
    await removeQueuedPhoto(photo.id);
    uploaded.push(hash);
  }
  return { uploaded, left: (await queuedPhotos()).length, message };
}

// A photo for display: from the phone's cache when it is there; from the network only
// when `download` is true (Wi-Fi, or the user tapped «نزّل الصور هلأ»). Null = not on this phone.
export async function loadPhoto(hash: string, download: boolean): Promise<string | null> {
  const url = photoUrl(hash);
  let cache: Cache | null = null;
  try {
    cache = await caches.open(PHOTO_CACHE);
    const hit = await cache.match(url);
    if (hit) return URL.createObjectURL(await hit.blob());
  } catch {}
  if (!download) return null;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    await cache?.put(url, response.clone()).catch(() => {});
    return URL.createObjectURL(await response.blob());
  } catch {
    return null;
  }
}
