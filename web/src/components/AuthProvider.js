import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
const AuthContext = createContext({
    user: null,
    session: null,
    loading: true,
    signOut: async () => { },
});
export const useAuth = () => useContext(AuthContext);
export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        // Get initial session
        supabase.auth.getSession().then(({ data: { session: s } }) => {
            setSession(s);
            setUser(s?.user ?? null);
            setLoading(false);
        });
        // Listen for auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
            setSession(s);
            setUser(s?.user ?? null);
            setLoading(false);
        });
        return () => subscription.unsubscribe();
    }, []);
    const signOut = async () => {
        await supabase.auth.signOut();
        setUser(null);
        setSession(null);
    };
    return (<AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>);
};
