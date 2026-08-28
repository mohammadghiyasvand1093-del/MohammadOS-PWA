import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import LifeWheelChart from "../components/LifeWheelChart";
import { CourseRepository } from "../repositories/CourseRepository";
import { AggregationService } from "../service/aggregationService";
import { getInsights } from "../ai/coachService";
import { recalibrateAllHabits } from "../app/recalibrateHabits";
import { getPersianWeekKey, getLocalDateKey, nowMs, toPersianDate, toPersianNumber, toPersianDateShort } from "../utils/date";

const GRACE_MONTHLY_LIMIT = 2;

const SEVERITY_STYLES = {
  alert: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-400" },
  warning: { bg: "bg-amber-500/10", border: "border-amber-500/30", text: "text-amber-400" },
  info: { bg: "bg-sky-500/10", border: "border-sky-500/30", text: "text-sky-400" },
  success: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", text: "text-emerald-400" },
};

const MOOD_LABELS = {
  1: "😫 خیلی بد",
  2: "😕 بد",
  3: "😐 معمولی",
  4: "🙂 خوب",
  5: "😄 عالی",
};

export default function StatusPage() {
  const [heatMapData, setHeatMapData] = useState([]);
  const [courses, setCourses] = useState([]);
  const [weeklyDayLogs, setWeeklyDayLogs] = useState([]);
  const [vitals, setVitals] = useState({
    streak: 0,
    monthRate: 0,
    avgMood: "-",
    graceUsed: 0,
    graceTotal: GRACE_MONTHLY_LIMIT,
    consistency: 0,
  });
  const [loadingVitals, setLoadingVitals] = useState(true);
  const [toastMessage, setToastMessage] = useState("");
  const [coachInsights, setCoachInsights] = useState([]);
  const [loadingCoach, setLoadingCoach] = useState(true);
  const [recalibrating, setRecalibrating] = useState(false);

  const toastTimeoutRef = useRef(null);

  const todayKey = useMemo(() => getLocalDateKey(new Date(nowMs())), []);
  const currentPeriodKey = useMemo(() => getPersianWeekKey(new Date(nowMs())), []);

  const showToast = useCallback((message) => {
    setToastMessage(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMessage(""), 3000);
  }, []);

  const levelLabelFa = useCallback((level) => {
    switch (level) {
      case 0: return "بدون داده";
      case 1: return "فعال / Grace";
      case 2: return "پیشرفت";
      case 3: return "پیشرفت بالا";
      case 4: return "Full Day";
      default: return "نامشخص";
    }
  }, []);

  const normalizeCourseProgress = useCallback((courseItem) => {
    const totalEpisodes = Number(courseItem.totalEpisodes || 0);
    const currentEpisode = Number(courseItem.currentEpisode || 0);
    let progress = Number(courseItem.progress || 0);

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      if (totalEpisodes > 0) progress = Math.round((currentEpisode / totalEpisodes) * 100);
      else progress = 0;
    }
    progress = Math.max(0, Math.min(100, progress));

    return { ...courseItem, progress, currentEpisode, totalEpisodes };
  }, []);

  const fetchCourses = useCallback(async () => {
    try {
      const coursesWithProgress = await CourseRepository.getAll({
        sortBy: "name",
        order: "asc",
        criticalFirst: true,
        calculateByEpisodesField: true,
      });
      setCourses(coursesWithProgress.map(normalizeCourseProgress));
    } catch (error) {
      console.error("Error loading courses:", error);
    }
  }, [normalizeCourseProgress]);

  const loadWeeklyLogs = useCallback(async () => {
    try {
      const stats = await AggregationService.getWeeklyStats();
      const logs = stats.weeklyDayLogs || [];
      setWeeklyDayLogs(logs);
      return logs;
    } catch (error) {
      console.error("Error loading weekly logs:", error);
      return [];
    }
  }, []);

  const loadHeatmap = useCallback(async () => {
    try {
      const data = await AggregationService.getHeatmapData(90);
      setHeatMapData(data);
    } catch (error) {
      console.error("Error loading heatmap data:", error);
    }
  }, []);

  const loadCoach = useCallback(async (vitalsData, weeklyDayLogsData) => {
    try {
      const [domainTrend, todayStats] = await Promise.all([
        AggregationService.getDomainTrend(6),
        AggregationService.getTodayStats()
      ]);
      
      const weeklyStats = {
        weeklyDayLogs: weeklyDayLogsData,
        moodTrend: weeklyDayLogsData.map(l => l.mood).filter(m => m != null)
      };

      const insights = getInsights(vitalsData, weeklyStats, domainTrend, todayStats?.dayLog);
      setCoachInsights(insights || []);
    } catch (err) {
      console.error("Load coach insights error:", err);
      setCoachInsights([]);
    } finally {
      setLoadingCoach(false);
    }
  }, []);

  const refreshInFlightRef = useRef(null);
  const refreshAll = useCallback(async () => {
    if (refreshInFlightRef.current) return refreshInFlightRef.current;

    const refreshPromise = (async () => {
      try {
        const [, weeklyLogs] = await Promise.all([
          fetchCourses(),
          loadWeeklyLogs(),
          loadHeatmap(),
        ]);
        const vitalsData = await AggregationService.getVitals();
        setVitals(vitalsData);
        setLoadingVitals(false);
        setWeeklyDayLogs(weeklyLogs);
        await loadCoach(vitalsData, weeklyLogs);
      } catch (err) {
        console.error("Error refreshing data:", err);
      }
    })();

    refreshInFlightRef.current = refreshPromise;
    try {
      await refreshPromise;
    } finally {
      refreshInFlightRef.current = null;
    }
  }, [fetchCourses, loadWeeklyLogs, loadHeatmap, loadCoach]);

  useEffect(() => {
    refreshAll();
    
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshAll]);

  const handleRecalibrate = useCallback(async () => {
    if (
      !window.confirm(
        "ریست نرم EMA؟\n\nتمام عادت‌ها به baseline ۰.۵ برمی‌گردند. تاریخ EMA پاک می‌شود.\n\nاین عملیات برگشت‌ناپذیر است."
      )
    )
      return;

    setRecalibrating(true);
    try {
      const result = await recalibrateAllHabits();
      showToast(`✓ ${toPersianNumber(result.count)} عادت به baseline ${result.baseline} ریست شد.`);

      await refreshAll();
    } catch (err) {
      showToast("❌ خطا در ریست EMA");
      console.error(err);
    } finally {
      setRecalibrating(false);
    }
  }, [showToast, refreshAll]);

  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, []);

  const missionConsoleColors = useMemo(
    () => ["#232B36", "#343D4B", "#4FAE87", "#3D8B6F", "#F5A623"],
    []
  );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 text-main space-y-6 relative">
      {toastMessage && (
        <div className="fixed top-5 left-5 bg-card border border-amber-active text-amber-active text-xs font-mono py-2.5 px-4 rounded shadow-lg shadow-black/80 z-50 animate-bounce">
          ⚡ {toastMessage}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-black text-main mb-1">وضعیت و پیشرفت</h2>
        <p className="text-xs text-muted font-mono tracking-widest uppercase mb-6">
          Real Progress • Not Just Busy Hours
        </p>
      </div>

      <LifeWheelChart
        courses={courses}
        dayLogs={weeklyDayLogs}
        periodKey={currentPeriodKey}
        onSaveSuccess={() => showToast("اطلاعات چرخ زندگی با موفقیت ذخیره شد.")}
      />

      <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-card border border-subtle rounded-lg p-4 text-center">
          <div className="text-[10px] font-mono text-muted uppercase mb-1">STREAK</div>
          <div className="text-2xl font-black text-amber-active">
            {loadingVitals ? "—" : toPersianNumber(vitals.streak)}
          </div>
          <div className="text-[9px] font-mono text-muted/50 mt-1">روز متوالی Full Day</div>
        </div>
        <div className="bg-card border border-subtle rounded-lg p-4 text-center">
          <div className="text-[10px] font-mono text-muted uppercase mb-1">MONTH RATE</div>
          <div className="text-2xl font-black text-steel-blue">
            {loadingVitals ? "—" : `${toPersianNumber(vitals.monthRate)}%`}
          </div>
          <div className="text-[9px] font-mono text-muted/50 mt-1">Full Day این ماه</div>
        </div>
        <div className="bg-card border border-subtle rounded-lg p-4 text-center">
          <div className="text-[10px] font-mono text-muted uppercase mb-1">AVG MOOD</div>
          <div className="text-2xl font-black text-sage-green">
            {loadingVitals ? "—" : vitals.avgMood !== "-" ? toPersianNumber(vitals.avgMood) : "—"}
          </div>
          <div className="text-[9px] font-mono text-muted/50 mt-1">میانگین حال روز</div>
        </div>
        <div className="bg-card border border-subtle rounded-lg p-4 text-center">
          <div className="text-[10px] font-mono text-muted uppercase mb-1">GRACE</div>
          <div className="text-2xl font-black text-blue-400">
            {loadingVitals
              ? "—"
              : `${toPersianNumber(vitals.graceUsed)}/${toPersianNumber(vitals.graceTotal)}`}
          </div>
          <div className="text-[9px] font-mono text-muted/50 mt-1">استفاده شده / سقف</div>
        </div>
        <div className="bg-card border border-subtle rounded-lg p-4 text-center">
          <div className="text-[10px] font-mono text-muted uppercase mb-1">CONSISTENCY</div>
          <div className="text-2xl font-black text-purple-400">
            {loadingVitals ? "—" : `${toPersianNumber(vitals.consistency)}%`}
          </div>
          <div className="text-[9px] font-mono text-muted/50 mt-1">Full Day / Expected</div>
        </div>
      </section>

      <section className="bg-card border border-subtle p-4 rounded-lg">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-sm font-mono text-muted uppercase tracking-wider">
              [ ↺ ] BASELINE RECALIBRATION
            </h3>
            <p className="text-[10px] font-mono text-muted/60 mt-1">ریست نرم EMA — بازگشت به ۰.۵</p>
          </div>
          <button
            onClick={handleRecalibrate}
            disabled={recalibrating}
            className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-mono rounded hover:bg-amber-500/20 transition disabled:opacity-50"
          >
            {recalibrating ? "..." : "RECALIBRATE"}
          </button>
        </div>
      </section>

      {/* === WEEKLY MOOD TREND === */}
      <section className="bg-card border border-subtle p-6 rounded-lg">
        <h3 className="text-sm font-mono text-amber-active mb-4 uppercase tracking-wider">
          [ 📈 ] WEEKLY MOOD TREND
        </h3>
        {(() => {
          const moodLogs = weeklyDayLogs
            .filter((log) => log.date <= todayKey && log.mood != null)
            .sort((a, b) => a.date.localeCompare(b.date));

          if (moodLogs.length === 0) {
            return (
              <p className="text-xs font-mono text-os-text/50 w-full text-center py-4">
                NO MOOD DATA THIS WEEK
              </p>
            );
          }

          if (moodLogs.length === 1) {
            const log = moodLogs[0];
            return (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <span className="text-3xl" aria-hidden="true">
                  {(MOOD_LABELS[log.mood] || "😐").split(" ")[0]}
                </span>
                <span className="text-xs font-mono text-sage-green font-bold">
                  {toPersianNumber(log.mood)} / ۵
                </span>
                <span className="text-[9px] font-mono text-muted/60">
                  {toPersianDate(log.date)}
                </span>
              </div>
            );
          }

          return (
            <div className="flex items-end justify-between gap-3 h-32 px-2">
              {moodLogs.map((log) => (
                <div key={log.date} className="flex flex-col items-center gap-2 flex-1">
                  <div className="text-xs font-mono text-sage-green font-bold">
                    {toPersianNumber(log.mood)}
                  </div>
                  <div
                    className="w-full bg-sage-green/40 rounded-t transition-all"
                    style={{ height: `${(log.mood / 5) * 100}%` }}
                  />
                  <span className="text-[9px] font-mono text-muted/60">
                    {toPersianDateShort(log.date)}
                  </span>
                </div>
              ))}
            </div>
          );
        })()}
      </section>

      {/* === COACH INSIGHTS === */}
      <section className="bg-card border border-subtle p-6 rounded-lg">
        <h3 className="text-sm font-mono text-amber-active mb-4 uppercase tracking-wider">
          [ 🧠 ] COACH INSIGHTS
        </h3>
        {loadingCoach ? (
          <p className="text-xs font-mono text-os-text/50 text-center py-4">ANALYZING DATA...</p>
        ) : !coachInsights || coachInsights.length === 0 ? (
          <p className="text-xs font-mono text-os-text/50 text-center py-4">
            NO CRITICAL INSIGHTS. YOU ARE ON TRACK.
          </p>
        ) : (
          <div className="space-y-3">
            {coachInsights.map((insight, idx) => {
              const style = SEVERITY_STYLES[insight.severity] || SEVERITY_STYLES.info;
              return (
                <div key={idx} className={`p-3 rounded-lg border ${style.bg} ${style.border}`}>
                  <div className="flex items-start gap-3">
                    <span className="text-lg">{insight.icon}</span>
                    <div className="flex-1">
                      <h4 className={`text-sm font-bold ${style.text}`}>{insight.title}</h4>
                      <p className="text-xs text-main/80 mt-1">{insight.message}</p>
                      {insight.action && (
                        <p className="text-[10px] font-mono text-muted/70 mt-2">→ {insight.action}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-card border border-subtle p-6 rounded-lg">
        <h3 className="text-sm font-mono text-amber-active mb-4 uppercase tracking-wider">
          [ 📊 ] DISCIPLINE HEATMAP (Last 90 Days)
        </h3>
        {heatMapData.length > 0 ? (
          <div className="overflow-x-auto pt-8">
            <div className="min-w-[860px] heatmap-rtl-fix">
              <ActivityCalendar
                data={heatMapData}
                colors={missionConsoleColors}
                blockSize={14}
                blockMargin={5}
                renderBlock={(block, activity) => {
                  const date = activity?.date;
                  const level = activity?.level ?? activity?.count ?? 0;
                  const title = date ? `${toPersianDate(date)} • ${levelLabelFa(level)}` : "";
                  return (
                    <g
                      key={
                        date
                          ? `activity-${date}`
                          : `empty-${block?.props?.x ?? 0}-${block?.props?.y ?? 0}`
                      }
                    >
                      <title>{title}</title>
                      {block}
                    </g>
                  );
                }}
                labels={{
                  months: [
                    "فروردین",
                    "اردیبهشت",
                    "خرداد",
                    "تیر",
                    "مرداد",
                    "شهریور",
                    "مهر",
                    "آبان",
                    "آذر",
                    "دی",
                    "بهمن",
                    "اسفند",
                  ],
                  weekdays: ["ش", "ی", "د", "س", "چ", "پ", "ج"],
                  legend: { less: "کم", more: "کامل" },
                }}
                theme={{ dark: missionConsoleColors, light: missionConsoleColors }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-muted">CALCULATING DATA METRICS...</p>
        )}
      </section>
    </div>
  );
}
