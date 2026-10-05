import { iconResponse } from "./icons/mark";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return iconResponse(size.width, 0.8);
}
