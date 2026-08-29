import { useState } from "react";
import { useAuth } from "./AuthContext";

const AUTH_NOTICE_STORAGE_KEY = "mohammados_auth_notice";

export default function LoginPage() {
  const { signIn, isConfigured } = useAuth();
  const [notice] = useState(() => {
    const value = localStorage.getItem(AUTH_NOTICE_STORAGE_KEY) || "";
    localStorage.removeItem(AUTH_NOTICE_STORAGE_KEY);
    return value;
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signIn(email, password);
    } catch (err) {
      setError(err.message || "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 bg-os-bg text-os-text" dir="rtl">
      <section className="w-full max-w-md bg-os-card border border-os-border rounded-2xl p-6 md:p-8 shadow-2xl" aria-labelledby="login-title">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3" aria-hidden="true">🔐</div>
          <h1 id="login-title" className="text-2xl font-black">ورود به MohammadOS</h1>
          <p className="text-xs text-os-text/50 mt-2">حساب مالک یا مهمان خود را وارد کنید</p>
        </div>

        {!isConfigured && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-300" role="alert">
            اتصال Supabase هنوز در تنظیمات برنامه ثبت نشده است.
          </div>
        )}
        {error && (
          <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-6 text-amber-300" role="status">
            {notice}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="block text-xs font-bold text-os-text/70 mb-2">ایمیل</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              inputMode="email"
              dir="ltr"
              className="w-full rounded-lg border border-os-border bg-os-bg px-4 py-3 text-sm outline-none focus:border-os-accent"
              placeholder="you@example.com"
              required
            />
          </label>
          <label className="block">
            <span className="block text-xs font-bold text-os-text/70 mb-2">رمز عبور</span>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                dir="ltr"
                className="w-full rounded-lg border border-os-border bg-os-bg px-4 py-3 pl-20 text-sm outline-none focus:border-os-accent"
                placeholder="رمز عبور"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-[10px] text-os-text/60 hover:text-os-accent"
              >
                {showPassword ? "پنهان" : "نمایش"}
              </button>
            </div>
          </label>
          <button
            type="submit"
            disabled={busy || !isConfigured}
            className="w-full rounded-lg bg-os-accent px-4 py-3 text-sm font-black text-os-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "در حال ورود..." : "ورود"}
          </button>
        </form>
        <p className="mt-6 text-center text-[10px] leading-6 text-os-text/40">
          ثبت‌نام عمومی بسته است؛ حساب‌ها فقط توسط مالک ساخته می‌شوند.
        </p>
      </section>
    </main>
  );
}
