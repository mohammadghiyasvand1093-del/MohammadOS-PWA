import { useEffect, useRef, useState } from "react";
import { DEFAULT_HELP_CONTENT, HELP_CONTENT } from "../content/helpContent";

const HELP_SECTIONS = Object.entries(HELP_CONTENT).map(([path, content]) => ({
  path,
  ...content,
}));

export default function HelpCenterModal({ onClose }) {
  const closeButtonRef = useRef(null);
  const [selectedPath, setSelectedPath] = useState(HELP_SECTIONS[0]?.path || "/");
  const selected = HELP_SECTIONS.find((section) => section.path === selectedPath) || {
    path: "/",
    ...DEFAULT_HELP_CONTENT,
  };

  useEffect(() => {
    closeButtonRef.current?.focus();
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
      className="fixed inset-0 z-[125] flex items-end justify-center bg-black/80 p-3 md:items-center md:p-6"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-os-border bg-os-card shadow-2xl"
        dir="rtl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-center-title"
      >
        <header className="flex items-start justify-between gap-4 border-b border-os-border p-5 md:p-6">
          <div>
            <p className="font-mono text-[10px] tracking-[0.2em] text-os-accent">MOHAMMADOS · HELP CENTER</p>
            <h2 id="help-center-title" className="mt-1 text-xl font-black md:text-2xl">راهنمای همهٔ بخش‌ها</h2>
            <p className="mt-2 text-xs leading-6 text-os-text/60">
              هر تب را انتخاب کن تا روش استفاده، دکمه‌ها و نکته‌های مهم آن را ببینی.
            </p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg border border-os-border px-3 py-2 text-xs text-os-text/60 hover:border-os-accent hover:text-os-accent"
            aria-label="بستن مرکز راهنما"
          >
            بستن
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[13rem_minmax(0,1fr)]">
          <nav
            className="flex shrink-0 gap-2 overflow-x-auto border-b border-os-border p-3 md:block md:space-y-2 md:overflow-y-auto md:border-b-0 md:border-l md:p-4"
            aria-label="بخش‌های راهنما"
            role="tablist"
          >
            {HELP_SECTIONS.map((section) => (
              <button
                key={section.path}
                type="button"
                role="tab"
                aria-selected={selected.path === section.path}
                aria-controls={`help-panel-${section.path.slice(1) || "today"}`}
                onClick={() => setSelectedPath(section.path)}
                className={`flex min-w-max items-center gap-2 rounded-lg border px-3 py-2 text-xs transition md:w-full ${
                  selected.path === section.path
                    ? "border-os-accent/60 bg-os-accent/10 text-os-accent"
                    : "border-os-border/70 text-os-text/60 hover:border-os-accent/40 hover:text-os-text"
                }`}
              >
                <span aria-hidden="true">{section.icon}</span>
                <span>{section.title.replace("راهنمای ", "")}</span>
              </button>
            ))}
          </nav>

          <article
            id={`help-panel-${selected.path.slice(1) || "today"}`}
            className="min-h-0 overflow-y-auto p-5 md:p-7"
            role="tabpanel"
            tabIndex={0}
            aria-label={selected.title}
          >
            <div className="flex items-start gap-3">
              <span className="text-3xl" aria-hidden="true">{selected.icon}</span>
              <div>
                <p className="text-[10px] font-mono tracking-[0.2em] text-os-accent">SECTION GUIDE</p>
                <h3 className="mt-1 text-xl font-black">{selected.title}</h3>
                <p className="mt-2 text-sm leading-7 text-os-text/65">{selected.summary}</p>
              </div>
            </div>

            <section className="mt-6">
              <h4 className="mb-3 text-sm font-black text-os-accent">چطور استفاده کنم؟</h4>
              <ol className="space-y-3">
                {selected.steps.map((step, index) => (
                  <li key={step} className="flex items-start gap-3 text-xs leading-6 text-os-text/75">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-os-accent/60 font-mono text-[10px] text-os-accent">
                      {index + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </section>

            {selected.controls.length > 0 && (
              <section className="mt-6">
                <h4 className="mb-3 text-sm font-black text-os-accent">دکمه‌ها و امکانات</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  {selected.controls.map(([name, description]) => (
                    <div key={name} className="rounded-xl border border-os-border/80 bg-os-bg/50 p-3">
                      <p className="text-xs font-bold">{name}</p>
                      <p className="mt-1 text-[11px] leading-5 text-os-text/55">{description}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-6 rounded-xl border border-os-accent/25 bg-os-accent/5 p-4">
              <h4 className="mb-2 text-sm font-black text-os-accent">نکته‌های مهم</h4>
              <ul className="space-y-2">
                {selected.tips.map((tip) => (
                  <li key={tip} className="text-xs leading-6 text-os-text/70">• {tip}</li>
                ))}
              </ul>
            </section>
          </article>
        </div>
      </section>
    </div>
  );
}
