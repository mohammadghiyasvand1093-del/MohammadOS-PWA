import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthService } from "./AuthService";
import { isSupabaseConfigured } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    let mounted = true;
    let subscription;

    AuthService.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data?.session || null);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const authState = AuthService.onAuthStateChange((_event, nextSession) => {
      if (mounted) setSession(nextSession);
    });
    subscription = authState?.data?.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    loading,
    isConfigured: isSupabaseConfigured,
    signIn: AuthService.signIn,
    signOut: AuthService.signOut,
  }), [session, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
