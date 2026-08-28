// src/pages/SchedulePage.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { DayLogRepository } from "../repositories/DayLogRepository";
import { exportScheduleToIcs } from "../app/exportSchedule";
import { nowMs } from "../utils/date";
import { SCHEDULE_MODES } from "../utils/schedule";

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
};

const dayNamesEn = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const dayNamesFa = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"];
const weekDaysShort = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const satToSunMap = [6, 0, 1, 2, 3, 4, 5];

function getWeekDates(referenceDate = new Date(), offset = 0) {
  const d = new Date(referenceDate);
  d.setDate(d.getDate() + offset * 7);
  const day = d.getDay();
  const diff = d.getDate() - (day === 6 ? 0 : day + 1);
  const saturday = new Date(d.setDate(diff));
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(saturday);
    date.setDate(saturday.getDate() + i);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const dayNum = String(date.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${dayNum}`);
  }
  return dates;
}

export default function SchedulePage() {
  const navigate = useNavigate();
  const [currentTime, setCurrentTime] = useState(new Date(nowMs()));
  const [error, setError] = useState(null);
  const [icsStatus, setIcsStatus] = useState("");
  const [icsMode, setIcsMode] = useState(SCHEDULE_MODES.WEEKLY);

  const todayDateKey = useMemo(() => {
    const d = new Date(currentTime);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }, [currentTime]);

  const todayIdxSatStart = useMemo(() => {
    const d = new Date(currentTime).getDay();
    return d === 6 ? 0 : d + 1;
  }, [currentTime]);

  const [schedule, setSchedule] = useState([]);
  const [scheduleSource, setScheduleSource] = useState("none");
  const [isSaved, setIsSaved] = useState(false);
  const [weekStatus, setWeekStatus] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(todayIdxSatStart);
  const [weekOffset, setWeekOffset] = useState(0);

  const weekDates = useMemo(() => getWeekDates(new Date(nowMs()), weekOffset), [weekOffset]);
  const selectedDateKey = weekDates[selectedIndex];
  const selectedDayEn = dayNamesEn[satToSunMap[selectedIndex]];
  const selectedDayFa = dayNamesFa[satToSunMap[selectedIndex]];
  const isTodaySelected = selectedDateKey === todayDateKey;

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date(nowMs())), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadSelectedSchedule() {
      try {
        // ✅ FIX Bug #1: Query by selectedDateKey so dated schedules
        // and weekly templates both resolve correctly per week offset.
        const data = await ScheduleRepository.getScheduleForDate(selectedDateKey, selectedDayEn);
        if (data && Array.isArray(data.schedule)) {
          setSchedule(data.schedule);
          setScheduleSource(data.source || "none");
          setIsSaved(true);
        } else {
          setSchedule([]);
          setScheduleSource("none");
          setIsSaved(false);
        }
      } catch (err) {
        console.error("Load schedule error:", err);
        setError("خطا در بارگذاری برنامه: " + (err.message || "خطای نامشخص"));
      }
    }
    loadSelectedSchedule();
  }, [selectedDateKey, selectedDayEn]);

  useEffect(() => {
    async function loadWeekStatus() {
      try {
        const today = new Date(todayDateKey + "T00:00:00");
        today.setHours(0, 0, 0, 0);

        const statusList = await Promise.all(
          weekDates.map(async (dateKey, idx) => {
            try {
              const checkDate = new Date(dateKey + "T00:00:00");
              checkDate.setHours(0, 0, 0, 0);
              const dayEn = dayNamesEn[satToSunMap[idx]];
              
              if (dayEn === "friday") return { dateKey, status: "rest", done: 0, total: 0, fullDay: false };
              if (checkDate > today) return { dateKey, status: "future", done: 0, total: 0, fullDay: false };

              const log = await DayLogRepository.getOrCreateByDate(dateKey, dayEn);
              if (!log) return { dateKey, status: "none", done: 0, total: 0, fullDay: false };

              const total = log.entries.length;
              const done = log.entries.filter((e) => e.done).length;

              let status = "none";
              if (log.status === "frozen") status = "frozen";
              else if (log.fullDay) status = "full";
              else if (done > 0) status = "partial";
              else if (checkDate.getTime() === today.getTime()) status = "active";

              return { dateKey, status, done: done || 0, total: total || 0, fullDay: log.fullDay };
            } catch {
              return { dateKey, status: "none", done: 0, total: 0, fullDay: false };
            }
          })
        );
        setWeekStatus(statusList);
      } catch (err) {
        console.error("Load week status error:", err);
      }
    }
    loadWeekStatus();
  }, [weekDates, todayDateKey]);

  const weeklySummary = useMemo(() => {
    if (weekStatus.length === 0) return null;
    const scoringDays = weekStatus.filter((d, idx) => dayNamesEn[satToSunMap[idx]] !== "friday");
    return {
      full: scoringDays.filter((d) => d.status === "full").length,
      partial: scoringDays.filter((d) => d.status === "partial").length,
      none: scoringDays.filter((d) => d.status === "none").length,
      frozen: scoringDays.filter((d) => d.status === "frozen").length,
    };
  }, [weekStatus]);

  const { progressPercent, dotX, dotY } = useMemo(() => {
    const currentMin = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startDay = schedule.length > 0 && schedule[0]?.startTime ? timeToMinutes(schedule[0].startTime) : 480;
    const endDay = schedule.length > 0 && schedule[schedule.length - 1]?.endTime ? timeToMinutes(schedule[schedule.length - 1].endTime) : 1320;
    const total = Math.max(1, endDay - startDay);
    const progress = Math.min(1, Math.max(0, (currentMin - startDay) / total));
    const angle = 180 - progress * 180;
    const rad = (angle * Math.PI) / 180;
    return {
      progressPercent: progress,
      dotX: 50 + 45 * Math.cos(rad),
      dotY: 50 - 45 * Math.sin(rad),
    };
  }, [currentTime, schedule]);

  const typeConfig = {
    course: { color: "var(--color-os-steel)", label: "آموزش", bg: "rgba(79, 168, 224, 0.1)" },
    fixed: { color: "#F87171", label: "ثابت", bg: "rgba(248, 113, 113, 0.1)" },
    habit: { color: "#34D399", label: "عادت", bg: "rgba(52, 211, 153, 0.1)" },
    break: { color: "var(--color-os-border)", label: "استراحت", bg: "rgba(35, 43, 54, 0.2)" },
    event: { color: "#A78BFA", label: "رویداد", bg: "rgba(167, 139, 250, 0.1)" },
  };

  const statusConfig = {
    full: { color: "#34D399", label: "Full Day" },
    partial: { color: "#FBBF24", label: "Partial" },
    active: { color: "#F5A623", label: "In Progress" },
    none: { color: "#F87171", label: "None" },
    future: { color: "#6B7280", label: "Future" },
    frozen: { color: "#60A5FA", label: "Grace" },
    rest: { color: "#8B5CF6", label: "Rest Day" },
  };

  const handleExportIcs = async () => {
    setIcsStatus("در حال ساخت فایل تقویم...");
    try {
      await exportScheduleToIcs({
        mode: icsMode,
        ...(icsMode === SCHEDULE_MODES.DATED
          ? { startDate: weekDates[0], endDate: weekDates[6] }
          : {}),
      });
      setIcsStatus("✅ فایل .ICS با موفقیت دانلود شد!");
    } catch (err) {
      if (err.message === "NO_SCHEDULE_DATA") {
        setIcsStatus("❌ هیچ برنامه‌ای برای خروجی وجود ندارد.");
      } else {
        setIcsStatus("❌ خطا در ساخت فایل: " + err.message);
      }
    } finally {
      setTimeout(() => setIcsStatus(""), 4000);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 font-vazir rtl text-os-text">
      <div className="flex flex-col items-center mb-8">
        <svg viewBox="0 0 100 55" className="w-72 h-36 mb-4">
          <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke="var(--color-os-border)" strokeWidth="3" strokeLinecap="round" />
          <path d="M 5 50 A 45 45 0 0 1 95 50" fill="none" stroke="var(--color-os-text)" strokeWidth="1.5" strokeLinecap="round" strokeDasharray={`${progressPercent * 141} 141`} className="transition-all duration-1000 ease-linear opacity-50" />
          <circle cx={dotX} cy={dotY} r="3" fill="var(--color-os-accent)" className="drop-shadow-[0_0_10px_var(--color-os-accent)]" />
        </svg>
        <div className="text-center">
          <h1 className="text-3xl font-black mb-1">کنسول مأموریت: {selectedDayFa}</h1>
          <p className="font-mono text-[10px] tracking-[0.3em] text-os-accent uppercase">Operational Status: Optimal</p>
          {isSaved && <p className="mt-2 text-[10px] font-mono text-green-400/70">
            LOCAL SCHEDULE SYNCED · {scheduleSource === "dated_plan" ? "DATED PLAN" : scheduleSource === "one_off_event" ? "ONE-OFF EVENT" : "WEEKLY TEMPLATE"}
          </p>}
        </div>
      </div>

      {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-center text-sm">{error}</div>}

      <div className="flex justify-between items-center mb-4 bg-os-card border border-os-border rounded-lg p-3">
        <button onClick={() => setWeekOffset((o) => o - 1)} className="text-xs font-mono text-os-text/60 hover:text-os-accent transition px-3 py-1 rounded border border-os-border/50 hover:border-os-accent">
          ← هفته قبل
        </button>
        <span className="text-sm font-bold font-mono text-os-text">
          {weekOffset === 0 ? "📅 این هفته" : weekOffset === 1 ? "📅 هفته بعد" : weekOffset === -1 ? "📅 هفته قبل" : `📅 هفته ${weekOffset > 0 ? "+" : ""}${weekOffset}`}
        </span>
        <button onClick={() => setWeekOffset((o) => o + 1)} className="text-xs font-mono text-os-text/60 hover:text-os-accent transition px-3 py-1 rounded border border-os-border/50 hover:border-os-accent">
          هفته بعد →
        </button>
      </div>

      {weeklySummary && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
            <div className="text-[10px] font-mono text-os-text/40 uppercase mb-1">FULL DAYS</div>
            <div className="text-2xl font-black text-emerald-400">{weeklySummary.full}</div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
            <div className="text-[10px] font-mono text-os-text/40 uppercase mb-1">PARTIAL</div>
            <div className="text-2xl font-black text-amber-400">{weeklySummary.partial}</div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
            <div className="text-[10px] font-mono text-os-text/40 uppercase mb-1">MISSED</div>
            <div className="text-2xl font-black text-red-400">{weeklySummary.none}</div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
            <div className="text-[10px] font-mono text-os-text/40 uppercase mb-1">GRACE</div>
            <div className="text-2xl font-black text-blue-400">{weeklySummary.frozen}</div>
          </div>
        </div>
      )}

      <div className="mb-8 p-4 bg-os-card border border-os-border rounded-lg">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-mono text-os-accent text-left">[ ◈ ] WEEK CONSOLE</h3>
          <button onClick={() => navigate(`/?date=${selectedDateKey}`)} className="text-[10px] font-mono text-os-accent border border-os-accent/30 px-2 py-1 rounded hover:bg-os-accent/10 transition">
            مشاهده در Today →
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {weekStatus.map((day, index) => {
            const cfg = statusConfig[day.status] || statusConfig.future;
            const isSelected = index === selectedIndex;
            const isToday = day.dateKey === todayDateKey;
            return (
              <button
                key={day.dateKey}
                onClick={() => setSelectedIndex(index)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:scale-105 ${
                  isSelected ? "ring-2 ring-os-accent border-os-accent bg-os-accent/10 shadow-[0_0_10px_rgba(245,166,35,0.15)]" : isToday ? "border-os-accent/50 bg-os-accent/5" : "border-os-border/50 bg-os-bg/50 hover:border-os-border"
                }`}
                title={`${day.dateKey} — ${cfg.label} (${day.done}/${day.total})`}
              >
                <span className="text-[10px] font-mono text-os-text/50">{weekDaysShort[index]}</span>
                <span className="w-5 h-5 rounded-full inline-block" style={{ backgroundColor: cfg.color }} aria-hidden="true" />
                <span className="text-[9px] font-mono text-os-text/40">{day.done}/{day.total}</span>
                {isToday && <span className="w-1 h-1 rounded-full bg-os-accent mt-0.5"></span>}
              </button>
            );
          })}
        </div>
        <div className="flex justify-center gap-3 mt-3 text-[9px] font-mono text-os-text/40 flex-wrap">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.full.color }}></span> Full</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.partial.color }}></span> Partial</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.active.color }}></span> Active</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.none.color }}></span> None</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.future.color }}></span> Future</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.frozen.color }}></span> Grace</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full inline-block" style={{ backgroundColor: statusConfig.rest.color }}></span> Rest</span>
        </div>
      </div>

      <div className="space-y-3 mb-12">
        {schedule.length > 0 ? (
          schedule.map((block, index) => {
            const currentMin = currentTime.getHours() * 60 + currentTime.getMinutes();
            const blockStart = timeToMinutes(block.startTime);
            const blockEnd = timeToMinutes(block.endTime);
            const isActive = isTodaySelected && currentMin >= blockStart && currentMin < blockEnd;
            const isPast = isTodaySelected && currentMin >= blockEnd;
            const cfg = typeConfig[block.type] || typeConfig.break;

            return (
              <div
                key={`${block.title}-${block.startTime}-${index}`}
                className={`flex items-center bg-os-card border border-os-border rounded-lg overflow-hidden transition-all duration-500 ${
                  isActive ? "ring-1 ring-os-accent border-os-accent/40 shadow-[0_0_20px_rgba(245,166,35,0.1)] scale-[1.01]" : isPast ? "opacity-30 grayscale-[0.5]" : "opacity-90"
                }`}
              >
                <div className="w-1.5 self-stretch" style={{ backgroundColor: cfg.color }}></div>
                <div dir="ltr" className="w-24 px-4 py-4 border-l border-os-border/50 text-center flex flex-col justify-center">
                  <span className="font-mono font-bold text-sm">{block.startTime || "--:--"}</span>
                  <span className="font-mono text-[10px] opacity-40">{block.endTime || "--:--"}</span>
                </div>
                <div className="flex-1 px-5 py-4 flex items-center justify-between">
                  <div>
                    <h3 className={`text-base font-bold ${isActive ? "text-os-accent" : "text-os-text"}`}>{block.title || block.name || "بدون عنوان"}</h3>
                    {isActive && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-os-accent animate-ping"></span>
                        <span className="text-[10px] text-os-accent font-mono">ACTIVE MISSION</span>
                      </div>
                    )}
                  </div>
                  <span className="text-[9px] font-bold px-2.5 py-1 rounded border" style={{ color: cfg.color, borderColor: `${cfg.color}44`, backgroundColor: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-os-card text-center py-16 opacity-50 border border-os-border rounded-lg">
            <p className="font-mono text-sm tracking-widest uppercase">No Active Trajectory Found</p>
            <p className="text-xs text-os-text/40 mt-2">برنامه‌ای برای {selectedDayFa} ثبت نشده است.</p>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-os-border pt-8">
        <label className="block text-xs font-mono text-os-text/60">
          نوع خروجی تقویم
          <select
            value={icsMode}
            onChange={(event) => setIcsMode(event.target.value)}
            className="mt-2 w-full p-3 rounded-md bg-os-bg border border-os-border text-os-text"
          >
            <option value={SCHEDULE_MODES.WEEKLY}>الگوی هفتگی</option>
            <option value={SCHEDULE_MODES.DATED}>برنامه تاریخ‌محور همین هفته</option>
          </select>
        </label>
        <button
          onClick={handleExportIcs}
          className="w-full p-3 rounded-md font-mono text-sm border border-os-border text-os-text hover:bg-os-card transition flex items-center justify-center gap-2"
        >
          [ ⬇ ] EXPORT WEEK TO .ICS
        </button>
        {icsStatus && <p className="text-center text-xs text-os-accent font-mono">{icsStatus}</p>}
      </div>
    </div>
  );
}
