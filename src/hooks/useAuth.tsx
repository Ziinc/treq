import type { ReactNode } from "react";
import { useAuthStore, type Subscription } from "../stores/authStore";

export type { Subscription };

export const useAuth = () => {
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);
  const loading = useAuthStore((s) => s.loading);
  const subscription = useAuthStore((s) => s.subscription);
  const signIn = useAuthStore((s) => s.signIn);
  const signOut = useAuthStore((s) => s.signOut);
  const refreshSubscription = useAuthStore((s) => s.refreshSubscription);
  const exchangeToken = useAuthStore((s) => s.exchangeToken);
  return {
    user,
    session,
    loading,
    subscription,
    signIn,
    signOut,
    refreshSubscription,
    exchangeToken,
  };
};

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) =>
  children;
