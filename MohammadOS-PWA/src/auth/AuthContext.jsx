import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthService } from "./AuthService";
import { ProfileService } from "./ProfileService";
import { isSupabaseConfigured } from "./supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  async function loadProfile(nextSession) {
    if (!nextSession?.user?.id) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    setProfileLoading(true);
    const { profile: nextProfile, error } = await ProfileService.getCurrentProfile(nextSession.user.id);
    setProfile(nextProfile);
    setProfileError(error?.message || (!nextProfile ? "پروفایل این حساب در Supabase ثبت نشده است." : null));
    setProfileLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    let subscription;

    AuthService.getSession().then(async ({ data }) => {
      if (mounted) {
        const nextSession = data?.session || null;
        setSession(nextSession);
        await loadProfile(nextSession);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const authState = AuthService.onAuthStateChange((_event, nextSession) => {
      if (mounted) {
        setSession(nextSession);
        void loadProfile(nextSession);
      }
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
    profile,
    role: profile?.role || null,
    loading,
    profileLoading,
    profileError,
    isConfigured: isSupabaseConfigured,
    signIn: AuthService.signIn,
    signOut: AuthService.signOut,
  }), [session, profile, loading, profileLoading, profileError]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// The provider and hook intentionally share this small module.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
