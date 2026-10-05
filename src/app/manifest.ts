import type { MetadataRoute } from "next";

// background_color and theme_color equal --bg (light) in globals.css.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "مِشوار",
    short_name: "مِشوار",
    description: "لاقي مشوارك بغزة، أو لاقي ركّاب لسيارتك.",
    start_url: "/?source=pwa",
    scope: "/",
    display: "standalone",
    dir: "rtl",
    lang: "ar",
    background_color: "#F2F2F7",
    theme_color: "#F2F2F7",
    icons: [
      { src: "/icons/any-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/any-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
