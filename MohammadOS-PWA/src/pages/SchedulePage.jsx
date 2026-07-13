import { useState, useEffect, useMemo } from "react";
import { generateDailySchedule } from "../ai/schedulerService";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { db } from "../db/database";
import { exportScheduleToIcs } from "../app/exportSchedule";

const timeToMinutes = (timeStr) => {
  if (!timeStr) return 0;

  const [h, m] = timeStr.split(":").map(Number);

  if (Number.isNaN(h) || Number.isNaN(m)) {
    return 0;
  }

  return h * 60 + m;
};

export default function SchedulePage() {
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [bulkJson, setBulkJson] = useState("");
  const [isSaved, setIsSaved] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  const daysMap = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  const daysMapFa = [
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
    "شنبه",
  ];

  const todayEn = daysMap[new Date().getDay()];
  const todayFa = daysMapFa[new Date().getDay()];

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadTodaySchedule() {
      try {
        const todayData = await ScheduleRepository.getDaySchedule(todayEn);

        if (todayData && Array.isArray(todayData.schedule)) {
          setSchedule(todayData.schedule);
          setIsSaved(true);
        }
      } catch (err) {
        console.error("Load today schedule error:", err);
        setError("خطا در بارگذاری برنامه امروز: " + (err.message || "خطای نامشخص"));
      }
    }

    loadTodaySchedule();
  }, [todayEn]);

  async function handleBulkSave() {
    try {
      const allData = JSON.parse(bulkJson);

      for (const day in allData) {
        if (allData[day] && Array.isArray(allData[day].schedule)) {
          await ScheduleRepository.saveDaySchedule(day, allData[day].schedule);
        }
      }

      const todayData = await ScheduleRepository.getDaySchedule(todayEn);

      if (todayData && Array.isArray(todayData.schedule)) {
        setSchedule(todayData.schedule);
      }

      setIsSaved(true);
      setBulkJson("");
      setError(null);
    } catch (err) {
      console.error("Bulk save error:", err);
      setError("فرمت JSON نامعتبر است یا ذخیره‌سازی انجام نشد.");
    }
  }

  async function handleGenerateAI() {
    setLoading(true);
    setError(null);

    try {
      const userCourses = await db.courses.toArray();

      const coursesData = userCourses.map((course) => ({
        name: course.name,
        totalEpisodes: Number(course.totalEpisodes) || 0,
        currentEpisode: Number(course.currentEpisode) || 0,
      }));

      if (coursesData.length === 0) {
        throw new Error(
          "هیچ دوره‌ای ثبت نشده است. لطفاً ابتدا از تب «ویرایش»، دوره‌های خود را وارد کنید."
        );
      }

      const fixedEvents = [
        {
          title: "خواب",
          startTime: "23:00",
          endTime: "05:30",
          type: "fixed",
        },
        {
          title: "ناهار",
          startTime: "14:30",
          endTime: "15:15",
          type: "fixed",
        },
      ];

      const aiInput = {
        courses: coursesData,
        fixedEvents,
      };

      console.log("AI scheduler input configuration:", aiInput);

      const result = await generateDailySchedule(aiInput);

      console.log("AI scheduler output result:", result);

      const normalizedSchedule = Array.isArray(result)
        ? result
        : Array.isArray(result?.schedule)
          ? result.schedule
          : [];

      if (normalizedSchedule.length === 0) {
        throw new Error("هوش مصنوعی برنامه خالی برگرداند.");
      }

      setSchedule(normalizedSchedule);

      await ScheduleRepository.saveDaySchedule(todayEn, normalizedSchedule);

      setIsSaved(true);
      setError(null);
    } catch (err) {
      console.error("Generate AI Schedule Error:", err);
      setError("خطا در ارتباط با هوش مصنوعی: " + (err.message || "خطای نامشخص"));
    } finally {
      setLoading(false);
    }
  }

  const { progressPercent, dotX, dotY } = useMemo(() => {
    const currentMin = currentTime.getHours() * 60 + currentTime.getMinutes();

    const startDay =
      schedule.length > 0 && schedule[0]?.startTime
        ? timeToMinutes(schedule[0].startTime)
        : 480;

    const endDay =
      schedule.length > 0 && schedule[schedule.length - 1]?.endTime
        ? timeToMinutes(schedule[schedule.length - 1].endTime)
        : 1320;

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
    course: {
      color: "var(--color-os-steel)",
      label: "آموزش",
      bg: "rgba(79, 168, 224, 0.1)",
    },
    fixed: {
      color: "#F87171",
      label: "ثابت",
      bg: "rgba(248, 113, 113, 0.1)",
    },
    habit: {
      color: "#34D399",
      label: "عادت",
      bg: "rgba(52, 211, 153, 0.1)",
    },
    break: {
      color: "var(--color-os-border)",
      label: "استراحت",
      bg: "rgba(35, 43, 54, 0.2)",
    },
  };

  return (
    <div className="max-w-3xl mx-auto p-6 font-vazir rtl text-os-text">
      <div className="flex flex-col items-center mb-12">
        <svg viewBox="0 0 100 55" className="w-72 h-36 mb-4">
          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke="var(--color-os-border)"
            strokeWidth="3"
            strokeLinecap="round"
          />

          <path
            d="M 5 50 A 45 45 0 0 1 95 50"
            fill="none"
            stroke="var(--color-os-text)"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeDasharray={`${progressPercent * 141} 141`}
            className="transition-all duration-1000 ease-linear opacity-50"
          />

          <circle
            cx={dotX}
            cy={dotY}
            r="3"
            fill="var(--color-os-accent)"
            className="drop-shadow-[0_0_10px_var(--color-os-accent)]"
          />
        </svg>

        <div className="text-center">
          <h1 className="text-3xl font-black mb-1">
            کنسول مأموریت: {todayFa}
          </h1>

          <p className="font-mono text-[10px] tracking-[0.3em] text-os-accent uppercase">
            Operational Status: Optimal
          </p>

          {isSaved && (
            <p className="mt-2 text-[10px] font-mono text-green-400/70">
              LOCAL SCHEDULE SYNCED
            </p>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-lg mb-6 text-center text-sm">
          {error}
        </div>
      )}

      <div className="space-y-3 mb-12">
        {schedule.length > 0 ? (
          schedule.map((block, index) => {
            const currentMin =
              currentTime.getHours() * 60 + currentTime.getMinutes();

            const blockStart = timeToMinutes(block.startTime);
            const blockEnd = timeToMinutes(block.endTime);

            const isActive = currentMin >= blockStart && currentMin < blockEnd;
            const isPast = currentMin >= blockEnd;
            const cfg = typeConfig[block.type] || typeConfig.break;

            return (
              <div
                key={`${block.startTime}-${block.endTime}-${index}`}
                className={`flex items-center bg-os-card border border-os-border rounded-lg overflow-hidden transition-all duration-500 ${
                  isActive
                    ? "ring-1 ring-os-accent border-os-accent/40 shadow-[0_0_20px_rgba(245,166,35,0.1)] scale-[1.01]"
                    : isPast
                      ? "opacity-30 grayscale-[0.5]"
                      : "opacity-90"
                }`}
              >
                <div
                  className="w-1.5 self-stretch"
                  style={{ backgroundColor: cfg.color }}
                ></div>

                <div className="w-24 px-4 py-4 border-l border-os-border/50 text-center flex flex-col justify-center">
                  <span className="font-mono font-bold text-sm">
                    {block.startTime || "--:--"}
                  </span>

                  <span className="font-mono text-[10px] opacity-40">
                    {block.endTime || "--:--"}
                  </span>
                </div>

                <div className="flex-1 px-5 py-4 flex items-center justify-between">
                  <div>
                    <h3
                      className={`text-base font-bold ${
                        isActive ? "text-os-accent" : "text-os-text"
                      }`}
                    >
                      {block.title || block.name || "بدون عنوان"}
                    </h3>

                    {isActive && (
                      <div className="flex items-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-os-accent animate-ping"></span>
                        <span className="text-[10px] text-os-accent font-mono">
                          ACTIVE MISSION
                        </span>
                      </div>
                    )}
                  </div>

                  <span
                    className="text-[9px] font-bold px-2.5 py-1 rounded border"
                    style={{
                      color: cfg.color,
                      borderColor: `${cfg.color}44`,
                      backgroundColor: cfg.bg,
                    }}
                  >
                    {cfg.label}
                  </span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-os-card text-center py-16 opacity-50 border border-os-border rounded-lg">
            <p className="font-mono text-sm tracking-widest uppercase">
              No Active Trajectory Found
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4 border-t border-os-border pt-8">
        <button
          onClick={handleGenerateAI}
          disabled={loading}
          className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-3 border ${
            loading
              ? "bg-os-border text-muted cursor-wait"
              : "bg-os-accent/10 border-os-accent text-os-accent hover:bg-os-accent hover:text-os-bg"
          }`}
        >
          {loading ? "ANALYZING..." : "تولید هوشمند با هسته AI"}
        </button>

        <button
          onClick={exportScheduleToIcs}
          className="w-full p-3 rounded-md font-mono text-sm border border-os-border text-os-text hover:bg-os-card transition flex items-center justify-center gap-2"
        >
          [ ⬇ ] EXPORT WEEK TO .ICS
        </button>

        <details className="group">
          <summary className="text-[10px] font-mono text-muted cursor-pointer hover:text-os-accent transition list-none text-center">
            [+] ADVANCED DATA INJECTION JSON
          </summary>

          <div className="mt-4 animate-in fade-in slide-in-from-top-2">
            <textarea
              value={bulkJson}
              onChange={(e) => setBulkJson(e.target.value)}
              placeholder='{"monday": {"schedule": [...]}}'
              className="w-full h-32 bg-os-bg border border-os-border rounded-lg p-3 font-mono text-[11px] focus:border-os-accent outline-none"
            />

            <button
              onClick={handleBulkSave}
              className="w-full mt-2 py-2 text-xs font-mono border border-os-border hover:border-os-text rounded-md transition"
            >
              EXECUTE_COMMIT
            </button>
          </div>
        </details>
      </div>
    </div>
  );
}
