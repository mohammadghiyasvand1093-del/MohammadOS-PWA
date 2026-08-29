import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AuthService } from "./AuthService";
import { ProfileService } from "./ProfileService";
import { isSupabaseConfigured } from "./supabaseClient";
import { ACTIVE_ACCOUNT_STORAGE_KEY, migrateLegacyDataToUser } from "../db/database";

const AuthContext = createContext(null);
const AUTH_NOTICE_STORAGE_KEY = "mohammados_auth_notice";

function getActiveAccountId() {
  return localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY);
}

function switchActiveAccount(nextSession) {
  const nextId = nextSession?.user?.id || null;
  const currentId = getActiveAccountId();
  if (currentId === nextId) return false;
  if (nextId) localStorage.setItem(ACTIVE_ACCOUNT_STORAGE_KEY, nextId);
  else localStorage.removeItem(ACTIVE_ACCOUNT_STORAGE_KEY);
  return true;
}

async function invalidateSession(message) {
  if (message) localStorage.setItem(AUTH_NOTICE_STORAGE_KEY, message);
  await AuthService.signOut().catch(() => {});
  switchActiveAccount(null);
  window.location.reload();
}

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
    const sessionLoginAt = nextSession.user.last_sign_in_at
      ? new Date(nextSession.user.last_sign_in_at).getTime()
      : 0;
    const reauthAt = nextProfile?.reauth_required_at
      ? new Date(nextProfile.reauth_required_at).getTime()
      : 0;

    if (nextProfile?.is_active && reauthAt > sessionLoginAt) {
      await invalidateSession("وضعیت حساب تغییر کرده است؛ برای ورود دوباره ایمیل و رمز عبور را وارد کنید.");
      return;
    }

    setProfile(nextProfile);
    setProfileError(
      error?.message
      || (!nextProfile
        ? "پروفایل این حساب در Supabase ثبت نشده است."
        : !nextProfile.is_active
          ? "این حساب توسط مالک غیرفعال شده است."
          : null)
    );
    if (!nextProfile?.is_active) {
      await invalidateSession("این حساب غیرفعال شده است. پس از فعال‌سازی، دوباره وارد شوید.");
      return;
    }
    if (nextProfile?.is_active) {
      await migrateLegacyDataToUser(nextSession.user.id, nextProfile.role);
      void ProfileService.touchPresence(nextSession.user.id);
    }
    setProfileLoading(false);
  }

  useEffect(() => {
    let mounted = true;
    let subscription;

    AuthService.getSession().then(async ({ data }) => {
      if (mounted) {
        const nextSession = data?.session || null;
        if (switchActiveAccount(nextSession)) {
          window.location.reload();
          return;
        }
        setSession(nextSession);
        await loadProfile(nextSession);
        setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    const authState = AuthService.onAuthStateChange((event, nextSession) => {
      if (mounted) {
        if (switchActiveAccount(nextSession)) {
          window.location.reload();
          return;
        }
        setSession(nextSession);
        void loadProfile(nextSession);
        if (event === "SIGNED_IN" && nextSession?.user?.id) {
          void ProfileService.touchPresence(nextSession.user.id, { recordLogin: true });
        }
      }
    });
    subscription = authState?.data?.subscription;

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user?.id || profile?.is_active !== true) return undefined;

    const touch = () => {
      if (document.visibilityState === "visible") {
        void ProfileService.touchPresence(session.user.id);
      }
    };
    const timer = window.setInterval(touch, 60_000);
    document.addEventListener("visibilitychange", touch);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", touch);
    };
  }, [session?.user?.id, profile?.is_active]);

  useEffect(() => {
    if (!session?.user?.id) return undefined;
    const sessionLoginAt = session.user.last_sign_in_at;

    const verifyProfile = async () => {
      const { profile: latestProfile, error } = await ProfileService.getCurrentProfile(session.user.id);
      if (error || !latestProfile) return;
      if (!latestProfile.is_active) {
        await invalidateSession("این حساب توسط مالک غیرفعال شد. پس از فعال‌سازی، دوباره وارد شوید.");
        return;
      }
      const sessionLoginTimestamp = sessionLoginAt
        ? new Date(sessionLoginAt).getTime()
        : 0;
      const reauthAt = latestProfile.reauth_required_at
        ? new Date(latestProfile.reauth_required_at).getTime()
        : 0;
      if (reauthAt > sessionLoginTimestamp) {
        await invalidateSession("وضعیت حساب تغییر کرده است؛ برای ورود دوباره ایمیل و رمز عبور را وارد کنید.");
        return;
      }
      setProfile(latestProfile);
    };

    const timer = window.setInterval(verifyProfile, 30_000);
    return () => window.clearInterval(timer);
  }, [session?.user?.id, session?.user?.last_sign_in_at]);

  const value = useMemo(() => ({
    session,
    user: session?.user || null,
    profile,
    role: profile?.is_active ? profile.role : null,
    loading,
    profileLoading,
    profileError,
    isConfigured: isSupabaseConfigured,
    signIn: AuthService.signIn,
    signOut: async () => {
      await AuthService.signOut();
      switchActiveAccount(null);
      window.location.reload();
    },
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
