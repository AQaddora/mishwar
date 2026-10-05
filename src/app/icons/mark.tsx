import { ImageResponse } from "next/og";

// ImageResponse can't read CSS variables, so these repeat the light --accent and white.
const ACCENT = "#0A7D5A";
const WHITE = "#FFFFFF";

// The app mark: a white route between two stops on a full-bleed accent square. Shapes only,
// no text (the built-in font has no Arabic glyphs). The route fills about 76% of its box,
// so `shapeScale` 0.5 keeps it inside the central 40% (the maskable safe zone).
export function iconResponse(size: number, shapeScale: number) {
  const box = Math.round(size * shapeScale);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: ACCENT,
        }}
      >
        <svg
          width={box}
          height={box}
          viewBox="0 0 24 24"
          fill="none"
          stroke={WHITE}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16" />
          <circle cx="6" cy="19" r="2.2" fill={WHITE} />
          <circle cx="18" cy="5" r="2.2" fill={WHITE} />
        </svg>
      </div>
    ),
    { width: size, height: size },
  );
}
