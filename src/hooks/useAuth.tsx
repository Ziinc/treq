import type { Session, User } from "@supabase/supabase-js";
import { getSetting, setSetting } from "../lib/api";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  WEB_URL,
  supabase,
} from "../lib/supabase";
import {
  authRetryDelayMs,
  checkSupabaseAuthHealth,
  classifySessionRestoreError,
  type AuthAvailability,
} from "../lib/supabaseHealth";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

export type { AuthAvailability };

export interface Subscription {
  status: "active" | "canceled" | "past_due" | "inactive";
  plan: "free" | "pro";
  current_period_end: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  availability: AuthAvailability;
  /** True when a session is saved locally, even if cloud restore has not succeeded. */
  hasStoredSession: boolean;
  subscription: Subscription | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  refreshSubscription: () => Promise<void>;
  exchangeToken: (token: string) => Promise<void>;
  retryConnection: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  availability: "checking",
  hasStoredSession: false,
  subscription: null,
  signIn: async () => {},
  signOut: async () => {},
  refreshSubscription: async () => {},
  exchangeToken: async () => {},
  retryConnection: async () => {},
});

AuthContext.displayName = "AuthContext";

export const useAuth = (): AuthContextType => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [availability, setAvailability] =
    useState<AuthAvailability>("checking");
  const [hasStoredSession, setHasStoredSession] = useState(false);
  const [subscription, setSubscription] = useState<Subscription | null>(null);

  const retryAttemptRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreInFlightRef = useRef<Promise<void> | null>(null);
  const mountedRef = useRef(true);
  const connectRef = useRef<(options?: { manual?: boolean }) => Promise<void>>(
    async () => {},
  );

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const scheduleBackoff = useCallback(() => {
    clearRetryTimer();
    const delay = authRetryDelayMs(retryAttemptRef.current);
    retryAttemptRef.current += 1;
    retryTimerRef.current = setTimeout(() => {
      void connectRef.current({ manual: false });
    }, delay);
  }, [clearRetryTimer]);

  const persistSession = useCallback(async (sess: Session | null) => {
    if (sess) {
      await setSetting(
        "supabase_session",
        JSON.stringify({
          accessToken: sess.access_token,
          refreshToken: sess.refresh_token,
        }),
      );
      setHasStoredSession(true);
    } else {
      await setSetting("supabase_session", "");
      setHasStoredSession(false);
    }
  }, []);

  const clearStoredSession = useCallback(async () => {
    await setSetting("supabase_session", "");
    setHasStoredSession(false);
  }, []);

  const fetchSubscription = useCallback(
    async (activeSession: Session | null) => {
      if (!activeSession) {
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
    },
    [],
  );

  const applySession = useCallback((next: Session | null) => {
    setSession(next);
    setUser(next?.user ?? null);
  }, []);

  const restoreFromStoredTokens = useCallback(async (): Promise<
    "ok" | "unavailable" | "signed_out"
  > => {
    const stored = await getSetting("supabase_session");
    if (!stored) {
      setHasStoredSession(false);
      applySession(null);
      return "signed_out";
    }

    setHasStoredSession(true);

    let tokens: Record<string, string>;
    try {
      tokens = JSON.parse(stored) as Record<string, string>;
    } catch (error) {
      console.warn("Clearing malformed supabase_session setting", error);
      await clearStoredSession();
      applySession(null);
      return "signed_out";
    }

    const accessToken = tokens.accessToken ?? tokens.access_token;
    const refreshToken = tokens.refreshToken ?? tokens.refresh_token;
    if (!accessToken || !refreshToken) {
      console.warn(
        "Clearing malformed supabase_session setting: missing tokens",
      );
      await clearStoredSession();
      applySession(null);
      return "signed_out";
    }

    try {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) throw error;
      if (data.session) {
        applySession(data.session);
        await persistSession(data.session);
        return "ok";
      }
      return "signed_out";
    } catch (error) {
      const kind = classifySessionRestoreError(error);
      if (kind === "network") {
        // Keep credentials; cloud is temporarily unreachable.
        return "unavailable";
      }
      if (kind === "invalid_token") {
        await clearStoredSession();
        applySession(null);
        return "signed_out";
      }
      if (kind === "malformed_json") {
        console.warn("Clearing malformed supabase_session setting", error);
        await clearStoredSession();
        applySession(null);
        return "signed_out";
      }
      console.warn("Session restore failed", error);
      return "unavailable";
    }
  }, [applySession, clearStoredSession, persistSession]);

  const connect = useCallback(
    async (options?: { manual?: boolean }) => {
      const manual = options?.manual ?? false;
      if (restoreInFlightRef.current) {
        await restoreInFlightRef.current;
        return;
      }

      const run = (async () => {
        if (manual) {
          retryAttemptRef.current = 0;
          clearRetryTimer();
        }

        // Always learn whether credentials exist locally, even when offline.
        const stored = await getSetting("supabase_session");
        if (!mountedRef.current) return;
        setHasStoredSession(Boolean(stored));

        // Fail fast: never call setSession while the auth API is down.
        const healthy = await checkSupabaseAuthHealth(SUPABASE_URL);
        if (!mountedRef.current) return;

        if (!healthy) {
          setAvailability("unavailable");
          setLoading(false);
          scheduleBackoff();
          return;
        }

        const result = await restoreFromStoredTokens();
        if (!mountedRef.current) return;

        if (result === "unavailable") {
          setAvailability("unavailable");
          setLoading(false);
          scheduleBackoff();
          return;
        }

        setAvailability("available");
        retryAttemptRef.current = 0;
        clearRetryTimer();
        setLoading(false);
      })();

      restoreInFlightRef.current = run;
      try {
        await run;
      } finally {
        if (restoreInFlightRef.current === run) {
          restoreInFlightRef.current = null;
        }
      }
    },
    [clearRetryTimer, restoreFromStoredTokens, scheduleBackoff],
  );

  connectRef.current = connect;

  // Probe health and restore the saved session on mount.
  useEffect(() => {
    mountedRef.current = true;
    void connectRef.current({ manual: false });
    return () => {
      mountedRef.current = false;
      clearRetryTimer();
    };
  }, [clearRetryTimer]);

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
        applySession(sessionData.session);
        setAvailability("available");
        await persistSession(sessionData.session);
      }
    },
    [applySession, persistSession],
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
      void fetchSubscription(session);
    } else {
      setSubscription(null);
    }
  }, [session, fetchSubscription]);

  const signIn = useCallback(async () => {
    await openUrl(`${WEB_URL}/sign-in?source=desktop`);
  }, []);

  const signOut = useCallback(async () => {
    clearRetryTimer();
    retryAttemptRef.current = 0;
    try {
      await supabase.auth.signOut();
    } catch {
      // Sign-out may fail while offline; still clear local credentials.
    }
    applySession(null);
    setSubscription(null);
    setAvailability("available");
    await persistSession(null);
  }, [applySession, clearRetryTimer, persistSession]);

  const refreshSubscription = useCallback(async () => {
    await fetchSubscription(session);
  }, [fetchSubscription, session]);

  const retryConnection = useCallback(async () => {
    setAvailability("checking");
    await connect({ manual: true });
  }, [connect]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      availability,
      hasStoredSession,
      subscription,
      signIn,
      signOut,
      refreshSubscription,
      exchangeToken,
      retryConnection,
    }),
    [
      user,
      session,
      loading,
      availability,
      hasStoredSession,
      subscription,
      signIn,
      signOut,
      refreshSubscription,
      exchangeToken,
      retryConnection,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
