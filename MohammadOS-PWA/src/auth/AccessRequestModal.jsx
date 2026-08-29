import { useState } from "react";
import { AccessRequestService } from "./AccessRequestService";

export default function AccessRequestModal({ onClose }) {
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const result = await AccessRequestService.create({ displayName, email, note });
    if (result.error) setError(result.error.message || "ارسال درخواست انجام نشد.");
    else setSubmitted(true);
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-3 md:items-center md:p-6" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-os-border bg-os-card p-5 shadow-2xl md:p-6" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="access-request-title">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-mono tracking-[0.2em] text-os-accent">REQUEST ACCESS</p>
            <h2 id="access-request-title" className="mt-1 text-xl font-black">درخواست حساب</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-os-border px-3 py-2 text-xs text-os-text/60 hover:border-os-accent hover:text-os-accent">بستن</button>
        </div>

        {submitted ? (
          <div className="space-y-4 text-center">
            <div className="text-5xl" aria-hidden="true">✅</div>
            <h3 className="text-lg font-black">درخواست ارسال شد</h3>
            <p className="text-xs leading-6 text-os-text/60">مالک درخواست را بررسی می‌کند. پس از تأیید، اطلاعات ورود را از مالک دریافت کنید.</p>
            <button type="button" onClick={onClose} className="w-full rounded-lg bg-os-accent px-4 py-3 text-sm font-black text-os-bg">متوجه شدم</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <p className="rounded-lg border border-os-accent/25 bg-os-accent/5 p-3 text-xs leading-6 text-os-text/65">رمز عبور را اینجا وارد نکنید. بعد از تأیید، حساب از مسیر امن Supabase ساخته می‌شود.</p>
            {error && <div className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300" role="alert">{error}</div>}
            <label className="block"><span className="mb-2 block text-xs font-bold text-os-text/70">نام نمایشی</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={80} required autoFocus className="w-full rounded-lg border border-os-border bg-os-bg px-4 py-3 text-sm outline-none focus:border-os-accent" placeholder="نام شما" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold text-os-text/70">ایمیل</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required inputMode="email" dir="ltr" className="w-full rounded-lg border border-os-border bg-os-bg px-4 py-3 text-sm outline-none focus:border-os-accent" placeholder="you@example.com" /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold text-os-text/70">توضیح اختیاری</span><textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} rows={3} className="w-full resize-y rounded-lg border border-os-border bg-os-bg px-4 py-3 text-sm outline-none focus:border-os-accent" placeholder="مثلاً دلیل استفاده از برنامه" /></label>
            <button type="submit" disabled={busy} className="w-full rounded-lg bg-os-accent px-4 py-3 text-sm font-black text-os-bg disabled:cursor-not-allowed disabled:opacity-50">{busy ? "در حال ارسال..." : "ارسال درخواست"}</button>
          </form>
        )}
      </section>
    </div>
  );
}
