import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { SyncService } from "../sync/SyncService";
import { RecordSyncService } from "../sync/RecordSyncService";
import { useOnlineStatus } from "../hooks/useOnlineStatus";

function formatDate(value) {
  if (!value) return "هنوز انجام نشده";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function getErrorMessage(error) {
  if (
    error?.message?.includes("sync_records")
    || error?.message?.includes("get_sync_record_status")
    || error?.message?.includes("pull_sync_records")
    || error?.message?.includes("seed_sync_records")
  ) {
    return "زیرساخت همگام‌سازی رکوردی در Supabase نصب نشده است؛ فایل supabase/record_sync_schema.sql را اجرا کنید.";
  }
  if (error?.code === "PGRST202") {
    return "بخش ابری هنوز در Supabase نصب نشده است؛ فایل supabase/sync_schema.sql را اجرا کنید.";
  }
  if (error?.code === "42P01" || error?.message?.includes("sync_snapshots")) {
    return "جدول همگام‌سازی در Supabase ساخته نشده است؛ فایل SQL مرحله را اجرا کنید.";
  }
  return error?.message || "عملیات همگام‌سازی انجام نشد.";
}

function getSyncState(status, isOnline) {
  if (!isOnline) return { label: "آفلاین", tone: "text-red-300", detail: "تغییرات محلی محفوظ هستند." };
  if (status?.hasConflict || status?.outbox?.conflictCount > 0) {
    return { label: "تعارض", tone: "text-amber-300", detail: "قبل از ادامه یکی از نسخه‌ها را انتخاب کن." };
  }
  if (status?.retryAt) return { label: "در انتظار تلاش دوباره", tone: "text-sky-300", detail: "خطای موقت ثبت شده است." };
  if (status?.localChanged || status?.outbox?.pendingCount > 0) {
    return { label: "در انتظار ارسال", tone: "text-amber-300", detail: "تغییرات این دستگاه هنوز در ابر ثبت نشده‌اند." };
  }
  if (status?.cloud) return { label: "همگام", tone: "text-emerald-300", detail: "این دستگاه با آخرین نسخهٔ ابری هماهنگ است." };
  return { label: "آمادهٔ اتصال", tone: "text-os-text/70", detail: "برای شروع، ارسال یا دریافت را انتخاب کن." };
}

export default function SyncPage() {
  const { user } = useAuth();
  const isOnline = useOnlineStatus();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  const [recordStatus, setRecordStatus] = useState(null);
  const [recordConflicts, setRecordConflicts] = useState([]);
  const [recordBusy, setRecordBusy] = useState("");
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

  useEffect(() => {
    const handleSyncApplied = () => {
      void refresh();
    };
    window.addEventListener("mohammados:sync-applied", handleSyncApplied);
    return () => window.removeEventListener("mohammados:sync-applied", handleSyncApplied);
  }, [refresh]);

  useEffect(() => {
    if (!userId || !isOnline) return undefined;
    let cancelled = false;
    void Promise.all([
      RecordSyncService.getRemoteStatus(userId),
      RecordSyncService.getConflicts(),
    ])
      .then(([nextStatus, nextConflicts]) => {
        if (!cancelled) {
          setRecordStatus(nextStatus);
          setRecordConflicts(nextConflicts);
        }
      })
      .catch(() => {
        // The explicit status button keeps the failure visible without blocking the page.
      });
    return () => {
      cancelled = true;
    };
  }, [isOnline, userId]);

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
      await SyncService.recordFailure(user.id, error).catch(() => {});
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
      await SyncService.recordFailure(user.id, error).catch(() => {});
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setBusy("");
    }
  }

  async function replaceLocalWithCloud() {
    if (!window.confirm("داده‌های محلی این دستگاه با نسخهٔ ابری جایگزین شود؟ قبل از ادامه از دادهٔ فعلی بکاپ بگیر.")) return;
    await runAction("pull", "نسخهٔ ابری روی این دستگاه دریافت شد.");
  }

  async function retryNow() {
    await SyncService.clearFailure();
    const hasLocalChanges = Boolean(
      status?.localChanged || status?.outbox?.pendingCount > 0
    );
    const action = hasLocalChanges ? "push" : "pull";
    const successText = action === "push"
      ? "تغییرات این دستگاه در فضای ابری ذخیره شد."
      : "نسخهٔ ابری روی این دستگاه دریافت شد.";
    await runAction(action, successText);
  }

  async function refreshRecordStatus() {
    if (!isOnline || recordBusy || !userId) return;
    setRecordBusy("status");
    setMessage(null);
    try {
      const [nextStatus, nextConflicts] = await Promise.all([
        RecordSyncService.getRemoteStatus(userId),
        RecordSyncService.getConflicts(),
      ]);
      setRecordStatus(nextStatus);
      setRecordConflicts(nextConflicts);
      if (nextStatus.status === "unavailable") {
        setMessage({ type: "error", text: getErrorMessage(nextStatus.error) });
      } else {
        setMessage({
          type: "info",
          text: nextStatus.seeded
            ? `نسخهٔ پایهٔ این حساب آماده است؛ ${nextStatus.recordCount || 0} رکورد در ابر ثبت شده.`
            : "نسخهٔ پایهٔ این حساب هنوز ساخته نشده است.",
        });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setRecordBusy("");
    }
  }

  async function seedRecordBaseline() {
    if (!isOnline || recordBusy || !userId) return;
    if (!window.confirm(
      "از داده‌های فعلی این حساب یک نسخهٔ پایهٔ رکوردی در Supabase ساخته شود؟ این کار فقط یک‌بار انجام می‌شود و همگام‌سازی خودکار را فعال نمی‌کند."
    )) return;

    setRecordBusy("seed");
    setMessage(null);
    try {
      const result = await RecordSyncService.seedLocalBaseline(userId);
      if (result.status === "seeded") {
        setRecordStatus(result);
        setMessage({
          type: "success",
          text: `نسخهٔ پایه ساخته شد و ${result.recordCount || 0} رکورد برای حساب فعلی آمادهٔ همگام‌سازی شد.`,
        });
      } else if (result.status === "already_seeded") {
        const nextStatus = result.remoteStatus || result;
        setRecordStatus(nextStatus);
        setMessage({ type: "info", text: "نسخهٔ پایهٔ این حساب قبلاً ساخته شده و دوباره روی آن نوشته نشد." });
      } else if (result.status === "unavailable") {
        setMessage({ type: "error", text: getErrorMessage(result.error) });
      } else if (result.status === "offline") {
        setMessage({ type: "error", text: "اینترنت قطع است؛ ساخت نسخهٔ پایه فعلاً انجام نمی‌شود." });
      } else if (result.status === "unauthenticated") {
        setMessage({ type: "error", text: "حساب واردشده شناسایی نشد؛ دوباره وارد حساب شو." });
      } else if (result.status === "too_large") {
        setMessage({ type: "error", text: "حجم نسخهٔ پایه زیاد است؛ ابتدا داده‌های غیرضروری را پاک یا جداگانه بکاپ بگیر." });
      } else {
        setMessage({ type: "error", text: "ساخت نسخهٔ پایه با وضعیت نامشخص متوقف شد؛ دوباره بررسی کن." });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setRecordBusy("");
    }
  }

  async function updateRecordStatusSilently() {
    if (!userId || !isOnline) return null;
    const [nextStatus, nextConflicts] = await Promise.all([
      RecordSyncService.getRemoteStatus(userId),
      RecordSyncService.getConflicts(),
    ]);
    setRecordStatus(nextStatus);
    setRecordConflicts(nextConflicts);
    return nextStatus;
  }

  async function resolveRecordConflict(opId, choice) {
    if (!userId || recordBusy) return;
    const prompt = choice === "cloud"
      ? "نسخهٔ ابری جایگزین نسخهٔ محلی این رکورد شود؟"
      : "نسخهٔ محلی نگه داشته و برای ارسال دوباره آماده شود؟";
    if (!window.confirm(prompt)) return;

    setRecordBusy("resolve-" + opId);
    setMessage(null);
    try {
      const result = await RecordSyncService.resolveConflict(opId, choice);
      if (result.status === "resolved_cloud") {
        setMessage({ type: "success", text: "نسخهٔ ابری پذیرفته شد و تعارض بسته شد." });
      } else if (result.status === "requeued_local") {
        setMessage({ type: "info", text: "نسخهٔ محلی نگه داشته شد؛ برای ثبت آن در ابر، ارسال تغییرات رکوردی را بزن." });
      } else {
        setMessage({ type: "error", text: "این تعارض دیگر وجود ندارد؛ وضعیت را تازه‌سازی کردم." });
      }
      await updateRecordStatusSilently();
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setRecordBusy("");
    }
  }

  async function pullRecordChanges() {
    if (!isOnline || recordBusy || !userId || !recordStatus?.seeded) return;
    setRecordBusy("pull");
    setMessage(null);
    try {
      const result = await RecordSyncService.pullRemote(userId);
      await updateRecordStatusSilently();
      if (result.status === "pulled") {
        setMessage({
          type: "success",
          text: `${result.applied} تغییر رکوردی دریافت شد؛ ${result.ignored} رکورد از قبل جدیدتر یا برابر بود.`,
        });
      } else if (result.status === "conflict") {
        setMessage({
          type: "conflict",
          text: `${result.conflicts.length} تعارض شناسایی شد؛ تغییرات محلی دست‌نخورده ماند و هنوز چیزی حذف نشد.`,
        });
      } else if (result.status === "idle") {
        setMessage({ type: "info", text: "تغییر رکوردی جدیدی برای دریافت وجود نداشت." });
      } else if (result.status === "needs_setup") {
        setMessage({
          type: "error",
          text: `${result.untrackedLocalCount} رکورد محلی هنوز نسخهٔ پایه ندارد؛ ابتدا از داده‌ها بکاپ بگیر و این دستگاه را برای دریافت آماده کن.`,
        });
      } else if (result.status === "not_seeded") {
        setMessage({ type: "error", text: "ابتدا برای این حساب نسخهٔ پایه بساز." });
      } else if (result.status === "unavailable") {
        setMessage({ type: "error", text: getErrorMessage(result.error) });
      } else if (result.status === "offline") {
        setMessage({ type: "error", text: "اینترنت قطع است؛ دریافت رکوردها فعلاً انجام نمی‌شود." });
      } else {
        setMessage({ type: "error", text: result.error || "دریافت رکوردها کامل نشد." });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setRecordBusy("");
    }
  }

  async function pushRecordChanges() {
    if (!isOnline || recordBusy || !userId || !recordStatus?.seeded) return;
    setRecordBusy("push");
    setMessage(null);
    try {
      const result = await RecordSyncService.pushPending(userId);
      await updateRecordStatusSilently();
      if (result.status === "synced") {
        setMessage({
          type: "success",
          text: `${result.accepted} تغییر محلی در فضای ابری ثبت شد.`,
        });
      } else if (result.status === "conflict") {
        setMessage({
          type: "conflict",
          text: `${result.conflicts} تعارض شناسایی شد؛ تغییرات متعارض برای تصمیم‌گیری نگه داشته شدند.`,
        });
      } else if (result.status === "idle") {
        setMessage({ type: "info", text: "تغییر محلیِ منتظر ارسال وجود ندارد." });
      } else if (result.status === "not_seeded") {
        setMessage({ type: "error", text: "ابتدا برای این حساب نسخهٔ پایه بساز." });
      } else if (result.status === "unavailable") {
        setMessage({ type: "error", text: getErrorMessage(result.error) });
      } else if (result.status === "offline") {
        setMessage({ type: "error", text: "اینترنت قطع است؛ ارسال رکوردها فعلاً انجام نمی‌شود." });
      } else {
        setMessage({ type: "error", text: getErrorMessage(result.error) });
      }
    } catch (error) {
      setMessage({ type: "error", text: getErrorMessage(error) });
    } finally {
      setRecordBusy("");
    }
  }

  const totalLocalRecords = status
    ? Object.values(status.localCounts).reduce((sum, count) => sum + count, 0)
    : 0;
  const syncState = getSyncState(status, isOnline);

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

      <section className="grid gap-3 sm:grid-cols-5" aria-label="خلاصه وضعیت همگام‌سازی">
        <div className="rounded-xl border border-os-border bg-os-card p-4">
          <p className="text-[10px] text-os-text/45">وضعیت سینک</p>
          <p className={`mt-2 text-sm font-bold ${syncState.tone}`}>{syncState.label}</p>
          <p className="mt-1 text-[10px] leading-5 text-os-text/45">{syncState.detail}</p>
        </div>
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
        <div className="rounded-xl border border-os-border bg-os-card p-4">
          <p className="text-[10px] text-os-text/45">تغییرات در صف</p>
          <p className="mt-2 text-sm font-bold text-os-accent">
            {loading ? "..." : (status?.outbox?.pendingCount || 0) + recordConflicts.length}
          </p>
          <p className="mt-1 text-[10px] leading-5 text-os-text/45">تغییرات محلی و تعارض‌های باز.</p>
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
            <p className="text-sm font-bold text-amber-300">
              {status.localMeta ? "تعارض بین این دستگاه و فضای ابری" : "اولین اتصال این دستگاه"}
            </p>
            <p className="mt-2 text-[11px] leading-6 text-os-text/60">
              {status.localMeta
                ? `نسخهٔ ابری: ${status.cloud?.version ?? "جدید"} — آخرین نسخهٔ پذیرفته‌شده در این دستگاه: ${status.localMeta?.cloudVersion ?? "ثبت نشده"}`
                : "این دستگاه هنوز نسخه‌ای را قبول نکرده است؛ مشخص کن داده‌های ابری روی این دستگاه بیاید یا داده‌های این دستگاه جایگزین ابر شود."}
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

      <section className="rounded-xl border border-sky-500/30 bg-os-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono tracking-widest text-sky-300">RECORD SYNC PREPARATION</p>
            <h2 className="mt-2 font-bold">نسخهٔ پایهٔ رکوردی</h2>
            <p className="mt-2 max-w-2xl text-[11px] leading-6 text-os-text/55">
              داده‌های فعلی همین حساب را با شناسهٔ هر رکورد در ابر ثبت می‌کند تا مرحلهٔ بعد بتواند تغییرات گوشی و لپ‌تاپ را دقیق‌تر ترکیب کند.
              این عملیات دستی، یک‌بارمصرف و غیرمخرب است؛ ارسال و دریافت رکوردی هنوز خودکار نشده است.
            </p>
          </div>
          <span className={`rounded-full border px-3 py-1 text-[10px] ${
            recordStatus?.seeded
              ? "border-emerald-500/40 text-emerald-300"
              : recordStatus?.state === "not_seeded"
                ? "border-amber-500/40 text-amber-300"
                : "border-os-border text-os-text/50"
          }`}>
            {recordStatus?.seeded
              ? "آماده"
              : recordStatus?.state === "not_seeded"
                ? "ساخته نشده"
                : "بررسی نشده"}
          </span>
        </div>

        {recordStatus?.seeded && (
          <p className="mt-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3 text-[11px] leading-6 text-emerald-200/80">
            {recordStatus.recordCount || 0} رکورد برای حساب فعلی آماده شده است.
            {recordStatus.baselineAt ? ` زمان: ${formatDate(recordStatus.baselineAt)}` : ""}
          </p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void refreshRecordStatus()}
            disabled={!isOnline || Boolean(recordBusy)}
            className="rounded-lg border border-sky-500/50 px-3 py-2 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recordBusy === "status" ? "در حال بررسی..." : "بررسی نسخهٔ پایه"}
          </button>
          <button
            type="button"
            onClick={() => void seedRecordBaseline()}
            disabled={!isOnline || Boolean(recordBusy) || recordStatus?.seeded}
            className="rounded-lg bg-sky-500/90 px-3 py-2 text-[11px] font-bold text-os-bg hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recordBusy === "seed" ? "در حال ساخت..." : "ساخت نسخهٔ پایه"}
          </button>
          <button
            type="button"
            onClick={() => void pullRecordChanges()}
            disabled={!isOnline || Boolean(recordBusy) || !recordStatus?.seeded}
            className="rounded-lg border border-emerald-500/50 px-3 py-2 text-[11px] text-emerald-300 hover:bg-emerald-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recordBusy === "pull" ? "در حال دریافت..." : "دریافت تغییرات رکوردی"}
          </button>
          <button
            type="button"
            onClick={() => void pushRecordChanges()}
            disabled={!isOnline || Boolean(recordBusy) || !recordStatus?.seeded}
            className="rounded-lg border border-amber-500/50 px-3 py-2 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {recordBusy === "push" ? "در حال ارسال..." : "ارسال تغییرات رکوردی"}
          </button>
        </div>
      </section>

      {recordConflicts.length > 0 && (
        <section className="rounded-xl border border-amber-500/40 bg-os-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono tracking-widest text-amber-300">CONFLICT REVIEW</p>
              <h2 className="mt-2 font-bold text-amber-200">تعارض‌های نیازمند تصمیم</h2>
              <p className="mt-2 text-[11px] leading-6 text-os-text/55">
                هیچ داده‌ای خودکار حذف نشده است. برای هر رکورد مشخص کن نسخهٔ ابری بماند یا تغییر محلی دوباره ارسال شود.
              </p>
            </div>
            <span className="rounded-full border border-amber-500/40 px-3 py-1 text-[10px] text-amber-300">
              {recordConflicts.length} مورد در انتظار
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {recordConflicts.map((conflict) => (
              <div key={conflict.opId} className="rounded-lg border border-os-border bg-os-bg/50 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 text-[11px] leading-6">
                    <p className="font-bold text-os-text">{conflict.entity}</p>
                    <p className="break-all text-os-text/55" dir="ltr">{conflict.entityId}</p>
                    <p className="text-os-text/55">
                      عملیات محلی: <span className="text-os-text/80">{conflict.operation === "delete" ? "حذف" : "ویرایش"}</span>
                      {" — "}نسخهٔ ابری: <span className="text-amber-300">{conflict.conflictVersion || "جدید"}</span>
                    </p>
                    {conflict.lastError && <p className="text-red-300/80">{conflict.lastError}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void resolveRecordConflict(conflict.opId, "cloud")}
                      disabled={Boolean(recordBusy)}
                      className="rounded border border-sky-500/50 px-3 py-2 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
                    >
                      پذیرش نسخهٔ ابری
                    </button>
                    <button
                      type="button"
                      onClick={() => void resolveRecordConflict(conflict.opId, "local")}
                      disabled={Boolean(recordBusy)}
                      className="rounded border border-amber-500/50 px-3 py-2 text-[11px] text-amber-300 hover:bg-amber-500/10 disabled:opacity-40"
                    >
                      نگه‌داشتن نسخهٔ محلی
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-xl border border-os-border bg-os-card p-4">
        <h2 className="font-bold">آخرین وضعیت</h2>
        <div className="mt-3 space-y-2 text-[11px] text-os-text/55">
          <p>آخرین همگام‌سازی این دستگاه: <span className="text-os-text/80">{formatDate(status?.localMeta?.lastSyncedAt)}</span></p>
          <p>آخرین تغییر ابری: <span className="text-os-text/80">{formatDate(status?.cloud?.updated_at)}</span></p>
          {status?.retryAt && (
            <p>
              تلاش دوباره: <span className="text-sky-300">{formatDate(status.retryAt)}</span>
              {status.localMeta?.lastError && (
                <span className="block mt-1 text-red-300/80">علت: {status.localMeta.lastError}</span>
              )}
            </p>
          )}
          <p>شناسهٔ این دستگاه: <span className="select-text break-all text-os-text/50" dir="ltr">{status?.deviceId || "..."}</span></p>
        </div>
        {status?.retryAt && (
          <button
            type="button"
            onClick={() => void retryNow()}
            disabled={Boolean(busy) || !isOnline}
            className="mt-4 rounded-lg border border-sky-500/50 px-3 py-2 text-[11px] text-sky-300 hover:bg-sky-500/10 disabled:opacity-40"
          >
            تلاش دوباره الآن
          </button>
        )}
        <p className="mt-4 rounded-lg border border-os-border/60 bg-os-bg/50 p-3 text-[11px] leading-6 text-os-text/50">
          نکته: Snapshot فعلی همچنان روش فعال همگام‌سازی است. زیرساخت رکوردی
          دریافت، ارسال و حل تعارض فعلاً دستی است؛ اجرای خودکار عمداً تا پایان تست دو دستگاه خاموش مانده است.
        </p>
      </section>
    </div>
  );
}
