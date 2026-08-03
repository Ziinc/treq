import {
	ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { getSetting, setSetting } from "../lib/api";
import { getCurrentWebview } from "@tauri-apps/api/webview";

export const DEFAULT_ZOOM = 100;
export const ZOOM_STEP = 5;
export const MIN_ZOOM = 50;
export const MAX_ZOOM = 200;

function clampZoom(value: number): number {
	return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value));
}

function applyZoomToDocument(zoom: number) {
	// WebView zoom changes the CSS viewport as well as the rendered scale. Unlike
	// CSS `zoom`, this lets responsive layouts reflow instead of scaling a
	// viewport-sized tree beyond the visible window and cropping it.
	try {
		void getCurrentWebview()
			.setZoom(zoom / 100)
			.catch((error) => console.error("Failed to apply UI zoom", error));
	} catch {
		// Unit and integration tests run without Tauri's window metadata.
	}
}

interface ZoomSettingsContextType {
	zoom: number;
	setZoom: (value: number) => Promise<void>;
	zoomIn: () => Promise<void>;
	zoomOut: () => Promise<void>;
}

const defaultContextValue: ZoomSettingsContextType = {
	zoom: DEFAULT_ZOOM,
	setZoom: async () => {
		console.warn("ZoomSettingsProvider not found, using fallback");
	},
	zoomIn: async () => {},
	zoomOut: async () => {},
};

const ZoomSettingsContext =
	createContext<ZoomSettingsContextType>(defaultContextValue);

ZoomSettingsContext.displayName = "ZoomSettingsContext";

export function ZoomSettingsProvider({ children }: { children: ReactNode }) {
	const [zoom, setZoomState] = useState<number>(DEFAULT_ZOOM);

	useEffect(() => {
		applyZoomToDocument(zoom);
	}, [zoom]);

	useEffect(() => {
		getSetting("ui_zoom").then((savedZoom) => {
			if (savedZoom) {
				const parsed = parseInt(savedZoom, 10);
				if (!isNaN(parsed) && parsed >= MIN_ZOOM && parsed <= MAX_ZOOM) {
					setZoomState(parsed);
				}
			}
		});
	}, []);

	const setZoom = useCallback(async (value: number) => {
		const clamped = clampZoom(value);
		setZoomState(clamped);
		await setSetting("ui_zoom", clamped.toString());
	}, []);

	const zoomIn = useCallback(async () => {
		setZoomState((current) => {
			const next = clampZoom(current + ZOOM_STEP);
			void setSetting("ui_zoom", next.toString());
			return next;
		});
	}, []);

	const zoomOut = useCallback(async () => {
		setZoomState((current) => {
			const next = clampZoom(current - ZOOM_STEP);
			void setSetting("ui_zoom", next.toString());
			return next;
		});
	}, []);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (!(event.ctrlKey || event.metaKey) || event.altKey) return;

			const isZoomIn =
				event.key === "=" || event.key === "+" || event.code === "Equal";
			const isZoomOut =
				event.key === "-" || event.key === "_" || event.code === "Minus";

			if (!isZoomIn && !isZoomOut) return;

			event.preventDefault();
			if (isZoomIn) {
				void zoomIn();
			} else {
				void zoomOut();
			}
		};

		window.addEventListener("keydown", handleKeyDown, true);
		return () => window.removeEventListener("keydown", handleKeyDown, true);
	}, [zoomIn, zoomOut]);

	const value = useMemo(
		() => ({ zoom, setZoom, zoomIn, zoomOut }),
		[zoom, setZoom, zoomIn, zoomOut],
	);

	return (
		<ZoomSettingsContext.Provider value={value}>
			{children}
		</ZoomSettingsContext.Provider>
	);
}

export function useZoomSettings(): ZoomSettingsContextType {
	return useContext(ZoomSettingsContext);
}
