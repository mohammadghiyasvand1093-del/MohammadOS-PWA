import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ProfileService } from "../auth/ProfileService";
import { AccessRequestService } from "../auth/AccessRequestService";

export default function AdminPage() {
  const { profile } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [requests, setRequests] = useState([]);
  const [requestBusyId, setRequestBusyId] = useState(null);

  const loadProfiles = useCallback(async () => {
    setLoading(true);
    setError("");
    const { profiles: nextProfiles, error: loadError } = await ProfileService.getProfiles();
    if (loadError) setError("بارگذاری حساب‌ها انجام نشد؛ قوانین Supabase را بررسی کنید.");
    setProfiles(nextProfiles);
    const { requests: nextRequests, error: requestError } = await AccessRequestService.getPending();
    if (requestError && !loadError) setError("درخواست‌ها بارگذاری نشدند؛ جدول access_requests را در Supabase اجرا کنید.");
    setRequests(nextRequests);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadProfiles();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [loadProfiles]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadProfiles();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [loadProfiles]);

  useEffect(() => {
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function formatDate(value) {
    if (!value) return "ثبت نشده";
    return new Intl.DateTimeFormat("fa-IR", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  }

  function isOnline(value) {
    return value && currentTime - new Date(value).getTime() < 2 * 60 * 1000;
  }

  async function handleToggle(item) {
    if (item.role === "owner") return;
    setBusyId(item.id);
    setError("");
    const { profile: updated, error: updateError } = await ProfileService.setActive(item.id, !item.is_active);
    if (updateError) setError("تغییر وضعیت حساب انجام نشد.");
    else setProfiles((current) => current.map((profileItem) => profileItem.id === updated.id ? updated : profileItem));
    setBusyId(null);
  }

  async function handleReview(request, status) {
    setRequestBusyId(request.id);
    setError("");
    const { request: reviewed, error: reviewError } = await AccessRequestService.review(request.id, status);
    if (reviewError) {
      setError("تغییر وضعیت درخواست انجام نشد؛ SQL مربوط به درخواست‌ها را بررسی کنید.");
    } else if (reviewed) {
      setRequests((current) => current.filter((item) => item.id !== reviewed.id));
    }
    setRequestBusyId(null);
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
                  <p className="truncate text-[10px] text-os-text/60" dir="ltr">{item.email || "ایمیل ثبت نشده"}</p>
                  <p className="truncate text-[10px] text-os-text/50" dir="ltr">{item.id}</p>
                  <p className="mt-2 text-[10px] text-os-text/60">
                    <span className={isOnline(item.last_seen_at) ? "text-emerald-300" : "text-os-text/50"}>
                      {isOnline(item.last_seen_at) ? "● اکنون فعال" : "○ آفلاین"}
                    </span>
                    <span className="mx-2">|</span>
                    آخرین ورود: {formatDate(item.last_login_at)}
                  </p>
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

      <section className="rounded-xl border border-os-border bg-os-card p-4" aria-labelledby="requests-title">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 id="requests-title" className="font-bold">درخواست‌های عضویت</h2>
          <span className="rounded bg-os-accent/10 px-2 py-1 text-[10px] text-os-accent">{requests.length} در انتظار</span>
        </div>
        <p className="mb-4 text-[11px] leading-6 text-os-text/50">
          تأیید درخواست، مجوز ساخت حساب را ثبت می‌کند. بعد از تأیید، حساب را در Authentication &gt; Users بساز و پروفایلش را به نقش guest وصل کن.
        </p>
        {requests.length === 0 ? (
          <p className="py-5 text-center text-xs text-os-text/50">درخواست جدیدی وجود ندارد.</p>
        ) : (
          <div className="space-y-3">
            {requests.map((request) => (
              <div key={request.id} className="rounded-lg border border-os-border/70 bg-os-bg/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm">{request.display_name}</p>
                    <p className="mt-1 truncate text-[10px] text-os-text/60" dir="ltr">{request.email}</p>
                    <p className="mt-1 text-[10px] text-os-text/40">ثبت درخواست: {formatDate(request.created_at)}</p>
                    {request.note && <p className="mt-2 rounded border border-os-border/60 p-2 text-xs leading-5 text-os-text/65">{request.note}</p>}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => handleReview(request, "approved")}
                      disabled={requestBusyId === request.id}
                      className="rounded border border-emerald-500/50 px-3 py-1.5 text-[10px] text-emerald-300 hover:bg-emerald-500/10 disabled:opacity-40"
                    >
                      تأیید
                    </button>
                    <button
                      type="button"
                      onClick={() => handleReview(request, "rejected")}
                      disabled={requestBusyId === request.id}
                      className="rounded border border-red-500/50 px-3 py-1.5 text-[10px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
                    >
                      رد
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
