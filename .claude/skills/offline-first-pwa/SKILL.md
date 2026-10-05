---
name: offline-first-pwa
description: How every Mishwar feature must behave on bad or no internet. Use whenever you build or change anything that loads or saves data — a screen showing server data, any button or form that writes (booking, offer, chat message, route or vehicle edit), the sync endpoint, the IndexedDB outbox, the service worker or caching, photo upload or download, or a "last updated" label — and whenever you decide what happens when two people change the same thing. Not for visual styling (ios-native-feel) or server and deploy config (taqat-deploy).
---

# Offline-first PWA

Internet in Gaza is weak, cuts out, and is paid by the megabyte. Treat the network as a
bonus: every screen works from what is already on the phone, and every action is safe to
take with no signal.

## The five rules

1. **Loads with no network.** The app shell and the last-known data render offline. Show
   cached data first, then refresh in the background.
2. **Every write goes to the outbox first.**
   - The write goes to an IndexedDB outbox, then syncs later.
   - Tell the user immediately: «انحفظ على جوالك، ورح ينبعت أول ما يرجع النت».
   - Keep the item marked as pending until the server confirms it.
   - Each entry carries an idempotency key, so a replay can never double-book.
3. **Sync is cheap.**
   - Small JSON, only the changes since the last sync, within the budget below.
   - Always show how old the data on screen is («آخر تحديث قبل ٥ دقايق»), and make stale
     data look stale.
4. **Photos never travel in the normal sync.**
   - Sync carries photo hashes only.
   - Downloaded photos are cached on the phone and shown offline.
   - New or changed photos upload and download only on Wi-Fi or an unmetered connection.
   - Where the browser can't tell (iPhone Safari), don't guess: automatic transfer is off.
     Show a «نزّل الصور هلأ» button and a «الصور بس على الواي فاي» setting.
5. **Every conflict has a stated rule and a visible outcome.** See the table below.

## Sync budget (gzipped bytes; test against it)

| Sync | Budget |
|---|---|
| Routine sync: changes since the cursor, a typical day | ≤ 10 KB |
| Any single sync response | ≤ 50 KB (paginate beyond this) |
| First sync on a fresh install: routes, stops, vehicles, no photos | ≤ 150 KB |
| One outbox upload batch | ≤ 20 KB |

- **Keep a unit test** that builds a realistic sync response from the seed data and asserts
  its gzipped size is under budget.
- **Raising a budget is allowed only on purpose,** in the same PR, with the reason.

## Conflicts

| Data | Rule | What the user sees |
|---|---|---|
| Seats on a trip | The server decides; the first booking to reach it wins | Winner: «تأكد حجزك». Loser: «الكراسي خلصت قبل ما يوصل طلبك», plus other options |
| Accepting an offer | First accept wins, and the request closes | The other drivers: «الراكب اختار عرض ثاني» |
| A driver's routes, weekly schedule, maintenance, vehicle, fares | One author: the driver's latest edit wins (by server time) | The driver sees the saved version |
| A rider books, offline, a driver who has since stopped running (not working that day, outside hours, maintenance, or that day's route skips the stop) | The server rejects the booking | «انلغى حجزك لأنه السوّاق غيّر شغله اليوم» (or the maintenance reason), plus other options |
| Chat messages | Append-only, ordered by server time | A pending mark until sent |

Before adding a new kind of shared data, add its row here first.

## Photos in practice

- **Detecting the connection:** `navigator.connection?.type`.
  - `wifi` or `ethernet`: allowed.
  - `cellular`: not allowed.
  - Missing (iPhone Safari, Firefox): unknown, so treated as not allowed.
  - `saveData` set: never automatic.
- **The «الصور بس على الواي فاي» setting** defaults to on.
  - On, with an unknown connection: photos move only when the user taps the button.
  - Off: automatic on any connection.
- **Before upload:**
  - Compress on the phone, aiming for about 200 KB per photo.
  - Upload from the outbox's separate photo queue, never the data queue.
  - Drivers get an «ابعت الصور هلأ» button.
- **Photo URLs contain the content hash.** A cached copy is then never stale, and serving
  photos cache-first is safe.
- **Storage:**
  - Call `navigator.storage.persist()` once the user has saved something that matters.
  - On `QuotaExceededError`, evict the least-recently-viewed photos first.
  - Never evict the outbox.

## Use the installed pwa-* skills for the mechanics

- **`pwa-offline`:** service-worker strategy.
  - Network-first for pages; cache-first only for hashed assets and photos.
  - Register the worker in production only.
  - `Cache-Control: no-cache` on `sw.js` and the manifest.
  - The update flow and recovering from missing chunks after a deploy.
- **`pwa-runtime-resilience`:** outbox replay, refetching on resume, error reporting.
- **`pwa-auth-state`:** purge user data and the outbox on logout or account switch.
- **Don't trust `navigator.onLine`.** Confirm with a real request (P-518).

## Reference

- `references/sync-protocol.md`: request and response shapes, the cursor, outbox entries,
  idempotency, IndexedDB stores, and the budget test. Read it before writing `/api/sync`,
  the outbox, or any code that reads local data.
