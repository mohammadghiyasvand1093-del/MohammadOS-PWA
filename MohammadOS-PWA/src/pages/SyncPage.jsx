import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { SyncService } from "../sync/SyncService";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

function formatDate(value) {
  if (!value) return "هنوز انجام نشده";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error) {
  if (error?.code === "PGRST202") {
    return "بخش ابری هنوز در Supabase نصب نشده است؛ فایل supabase/sync_schema.sql را اجرا کنید.";
  }
  if (error?.code === "42P01" || error?.message?.includes("sync_snapshots")) {
    return "جدول همگام‌سازی در Supabase ساخته نشده است؛ فایل SQL مرحله را اجرا کنید.";
  }
  return error?.message || "عملیات همگام‌سازی انجام نشد.";
}

export default function SyncPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  const userId = user?.id;

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setMessage(null);
    try {
      setStatus(await SyncService.getStatus(userId));
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  async function runAction(action, successText) {
    if (!isOnline || busy) return;
    setBusy(action);
    setMessage(null);
    try {
      const result = action === "push"
        ? await SyncService.pushLocal(user.id)
        : await SyncService.pullCloud(user.id);

      if (result.status === "conflict") {
        setStatus(await SyncService.getStatus(user.id));
        setMessage({
          type: "conflict",
          text: "نسخهٔ ابری از آخرین همگام‌سازی تغییر کرده است. برای جلوگیری از حذف داده، یکی از دو گزینهٔ پایین را آگاهانه انتخاب کن.",
        });
      } else if (result.status === "empty") {
        setMessage({ type: "info", text: "هنوز نسخه‌ای در فضای ابری وجود ندارد؛ ابتدا ارسال را بزن." });
      } else {
        await refresh();
        setMessage({ type: "success", text: successText });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function replaceCloudWithLocal() {
    if (!window.confirm("نسخهٔ ابری با داده‌های این دستگاه جایگزین شود؟ دادهٔ ابری قبلی دیگر نسخهٔ اصلی نخواهد بود.")) return;
    setBusy("force-push");
    setMessage(null);
    try {
      const result = await SyncService.pushLocal(user.id, { force: true });
      if (result.status === "synced") {
        await refresh();
        setMessage({ type: "success", text: "داده‌های این دستگاه به‌عنوان نسخهٔ جدید ابری ذخیره شد." });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function replaceLocalWithCloud() {
    if (!window.confirm("داده‌های محلی این دستگاه با نسخهٔ ابری جایگزین شود؟ قبل از ادامه از دادهٔ فعلی بکاپ بگیر.")) return;
    await runAction("pull", "نسخهٔ ابری روی این دستگاه دریافت شد.");
  }

  const totalLocalRecords = status
    ? Object.values(status.localCounts).reduce((sum, count) => sum + count, 0)
    : 0;

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <p className="text-[10px] font-mono tracking-widest text-os-accent">LOCAL-FIRST SYNC</p>
        <h1 className="mt-2 text-2xl font-black">همگام‌سازی گوشی و لپ‌تاپ</h1>
        <p className="mt-2 text-xs leading-6 text-os-text/55">
          داده‌ها برای هر حساب جدا هستند. این مرحله قبل از جایگزینی اطلاعات، تعارض را نشان می‌دهد.
        </p>
      </header>

      {!isOnline && (
        <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">
          اینترنت قطع است؛ اطلاعات محلی محفوظ می‌ماند و عملیات ابری موقتاً غیرفعال است.
        </div>
      )}

      {message && (
        <div
          className={`rounded-xl border p-3 text-xs leading-6 ${
            message.type === "error"
              ? "border-red-500/40 bg-red-500/10 text-red-300"
              : message.type === "conflict"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : message.type === "success"
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-300"
          }`}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-3" aria-label="خلاصه وضعیت همگام‌سازی">
        <div className="rounded-xl border border-os-border bg-os-card p-4">
          <p className="text-[10px] text-os-text/45">وضعیت اتصال</p>
          <p className={`mt-2 text-sm font-bold ${isOnline ? "text-emerald-300" : "text-red-300"}`}>
            {isOnline ? "● آنلاین" : "● آفلاین"}
          </p>
        </div>
        <div className="rounded-xl border border-os-border bg-os-card p-4">
          <p className="text-[10px] text-os-text/45">نسخهٔ ابری</p>
          <p className="mt-2 text-sm font-bold text-os-accent">{status?.cloud?.version ?? "وجود ندارد"}</p>
        </div>
        <div className="rounded-xl border border-os-border bg-os-card p-4">
          <p className="text-[10px] text-os-text/45">رکوردهای این دستگاه</p>
          <p className="mt-2 text-sm font-bold text-os-text">{loading ? "..." : totalLocalRecords}</p>
        </div>
      </section>

      <section className="rounded-xl border border-os-border bg-os-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-bold">عملیات امن</h2>
            <p className="mt-1 text-[11px] leading-6 text-os-text/50">
              ارسال و دریافت دستی است تا هیچ دستگاهی بی‌خبر دادهٔ دستگاه دیگر را پاک نکند.
            </p>
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="rounded-lg border border-os-border px-3 py-2 text-xs text-os-text/70 hover:border-os-accent hover:text-os-accent disabled:opacity-50">
            {loading ? "در حال بررسی..." : "تازه‌سازی وضعیت"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={() => void runAction("push", "داده‌های این دستگاه در فضای ابری ذخیره شد.")} disabled={!isOnline || Boolean(busy)} className="rounded-lg bg-os-accent px-4 py-3 text-sm font-black text-os-bg disabled:cursor-not-allowed disabled:opacity-40">
            {busy === "push" ? "در حال ارسال..." : "ارسال این دستگاه به ابر"}
          </button>
          <button type="button" onClick={() => void runAction("pull", "نسخهٔ ابری روی این دستگاه دریافت شد.")} disabled={!isOnline || Boolean(busy)} className="rounded-lg border border-os-accent/60 px-4 py-3 text-sm font-bold text-os-accent hover:bg-os-accent/10 disabled:cursor-not-allowed disabled:opacity-40">
            {busy === "pull" ? "در حال دریافت..." : "دریافت نسخهٔ ابری"}
          </button>
        </div>

        {status?.hasConflict && (
          <div className="mt-5 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <p className="text-sm font-bold text-amber-300">تعارض بین این دستگاه و فضای ابری</p>
            <p className="mt-2 text-[11px] leading-6 text-os-text/60">
              نسخهٔ ابری: {status.cloud?.version ?? "جدید"} — آخرین نسخهٔ پذیرفته‌شده در این دستگاه: {status.localMeta?.cloudVersion ?? "ثبت نشده"}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => void replaceLocalWithCloud()} disabled={Boolean(busy)} className="rounded border border-sky-500/50 px-3 py-2 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-40">
                دریافت و جایگزینی محلی
              </button>
              <button type="button" onClick={() => void replaceCloudWithLocal()} disabled={Boolean(busy)} className="rounded border border-amber-500/50 px-3 py-2 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-40">
                جایگزینی نسخهٔ ابری
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-os-border bg-os-card p-4">
        <h2 className="font-bold">آخرین وضعیت</h2>
        <div className="mt-3 space-y-2 text-[11px] text-os-text/55">
          <p>آخرین همگام‌سازی این دستگاه: <span className="text-os-text/80">{formatDate(status?.localMeta?.lastSyncedAt)}</span></p>
          <p>آخرین تغییر ابری: <span className="text-os-text/80">{formatDate(status?.cloud?.updated_at)}</span></p>
          <p>شناسهٔ این دستگاه: <span className="select-text break-all text-os-text/50" dir="ltr">{status?.deviceId || "..."}</span></p>
        </div>
        <p className="mt-4 rounded-lg border border-os-border/60 bg-os-bg/50 p-3 text-[11px] leading-6 text-os-text/50">
          نکته: این مرحله پشتیبان و تعارض‌سنج امن است؛ تایمر فعال، پیش‌نویس‌ها، تاریخچهٔ Import و داده‌های موقت دستگاه عمداً همگام نمی‌شوند.
        </p>
      </section>
    </div>
  );
}
