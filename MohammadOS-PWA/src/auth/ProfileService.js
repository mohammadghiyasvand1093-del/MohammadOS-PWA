import { isSupabaseConfigured, supabase } from "./supabaseClient";

export const ProfileService = {
  async getCurrentProfile(userId) {
    if (!isSupabaseConfigured || !userId) return { profile: null, error: null };

    const { data, error } = await supabase
      .from("profiles")
      .select("id, display_name, role, is_active")
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
      .select("id, display_name, role, is_active")
      .order("role", { ascending: true });
    return { profiles: data || [], error };
  },

  async setActive(userId, isActive) {
    if (!isSupabaseConfigured) {
      return { profile: null, error: new Error("Supabase is not configured") };
    }

    const { data, error } = await supabase
      .from("profiles")
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq("id", userId)
      .select("id, display_name, role, is_active")
      .single();
    return { profile: data || null, error };
  },
};
