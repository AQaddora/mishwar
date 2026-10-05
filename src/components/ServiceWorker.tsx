"use client";

import { useEffect } from "react";
import { pendingCount } from "@/lib/outbox";

// Registers public/sw.js, in production builds only (in development it would serve
// stale code). See the comments at the top of sw.js for what it caches.
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const hadController = sw.controller !== null;

    // Tell the worker what this page loaded, so it can keep copies for offline.
    const warm = () => {
      const urls = [location.href, ...performance.getEntriesByType("resource").map((e) => e.name)].filter((u) =>
        u.startsWith(location.origin),
      );
      sw.controller?.postMessage({ type: "warm", urls });
    };
    // A new version took over: reload once to run it, unless a write is still waiting
    // on this phone. The first install is not an update, so it never reloads.
    const onChange = async () => {
      if (!hadController) return warm();
      if ((await pendingCount().catch(() => 1)) === 0) location.reload();
    };
    sw.addEventListener("controllerchange", onChange);
    sw.register("/sw.js").then(() => sw.ready).then(warm).catch(() => {});
    return () => sw.removeEventListener("controllerchange", onChange);
  }, []);
  return null;
}
