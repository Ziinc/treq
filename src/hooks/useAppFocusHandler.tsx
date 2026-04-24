import { getRepoStatus } from "../lib/api";
import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useRef,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

type FocusPhase = "afterInvalidate";

type FocusCallback = () => void | Promise<void>;

interface FocusRefreshContextValue {
	subscribe: (phase: FocusPhase, callback: FocusCallback) => () => void;
}

const FocusRefreshContext = createContext<FocusRefreshContextValue | null>(
	null,
);

interface FocusRefreshProviderProps {
	repoPath: string;
	onBranchUpdate: (branch: string) => void;
	children: ReactNode;
}

export function FocusRefreshProvider({
	repoPath,
	onBranchUpdate,
	children,
}: FocusRefreshProviderProps) {
	const subscribersRef = useRef<Map<FocusPhase, Set<FocusCallback>>>(
		new Map([["afterInvalidate", new Set()]]),
	);

	const subscribe = useCallback(
		(phase: FocusPhase, callback: FocusCallback) => {
			const phaseSet = subscribersRef.current.get(phase)!;
			phaseSet.add(callback);
			return () => {
				phaseSet.delete(callback);
			};
		},
		[],
	);

	useEffect(() => {
		if (!repoPath) return;

		let lastFocusTime = 0;
		const FOCUS_DEBOUNCE_MS = 5000;

		const notifySubscribers = async (phase: FocusPhase) => {
			const callbacks = Array.from(subscribersRef.current.get(phase) || []);
			await Promise.allSettled(callbacks.map((cb) => cb()));
		};

		const handleFocus = async () => {
			const now = Date.now();
			if (now - lastFocusTime < FOCUS_DEBOUNCE_MS) return;
			lastFocusTime = now;

			try {
				const status = await getRepoStatus(repoPath);
				onBranchUpdate(status.current_branch);
			} catch (error) {
				console.debug("Repo status fetch failed:", error);
			}

			await notifySubscribers("afterInvalidate");
		};

		const unlistenFocus = getCurrentWindow().onFocusChanged(
			({ payload: focused }) => {
				if (focused) {
					handleFocus();
				}
			},
		);

		return () => {
			unlistenFocus.then((fn) => fn());
		};
	}, [repoPath, onBranchUpdate]);

	return (
		<FocusRefreshContext.Provider value={{ subscribe }}>
			{children}
		</FocusRefreshContext.Provider>
	);
}

/**
 * Subscribe to a focus refresh phase. The callback will be called
 * after the app regains focus and the specified phase completes.
 */
export function useFocusRefreshSubscription(
	phase: FocusPhase,
	callback: FocusCallback,
	deps: React.DependencyList = [],
) {
	const context = useContext(FocusRefreshContext);
	// Store latest callback in ref to avoid re-subscribing on every render
	const callbackRef = useRef(callback);
	callbackRef.current = callback;

	useEffect(() => {
		if (!context) return;
		const stableCallback = () => callbackRef.current();
		return context.subscribe(phase, stableCallback);
	}, [context, phase, ...deps]);
}
