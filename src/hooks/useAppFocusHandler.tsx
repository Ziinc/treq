import {
	createContext,
	useContext,
	useEffect,
	useRef,
	useCallback,
	type ReactNode,
} from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
	jjGitFetchBackground,
	jjGetCurrentBranch,
	checkAndRebaseWorkspaces,
} from "../lib/api";

type FocusPhase = "afterRebase" | "afterInvalidate";

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
		new Map([
			["afterRebase", new Set()],
			["afterInvalidate", new Set()],
		]),
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
		let lastRebaseTime = 0;
		const FOCUS_DEBOUNCE_MS = 5000;
		const REBASE_DEBOUNCE_MS = 10000;

		const notifySubscribers = async (phase: FocusPhase) => {
			const callbacks = Array.from(subscribersRef.current.get(phase) || []);
			await Promise.allSettled(callbacks.map((cb) => cb()));
		};

		const handleFocus = async () => {
			const now = Date.now();
			if (now - lastFocusTime < FOCUS_DEBOUNCE_MS) return;
			lastFocusTime = now;

			try {
				// Step 1: Background git fetch
				await jjGitFetchBackground(repoPath);
			} catch (error) {
				console.debug("Background fetch failed:", error);
			}

			// Step 2: Branch update (fire-and-forget)
			jjGetCurrentBranch(repoPath)
				.then((branch) => onBranchUpdate(branch))
				.catch((error) =>
					console.error("Failed to get current branch:", error),
				);

			// Step 3: Rebase — independent, longer debounce
			const shouldRebase = now - lastRebaseTime >= REBASE_DEBOUNCE_MS;
			if (shouldRebase) {
				lastRebaseTime = now;
				try {
					await checkAndRebaseWorkspaces(repoPath);
				} catch (error) {
					console.error("Auto-rebase failed:", error);
				}
				// Step 4: Notify afterRebase subscribers (only when rebase ran)
				await notifySubscribers("afterRebase");
			}

			// Step 5: Notify afterInvalidate subscribers (every debounced focus)
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
