import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
  useZoomSettingsStore,
} from "../stores/zoomSettingsStore";

export { DEFAULT_ZOOM, MAX_ZOOM, MIN_ZOOM, ZOOM_STEP };

export function useZoomSettings() {
  const zoom = useZoomSettingsStore((s) => s.zoom);
  const setZoom = useZoomSettingsStore((s) => s.setZoom);
  const zoomIn = useZoomSettingsStore((s) => s.zoomIn);
  const zoomOut = useZoomSettingsStore((s) => s.zoomOut);
  return { zoom, setZoom, zoomIn, zoomOut };
}
