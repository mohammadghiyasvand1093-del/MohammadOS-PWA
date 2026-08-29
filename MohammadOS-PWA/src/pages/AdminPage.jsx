import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ProfileService } from "../auth/ProfileService";

export default function AdminPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError("");
    const { profiles: nextProfiles, error: loadError } = await ProfileService.getProfiles();
    if (loadError) setError("بارگذاری حساب‌ها انجام نشد؛ قوانین Supabase را بررسی کنید.");
    setProfiles(nextProfiles);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  async function handleToggle(item) {
    if (item.role === "owner") return;
    setBusyId(item.id);
    setError("");
    const { profile: updated, error: updateError } = await ProfileService.setActive(item.id, !item.is_active);
    if (updateError) setError("تغییر وضعیت حساب انجام نشد.");
    else setProfiles((current) => current.map((profileItem) => profileItem.id === updated.id ? updated : profileItem));
    setBusyId(null);
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <p className="text-[10px] font-mono tracking-widest text-os-accent">OWNER CONTROL</p>
        <h1 className="mt-2 text-2xl font-black">پنل مدیریت حساب‌ها</h1>
        <p className="mt-2 text-xs leading-6 text-os-text/50">
          فقط مالک می‌تواند وضعیت حساب مهمان را فعال یا غیرفعال کند.
        </p>
      </header>

      {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{error}</div>}

      <section className="rounded-xl border border-os-border bg-os-card p-4" aria-labelledby="profiles-title">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="profiles-title" className="font-bold">حساب‌ها</h2>
          <span className="text-[10px] text-os-text/40">{profile?.display_name || "مالک"}</span>
        </div>
        {loading ? (
          <p className="py-6 text-center text-xs text-os-text/50" role="status">در حال بارگذاری...</p>
        ) : profiles.length === 0 ? (
          <p className="py-6 text-center text-xs text-os-text/50">حسابی برای نمایش وجود ندارد.</p>
        ) : (
          <div className="space-y-3">
            {profiles.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-os-border/70 bg-os-bg/50 p-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm">{item.display_name || (item.role === "owner" ? "مالک" : "مهمان")}</p>
                  <p className="truncate text-[10px] text-os-text/50" dir="ltr">{item.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`rounded px-2 py-1 text-[10px] ${item.is_active ? "bg-emerald-500/10 text-emerald-300" : "bg-red-500/10 text-red-300"}`}>
                    {item.is_active ? "فعال" : "غیرفعال"}
                  </span>
                  {item.role === "guest" && (
                    <button
                      type="button"
                      onClick={() => handleToggle(item)}
                      disabled={busyId === item.id}
                      className="rounded border border-os-border px-2 py-1 text-[10px] text-os-text/70 hover:border-os-accent hover:text-os-accent disabled:opacity-40"
                    >
                      {busyId === item.id ? "..." : item.is_active ? "غیرفعال‌کردن" : "فعال‌کردن"}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
