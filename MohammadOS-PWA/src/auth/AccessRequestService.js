import { isSupabaseConfigured, supabase } from "./supabaseClient";

export const AccessRequestService = {
  async create({ displayName, email, note }) {
    if (!isSupabaseConfigured) {
      return { request: null, error: new Error("اتصال Supabase در دسترس نیست.") };
    }

    const normalizedEmail = String(email || "").trim().toLowerCase();
    const normalizedName = String(displayName || "").trim().slice(0, 80);
    const normalizedNote = String(note || "").trim().slice(0, 500);

    if (normalizedName.length < 2) return { request: null, error: new Error("نام نمایشی کوتاه است.") };
    if (!normalizedEmail || !normalizedEmail.includes("@")) return { request: null, error: new Error("ایمیل معتبر وارد کنید.") };

    const { data, error } = await supabase
      .from("access_requests")
      .insert({
        display_name: normalizedName,
        email: normalizedEmail,
        note: normalizedNote || null,
      });

    if (error) {
      const message = error.code === "23505"
        ? "برای این ایمیل یک درخواست در حال بررسی وجود دارد."
        : error.message;
      return { request: null, error: new Error(message) };
    }
    return { request: data, error: null };
  },

  async getPending() {
    if (!isSupabaseConfigured) return { requests: [], error: new Error("Supabase در دسترس نیست.") };
    const { data, error } = await supabase
      .from("access_requests")
      .select("id, display_name, email, note, status, created_at, reviewed_at, reviewed_by")
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    return { requests: data || [], error };
  },

  async review(id, status) {
    if (!isSupabaseConfigured) return { request: null, error: new Error("Supabase در دسترس نیست.") };
    if (!["approved", "rejected"].includes(status)) {
      return { request: null, error: new Error("وضعیت درخواست معتبر نیست.") };
    }
    const { data, error } = await supabase.rpc("review_access_request", {
      target_request_id: id,
      next_status: status,
    });
    return { request: data || null, error };
  },
};
