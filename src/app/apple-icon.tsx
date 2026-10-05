import { iconResponse } from "./icons/mark";

// Opaque, square corners: iOS rounds the corners itself and turns transparency black.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return iconResponse(size.width, 0.7);
}
