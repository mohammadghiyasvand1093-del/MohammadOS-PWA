// src/components/RoadmapStatsPanel.jsx
import { toPersianNumber } from "../utils/date";

export default function RoadmapStatsPanel({ stats }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
      {/* Completion Rate Ring */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col items-center justify-center col-span-2 md:col-span-1">
        <div className="relative w-20 h-20">
          <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
            <circle cx="40" cy="40" r="34" fill="none" stroke="currentColor" strokeWidth="6" className="text-os-border/50" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="none"
              stroke="#10B981"
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 34}
              strokeDashoffset={2 * Math.PI * 34 - (stats.completionRate / 100) * (2 * Math.PI * 34)}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-lg font-bold text-emerald-400">
              {toPersianNumber(stats.completionRate)}%
            </span>
          </div>
        </div>
        <span className="text-[10px] font-mono text-os-text/50 mt-2 uppercase tracking-wider">
          Completion Rate
        </span>
      </div>

      {/* Total Gates */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          Total Gates
        </span>
        <span className="text-2xl font-bold text-white font-mono">
          {toPersianNumber(stats.totalGates)}
        </span>
      </div>

      {/* Completed Gates */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          Completed
        </span>
        <span className="text-2xl font-bold text-emerald-400 font-mono">
          {toPersianNumber(stats.completedGates)}
        </span>
      </div>

      {/* In Progress */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          In Progress
        </span>
        <span className="text-2xl font-bold text-amber-400 font-mono">
          {toPersianNumber(stats.inProgressGates)}
        </span>
      </div>

      {/* Criteria Progress */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center col-span-2 md:col-span-2">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          Criteria Done
        </span>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-sky-400 font-mono">
            {toPersianNumber(stats.doneCriteria)} / {toPersianNumber(stats.totalCriteria)}
          </span>
        </div>
        <div className="w-full h-1.5 bg-os-border rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-sky-500 rounded-full transition-all duration-500"
            style={{ width: `${stats.completionRate}%` }}
          />
        </div>
      </div>

      {/* Overdue */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          Overdue
        </span>
        <span className={`text-2xl font-bold font-mono ${stats.overdueGates > 0 ? "text-red-500" : "text-os-text/40"}`}>
          {toPersianNumber(stats.overdueGates)}
        </span>
      </div>

      {/* Locked */}
      <div className="bg-os-card border border-os-border rounded-xl p-4 flex flex-col justify-center">
        <span className="text-[10px] font-mono text-os-text/50 mb-1 uppercase tracking-wider">
          Locked
        </span>
        <span className={`text-2xl font-bold font-mono ${stats.lockedGates > 0 ? "text-slate-400" : "text-os-text/40"}`}>
          {toPersianNumber(stats.lockedGates)}
        </span>ROLE: نگهبان Git/GitHub + طراح پروژه رزومه‌ای (Git-Keeper).

ورودی من: کدی که از Python-Polish یا SQL-Coach با برچسب "✅ آماده Git" اومده (من داخل VSCode می‌نویسمش).

STEP 1 — بررسی نهایی: ساختار فایل/پوشه مناسب ریپو + پیام commit استاندارد (Conventional Commits: feat/fix/refactor)
STEP 2 — بر اساس سطح فعلی من (از فایل profile_all.md)، یک پروژه کوچک واقعی طراحی کن که همین مفهوم رو کاربردی نشون بده و برای رزومه ارزش داشته باشه
STEP 3 — وقتی پروژه رو کامل کردم: README حرفه‌ای بنویس (توضیح پروژه، تکنولوژی‌ها، نحوه اجرا) + یک جمله برای بخش «پروژه‌ها»ی رزومه

RULES:
- فقط کد با برچسب "✅ آماده Git" رو بپذیر؛ کد خام یا تست‌نشده رو رد کن
- هر پروژه باید مستقل و قابل نمایش در GitHub باشه، نه فقط تمرین کلاسی
      </div>
    </div>
  );
}