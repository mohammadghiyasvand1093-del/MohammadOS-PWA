import { useState } from "react";
import { useNavigate } from "react-router-dom";
import AccessRequestModal from "../auth/AccessRequestModal";

const DEMO_STEPS = [
  {
    key: "today",
    label: "امروز",
    icon: "🎯",
    title: "داشبورد اجرای امروز",
    description: "اینجا می‌بینی امروز چه کارهایی داری، چقدر پیش رفته‌ای و کدام مأموریت‌ها مهم‌تر هستند.",
    tip: "با تیک‌زدن عادت‌ها، امتیاز روز و روند پیشرفتت به‌روزرسانی می‌شود.",
    preview: (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-xl border border-os-border bg-os-bg p-4">
          <span className="text-xs text-os-text/60">پیشرفت امروز</span>
          <span className="font-mono text-lg font-black text-os-accent">۷۵٪</span>
        </div>
        {["مطالعهٔ هدفمند", "ورزش کوتاه", "ثبت حال روز"].map((item, index) => (
          <div key={item} className="flex items-center justify-between rounded-lg border border-os-border/70 bg-os-bg/60 p-3">
            <span className="text-sm">{item}</span>
            <span className={index < 2 ? "text-emerald-400" : "text-os-text/40"}>{index < 2 ? "✓ انجام شد" : "○ باقی‌مانده"}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "week",
    label: "هفته",
    icon: "🗓️",
    title: "برنامهٔ هفتگی و تاریخ‌محور",
    description: "برنامه‌های تکرارشونده برای روزهای هفته و رویدادهای مشخص با تاریخ واقعی را کنار هم می‌بینی.",
    tip: "کلاس‌های ثابت را هفتگی و امتحان یا رویداد موقت را با تاریخ دقیق ثبت کن.",
    preview: (
      <div className="grid grid-cols-2 gap-3">
        {[
          ["شنبه", "مطالعه", "۰۸:۰۰"],
          ["یکشنبه", "کلاس زبان", "۱۷:۰۰"],
          ["دوشنبه", "ورزش", "۱۹:۰۰"],
          ["۳۱ شهریور", "امتحان", "۱۹:۰۰"],
        ].map(([day, title, time]) => (
          <div key={`${day}-${title}`} className="rounded-xl border border-os-border bg-os-bg p-3">
            <p className="text-[10px] text-os-accent">{day}</p>
            <p className="mt-2 text-sm font-bold">{title}</p>
            <p className="mt-1 font-mono text-xs text-os-text/50">{time}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "planner",
    label: "برنامه‌ریز",
    icon: "📋",
    title: "برنامه‌ریز عملیاتی",
    description: "رویدادها، زمان‌های آزاد و مأموریت‌های مهم را در یک نمای روزانه مدیریت می‌کنی.",
    tip: "هر رویداد باید عنوان، تاریخ، زمان شروع و پایان مشخص داشته باشد.",
    preview: (
      <div className="space-y-2">
        {[
          ["۰۹:۰۰", "یادگیری Python", "آموزش"],
          ["۱۴:۱۰", "آزاد بدون تعهد", "استراحت"],
          ["۱۹:۰۰", "مرور امتحان", "مأموریت مهم"],
        ].map(([time, title, type]) => (
          <div key={title} className="flex items-center gap-3 rounded-xl border border-os-border bg-os-bg p-3">
            <span className="w-14 shrink-0 font-mono text-xs text-os-accent">{time}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{title}</p>
              <p className="mt-1 text-[10px] text-os-text/50">{type}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "status",
    label: "وضعیت",
    icon: "📈",
    title: "وضعیت و چرخ زندگی",
    description: "روند عادت‌ها و تعادل حوزه‌های مهم زندگی را در یک نگاه بررسی می‌کنی.",
    tip: "گزارش‌ها بر اساس داده‌هایی ساخته می‌شوند که خودت در برنامه ثبت کرده‌ای.",
    preview: (
      <div className="grid grid-cols-3 gap-3">
        {[
          ["تمرکز", "۸۲٪"],
          ["انرژی", "۶۸٪"],
          ["نظم", "۷۶٪"],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-os-border bg-os-bg p-3 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full border-4 border-os-accent/40 font-mono text-xs text-os-accent">{value}</div>
            <p className="mt-2 text-xs text-os-text/60">{label}</p>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "roadmap",
    label: "نقشه راه",
    icon: "🧭",
    title: "نقشهٔ راه هدف‌ها",
    description: "هدف بزرگ را به دروازه‌ها، معیارها و قدم‌های قابل اجرا تبدیل می‌کنی.",
    tip: "می‌توانی پاسخ ساختاریافتهٔ AI را وارد کنی و بعد آن را بررسی و اصلاح کنی.",
    preview: (
      <div className="space-y-3">
        {[
          ["۱", "پایه‌های بک‌اند", "در انتظار شروع"],
          ["۲", "ساختمان API", "در حال پیشرفت"],
          ["۳", "پروژهٔ واقعی", "قفل تا تکمیل مرحله قبل"],
        ].map(([number, title, state]) => (
          <div key={title} className="flex items-center gap-3 rounded-xl border border-os-border bg-os-bg p-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-os-accent text-os-accent">{number}</span>
            <div className="min-w-0">
              <p className="text-sm font-bold">{title}</p>
              <p className="mt-1 text-[10px] text-os-text/50">{state}</p>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: "reports",
    label: "گزارش‌ها",
    icon: "📊",
    title: "گزارش‌ساز هوشمند",
    description: "گزارش روزانه و هفتگی را آماده می‌کنی و در صورت نیاز برای مشاور AI کپی می‌کنی.",
    tip: "اطلاعات حساس را قبل از ارسال به سرویس بیرونی بررسی و حذف کن.",
    preview: (
      <div className="space-y-3">
        <div className="rounded-xl border border-os-border bg-os-bg p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="text-os-text/60">امتیاز این هفته</span>
            <span className="font-mono text-os-accent">۷۹٪</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-os-border">
            <div className="h-full w-[79%] rounded-full bg-os-accent" />
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-3 text-xs leading-6 text-sky-200">
          گزارش آمادهٔ بررسی است؛ می‌توانی آن را کپی کنی.
        </div>
      </div>
    ),
  },
  {
    key: "admin",
    label: "مدیریت",
    icon: "🛡️",
    title: "مدیریت حساب‌ها",
    description: "مالک می‌تواند حساب مهمان را ببیند، فعال یا غیرفعال کند و آخرین فعالیت را بررسی کند.",
    tip: "این بخش فقط برای مالک قابل مشاهده است و در دمو هیچ حساب واقعی نمایش داده نمی‌شود.",
    preview: (
      <div className="space-y-3">
        {[
          ["مالک", "فعال", "اکنون فعال"],
          ["مهمان", "فعال", "آخرین فعالیت: ۲ دقیقه قبل"],
        ].map(([name, state, activity]) => (
          <div key={name} className="flex items-center justify-between rounded-xl border border-os-border bg-os-bg p-3">
            <div>
              <p className="text-sm font-bold">{name}</p>
              <p className="mt-1 text-[10px] text-os-text/50">{activity}</p>
            </div>
            <span className="rounded bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-300">{state}</span>
          </div>
        ))}
      </div>
    ),
  },
];

export default function DemoPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const current = DEMO_STEPS[step];
  const isLast = step === DEMO_STEPS.length - 1;

  function finishDemo() {
    navigate("/");
  }

  return (
    <main className="min-h-screen w-full overflow-y-auto bg-os-bg px-4 py-6 text-os-text md:px-8 md:py-10" dir="rtl">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-[10px] tracking-[0.25em] text-os-accent">MOHAMMADOS · INTERACTIVE DEMO</p>
            <h1 className="mt-2 text-2xl font-black md:text-3xl">دموی تعاملی برنامه</h1>
          </div>
          <button type="button" onClick={finishDemo} className="rounded-lg border border-os-border px-3 py-2 text-xs text-os-text/60 hover:border-os-accent hover:text-os-accent">
            خروج
          </button>
        </header>

        <section className="rounded-2xl border border-os-border bg-os-card p-4 shadow-2xl md:p-6" aria-live="polite">
          <div className="mb-5 flex items-center justify-between gap-3">
            <span className="text-xs text-os-text/50">نمایش نمونه؛ اطلاعات واقعی ذخیره نمی‌شود</span>
            <span className="font-mono text-xs text-os-accent">{step + 1} / {DEMO_STEPS.length}</span>
          </div>

          <div className="mb-5 flex gap-1.5" aria-label="پیشرفت دمو">
            {DEMO_STEPS.map((item, index) => (
              <button
                key={item.key}
                type="button"
                aria-label={`رفتن به مرحله ${index + 1}: ${item.label}`}
                aria-current={index === step ? "step" : undefined}
                onClick={() => setStep(index)}
                className={`h-1.5 flex-1 rounded-full transition ${index <= step ? "bg-os-accent" : "bg-os-border"}`}
              />
            ))}
          </div>

          <div className="mb-6 flex items-start gap-3">
            <span className="text-3xl" aria-hidden="true">{current.icon}</span>
            <div>
              <p className="text-xs text-os-accent">{current.label}</p>
              <h2 className="mt-1 text-xl font-black">{current.title}</h2>
              <p className="mt-2 text-sm leading-7 text-os-text/65">{current.description}</p>
            </div>
          </div>

          <div className="mb-5 rounded-2xl border border-os-border/80 bg-os-bg/40 p-4">
            {current.preview}
          </div>

          <div className="mb-6 rounded-xl border border-os-accent/25 bg-os-accent/5 p-4 text-xs leading-6 text-os-text/70">
            <span className="font-bold text-os-accent">نکته:</span> {current.tip}
          </div>

          {isLast && (
            <section className="mb-6 rounded-2xl border border-os-accent/40 bg-os-accent/10 p-4 md:p-5" aria-labelledby="demo-next-step-title">
              <h3 id="demo-next-step-title" className="text-base font-black text-os-accent">حالا چه کار کنی؟</h3>
              <p className="mt-2 text-xs leading-6 text-os-text/70">
                اگر حساب داری وارد شو؛ اگر هنوز حساب نداری، درخواستت را برای بررسی مالک ارسال کن.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={finishDemo}
                  className="rounded-lg bg-os-accent px-4 py-3 text-xs font-black text-os-bg transition hover:opacity-90"
                >
                  ورود به حساب
                </button>
                <button
                  type="button"
                  onClick={() => setIsRequestOpen(true)}
                  className="rounded-lg border border-os-accent/60 px-4 py-3 text-xs font-bold text-os-accent transition hover:bg-os-accent/10"
                >
                  درخواست حساب جدید
                </button>
              </div>
            </section>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button type="button" onClick={finishDemo} className="text-xs text-os-text/45 hover:text-os-text">
              رد کردن دمو
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setStep((value) => Math.max(0, value - 1))}
                disabled={step === 0}
                className="rounded-lg border border-os-border px-4 py-2 text-xs text-os-text/60 disabled:cursor-not-allowed disabled:opacity-30"
              >
                قبلی
              </button>
              {isLast ? (
                <button type="button" onClick={finishDemo} className="rounded-lg bg-os-accent px-5 py-2 text-xs font-black text-os-bg">
                  رفتن به صفحهٔ ورود
                </button>
              ) : (
                <button type="button" onClick={() => setStep((value) => Math.min(DEMO_STEPS.length - 1, value + 1))} className="rounded-lg bg-os-accent px-5 py-2 text-xs font-black text-os-bg">
                  مرحلهٔ بعد
                </button>
              )}
            </div>
          </div>
        </section>

        <p className="mt-5 text-center text-[10px] leading-6 text-os-text/40">
          این دمو فقط برای آشنایی است. برای استفادهٔ واقعی باید با حساب مالک یا مهمان وارد شوید.
        </p>
      </div>
      {isRequestOpen && <AccessRequestModal onClose={() => setIsRequestOpen(false)} />}
    </main>
  );
}
