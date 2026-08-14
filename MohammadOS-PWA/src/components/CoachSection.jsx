import { useState } from "react";
import { runEveningReview, runWeeklyAnalysis, runMonthlyReview, isAvalAIConfigured } from "../ai/coachService.js";

function useAsyncAction() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState("");

  const run = async (fn) => {
    setLoading(true);
    setError(null);
    try {
      const text = await fn();
      setResult(text);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return { loading, error, result, run, clear: () => { setResult(""); setError(null); } };
}

/**
 * CoachSection — Batch 8.5
 * Pure presentational component. All data arrives via props from parent (StatusPage).
 * No imports from aggregationService or repositories.
 *
 * Props:
 *   todayLog      — current day log object (for evening review)
 *   weeklyDayLogs — array of 7 day logs (for weekly analysis)
 *   monthLogs     — array of day logs for current month (for monthly review)
 *   roadmapStatus — array of roadmap items (optional, for monthly review)
 */
export default function CoachSection({ todayLog, weeklyDayLogs = [], monthLogs = [], roadmapStatus = [] }) {
  const evening = useAsyncAction();
  const weekly = useAsyncAction();
  const monthly = useAsyncAction();
  const [activeTab, setActiveTab] = useState("evening");
  const configured = isAvalAIConfigured();

  const handleEvening = () => {
    evening.run(() => runEveningReview(todayLog));
  };

  const handleWeekly = () => {
    weekly.run(() => runWeeklyAnalysis(weeklyDayLogs));
  };

  const handleMonthly = () => {
    monthly.run(() => runMonthlyReview(monthLogs, roadmapStatus));
  };

  const active = activeTab === "evening" ? evening : activeTab === "weekly" ? weekly : monthly;
  const hasData = activeTab === "evening" ? Boolean(todayLog) : activeTab === "weekly" ? weeklyDayLogs.length > 0 : monthLogs.length > 0;

  return (
    <div className="mt-6 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-amber-400 tracking-wider uppercase">
          🤖 AI Coach {configured ? "(AvalAI)" : "(Offline)"}
        </h3>
        {!configured && (
          <span className="text-[10px] text-slate-400 border border-slate-600 px-2 py-0.5 rounded">
            API Key تنظیم نشده
          </span>
        )}
      </div>

      <div className="flex gap-2 mb-3">
        {[
          { key: "evening", label: "امشب", icon: "🌙" },
          { key: "weekly", label: "هفتگی", icon: "📊" },
          { key: "monthly", label: "ماهانه", icon: "📅" },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
              activeTab === tab.key
                ? "bg-amber-500/20 border-amber-500 text-amber-300"
                : "bg-transparent border-slate-700 text-slate-400 hover:border-slate-500"
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-3">
        <button
          onClick={activeTab === "evening" ? handleEvening : activeTab === "weekly" ? handleWeekly : handleMonthly}
          disabled={active.loading || !hasData}
          className="flex-1 py-2 text-xs font-bold rounded bg-amber-500 hover:bg-amber-400 text-black transition-colors disabled:opacity-50"
        >
          {active.loading ? "در حال تحلیل..." : !hasData ? "داده‌ای موجود نیست" : "دریافت تحلیل"}
        </button>
        {active.result && (
          <button
            onClick={active.clear}
            className="px-3 py-2 text-xs rounded border border-slate-600 text-slate-300 hover:bg-slate-800"
          >
            پاک کردن
          </button>
        )}
      </div>

      {active.result && (
        <div className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed bg-slate-900/50 p-3 rounded border border-slate-700">
          {active.result}
        </div>
      )}

      {active.error && (
        <div className="text-xs text-red-400 mt-2">{active.error}</div>
      )}
    </div>
  );
}