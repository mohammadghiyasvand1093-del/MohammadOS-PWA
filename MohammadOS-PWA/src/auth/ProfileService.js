import { isSupabaseConfigured, supabase } from "./supabaseClient";

export const ProfileService = {
  async getCurrentProfile(userId) {
    if (!isSupabaseConfigured || !userId) return { profile: null, error: null };

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role, is_active, profile_setup_completed, last_login_at, last_seen_at, reauth_required_at")
      .eq("id", userId)
      .maybeSingle();

    return { profile: data || null, error };
  },

  async getProfiles() {
    if (!isSupabaseConfigured) {
      return { profiles: [], error: new Error("Supabase is not configured") };
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, display_name, role, is_active, profile_setup_completed, last_login_at, last_seen_at, reauth_required_at")
      .order("role", { ascending: true });
    return { profiles: data || [], error };
  },

  async touchPresence(userId, { recordLogin = false } = {}) {
    if (!isSupabaseConfigured || !userId) return { error: null };

    const { error } = await supabase.rpc("touch_profile_presence", {
      target_user_id: userId,
      record_login: recordLogin,
    });
    return { error };
  },

  async updateDisplayName(userId, displayName) {
    if (!isSupabaseConfigured || !userId) {
      return { profile: null, error: new Error("Supabase is not configured") };
    }

    const name = String(displayName || "").trim().slice(0, 80);
    if (name.length < 2) return { profile: null, error: new Error("نام کوتاه است") };

    const { data, error } = await supabase.rpc("update_own_profile", {
      new_display_name: name,
    });
    if (error) {
      const setupError = new Error(
        error.code === "PGRST202"
          ? "تابع ذخیره نام در Supabase نصب نشده است."
          : error.message
      );
      setupError.cause = error;
      return { profile: null, error: setupError };
    }
    return { profile: data || null, error: null };
  },

  async setActive(userId, isActive) {
    if (!isSupabaseConfigured) {
      return { profile: null, error: new Error("Supabase is not configured") };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({
        is_active: isActive,
        ...(isActive ? {} : { reauth_required_at: new Date().toISOString() }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .select("id, email, display_name, role, is_active, profile_setup_completed, last_login_at, last_seen_at, reauth_required_at")
      .single();
    return { profile: data || null, error };
  },
};
