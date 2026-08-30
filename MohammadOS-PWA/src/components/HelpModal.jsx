import { useEffect } from "react";

export default function HelpModal({ content, onClose, onOpenAll }) {
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/75 p-3 md:items-center md:p-6"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-os-border bg-os-card p-5 shadow-2xl md:p-6" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="help-modal-title">
        <header className="flex items-start justify-between gap-4 border-b border-os-border pb-4">
          <div className="flex items-start gap-3">
            <span className="text-3xl" aria-hidden="true">{content.icon}</span>
            <div>
              <p className="text-[10px] font-mono tracking-[0.2em] text-os-accent">MOHAMMADOS · HELP</p>
              <h2 id="help-modal-title" className="mt-1 text-xl font-black">{content.title}</h2>
              <p className="mt-2 text-xs leading-6 text-os-text/60">{content.summary}</p>
            </div>
          </div>
              <div className="flex shrink-0 items-center gap-2">
                {onOpenAll && (
                  <button
                    type="button"
                    onClick={onOpenAll}
                    className="rounded-lg border border-os-accent/40 px-3 py-2 text-xs text-os-accent hover:bg-os-accent/10"
                  >
                    همهٔ بخش‌ها
                  </button>
                )}
                <button type="button" onClick={onClose} className="rounded-lg border border-os-border px-3 py-2 text-xs text-os-text/60 hover:border-os-accent hover:text-os-accent" aria-label="بستن راهنما">بستن</button>
              </div>
        </header>
        <div className="mt-5 space-y-5">
          <section>
            <h3 className="mb-3 text-sm font-black text-os-accent">چطور استفاده کنم؟</h3>
            <ol className="space-y-3">
              {content.steps.map((step, index) => <li key={step} className="flex items-start gap-3 text-xs leading-6 text-os-text/75"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-os-accent/60 font-mono text-[10px] text-os-accent">{index + 1}</span><span>{step}</span></li>)}
            </ol>
          </section>
          {content.controls.length > 0 && <section><h3 className="mb-3 text-sm font-black text-os-accent">دکمه‌ها و امکانات</h3><div className="space-y-2">{content.controls.map(([name, description]) => <div key={name} className="rounded-xl border border-os-border/80 bg-os-bg/50 p-3"><p className="text-xs font-bold">{name}</p><p className="mt-1 text-[11px] leading-5 text-os-text/55">{description}</p></div>)}</div></section>}
          <section className="rounded-xl border border-os-accent/25 bg-os-accent/5 p-4"><h3 className="mb-2 text-sm font-black text-os-accent">نکته‌های مهم</h3><ul className="space-y-2">{content.tips.map((tip) => <li key={tip} className="text-xs leading-6 text-os-text/70">• {tip}</li>)}</ul></section>
        </div>
      </section>
    </div>
  );
}
