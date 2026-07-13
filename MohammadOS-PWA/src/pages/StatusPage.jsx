import { useState, useEffect, useMemo, useCallback } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import { db } from "../db/database";
import CoachReportModal from "../components/CoachReportModal";
import LifeWheelChart from "../components/LifeWheelChart";
import { runWeeklyAnalysis } from "../ai/coachService";
import { exportToCSV, exportToJSON } from "../app/exportData";
import { CourseRepository } from "../repositories/CourseRepository";

export default function StatusPage() {
  const [heatMapData, setHeatMapData] = useState([]);
  const [courses, setCourses] = useState([]);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [dashboardSummary, setDashboardSummary] = useState(null);

  const [weeklyStats, setWeeklyStats] = useState({
    fullDays: 0,
    outcomeRatio: 0,
    totalTasks: 0,
    doneTasks: 0,
  });

  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [coachReport, setCoachReport] = useState(null);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

  const [isExporting, setIsExporting] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [toastType, setToastType] = useState("success");

  const showToast = useCallback((message, type = "success") => {
    setToastMessage(message);
    setToastType(type);
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timer = window.setTimeout(() => {
      setToastMessage("");
    }, 3000);

    return () => window.clearTimeout(timer);
  }, [toastMessage]);

  const formatPersianDate = useCallback((isoDate) => {
    try {
      const [y, m, d] = isoDate.split("-").map(Number);
      const dt = new Date(Date.UTC(y, m - 1, d));

      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
    } catch {
      return isoDate;
    }
  }, []);

  const levelLabelFa = useCallback((level) => {
    switch (level) {
      case 0:
        return "بدون داده";
      case 1:
        return "فعال / Grace";
      case 2:
        return "پیشرفت";
      case 3:
        return "پیشرفت بالا";
      case 4:
        return "Full Day";
      default:
        return "نامشخص";
    }
  }, []);

  useEffect(() => {
    async function fetchCourses() {
      try {
        setIsLoadingCourses(true);
        const coursesWithProgress = await CourseRepository.getAll({
          sortBy: "name",
          order: "asc",
          criticalFirst: true,
        });

        setCourses(coursesWithProgress);
      } catch (error) {
        console.error("Error loading courses:", error);
        showToast("خطا در بارگذاری دوره‌ها", "error");
      } finally {
        setIsLoadingCourses(false);
      }
    }

    fetchCourses();
  }, [showToast]);

  useEffect(() => {
    async function loadDashboardSummary() {
      try {
        const summary = await CourseRepository.getDashboardSummary();
        setDashboardSummary(summary);
      } catch (error) {
        console.error("Error loading dashboard summary:", error);
      }
    }

    loadDashboardSummary();
  }, []);

  useEffect(() => {
    async function calculateWeeklyStats() {
      try {
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setHours(0, 0, 0, 0);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const startDateStr = startOfWeek.toISOString().split("T")[0];
        const endDateStr = endOfWeek.toISOString().split("T")[0];

        const logs = await db.dayLogs
          .where("date")
          .between(startDateStr, endDateStr, true, true)
          .toArray();

        const fullDays = logs.filter((log) => log.fullDay).length;

        let totalTasks = 0;
        let doneTasks = 0;

        logs.forEach((log) => {
          if (Array.isArray(log.entries)) {
            totalTasks += log.entries.length;
            doneTasks += log.entries.filter((entry) => entry.done).length;
          }
        });

        const outcomeRatio =
          totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 10) / 10 : 0;

        setWeeklyStats({
          fullDays,
          outcomeRatio,
          totalTasks,
          doneTasks,
        });
      } catch (error) {
        console.error("Error calculating weekly stats:", error);
      }
    }

    calculateWeeklyStats();
  }, []);

  useEffect(() => {
    async function loadHeatmap() {
      try {
        const logs = await db.dayLogs.toArray();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const last90Days = [];

        for (let i = 89; i >= 0; i--) {
          const currentDate = new Date(today);
          currentDate.setDate(today.getDate() - i);
          const dateStr = currentDate.toISOString().split("T")[0];

          const log = logs.find((item) => item.date === dateStr);
          let level = 0;

          if (log) {
            if (log.status === "frozen") {
              level = 1;
            } else if (log.fullDay) {
              level = 4;
            } else if (
              Array.isArray(log.entries) &&
              log.entries.some((entry) => entry.done)
            ) {
              level = 2;
            } else {
              level = 1;
            }
          }

          last90Days.push({
            date: dateStr,
            count: level,
            level,
          });
        }

        setHeatMapData(last90Days);
      } catch (error) {
        console.error("Error loading heatmap data:", error);
      }
    }

    loadHeatmap();
  }, []);

  const handleExport = useCallback(
    async (type, range) => {
      setIsExporting(true);
      try {
        if (type === "csv") {
          await exportToCSV(range);
          showToast(
            `فایل CSV (${
              range === "all" ? "کل تاریخچه" : `${range} روزه`
            }) دانلود شد.`,
            "success"
          );
        }

        if (type === "json") {
          await exportToJSON(range);
          showToast(
            `پشتیبان JSON (${
              range === "all" ? "کل تاریخچه" : `${range} روزه`
            }) دانلود شد.`,
            "success"
          );
        }
      } catch (error) {
        console.error("Error exporting data:", error);
        showToast("خطا در خروجی گرفتن از اطلاعات!", "error");
      } finally {
        setIsExporting(false);
      }
    },
    [showToast]
  );

  const handleWeeklyAnalysis = useCallback(async () => {
    setIsCoachModalOpen(true);
    setIsCoachLoading(true);
    setCoachError(null);
    setCoachReport(null);

    try {
      const last7Logs = await db.dayLogs
        .orderBy("date")
        .reverse()
        .limit(7)
        .toArray();

      if (last7Logs.length === 0) {
        throw new Error("هیچ لاگی برای ۷ روز اخیر ثبت نشده است.");
      }

      const sortedLogs = last7Logs.reverse();
      const result = await runWeeklyAnalysis(sortedLogs);
      setCoachReport(result);
    } catch (error) {
      console.error("Error running weekly AI analysis:", error);
      setCoachError(error.message || "خطا در تحلیل هفتگی.");
    } finally {
      setIsCoachLoading(false);
    }
  }, []);

  const missionConsoleColors = useMemo(
    () => ["#232B36", "#343D4B", "#4FAE87", "#4FAE87", "#F5A623"],
    []
  );

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 text-main space-y-6 relative">
      {toastMessage && (
        <div
          className={`fixed top-5 left-5 bg-card border text-xs font-mono py-2.5 px-4 rounded shadow-lg shadow-black/80 z-50 animate-bounce ${
            toastType === "error"
              ? "border-red-500 text-red-400"
              : "border-amber-active text-amber-active"
          }`}
        >
          ⚡ {toastMessage}
        </div>
      )}

      <div>
        <h2 className="text-2xl font-black text-main mb-1">وضعیت و پیشرفت</h2>
        <p className="text-xs text-muted font-mono tracking-widest uppercase mb-6">
          Real Progress • Not Just Busy Hours
        </p>
      </div>

      <LifeWheelChart />

      {dashboardSummary && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-card border border-subtle rounded-lg p-3 text-center">
            <div className="text-[10px] font-mono text-muted uppercase">
              دوره‌ها
            </div>
            <div className="text-xl font-black text-main mt-1">
              {dashboardSummary.totalCourses}
            </div>
          </div>
          <div className="bg-card border border-subtle rounded-lg p-3 text-center">
            <div className="text-[10px] font-mono text-muted uppercase">
              حیاتی
            </div>
            <div className="text-xl font-black text-amber-active mt-1">
              {dashboardSummary.criticalCourses}
            </div>
          </div>
          <div className="bg-card border border-subtle rounded-lg p-3 text-center">
            <div className="text-[10px] font-mono text-muted uppercase">
              میانگین پیشرفت
            </div>
            <div className="text-xl font-black text-steel-blue mt-1">
              {dashboardSummary.avgProgress}%
            </div>
          </div>
          <div className="bg-card border border-subtle rounded-lg p-3 text-center">
            <div className="text-[10px] font-mono text-muted uppercase">
              جلسات تکمیل‌شده
            </div>
            <div className="text-xl font-black text-sage-green mt-1">
              {dashboardSummary.completedSessions}
            </div>
          </div>
        </section>
      )}

      <section className="bg-card border border-subtle p-6 rounded-lg">
        <h3 className="text-sm font-mono text-amber-active mb-4 uppercase tracking-wider">
          [ 📊 ] DISCIPLINE HEATMAP (Last 90 Days)
        </h3>

        {heatMapData.length > 0 ? (
          <div className="overflow-x-auto pt-8">
            <div className="min-w-[860px]">
              <ActivityCalendar
                data={heatMapData}
                colors={missionConsoleColors}
                blockSize={14}
                blockMargin={5}
                renderBlock={(block, activity) => {
                  const date = activity?.date;
                  const level = activity?.level ?? activity?.count ?? 0;
                  const title = date
                    ? `${formatPersianDate(date)} • ${levelLabelFa(level)}`
                    : "";

                  return (
                    <g key={date || "activity-empty"}>
                      <title>{title}</title>
                      {block}
                    </g>
                  );
                }}
                labels={{
                  months: [
                    "Jan",
                    "Feb",
                    "Mar",
                    "Apr",
                    "May",
                    "Jun",
                    "Jul",
                    "Aug",
                    "Sep",
                    "Oct",
                    "Nov",
                    "Dec",
                  ],
                  weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
                  legend: {
                    less: "Low",
                    more: "Full",
                  },
                }}
                theme={{
                  dark: missionConsoleColors,
                  light: missionConsoleColors,
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs font-mono text-muted">
            CALCULATING DATA METRICS...
          </p>
        )}
      </section>

      <section className="bg-card border border-subtle rounded-lg p-6">
        <h3 className="text-sm font-mono text-steel-blue mb-4 tracking-wider">
          [ 📚 ] COURSE PROGRESS
        </h3>

        {isLoadingCourses ? (
          <div className="flex justify-center py-8">
            <span className="text-xs font-mono text-muted animate-pulse">
              LOADING COURSES...
            </span>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-xs font-mono text-muted">
              هیچ دوره‌ای ثبت نشده است.
            </p>
            <p className="text-[10px] font-mono text-muted/50 mt-2">
              برای افزودن دوره به بخش "مدیریت و ویرایش" بروید.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {courses.map((courseItem) => (
              <div key={courseItem.id} className="group">
                <div className="flex justify-between items-center text-xs mb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-main font-bold">
                      {courseItem.name}
                    </span>
                    {courseItem.isCritical && (
                      <span className="text-[8px] font-mono text-amber-active border border-amber-active/30 px-1.5 py-0.5 rounded">
                        CRITICAL
                      </span>
                    )}
                    {courseItem.progress === 100 && (
                      <span className="text-[8px] font-mono text-sage-green border border-sage-green/30 px-1.5 py-0.5 rounded">
                        COMPLETED
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-muted">
                    {courseItem.progress}%
                    <span className="text-[9px] text-muted/50 ml-1">
                      ({courseItem.currentEpisode || 0}/
                      {courseItem.totalEpisodes})
                    </span>
                  </span>
                </div>

                <div className="w-full h-2.5 bg-[#232B36] border border-subtle/30 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ease-out group-hover:brightness-110 ${
                      courseItem.progress === 100
                        ? "bg-sage-green"
                        : "bg-[#F5A623]"
                    }`}
                    style={{ width: `${courseItem.progress}%` }}
                  />
                </div>

                {courseItem.instructor && (
                  <div className="text-[9px] font-mono text-muted/50 mt-1">
                    {courseItem.instructor}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="bg-card border border-subtle rounded-lg p-6">
        <h3 className="text-sm font-mono text-muted-purple mb-4 tracking-wider">
          [ ⚡ ] WEEKLY KPIs
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
          <div className="bg-card/60 border border-subtle rounded-md p-3">
            <div className="text-muted mb-1">روزهای کامل</div>
            <div className="text-2xl font-black text-amber-active font-mono">
              {weeklyStats.fullDays}
            </div>
            <div className="text-[9px] text-muted/50 mt-1">از ۷ روز</div>
          </div>
          <div className="bg-card/60 border border-subtle rounded-md p-3">
            <div className="text-muted mb-1">نسبت خروجی</div>
            <div className="text-lg font-black text-steel-blue font-mono">
              {weeklyStats.outcomeRatio}x
            </div>
            <div className="text-[9px] text-muted/50 mt-1">
              {weeklyStats.doneTasks}/{weeklyStats.totalTasks} تسک
            </div>
          </div>
          <div className="bg-card/60 border border-subtle rounded-md p-3">
            <div className="text-muted mb-1">کل تسک‌ها</div>
            <div className="text-2xl font-black text-main font-mono">
              {weeklyStats.totalTasks}
            </div>
            <div className="text-[9px] text-muted/50 mt-1">این هفته</div>
          </div>
          <div className="bg-card/60 border border-subtle rounded-md p-3">
            <div className="text-muted mb-1">تکمیل‌شده</div>
            <div className="text-2xl font-black text-sage-green font-mono">
              {weeklyStats.doneTasks}
            </div>
            <div className="text-[9px] text-muted/50 mt-1">
              {weeklyStats.totalTasks > 0
                ? Math.round(
                    (weeklyStats.doneTasks / weeklyStats.totalTasks) * 100
                  )
                : 0}
              %
            </div>
          </div>
        </div>
      </section>

      <button
        onClick={handleWeeklyAnalysis}
        disabled={isCoachLoading}
        className={`w-full mt-6 p-3 rounded-md font-mono text-sm border transition flex items-center justify-center gap-2 ${
          isCoachLoading
            ? "border-subtle text-muted cursor-not-allowed opacity-60"
            : "border-amber-active text-amber-active hover:bg-amber-active/10"
        }`}
      >
        {isCoachLoading ? (
          <>
            <span className="animate-spin inline-block w-4 h-4 border-2 border-amber-active border-t-transparent rounded-full"></span>
            تحلیل در حال انجام...
          </>
        ) : (
          "[ 🧠 ] تحلیل هفتگی عملکرد توسط AI"
        )}
      </button>

      <div className="bg-card border border-subtle p-6 rounded-lg mt-8">
        <h3 className="text-sm font-mono text-blue-gray mb-4">
          [ ⬇ ] DATA EXPORT
        </h3>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => handleExport("csv", "7")}
            disabled={isExporting}
            className="flex-1 bg-base border border-subtle text-muted py-2 rounded font-mono text-xs hover:bg-subtle hover:text-main transition disabled:opacity-50"
          >
            CSV (7 Days)
          </button>
          <button
            onClick={() => handleExport("csv", "30")}
            disabled={isExporting}
            className="flex-1 bg-base border border-subtle text-muted py-2 rounded font-mono text-xs hover:bg-subtle hover:text-main transition disabled:opacity-50"
          >
            CSV (30 Days)
          </button>
          <button
            onClick={() => handleExport("csv", "all")}
            disabled={isExporting}
            className="flex-1 bg-base border border-subtle text-muted py-2 rounded font-mono text-xs hover:bg-subtle hover:text-main transition disabled:opacity-50"
          >
            CSV (All)
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => handleExport("json", "7")}
            disabled={isExporting}
            className="flex-1 bg-amber-active/10 border border-amber-active text-amber-active py-2 rounded font-mono text-xs hover:bg-amber-active/20 transition disabled:opacity-50"
          >
            JSON (7 Days)
          </button>
          <button
            onClick={() => handleExport("json", "30")}
            disabled={isExporting}
            className="flex-1 bg-amber-active/10 border border-amber-active text-amber-active py-2 rounded font-mono text-xs hover:bg-amber-active/20 transition disabled:opacity-50"
          >
            JSON (30 Days)
          </button>
          <button
            onClick={() => handleExport("json", "all")}
            disabled={isExporting}
            className="flex-1 bg-amber-active/10 border border-amber-active text-amber-active py-2 rounded font-mono text-xs hover:bg-amber-active/20 transition disabled:opacity-50"
          >
            JSON (All)
          </button>
        </div>
      </div>

      <CoachReportModal
        isOpen={isCoachModalOpen}
        onClose={() => setIsCoachModalOpen(false)}
        isLoading={isCoachLoading}
        error={coachError}
        reportData={coachReport}
      />
    </div>
  );
}
