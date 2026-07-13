import { useState, useEffect, useRef } from "react";
import { DayLogRepository } from "../repositories/DayLogRepository";
import { TimerRepository } from "../repositories/TimerRepository";
import { saveHabit } from "../app/saveHabit";
import { todayKey, getTodayEn } from "../utils/date";

function formatMs(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function TodayPage() {
  const [dayLog, setDayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  
  const [habitName, setHabitName] = useState("");
  const [habitDomain, setHabitDomain] = useState("");
  const [recType, setRecType] = useState("daily");
  const [recDays, setRecDays] = useState([]);
  const [toastMsg, setToastMsg] = useState(null);
  const [error, setError] = useState(null);

  const toastTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    loadTodayData();
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  async function loadTodayData() {
    try {
      setLoading(true);
      const log = await DayLogRepository.getOrCreateByDate(todayKey(), getTodayEn());
      setDayLog(log);

      // اصلاح باگ ۲: خواندن صحیح تایمر فعال و محاسبه زمان سپری شده
      const timer = await TimerRepository.getActive();
      if (timer) {
        setActiveTimer(timer);
        setElapsedTime(
          (timer.accumulatedTime || 0) +
          (timer.isRunning && timer.startTime ? Date.now() - timer.startTime : 0)
        );
      }
    } catch (err) {
      setError("خطا در بارگذاری داده‌ها: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTimer?.isRunning) {
      timerIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - activeTimer.startTime + activeTimer.accumulatedTime;
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      clearInterval(timerIntervalRef.current);
    }
    return () => clearInterval(timerIntervalRef.current);
  }, [activeTimer]);

  function showToast(msg) {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 4000);
  }

  async function handleToggleDone(entryId) {
    const originalLog = { ...dayLog };
    try {
      const updatedEntries = dayLog.entries.map(e =>
        e.id === entryId ? { ...e, done: !e.done } : e
      );
      const updatedLog = { ...dayLog, entries: updatedEntries };
      setDayLog(updatedLog);
      await DayLogRepository.recomputeAndSave(updatedLog);
    } catch (err) {
      setDayLog(originalLog);
      setError("خطا در بروزرسانی وضعیت: " + err.message);
    }
  }

  async function handleStartTimer(entryId) {
    try {
      if (activeTimer?.isRunning) {
        await handleStopTimer(true);
      }
      const timer = await TimerRepository.start(entryId, dayLog.date);
      setActiveTimer(timer);
    } catch (err) {
      setError("خطا در شروع تایمر: " + err.message);
    }
  }

  async function handleStopTimer(isSwitch = false) {
    try {
      const result = await TimerRepository.stop();
      if (result) {
        const updatedEntries = dayLog.entries.map(e => {
          if (e.id === result.taskRefId) {
            const startStr = new Date(Date.now() - result.totalMs).toTimeString().split(" ")[0];
            return { ...e, actualStart: startStr, actualEnd: new Date().toTimeString().split(" ")[0], done: true };
          }
          return e;
        });
        const updatedLog = { ...dayLog, entries: updatedEntries };
        setDayLog(updatedLog);
        await DayLogRepository.recomputeAndSave(updatedLog);
        
        // اصلاح باگ ۳: نمایش Toast در حالت Switch هم
        if (!isSwitch) {
          setActiveTimer(null);
          setElapsedTime(0);
          showToast("تایمر متوقف و زمان ثبت شد.");
        } else {
          const stoppedTaskTitle = dayLog.entries.find(e => e.id === result.taskRefId)?.title || "تسک قبلی";
          showToast(`تایمر "${stoppedTaskTitle}" متوقف و ذخیره شد.`);
        }
      }
    } catch (err) {
      setError("خطا در توقف تایمر: " + err.message);
    }
  }

  const handleDayToggle = (dayIndex) => {
    setRecDays(prev => 
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  async function handleSaveHabit() {
    if (!habitName.trim()) return;
    try {
      let recurrence = { type: recType };
      if (recType === "weekly") {
        if (recDays.length === 0) throw new Error("حداقل یک روز انتخاب کنید.");
        recurrence.days = recDays;
      }
      await saveHabit({ name: habitName.trim(), domain: habitDomain, recurrence });
      
      const refreshed = await DayLogRepository.getOrCreateByDate(todayKey(), getTodayEn());
      setDayLog(refreshed);

      setHabitName("");
      setHabitDomain("");
      setRecType("daily");
      setRecDays([]);
      showToast("عادت جدید با موفقیت ثبت شد.");
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleJournalChange(e) {
    setDayLog(prev => ({ ...prev, journalNote: e.target.value }));
  }

  async function handleJournalBlur() {
    try {
      await DayLogRepository.recomputeAndSave(dayLog);
    } catch (err) {
      setError("خطا در ذخیره یادداشت: " + err.message);
    }
  }

  if (loading) return <div className="p-8 text-center text-os-text/50 font-mono">LOADING MISSION DATA...</div>;
  if (!dayLog) return <div className="p-8 text-center text-os-text/50">NO DATA</div>;

  const criticalTasks = dayLog.entries.filter(e => e.isCritical);
  const otherTasks = dayLog.entries.filter(e => !e.isCritical);
  
  const daysOfWeek = [
    { id: 0, label: 'ش' }, { id: 1, label: 'ی' }, { id: 2, label: 'د' }, 
    { id: 3, label: 'س' }, { id: 4, label: 'چ' }, { id: 5, label: 'پ' }, { id: 6, label: 'ج' }
  ];

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 text-os-text relative">
      
      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-os-card border border-sky-500 text-sky-400 px-4 py-2 rounded shadow-lg z-50 text-sm font-mono">
          {toastMsg}
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h2 className="text-xl font-bold text-white">داشبورد اجرای امروز</h2>
          <p className="text-xs font-mono text-os-text/50 mt-1 tracking-widest">DATE: {dayLog.date}</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-mono border ${dayLog.fullDay ? "bg-emerald-500/10 text-emerald-400 border-emerald-500" : "bg-os-text/10 text-os-text/50 border-os-border"}`}>
          {dayLog.fullDay ? "✓ FULL DAY ACHIEVED" : "○ IN PROGRESS"}
        </div>
      </div>

      {activeTimer && (
        <div className="mb-6 bg-os-accent/10 border border-os-accent p-4 rounded-md flex justify-between items-center">
          <div>
            <p className="text-[10px] text-os-accent font-bold">ACTIVE MISSION</p>
            <p className="text-sm text-white">
              {dayLog.entries.find(e => e.id === activeTimer.taskRefId)?.title || "در حال اجرا..."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xl font-mono font-bold text-os-accent">{formatMs(elapsedTime)}</span>
            <button onClick={() => handleStopTimer()} className="bg-red-500/20 border border-red-500 text-red-400 px-3 py-1 rounded text-xs font-mono hover:bg-red-500/30 transition">
              STOP & SAVE
            </button>
          </div>
        </div>
      )}

      {/* فرم افزودن عادت جدید */}
      <div className="flex flex-col gap-3 mb-8 p-4 bg-os-card border border-os-border rounded-lg">
        <h3 className="text-sm font-mono text-os-accent">[ + ] ADD NEW HABIT</h3>
        {error && <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-2 rounded text-xs">{error}</div>}
        <input
          value={habitName}
          onChange={(e) => setHabitName(e.target.value)}
          placeholder="نام عادت..."
          className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text transition"
        />
        
        <select
          value={habitDomain}
          onChange={(e) => setHabitDomain(e.target.value)}
          className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text text-sm font-mono transition"
        >
          <option value="">بدون بُعد (null)</option>
          <option value="career">شغل (Career)</option>
          <option value="health">سلامتی (Health)</option>
          <option value="learning">یادگیری (Learning)</option>
          <option value="discipline">دیسپلین (Discipline)</option>
          <option value="relationships">روابط (Relationships)</option>
          <option value="recreation">تفریح (Recreation)</option>
        </select>

        <div className="flex gap-4 items-center mt-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer text-os-text/70">
            <input type="radio" checked={recType === "daily"} onChange={() => setRecType("daily")} className="accent-os-accent" />
            هر روز
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer text-os-text/70">
            <input type="radio" checked={recType === "weekly"} onChange={() => setRecType("weekly")} className="accent-os-accent" />
            روزهای خاص
          </label>
        </div>

        {recType === "weekly" && (
          <div className="flex gap-2 mt-2">
            {daysOfWeek.map(day => (
              <button
                key={day.id}
                type="button"
                onClick={() => handleDayToggle(day.id)}
                className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold transition ${
                  recDays.includes(day.id) 
                    ? "bg-os-accent text-os-bg border-os-accent" 
                    : "bg-os-bg border-os-border text-os-text/50 hover:border-os-accent"
                }`}
              >
                {day.label}
              </button>
            ))}
          </div>
        )}

        <button 
          onClick={handleSaveHabit} 
          className="bg-os-accent text-os-bg px-6 py-3 rounded-lg font-mono font-bold hover:bg-os-accent/90 transition-colors mt-2"
        >
          ثبت عادت
        </button>
      </div>

      {/* ماموریت‌های حیاتی */}
      <div className="mb-8">
        <h3 className="text-sm font-mono text-os-accent mb-3">[ ! ] CRITICAL MISSIONS</h3>
        <div className="space-y-2">
          {criticalTasks.length === 0 && <p className="text-os-text/50 text-sm">ماموریتی ثبت نشده است.</p>}
          {criticalTasks.map(task => (
            <div key={task.id} className={`flex items-center bg-os-card border rounded-md p-3 transition-all ${task.done ? "opacity-50 border-os-border" : "border-os-border"} ${activeTimer?.taskRefId === task.id ? "border-os-accent" : ""}`}>
              <button onClick={() => handleToggleDone(task.id)} className={`w-6 h-6 rounded border-2 mr-4 flex items-center justify-center transition ${task.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-os-border"}`}>
                {task.done && "✓"}
              </button>
              <div className="flex-1">
                <h4 className={`text-sm font-bold ${task.done ? "line-through text-os-text/50" : "text-white"}`}>{task.title}</h4>
                <span className="text-[10px] font-mono text-os-text/40">PLANNED: {task.plannedStart} - {task.plannedEnd} {task.actualStart && `| ACTUAL: ${task.actualStart} - ${task.actualEnd}`}</span>
              </div>
              {!activeTimer && !task.done && (
                <button onClick={() => handleStartTimer(task.id)} className="text-xs font-mono text-sky-400 border border-sky-400 px-2 py-1 rounded hover:bg-sky-400/10 transition">
                  START
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* سایر کارها */}
      <div className="mb-8">
        <h3 className="text-sm font-mono text-sky-400 mb-3">[ - ] OTHER BLOCKS</h3>
        <div className="space-y-2">
          {otherTasks.map(task => (
            <div key={task.id} className={`flex items-center bg-os-card border border-os-border rounded-md p-3 transition-all ${task.done ? "opacity-40" : ""}`}>
              <button onClick={() => handleToggleDone(task.id)} className={`w-5 h-5 rounded border-2 mr-4 flex items-center justify-center transition ${task.done ? "bg-sky-400 border-sky-400 text-os-bg" : "border-os-border"}`}>
                {task.done && "✓"}
              </button>
              <div className="flex-1">
                <h4 className={`text-sm ${task.done ? "line-through text-os-text/50" : "text-os-text"}`}>{task.title}</h4>
                <span className="text-[10px] font-mono text-os-text/40">{task.plannedStart} - {task.plannedEnd}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* یادداشت روزانه */}
      <div>
        <h3 className="text-sm font-mono text-purple-400 mb-3">[ * ] DAILY JOURNAL</h3>
        <textarea 
          value={dayLog.journalNote || ""}
          onChange={handleJournalChange}
          onBlur={handleJournalBlur}
          placeholder="امروز دقیقاً چی ساختی یا یاد گرفتی؟"
          className="w-full h-32 p-3 bg-os-card border border-os-border rounded-md text-sm text-os-text focus:outline-none focus:border-sky-400 resize-none transition"
        />
      </div>
    </div>
  );
}