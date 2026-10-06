"use client";

import { useEffect } from "react";
import { pendingCount } from "@/lib/outbox";
import { ownScreens, SCREENS } from "@/lib/screens";
import type { TabRole } from "@/components/TabBar";

const PRECACHE_DELAY_MS = 1500;
const UPDATE_EVERY_MS = 30 * 60 * 1000;

// Registers public/sw.js, in production builds only (in development it would serve
// stale code). See the comments at the top of sw.js for what it caches.
export function ServiceWorker({ build, role, accountId }: { build: string; role: TabRole; accountId: string | null }) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    let controlled = sw.controller !== null;
    let alive = true;

    // Tell the worker what this page loaded, so it can keep copies for offline.
    const warm = () => {
      const urls = [location.href, ...performance.getEntriesByType("resource").map((e) => e.name)].filter((u) =>
        u.startsWith(location.origin),
      );
      sw.controller?.postMessage({ type: "warm", urls });
    };
    // Every screen of this role, a little after the page itself, so the screen on show
    // gets the network first. The worker fetches only what it doesn't have yet.
    const precache = async () => {
      const worker = (await sw.ready).active;
      const own = await ownScreens(role, accountId).catch(() => []);
      if (alive) worker?.postMessage({ type: "precache", stamp: `${build}:${accountId ?? "guest"}`, urls: [...SCREENS[role], ...own] });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const precacheSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void precache(), PRECACHE_DELAY_MS);
    };
    // A new version took over: reload once to run it, unless a write is still waiting
    // on this phone. The first install is not an update, so it never reloads.
    const onChange = async () => {
      if (!controlled) {
        controlled = true;
        return warm();
      }
      if ((await pendingCount().catch(() => 1)) === 0) location.reload();
    };
    // An app on the home screen can stay open for days: look for a new worker when it
    // comes back to the front, at most every half hour.
    let checked = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - checked < UPDATE_EVERY_MS) return;
      checked = Date.now();
      void sw.getRegistration().then((r) => r?.update()).catch(() => {});
    };
    sw.addEventListener("controllerchange", onChange);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("mishwar:synced", precacheSoon);
    window.addEventListener("online", precacheSoon);
    sw.register("/sw.js", { updateViaCache: "none" })
      .then(() => sw.ready)
      .then(() => {
        warm();
        precacheSoon();
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearTimeout(timer);
      sw.removeEventListener("controllerchange", onChange);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("mishwar:synced", precacheSoon);
      window.removeEventListener("online", precacheSoon);
    };
  }, [build, role, accountId]);
  return null;
}
