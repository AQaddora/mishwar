import type { Map as LeafletMap } from "leaflet";

// Leaflet (1.9.4) finishes an animated zoom from a 250ms timer that map.remove() does not
// cancel. When the screen closes inside that time (a driver saves his route right after
// the map refits to the last stop), the timer moves a map whose panes are gone and throws
// "Cannot read properties of undefined (reading '_leaflet_pos')". So end the zoom first:
// the timer does nothing when no zoom is running.
export function closeMap(map: LeafletMap) {
  (map as LeafletMap & { _animatingZoom?: boolean })._animatingZoom = false;
  map.remove();
}
