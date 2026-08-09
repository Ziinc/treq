import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";
import {
	type TreqSendAsset,
	type TreqSendPayload,
	TREQ_SEND_EVENT,
	parseTreqSendPayload,
} from "../lib/treqSend";

interface TreqSendContextValue {
	assets: TreqSendAsset[];
	dismissAsset: (id: string) => void;
	clearSessionAssets: (ptySessionId: string) => void;
	/** Test/helper seam to inject an asset without going through IPC. */
	ingestPayload: (payload: TreqSendPayload | TreqSendAsset) => void;
}

const TreqSendContext = createContext<TreqSendContextValue | null>(null);

export function TreqSendProvider({ children }: { children: ReactNode }) {
	const [assets, setAssets] = useState<TreqSendAsset[]>([]);

	const ingestPayload = useCallback((payload: TreqSendPayload | TreqSendAsset) => {
		const asset =
			"id" in payload && "mediaType" in payload
				? (payload as TreqSendAsset)
				: parseTreqSendPayload(payload);
		if (!asset) return;
		setAssets((prev) => {
			if (prev.some((existing) => existing.id === asset.id)) {
				return prev;
			}
			return [...prev, asset];
		});
	}, []);

	const dismissAsset = useCallback((id: string) => {
		setAssets((prev) => prev.filter((asset) => asset.id !== id));
	}, []);

	const clearSessionAssets = useCallback((ptySessionId: string) => {
		setAssets((prev) =>
			prev.filter((asset) => asset.ptySessionId !== ptySessionId),
		);
	}, []);

	useEffect(() => {
		let unlisten: (() => void) | undefined;
		listen<TreqSendPayload>(TREQ_SEND_EVENT, (event) => {
			ingestPayload(event.payload);
		})
			.then((fn) => {
				unlisten = fn;
			})
			.catch((error) => {
				console.error("Failed to listen for treq send events:", error);
			});
		return () => {
			unlisten?.();
		};
	}, [ingestPayload]);

	const value = useMemo(
		() => ({
			assets,
			dismissAsset,
			clearSessionAssets,
			ingestPayload,
		}),
		[assets, dismissAsset, clearSessionAssets, ingestPayload],
	);

	return (
		<TreqSendContext.Provider value={value}>{children}</TreqSendContext.Provider>
	);
}

export function useTreqSend(): TreqSendContextValue {
	const ctx = useContext(TreqSendContext);
	if (!ctx) {
		throw new Error("useTreqSend must be used within TreqSendProvider");
	}
	return ctx;
}

/** Optional variant for panels that may render outside the provider in tests. */
export function useTreqSendOptional(): TreqSendContextValue | null {
	return useContext(TreqSendContext);
}
