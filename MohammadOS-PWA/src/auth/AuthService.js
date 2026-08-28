import { isSupabaseConfigured, supabase } from "./supabaseClient";

function mapAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return "ایمیل یا رمز عبور صحیح نیست.";
  if (message.includes("email not confirmed")) return "ایمیل حساب هنوز تأیید نشده است.";
  if (!navigator.onLine) return "اتصال اینترنت برای ورود برقرار نیست.";
  return "ورود انجام نشد. دوباره تلاش کنید.";
}

export const AuthService = {
  async getSession() {
    if (!isSupabaseConfigured) return { data: { session: null }, error: null };
    return supabase.auth.getSession();
  },

  onAuthStateChange(callback) {
    if (!isSupabaseConfigured) return { data: { subscription: { unsubscribe() {} } } };
    return supabase.auth.onAuthStateChange(callback);
  },

  async signIn(email, password) {
    if (!isSupabaseConfigured) throw new Error("اتصال حساب هنوز در تنظیمات انتشار ثبت نشده است.");
    if (!email.trim() || !password) throw new Error("ایمیل و رمز عبور را وارد کنید.");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      const mappedError = new Error(mapAuthError(error));
      mappedError.cause = error;
      throw mappedError;
    }
    return data;
  },

  async signOut() {
    if (!isSupabaseConfigured) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
};
