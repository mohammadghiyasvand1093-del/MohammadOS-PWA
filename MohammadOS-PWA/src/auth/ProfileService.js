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
};
