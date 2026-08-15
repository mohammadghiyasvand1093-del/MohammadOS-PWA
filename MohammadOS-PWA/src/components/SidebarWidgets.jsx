import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { AggregationService } from "../service/aggregationService";
import { nowMs } from "../utils/date";

const MOOD_EMOJIS = {
  1: "😫", 2: "😕", 3: "😐", 4: "🙂", 5: "😄",
};

function formatShortMs(ms) {
  if (isNaN(ms) || ms < 0) return "00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ✅ Batch 60: Helper for formatting elapsed time in minutes/hours
function formatDuration(ms) {
  if (!ms || ms < 0) return "۰ دقیقه";
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h > 0) return `${h} ساعت و ${min} دقیقه`;
  return `${min} دقیقه`;
}

// ═══════════════════════════════════════════
// بچ ۶۶ — Theme Toggle (Segmented Control)
// ۳ حالت: Dark / Light / System
// ═══════════════════════════════════════════
function ThemeToggle() {
  const [current, setCurrent] = useState(() => {
    return localStorage.getItem("mohammados_theme") || "system";
  });

  const setMode = useCallback((mode) => {
    setCurrent(mode);
    localStorage.setItem("mohammados_theme", mode);
    // ارسال CustomEvent به App.jsx برای sync
    window.dispatchEvent(new CustomEvent("mohammados-theme-change", { detail: mode }));
  }, []);

  // Cross-tab sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === "mohammados_theme" && e.newValue) {
        setCurrent(e.newValue);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const options = [
    { id: "dark",   icon: "🌙", label: "تاریک" },
    { id: "light",  icon: "☀️", label: "روشن" },
    { id: "system", icon: "🖥️", label: "سیستم" },
  ];

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-os-bg/60 border border-os-border/40" role="radiogroup" aria-label="انتخاب تم">
      {options.map((opt) => {
        const isActive = current === opt.id;
        return (
          <button
            key={opt.id}
            onClick={() => setMode(opt.id)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-[10px] font-bold transition-all duration-200 border ${
              isActive
                ? "bg-os-accent/15 text-os-accent border-os-accent/30 shadow-[0_0_8px_color-mix(in_srgb,var(--color-os-accent)_15%,transparent)]"
                : "text-os-text/40 hover:text-os-text/70 border-transparent hover:bg-os-border/20"
            }`}
            title={opt.label}
            aria-label={`تم: ${opt.label}`}
            aria-pressed={isActive}
            role="radio"
          >
            <span className="text-xs" aria-hidden="true">{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function SidebarWidgets() {
  const navigate = useNavigate();
  
  const [streak, setStreak] = useState(0);
  const [todayRate, setTodayRate] = useState(0);
  const [mood, setMood] = useState(null);
  const [graceUsed, setGraceUsed] = useState(0);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [todayFullDay, setTodayFullDay] = useState(false);
  
  // ✅ Batch 60: State for nearby events banner
  const [nearby, setNearby] = useState(null);
  
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const stats = await AggregationService.getTodayStats();
        if (!mounted) return;
        
        setStreak(stats.streak ?? 0);
        setTodayRate(stats.fullDayScore ?? 0);
        setTodayFullDay(stats.dayLog?.fullDay ?? (stats.fullDayScore >= 90));
        setMood(stats.mood ?? null);
        setGraceUsed(stats.graceUsed ?? 0);
        
        if (stats.timer) {
          setActiveTimer(stats.timer);
          setElapsed(stats.elapsedMs ?? 0);
        } else {
          setActiveTimer(null);
          setElapsed(0);
        }

        // ✅ Batch 60: Calculate nearby events efficiently within the same fetch
        const habits = stats?.dayLog?.habits || stats?.dayLog?.entries || [];
        const undone = habits.filter(h => !h.done);
        const hasTimer = stats?.timer?.isRunning || false;
        const hasUndone = undone.length > 0;
        
        if (!hasTimer && !hasUndone) {
          setNearby(null);
        } else {
          setNearby({
            hasTimer,
            elapsedMs: stats?.elapsedMs || 0,
            undoneTotal: undone.length,
            undoneCritical: undone.filter(h => h.isCritical).length,
          });
        }
      } catch (err) {
        console.error("SidebarWidgets load error:", err);
      }
    }

    fetchData();
    const dataInterval = setInterval(fetchData, 30000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mounted = false;
      clearInterval(dataInterval);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (activeTimer?.isRunning) {
      timerIntervalRef.current = setInterval(() => {
        const start = activeTimer.startTime || 0;
        const accumulated = activeTimer.accumulatedTime || 0;
        setElapsed(accumulated + (nowMs() - start));
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeTimer]);

  const moodEmoji = mood ? MOOD_EMOJIS[mood] || "❓" : "—";

  const graceColor = graceUsed >= 2 ? "text-red-400" 
    : graceUsed > 0 ? "text-amber-400" 
    : "text-emerald-400";

  return (
    <div className="mb-4 space-y-2" role="complementary" aria-label="ویجت‌های وضعیت">
      
      {/* ═══════════════════════════════════════════
          بچ ۶۶ — Theme Toggle (Segmented Control)
          ═══════════════════════════════════════════ */}
      <ThemeToggle />

      {/* ✅ Batch 60: رویدادهای نزدیک (Nearby Events Banner) */}
      {nearby && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-2 mb-4">
          <div className="text-[10px] font-mono text-os-accent uppercase tracking-wider mb-1">
            [ ⚡ ] رویدادهای نزدیک
          </div>
          
          {nearby.hasTimer && (
            <button 
              onClick={() => navigate("/")} // ✅ Nazer 2 Fix
              className="w-full flex items-center gap-2 rounded bg-os-card border border-os-border p-2 hover:border-amber-500/50 transition text-left"
            >
              <span className="text-lg">⏱️</span>
              <div className="flex-1">
                <div className="text-xs font-bold text-os-text">تایمر فعال</div>
                <div className="text-[10px] font-mono text-os-text/60">{formatDuration(nearby.elapsedMs)} گذشته</div>
              </div>
              <span className="text-[10px] font-mono text-os-accent">برو →</span>
            </button>
          )}
          
          {nearby.undoneCritical > 0 && (
            <button 
              onClick={() => navigate("/")} // ✅ Nazer 2 Fix
              className="w-full flex items-center gap-2 rounded bg-os-card border border-red-500/30 p-2 hover:border-red-500/50 transition text-left"
            >
              <span className="text-lg">🔴</span>
              <div className="flex-1">
                <div className="text-xs font-bold text-red-400">{nearby.undoneCritical} ماموریت بحرانی مانده</div>
                <div className="text-[10px] font-mono text-os-text/60">بدون این‌ها Full Day نمی‌شود</div>
              </div>
              <span className="text-[10px] font-mono text-os-accent">برو →</span>
            </button>
          )}
          
          {nearby.undoneTotal > 0 && nearby.undoneCritical === 0 && (
            <button 
              onClick={() => navigate("/")} // ✅ Nazer 2 Fix
              className="w-full flex items-center gap-2 rounded bg-os-card border border-os-border p-2 hover:border-amber-500/50 transition text-left"
            >
              <span className="text-lg">📝</span>
              <div className="flex-1">
                <div className="text-xs font-bold text-os-text">{nearby.undoneTotal} عادت انجام نشده</div>
              </div>
              <span className="text-[10px] font-mono text-os-accent">برو →</span>
            </button>
          )}
        </div>
      )}

      {/* Streak */}
      <div className="bg-os-bg/60 border border-os-border/40 rounded-lg p-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[9px] font-mono text-os-text/40 uppercase tracking-wider" aria-hidden="true">
            🔥 Streak
          </span>
          <span className="text-lg font-black text-os-accent font-mono" aria-live="polite" aria-atomic="true" aria-label={`استریک: ${streak} روز`}>
            {streak}
          </span>
        </div>
        {/* ✅ Batch 46: Streak Hint */}
        {!todayFullDay && streak > 0 && (
          <p className="text-[9px] text-os-text/30 mb-2 text-right leading-tight">
            بر اساس دیروز — امروز هنوز در جریانه
          </p>
        )}
        <div 
          className="w-full bg-os-border/30 rounded-full h-1.5" 
          role="progressbar" 
          aria-valuenow={streak} 
          aria-valuemin="0" 
          aria-valuemax={50}
          aria-label="پیشرفت استریک"
        >
          <div
            className="bg-os-accent h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(streak * 2, 100)}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Today Rate */}
      <div className="bg-os-bg/60 border border-os-border/40 rounded-lg p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] font-mono text-os-text/40 uppercase tracking-wider" aria-hidden="true">
            🎯 Today
          </span>
          <span className="text-sm font-bold text-os-accent font-mono" aria-live="polite" aria-atomic="true" aria-label={`پیشرفت امروز: ${todayRate} درصد`}>
            {todayRate}%
          </span>
        </div>
        <div className="w-full bg-os-border/30 rounded-full h-1.5" role="progressbar" aria-valuenow={todayRate} aria-valuemin="0" aria-valuemax="100" aria-label="پیشرفت Full Day">
          <div
            className="bg-os-accent h-1.5 rounded-full transition-all duration-500"
            style={{ width: `${todayRate}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {/* Mood */}
      <div className="bg-os-bg/60 border border-os-border/40 rounded-lg p-3 flex items-center justify-between">
        <span className="text-[9px] font-mono text-os-text/40 uppercase tracking-wider" aria-hidden="true">
          😊 Mood
        </span>
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">{moodEmoji}</span>
          <span className="text-sm font-bold text-emerald-400 font-mono" aria-live="polite" aria-atomic="true" aria-label={`حال روز: ${mood || "ثبت نشده"}`}>
            {mood || "—"}
          </span>
        </div>
      </div>

      {/* Grace */}
      <div className="bg-os-bg/60 border border-os-border/40 rounded-lg p-3 flex items-center justify-between">
        <span className="text-[9px] font-mono text-os-text/40 uppercase tracking-wider" aria-hidden="true">
          ❄️ Grace
        </span>
        <span className={`text-sm font-bold font-mono ${graceColor}`} aria-live="polite" aria-atomic="true" aria-label={`Grace Day استفاده شده: ${graceUsed} از ۲`}>
          {graceUsed}/2
        </span>
      </div>

      {/* Active Timer */}
      {activeTimer && (
        <div className="bg-os-accent/10 border border-os-accent/30 rounded-lg p-3" role="status" aria-live="off">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-mono text-os-accent uppercase tracking-wider" aria-hidden="true">
              🟢 Timer
            </span>
            <span className="text-sm font-bold text-os-accent font-mono" aria-label={`زمان سپری شده: ${formatShortMs(elapsed)}`}>
              {formatShortMs(elapsed)}
            </span>
          </div>
          <p className="text-[10px] text-os-text/60 truncate">
            در حال اجرا...
          </p>
        </div>
      )}
    </div>
  );
}