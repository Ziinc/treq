import type { Session, User } from "@supabase/supabase-js";
import { getSetting, setSetting } from "../lib/api";
import {
	SUPABASE_ANON_KEY,
	SUPABASE_URL,
	WEB_URL,
	supabase,
} from "../lib/supabase";
import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

export interface Subscription {
	status: "active" | "canceled" | "past_due" | "inactive";
	plan: "free" | "pro";
	current_period_end: string | null;
}

interface AuthContextType {
	user: User | null;
	session: Session | null;
	loading: boolean;
	subscription: Subscription | null;
	signIn: () => Promise<void>;
	signOut: () => Promise<void>;
	refreshSubscription: () => Promise<void>;
	exchangeToken: (token: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
	user: null,
	session: null,
	loading: true,
	subscription: null,
	signIn: async () => {},
	signOut: async () => {},
	refreshSubscription: async () => {},
	exchangeToken: async () => {},
});

AuthContext.displayName = "AuthContext";

export const useAuth = (): AuthContextType => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
	children,
}) => {
	const [user, setUser] = useState<User | null>(null);
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);
	const [subscription, setSubscription] = useState<Subscription | null>(null);

	const persistSession = useCallback(async (sess: Session | null) => {
		if (sess) {
			await setSetting(
				"supabase_session",
				JSON.stringify({
					accessToken: sess.access_token,
					refreshToken: sess.refresh_token,
				}),
			);
		} else {
			await setSetting("supabase_session", "");
		}
	}, []);

	const fetchSubscription = useCallback(async () => {
		if (!session) {
			setSubscription(null);
			return;
		}
		try {
			const { data, error } = await supabase
				.from("subscriptions")
				.select("*")
				.single();

			if (!error && data) {
				setSubscription(data as Subscription);
			}
		} catch {
			// Subscription fetch failed silently
		}
	}, [session]);

	// Restore session on mount
	useEffect(() => {
		const restoreSession = async () => {
			try {
				const stored = await getSetting("supabase_session");
				if (stored) {
					const tokens = JSON.parse(stored) as Record<string, string>;
					const { accessToken } = tokens;
					const { refreshToken } = tokens;
					const { data, error } = await supabase.auth.setSession({
						access_token: accessToken,
						refresh_token: refreshToken,
					});
					if (!error && data.session) {
						setSession(data.session);
						setUser(data.session.user);
					}
				}
			} catch {
				// Failed to restore session
			} finally {
				setLoading(false);
			}
		};
		restoreSession();
	}, []);

	// Exchange a one-time token for a Supabase session
	const exchangeToken = useCallback(
		async (token: string) => {
			const response = await fetch(
				`${SUPABASE_URL}/functions/v1/exchange-desktop-token`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
						apikey: SUPABASE_ANON_KEY,
					},
					body: JSON.stringify({ token }),
				},
			);

			if (!response.ok) {
				const err = await response.json().catch(() => ({}));
				throw new Error(err.error || "Token exchange failed");
			}

			const data = await response.json();
			const { data: sessionData, error } = await supabase.auth.setSession({
				access_token: data.access_token as string,
				refresh_token: data.refresh_token as string,
			});

			if (error) throw error;
			if (sessionData.session) {
				setSession(sessionData.session);
				setUser(sessionData.session.user);
				await persistSession(sessionData.session);
			}
		},
		[persistSession],
	);

	// Listen for deep-link events (desktop auth callback)
	useEffect(() => {
		const unlisten = listen<string[]>("deep-link-received", async (event) => {
			try {
				const urls = event.payload;
				const url = urls.find((u: string) => u.includes("auth/callback"));
				if (!url) return;

				const urlObj = new URL(url);
				const token = urlObj.searchParams.get("token");
				if (!token) return;

				await exchangeToken(token);
			} catch {
				// Deep link handling failed
			}
		});

		return () => {
			unlisten.then((fn) => fn());
		};
	}, [exchangeToken]);

	// Fetch subscription when session changes
	useEffect(() => {
		if (session) {
			fetchSubscription();
		} else {
			setSubscription(null);
		}
	}, [session, fetchSubscription]);

	const signIn = useCallback(async () => {
		await openUrl(`${WEB_URL}/login?source=desktop`);
	}, []);

	const signOut = useCallback(async () => {
		await supabase.auth.signOut();
		setUser(null);
		setSession(null);
		setSubscription(null);
		await persistSession(null);
	}, [persistSession]);

	const refreshSubscription = useCallback(async () => {
		await fetchSubscription();
	}, [fetchSubscription]);

	const value = useMemo(
		() => ({
			user,
			session,
			loading,
			subscription,
			signIn,
			signOut,
			refreshSubscription,
			exchangeToken,
		}),
		[
			user,
			session,
			loading,
			subscription,
			signIn,
			signOut,
			refreshSubscription,
			exchangeToken,
		],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
