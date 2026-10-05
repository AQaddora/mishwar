import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    // The service worker and the manifest must never be served from a stale HTTP cache,
    // or phones keep an old version of the app.
    const noCache = [{ key: "Cache-Control", value: "no-cache" }];
    return [
      { source: "/sw.js", headers: [...noCache, { key: "Service-Worker-Allowed", value: "/" }] },
      { source: "/manifest.webmanifest", headers: noCache },
    ];
  },
};

export default nextConfig;
