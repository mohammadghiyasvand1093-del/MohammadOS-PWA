// src/pages/TodayPage.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { DayLogRepository } from "../repositories/DayLogRepository";
import { TimerRepository } from "../repositories/TimerRepository";
import { HabitRepository } from "../repositories/HabitRepository";
import { saveHabit } from "../app/saveHabit";
import { deleteHabit } from "../app/deleteHabit";
import { todayKey, getTodayEn, nowMs, getDayEnFromDateKey, toPersianDate } from "../utils/date"; // ✅ FIX 3.1
import { AggregationService } from "../service/aggregationService";

function formatMs(ms) {
  if (isNaN(ms) || ms < 0) return "00:00:00";
  const totalSec = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSec / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, "0");
  const s = String(totalSec % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

function calculateDuration(start, end) {
  if (!start || !end) return null;
  const startParts = start.split(':').map(Number);
  const endParts = end.split(':').map(Number);
  const sh = startParts[0] || 0, sm = startParts[1] || 0, ss = startParts[2] || 0;
  const eh = endParts[0] || 0, em = endParts[1] || 0, es = endParts[2] || 0;
  
  let startSec = sh * 3600 + sm * 60 + ss;
  let endSec = eh * 3600 + em * 60 + es;
  if (endSec < startSec) endSec += 24 * 3600;
  const diffSec = endSec - startSec;
  if (diffSec === 0) return null;
  
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  if (h === 0 && m === 0) return "کمتر از ۱ دقیقه";
  return `${h > 0 ? `${h} ساعت و ` : ''}${m} دقیقه`;
}

const MOOD_EMOJIS = [
  { value: 1, emoji: "😫", label: "خیلی بد" },
  { value: 2, emoji: "😕", label: "بد" },
  { value: 3, emoji: "😐", label: "معمولی" },
  { value: 4, emoji: "🙂", label: "خوب" },
  { value: 5, emoji: "😄", label: "عالی" },
];

const HABIT_DOMAINS = [
  { value: 'learning', label: '📚 یادگیری', color: '#4D8EF5' },
  { value: 'fitness', label: '💪 ورزش', color: '#00C878' },
  { value: 'discipline', label: '🎯 انضباط', color: '#F5C542' },
  { value: 'work', label: '💼 کار', color: '#A855F7' },
  { value: 'rest', label: '😴 استراحت', color: '#22D3EE' },
  { value: 'social', label: '🤝 اجتماعی', color: '#F97316' },
];

export default function TodayPage() {
  const [searchParams] = useSearchParams();
  const dateParam = searchParams.get("date");

  const targetDateKey = dateParam || todayKey();
  const targetDayEn = dateParam ? getDayEnFromDateKey(dateParam) : getTodayEn();
  const isHistorical = Boolean(dateParam);

  const isToday = targetDateKey === todayKey();
  const yesterday = new Date(nowMs());
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
  const isYesterday = targetDateKey === yesterdayKey;
  const canFreeze = isToday || isYesterday;

  const [dayLog, setDayLog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);

  const [habitName, setHabitName] = useState("");
  const [habitDomain, setHabitDomain] = useState("discipline");
  const [recType, setRecType] = useState("daily");
  const [recDays, setRecDays] = useState([]);
  const [isCritical, setIsCritical] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);
  const [error, setError] = useState(null);
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const [timerActionPending, setTimerActionPending] = useState(false);
  
  const [graceLoading, setGraceLoading] = useState(false);
  const [graceUsed, setGraceUsed] = useState(0);

  const [mood, setMood] = useState(null);
  const [moodNote, setMoodNote] = useState("");
  
  const [habitCount, setHabitCount] = useState(0);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmDeleteMsg, setConfirmDeleteMsg] = useState("");
  const [streak, setStreak] = useState(0);
  
  // ✅ بچ ۶۸: Search state
  const [taskSearch, setTaskSearch] = useState("");

  const toastTimeoutRef = useRef(null);
  const timerIntervalRef = useRef(null);
  const journalDebounceRef = useRef(null);
  
  // ✅ FIX (Item 2.4): Prevent state update on unmounted component
  const isMountedRef = useRef(true);
  
  const dayLogRef = useRef(null);
  const dayLogSaveSeqRef = useRef(0);
  const dayLogMutationSeqRef = useRef(0);
  const timerActionPendingRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  function updateDayLog(nextLog, { markMutation = true } = {}) {
    if (!isMountedRef.current) return;
    if (markMutation) {
      dayLogMutationSeqRef.current += 1;
    }
    dayLogRef.current = nextLog;
    setDayLog(nextLog);
  }

  async function persistDayLog(nextLog, { applySavedState = true } = {}) {
    const saveSeq = ++dayLogSaveSeqRef.current;
    const mutationSeqAtSaveStart = dayLogMutationSeqRef.current;
    const saved = await DayLogRepository.recomputeAndSave(nextLog);

    if (
      applySavedState &&
      isMountedRef.current &&
      saveSeq === dayLogSaveSeqRef.current &&
      mutationSeqAtSaveStart === dayLogMutationSeqRef.current
    ) {
      updateDayLog(saved, { markMutation: false });
    }

    return saved;
  }

  const loadTodayData = useCallback(async (signal) => {
    try {
      const log = await DayLogRepository.getOrCreateByDate(targetDateKey, targetDayEn);
      if (signal?.aborted) return;
      updateDayLog(log, { markMutation: false });
      
      const synced = await AggregationService.syncScheduleToToday(targetDateKey, targetDayEn);
      if (synced && synced.entries.length > (log.entries?.length || 0)) {
        updateDayLog(synced, { markMutation: false });
      }

      setMood(log.mood ?? null);
      setMoodNote(log.moodNote ?? "");

      const [stats, allHabits, timer] = await Promise.all([
        AggregationService.getTodayStats(),
        HabitRepository.getAll(),
        TimerRepository.getActive()
      ]);

      if (signal?.aborted) return;
      
      setGraceUsed(stats.graceUsed ?? 0);
      setStreak(stats.streak ?? 0);
      setHabitCount(allHabits.length);

      if (timer) {
        setActiveTimer(timer);
        const start = timer.startTime || 0;
        const accumulated = timer.accumulatedTime || 0;
        const runningDiff = timer.isRunning && start ? nowMs() - start : 0;
        setElapsedTime(accumulated + runningDiff);
      }
    } catch (err) {
      if (signal?.aborted) return;
      setError("خطا در بارگذاری داده‌ها: " + err.message);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [targetDateKey, targetDayEn]);

  useEffect(() => {
    document.title = "MohammadOS | داشبورد اجرا";
    
    const controller = new AbortController();
    (async () => {
      await loadTodayData(controller.signal);
    })();
    return () => {
      controller.abort();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (journalDebounceRef.current) clearTimeout(journalDebounceRef.current);
    };
  }, [loadTodayData]);

  useEffect(() => {
    if (activeTimer?.isRunning) {
      timerIntervalRef.current = setInterval(() => {
        const elapsed = nowMs() - activeTimer.startTime + activeTimer.accumulatedTime;
        setElapsedTime(elapsed);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [activeTimer]);

  // ✅ بچ ۶۸: Filter Logic برای تسک‌های امروز (انتقال به بالا برای رفع خطای Hook)
  const criticalTasks = useMemo(() => dayLog?.entries.filter(e => e.isCritical) || [], [dayLog]);
  const otherTasks = useMemo(() => dayLog?.entries.filter(e => !e.isCritical) || [], [dayLog]);

  const filteredCritical = useMemo(() => {
    if (!taskSearch.trim()) return criticalTasks;
    const q = taskSearch.trim().toLowerCase();
    return criticalTasks.filter(t => t.title?.toLowerCase().includes(q));
  }, [criticalTasks, taskSearch]);

  const filteredOther = useMemo(() => {
    if (!taskSearch.trim()) return otherTasks;
    const q = taskSearch.trim().toLowerCase();
    return otherTasks.filter(t => t.title?.toLowerCase().includes(q));
  }, [otherTasks, taskSearch]);

  function showToast(msg) {
    setToastMsg(msg);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToastMsg(null), 4000);
  }

  async function handleToggleDone(entryId) {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;

    const targetEntry = currentLog.entries.find((e) => e.id === entryId);
    if (!targetEntry) return;

    const previousDone = targetEntry.done;
    const updatedEntries = currentLog.entries.map((e) =>
      e.id === entryId ? { ...e, done: !e.done } : e
    );
    const updatedLog = { ...currentLog, entries: updatedEntries };
    const nextMutationSeq = dayLogMutationSeqRef.current + 1;
    const saveSeqAtStart = dayLogSaveSeqRef.current;

    try {
      updateDayLog(updatedLog);
      await persistDayLog(updatedLog);
      
      try {
        const stats = await AggregationService.getTodayStats();
        setStreak(stats.streak ?? 0);
      } catch (streakErr) {
        console.warn("Streak refresh after toggle failed:", streakErr);
      }
    } catch (err) {
      if (
        dayLogMutationSeqRef.current !== nextMutationSeq ||
        dayLogSaveSeqRef.current !== saveSeqAtStart + 1
      ) {
        return;
      }

      const latestLog = dayLogRef.current;
      if (!latestLog) return;

      const rolledBackEntries = latestLog.entries.map((e) =>
        e.id === entryId ? { ...e, done: previousDone } : e
      );
      const rolledBackLog = { ...latestLog, entries: rolledBackEntries };
      updateDayLog(rolledBackLog);
      
      setError("خطا در بروزرسانی وضعیت: " + err.message);
    }
  }

  async function handleDeleteEntry(entryId) {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;

    const targetEntry = currentLog.entries.find((e) => e.id === entryId);
    if (!targetEntry) return;

    const isHabit = targetEntry.category === 'habit' && targetEntry.refId;
    const confirmMsg = isHabit
      ? "این عادت به طور کامل از سیستم پاک می‌شود و تاریخچه EMA آن از بین می‌رود. فردا دیگر در لیست نمی‌آید.\n\nاین عملیات برگشت‌ناپذیر است."
      : "آیا از حذف این مورد از لیست امروز مطمئن هستید؟";

    setConfirmDeleteId(entryId);
    setConfirmDeleteMsg(confirmMsg);
  }

  async function executeDelete() {
    if (!confirmDeleteId) return;
    
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    
    const targetEntry = currentLog.entries.find((e) => e.id === confirmDeleteId);
    const isHabit = targetEntry?.category === 'habit' && targetEntry?.refId;

    try {
      if (isHabit && targetEntry?.refId) {
        await deleteHabit(targetEntry.refId);
      }

      const updatedEntries = currentLog.entries.filter((e) => e.id !== confirmDeleteId);
      const updatedLog = { ...currentLog, entries: updatedEntries };
      
      updateDayLog(updatedLog);
      await persistDayLog(updatedLog);
      showToast(isHabit ? "عادت به طور کامل حذف شد." : "مورد از لیست امروز حذف شد.");
      
      if (isHabit) setHabitCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      setError("خطا در حذف مورد: " + err.message);
    } finally {
      setConfirmDeleteId(null);
      setConfirmDeleteMsg("");
    }
  }

  function cancelDelete() {
    setConfirmDeleteId(null);
    setConfirmDeleteMsg("");
  }

  function handleEntryDetailChange(entryId, field, value) {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    const updatedEntries = currentLog.entries.map(e =>
      e.id === entryId ? { ...e, [field]: value } : e
    );
    const updatedLog = { ...currentLog, entries: updatedEntries };
    updateDayLog(updatedLog);
  }

  async function handleSaveDayReport() {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;

    try {
      setError(null);
      await persistDayLog(currentLog);
      showToast("✓ گزارش روز با موفقیت ذخیره شد.");
    } catch (err) {
      setError("خطا در ذخیره گزارش: " + err.message);
    }
  }

  async function appendChip(entryId, chip) {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;

    const updatedEntries = currentLog.entries.map((e) => {
      if (e.id !== entryId) return e;
      const currentNote = e.note || "";
      const newNote = currentNote ? `${currentNote.trim()} ${chip}` : chip;
      return { ...e, note: newNote };
    });

    const updatedLog = { ...currentLog, entries: updatedEntries };
    updateDayLog(updatedLog);

    try {
      await persistDayLog(updatedLog);
    } catch (err) {
      setError("خطا در ذخیره یادداشت: " + err.message);
    }
  }

  async function handleCopyReport() {
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    
    // ✅ FIX 3.2: Convert raw date to Persian
    let report = `📅 گزارش روز: ${toPersianDate(currentLog.date)}\n\n`;
    
    const moodEntry = MOOD_EMOJIS.find(m => m.value === currentLog.mood);
    if (moodEntry) {
      report += `😊 حال روز: ${moodEntry.emoji} ${moodEntry.label}\n`;
      if (currentLog.moodNote) {
        report += `📝 توضیح حال: ${currentLog.moodNote}\n`;
      }
      report += `\n`;
    }

    currentLog.entries.forEach(task => {
      if (task.done) {
        const duration = calculateDuration(task.actualStart, task.actualEnd);
        report += `✅ ${task.title}\n`;
        if (task.actualStart) {
          report += `   ⏱ ${task.actualStart} تا ${task.actualEnd || 'ادامه دارد'}${duration ? ` (${duration})` : ''}\n`;
        }
        if (task.note) {
          report += `   📝 ${task.note}\n`;
        }
        report += `\n`;
      }
    });
    if (currentLog.journalNote) {
      report += `💡 یادداشت روزانه:\n${currentLog.journalNote}\n`;
    }
    
    try {
      await navigator.clipboard.writeText(report);
      showToast("📋 گزارش برای پیام‌رسان کپی شد!");
    } catch (clipErr) {
      console.error("Clipboard error:", clipErr);
      showToast("❌ کپی ناموفق — دسترسی clipboard ندارید");
    }
  }

  async function stopActiveTimerCore() {
    const result = await TimerRepository.stop();
    if (!result) return { stopped: false };

    setActiveTimer(null);
    setElapsedTime(0);

    const currentLog = dayLogRef.current;
    let stoppedTaskTitle = "تسک قبلی";
    let dayLogSaved = true;

    if (currentLog) {
      const stoppedEntry = currentLog.entries.find((e) => e.id === result.taskRefId);
      stoppedTaskTitle = stoppedEntry?.title || stoppedTaskTitle;

      const now = nowMs();
      const startTimeMs = now - result.totalMs;
      
      const startDateTime = new Date(startTimeMs);
      const endDateTime = new Date(now);

      const startStr = startDateTime.toTimeString().split(" ")[0];
      const endStr = endDateTime.toTimeString().split(" ")[0];

      const updatedEntries = currentLog.entries.map((e) =>
        e.id === result.taskRefId
          ? { ...e, actualStart: startStr, actualEnd: endStr, done: true }
          : e
      );

      const updatedLog = { ...currentLog, entries: updatedEntries };
      updateDayLog(updatedLog);

      try {
        await persistDayLog(updatedLog, { applySavedState: false });
      } catch (saveErr) {
        dayLogSaved = false;
        console.error("خطا در ذخیره خودکار تایمر: ", saveErr);
        setError("تایمر متوقف شد اما ذخیره گزارش روز با خطا مواجه شد: " + saveErr.message);
      }
    }

    return { stopped: true, stoppedTaskTitle, dayLogSaved };
  }

  async function handleStopTimer(isSwitch = false) {
    if (timerActionPendingRef.current) return false;
    timerActionPendingRef.current = true;
    setTimerActionPending(true);

    try {
      const { stopped, stoppedTaskTitle, dayLogSaved } = await stopActiveTimerCore();
      if (!stopped) return false;

      if (!isSwitch) {
        showToast(dayLogSaved ? "تایمر متوقف و زمان ثبت شد." : "تایمر متوقف شد اما ذخیره گزارش روز شکست خورد.");
      } else {
        showToast(dayLogSaved ? `تایمر "${stoppedTaskTitle}" متوقف و ذخیره شد.` : `تایمر "${stoppedTaskTitle}" متوقف شد اما ذخیره گزارش روز شکست خورد.`);
      }

      return true;
    } catch (err) {
      setError("خطا در توقف تایمر: " + err.message);
      return false;
    } finally {
      timerActionPendingRef.current = false;
      setTimerActionPending(false);
    }
  }

  async function handleStartTimer(entryId) {
    if (timerActionPendingRef.current) return;
    timerActionPendingRef.current = true;
    setTimerActionPending(true);

    let stoppedPreviousTimer = false;

    try {
      if (activeTimer?.isRunning) {
        const { stopped, dayLogSaved } = await stopActiveTimerCore();
        if (!stopped) return;
        stoppedPreviousTimer = true;
        showToast(dayLogSaved ? "تایمر قبلی متوقف و ذخیره شد." : "تایمر قبلی متوقف شد اما ذخیره گزارش روز شکست خورد.");
      }

      const currentLog = dayLogRef.current;
      if (!currentLog) return;

      const timer = await TimerRepository.start(entryId, currentLog.date);
      setActiveTimer(timer);
      setElapsedTime(0);
    } catch (err) {
      setError(
        stoppedPreviousTimer
          ? "تایمر قبلی با موفقیت متوقف شد، اما شروع تایمر جدید با خطا مواجه شد: " + err.message
          : "خطا در شروع تایمر: " + err.message
      );
    } finally {
      timerActionPendingRef.current = false;
      setTimerActionPending(false);
    }
  }

  const handleDayToggle = (dayIndex) => {
    setRecDays(prev =>
      prev.includes(dayIndex) ? prev.filter(d => d !== dayIndex) : [...prev, dayIndex]
    );
  };

  async function handleSaveHabit() {
    if (!habitName.trim()) return;

    if (habitCount >= 7) {
      setError("سقف ۷ عادت فعال پر شده است. برای ثبت عادت جدید، ابتدا یکی را حذف کنید.");
      return;
    }

    try {
      let recurrence = { type: recType };
      if (recType === "weekly") {
        if (recDays.length === 0) throw new Error("حداقل یک روز انتخاب کنید.");
        recurrence.days = recDays;
      }
      
      await saveHabit({ 
        name: habitName.trim(), 
        domain: habitDomain, 
        recurrence,
        isCritical
      });

      const localLog = dayLogRef.current;
      const refreshed = await DayLogRepository.getOrCreateByDate(targetDateKey, targetDayEn);

      const localEntriesById = new Map((localLog?.entries || []).map((entry) => [entry.id, entry]));
      const mergedEntries = refreshed.entries.map((entry) => {
        const localEntry = localEntriesById.get(entry.id);
        if (!localEntry) return entry;

        return {
          ...entry,
          done: localEntry.done,
          actualStart: localEntry.actualStart,
          actualEnd: localEntry.actualEnd,
          note: localEntry.note,
        };
      });

      const mergedLog = {
        ...refreshed,
        journalNote: localLog?.journalNote ?? refreshed.journalNote,
        mood: localLog?.mood ?? refreshed.mood,
        moodNote: localLog?.moodNote ?? refreshed.moodNote,
        entries: mergedEntries,
      };

      updateDayLog(mergedLog);
      await persistDayLog(mergedLog);
      
      setHabitCount(prev => prev + 1);

      setHabitName("");
      setHabitDomain("discipline");
      setRecType("daily");
      setRecDays([]);
      setIsCritical(false);
      showToast("عادت جدید با موفقیت ثبت شد.");
    } catch (err) {
      setError(err.message);
    }
  }

  function handleJournalChange(e) {
    const val = e.target.value;
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    const updatedLog = { ...currentLog, journalNote: val };
    updateDayLog(updatedLog);
    
    if (journalDebounceRef.current) clearTimeout(journalDebounceRef.current);
    journalDebounceRef.current = setTimeout(async () => {
      try {
        await persistDayLog(updatedLog);
      } catch (err) {
        setError("خطا در ذخیره خودکار یادداشت: " + err.message);
      }
    }, 2500);
  }

  function handleJournalBlur() {
    if (journalDebounceRef.current) clearTimeout(journalDebounceRef.current);
    handleSaveDayReport();
  }

  async function handleMoodCommit(e) {
    const value = Number(e.target.value);
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    if (value === currentLog.mood) return;

    const previousMood = currentLog.mood;
    const updatedLog = { ...currentLog, mood: value };
    updateDayLog(updatedLog);
    try {
      await persistDayLog(updatedLog);
      showToast("حال روز ثبت شد.");
    } catch (err) {
      setMood(previousMood);
      updateDayLog({ ...currentLog, mood: previousMood });
      setError("خطا در ذخیره حال: " + err.message);
    }
  }

  function handleMoodNoteChange(e) {
    const val = e.target.value;
    setMoodNote(val);
    const currentLog = dayLogRef.current;
    if (!currentLog) return;
    const updatedLog = { ...currentLog, moodNote: val };
    updateDayLog(updatedLog);
  }

  function handleMoodNoteBlur() {
    handleSaveDayReport();
  }

  async function handleToggleFreeze() {
    const currentLog = dayLogRef.current;
    if (!currentLog || !canFreeze) return;
    
    setGraceLoading(true);
    setError(null);
    
    try {
      if (currentLog.status === "frozen") {
        const ok = await DayLogRepository.unfreezeDay(targetDateKey);
        if (!ok) {
          setError("خطا در Unfreeze — داده یافت نشد.");
          return;
        }
        showToast("❄️ روز از حالت Grace خارج شد.");
      } else {
        const ok = await DayLogRepository.freezeDay(targetDateKey);
        if (!ok) {
          setError("سقف Grace ماه تکمیل شده (۲/۲).");
          return;
        }
        showToast("❄️ روز Grace شد. استراحت کن!");
      }
      
      const refreshed = await DayLogRepository.getOrCreateByDate(targetDateKey, targetDayEn);
      updateDayLog(refreshed, { markMutation: false });
      
      const stats = await AggregationService.getTodayStats();
      setGraceUsed(stats.graceUsed ?? 0);
    } catch (err) {
      setError("خطا در Grace Day: " + err.message);
    } finally {
      setGraceLoading(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-os-text/50 font-mono">LOADING MISSION DATA...</div>;
  if (!dayLog) return <div className="p-8 text-center text-os-text/50">NO DATA</div>;

  const daysOfWeek = [
    { id: 0, label: 'ش', fullLabel: 'شنبه' },
    { id: 1, label: 'ی', fullLabel: 'یکشنبه' },
    { id: 2, label: 'د', fullLabel: 'دوشنبه' },
    { id: 3, label: 'س', fullLabel: 'سه‌شنبه' },
    { id: 4, label: 'چ', fullLabel: 'چهارشنبه' },
    { id: 5, label: 'پ', fullLabel: 'پنجشنبه' },
    { id: 6, label: 'ج', fullLabel: 'جمعه' }
  ];

  const renderEntry = (task) => {
    const duration = calculateDuration(task.actualStart, task.actualEnd);
    const isExpanded = expandedEntryId === task.id;
    const hasPlannedTime = task.plannedStart && task.plannedEnd;

    return (
      <div 
        key={task.id} 
        role="listitem"
        className={`bg-os-card border rounded-md p-3 transition-all outline-none ${task.done ? "opacity-60 border-os-border" : "border-os-border"} ${activeTimer?.taskRefId === task.id ? "border-os-accent" : ""} focus:ring-2 focus:ring-os-accent/50`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return; 
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggleDone(task.id);
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1">
            <button 
              onClick={() => handleToggleDone(task.id)}
              aria-pressed={task.done}
              aria-label={task.done ? `تسک ${task.title} انجام شده است` : `علامت‌گذاری تسک ${task.title} به عنوان انجام شده`}
              className={`w-6 h-6 rounded border-2 flex items-center justify-center transition ${task.done ? "bg-emerald-500 border-emerald-500 text-white" : "border-os-border"}`}
            >
              {task.done && "✓"}
            </button>
            <div className="flex-1">
              <h4 className={`text-sm font-bold ${task.done ? "line-through text-os-text/50" : "text-white"}`}>{task.title}</h4>
              <span className="text-[10px] font-mono text-os-text/40" dir="ltr">
                {hasPlannedTime ? `PLANNED: ${task.plannedStart} - ${task.plannedEnd}` : "⏱ زمان‌بندی نشده"}
                {task.actualStart && ` | ACTUAL: ${task.actualStart} - ${task.actualEnd}`}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 text-left">
            {duration && (
              <span className="text-[10px] font-mono text-os-accent bg-os-bg px-2 py-1 rounded border border-os-border" aria-hidden="true">
                {duration}
              </span>
            )}
            <button
              onClick={() => setExpandedEntryId(isExpanded ? null : task.id)}
              aria-expanded={isExpanded}
              aria-label={isExpanded ? "بستن جزئیات زمان‌بندی" : "باز کردن جزئیات و ثبت زمان واقعی"}
              className="text-os-text/50 hover:text-os-accent text-[10px] font-mono border border-os-border px-2 py-1 rounded transition"
            >
              {isExpanded ? "CLOSE" : "LOG"}
            </button>
            <button
              onClick={() => handleDeleteEntry(task.id)}
              aria-label={`حذف تسک ${task.title}`}
              className="text-red-400 border border-red-400/30 px-2 py-1 rounded text-[10px] font-mono hover:bg-red-500/10 transition"
            >
              DEL
            </button>
            {!activeTimer && !task.done && !isHistorical && (
              <button 
                onClick={() => handleStartTimer(task.id)} 
                disabled={timerActionPending}
                aria-label={`شروع تایمر برای ${task.title}`}
                className={`text-xs font-mono text-sky-400 border border-sky-400 px-2 py-1 rounded hover:bg-sky-400/10 transition ${timerActionPending ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                START
              </button>
            )}
          </div>
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-os-border space-y-3">
            <div className="flex gap-4 items-center">
              <div className="flex flex-col">
                <label className="text-[9px] font-mono text-os-text/50 mb-1" htmlFor={`start-${task.id}`}>ACTUAL START</label>
                <input
                  id={`start-${task.id}`}
                  type="time"
                  step="1"
                  value={task.actualStart || ""}
                  onChange={(e) => handleEntryDetailChange(task.id, 'actualStart', e.target.value)}
                  onBlur={handleSaveDayReport}
                  className="bg-os-bg border border-os-border rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-os-accent"
                  dir="ltr"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[9px] font-mono text-os-text/50 mb-1" htmlFor={`end-${task.id}`}>ACTUAL END</label>
                <input
                  id={`end-${task.id}`}
                  type="time"
                  step="1"
                  value={task.actualEnd || ""}
                  onChange={(e) => handleEntryDetailChange(task.id, 'actualEnd', e.target.value)}
                  onBlur={handleSaveDayReport}
                  className="bg-os-bg border border-os-border rounded p-2 text-xs font-mono text-white focus:outline-none focus:border-os-accent"
                  dir="ltr"
                />
              </div>
            </div>

            <div className="flex flex-col">
              <label className="text-[9px] font-mono text-os-text/50 mb-1" htmlFor={`note-${task.id}`}>NOTE / OBSTACLE</label>
              <textarea
                id={`note-${task.id}`}
                value={task.note || ""}
                onChange={(e) => handleEntryDetailChange(task.id, 'note', e.target.value)}
                onBlur={handleSaveDayReport}
                placeholder="یادداشت، خطایابی، یا مانع این بخش..."
                className="w-full h-20 bg-os-bg border border-os-border rounded p-2 text-xs text-white resize-none focus:outline-none focus:border-os-accent"
              />
              <div className="flex gap-2 mt-2">
                {["[#تمرکز_بالا]", "[#خستگی]", "[#نیاز_به_تکرار]"].map(chip => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => appendChip(task.id, chip)}
                    className="text-[9px] font-mono bg-os-bg border border-os-border text-os-text/70 px-2 py-1 rounded hover:border-os-accent hover:text-os-accent transition"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const fullDayProgress = Math.min(dayLog.fullDayScore || 0, 100);

  return (
    <div className={`max-w-3xl mx-auto p-4 md:p-8 text-os-text relative transition-opacity duration-500 ${dayLog.status === "frozen" ? "opacity-40" : "opacity-100"}`} dir="rtl">

      {toastMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-os-card border border-sky-500 text-sky-400 px-4 py-2 rounded shadow-lg z-50 text-sm font-mono text-center" role="status" aria-live="polite">
          {toastMsg}
        </div>
      )}

      {error && (
        <div className="mb-4 bg-red-500/10 border border-red-500 text-red-400 px-4 py-2 rounded text-xs font-mono flex justify-between items-center" role="alert" aria-live="assertive">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300 ml-2" aria-label="بستن خطا">✖</button>
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" role="dialog" aria-modal="true" onClick={cancelDelete}>
          <div className="bg-os-card border border-os-border rounded-lg p-6 max-w-sm w-full mx-4 text-right" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-bold text-white mb-3">تأیید حذف</h3>
            <p className="text-xs text-os-text/70 mb-6 whitespace-pre-line">{confirmDeleteMsg}</p>
            <div className="flex gap-3 justify-end">
              <button onClick={cancelDelete} className="px-4 py-2 text-xs font-mono border border-os-border rounded hover:bg-os-bg transition">انصراف</button>
              <button onClick={executeDelete} className="px-4 py-2 text-xs font-mono bg-red-500/20 border border-red-500 text-red-400 rounded hover:bg-red-500/30 transition">حذف</button>
            </div>
          </div>
        </div>
      )}

      {dayLog.status === "frozen" && (
        <div className="mb-4 opacity-40 border border-os-border/50 text-os-text/60 px-4 py-2 rounded text-xs font-mono text-center">
          ❄️ این روز در حالت Grace است — استراحت کن!
        </div>
      )}

      <div className="flex justify-between items-center mb-4">
        <div className="text-right">
          {/* ✅ FIX 3.3: Convert header date to Persian */}
          <h2 className="text-xl font-bold text-white">
            {isHistorical ? `داشبورد اجرای ${toPersianDate(dayLog.date)}` : "داشبورد اجرای امروز"}
          </h2>
          {/* ✅ FIX 3.4: Convert sub-header date to Persian */}
          <p className="text-xs font-mono text-os-text/50 mt-1 tracking-widest text-left" dir="ltr">
            DATE: {toPersianDate(dayLog.date)} {isHistorical && "● ARCHIVE"}
          </p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-mono border ${
          dayLog.status === "frozen" 
            ? "opacity-40 text-os-text/60 border-os-border/50" 
            : dayLog.fullDay 
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500" 
              : "bg-os-text/10 text-os-text/50 border-os-border"
        }`} aria-live="polite">
          {dayLog.status === "frozen" ? "❄️ FROZEN" : dayLog.fullDay ? "✓ FULL DAY ACHIEVED" : "○ IN PROGRESS"}
        </div>
      </div>

      <div className="mb-8" title={`${Math.round(fullDayProgress)}% — ${fullDayProgress >= 90 ? 'Full Day!' : 'نیاز به 90% برای Full Day'}`}>
        <div className="flex justify-between text-[10px] font-mono text-os-text/50 mb-1">
          <span>PROGRESS TO FULL DAY</span>
          <div className="flex items-center gap-2">
            {!dayLog.fullDay && streak > 0 && (
              <span className="text-[9px] text-os-text/30">🔥 {streak} <span className="hidden sm:inline">— بر اساس دیروز</span></span>
            )}
            <span dir="ltr">{Math.round(fullDayProgress)}% / 90%</span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-os-border/30 rounded-full overflow-hidden" role="progressbar" aria-valuenow={Math.round(fullDayProgress)} aria-valuemin="0" aria-valuemax="100" aria-label="پیشرفت روز به سمت Full Day">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              fullDayProgress >= 90 ? "bg-emerald-500" : "bg-amber-400"
            }`}
            style={{ width: `${fullDayProgress}%` }}
            aria-hidden="true"
          />
        </div>
      </div>

      {canFreeze && (
        <div className="mb-4 flex justify-end items-center gap-2">
          <span className="text-[10px] font-mono text-os-text/40">
            GRACE {graceUsed}/2
          </span>
          <button
            onClick={handleToggleFreeze}
            disabled={graceLoading}
            aria-pressed={dayLog.status === "frozen"}
            aria-label={dayLog.status === "frozen" ? "خروج از حالت Grace Day" : "فعال‌سازی Grace Day"}
            className={`px-3 py-1.5 rounded-full text-xs font-mono border transition ${
              dayLog.status === "frozen"
                ? "opacity-40 text-os-text/60 border-os-border/50 hover:opacity-60"
                : "bg-os-card text-os-text/70 border-os-border hover:opacity-80"
            } ${graceLoading ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            {graceLoading ? "..." : dayLog.status === "frozen" ? "❄️ Unfreeze" : "❄️ Freeze Day"}
          </button>
        </div>
      )}

      {activeTimer && !isHistorical && (
        <div className="mb-6 bg-os-accent/10 border border-os-accent p-4 rounded-md flex justify-between items-center" role="status" aria-live="polite">
          <div className="text-right">
            <p className="text-[10px] text-os-accent font-bold">ACTIVE MISSION</p>
            <p className="text-sm text-white">
              {dayLog.entries.find(e => e.id === activeTimer.taskRefId)?.title || "در حال اجرا..."}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xl font-mono font-bold text-os-accent" dir="ltr">{formatMs(elapsedTime)}</span>
            <button 
              onClick={() => handleStopTimer()} 
              disabled={timerActionPending}
              className={`bg-red-500/20 border border-red-500 text-red-400 px-3 py-1 rounded text-xs font-mono hover:bg-red-500/30 transition ${timerActionPending ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              STOP & SAVE
            </button>
          </div>
        </div>
      )}

      {!isHistorical && (
        habitCount >= 7 ? (
          <div className="flex flex-col gap-3 mb-8 p-4 bg-os-card border border-os-border rounded-lg text-right">
            <h3 className="text-sm font-mono text-os-accent text-left">[ + ] ADD NEW HABIT</h3>
            <div className="text-center py-4">
              <p className="text-sm text-os-text/70">سقف ۷ عادت فعال پر شده</p>
              <p className="text-[10px] text-os-text/40 mt-1">برای افزودن عادت جدید ابتدا یکی را حذف کن</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 mb-8 p-4 bg-os-card border border-os-border rounded-lg text-right">
            <h3 className="text-sm font-mono text-os-accent text-left">[ + ] ADD NEW HABIT</h3>
            <input
              value={habitName}
              onChange={(e) => setHabitName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSaveHabit()}
              placeholder="نام عادت..."
              className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text transition"
            />

            <select
              value={habitDomain}
              onChange={(e) => setHabitDomain(e.target.value)}
              className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text text-sm font-mono transition"
            >
              {HABIT_DOMAINS.map(d => (
                <option key={d.value} value={d.value} style={{ color: d.color }}>
                  {d.label}
                </option>
              ))}
            </select>

            <div className="flex gap-4 items-center mt-2 justify-start">
              <label className="flex items-center gap-2 text-sm cursor-pointer text-os-text/70">
                <input type="radio" name="recurrence-type" checked={recType === "daily"} onChange={() => setRecType("daily")} className="accent-os-accent" />
                هر روز
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer text-os-text/70">
                <input type="radio" name="recurrence-type" checked={recType === "weekly"} onChange={() => setRecType("weekly")} className="accent-os-accent" />
                روزهای خاص
              </label>
            </div>

            {recType === "weekly" && (
              <div className="flex gap-2 mt-2 justify-start">
                {daysOfWeek.map(day => (
                  <button
                    key={day.id}
                    type="button"
                    onClick={() => handleDayToggle(day.id)}
                    aria-pressed={recDays.includes(day.id)}
                    aria-label={day.fullLabel}
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

            <label className="flex items-center gap-2 text-sm cursor-pointer text-os-text/70 mt-2">
              <input 
                type="checkbox" 
                checked={isCritical} 
                onChange={(e) => setIsCritical(e.target.checked)} 
                className="accent-red-500 w-4 h-4"
              />
              <span className="text-red-400 font-bold">🔴 CRITICAL MISSION</span>
            </label>

            <button
              onClick={handleSaveHabit}
              className="bg-os-accent text-os-bg px-6 py-3 rounded-lg font-mono font-bold hover:bg-os-accent/90 transition-colors mt-2"
            >
              ثبت عادت
            </button>
          </div>
        )
      )}

      <div className="mb-4">
        <div className="relative">
          <input
            type="text"
            value={taskSearch}
            onChange={(e) => setTaskSearch(e.target.value)}
            placeholder="🔍 جستجو در تسک‌ها..."
            className="w-full px-4 py-2.5 pr-10 bg-os-bg border border-os-border rounded-lg text-sm text-os-text focus:outline-none focus:border-os-accent transition placeholder:text-os-text/30"
          />
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-os-text/30 text-sm">🔍</span>
        </div>
      </div>

      <div className="mb-8 text-right">
        <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ! ] CRITICAL MISSIONS</h3>
        <div className="space-y-2" role="list">
          {filteredCritical.length === 0 ? (
            <div className="text-os-text/40 text-sm text-center py-4 border border-dashed border-os-border/30 rounded">
              {taskSearch.trim() ? "🔍 نتیجه‌ای برای این جستجو یافت نشد." : "🔴 هنوز ماموریت بحرانی نداری."}
              {!taskSearch.trim() && <br />}
              {!taskSearch.trim() && <span className="text-[10px]">چک‌باکس CRITICAL MISSION را در فرم بالا بزن یا از <Link to="/planner" className="text-os-accent underline hover:text-os-accent/80">برنامه‌ریز</Link> import کن.</span>}
            </div>
          ) : (
            filteredCritical.map(task => renderEntry(task))
          )}
        </div>
      </div>

      <div className="mb-8 text-right">
        <h3 className="text-sm font-mono text-sky-400 mb-3 text-left">[ - ] OTHER BLOCKS</h3>
        <div className="space-y-2 text-right" role="list">
          {filteredOther.length === 0 ? (
             <div className="text-os-text/40 text-sm text-center py-4 border border-dashed border-os-border/30 rounded">
              {taskSearch.trim() ? "🔍 نتیجه‌ای برای این جستجو یافت نشد." : "هیچ بلوک دیگری برای امروز ثبت نشده است."}
              {!taskSearch.trim() && <br />}
              {!taskSearch.trim() && <span className="text-[10px]">برنامهٔ هفتگی را در <Link to="/planner" className="text-os-accent underline hover:text-os-accent/80">برنامه‌ریز</Link> تنظیم کن.</span>}
            </div>
          ) : (
            filteredOther.map(task => renderEntry(task))
          )}
        </div>
      </div>

      <div className="mb-8 p-4 bg-os-card border border-os-border rounded-lg text-right">
        <h3 className="text-sm font-mono text-amber-400 mb-3 text-left">[ ~ ] MOOD SLIDER</h3>
        <div className="flex flex-col items-center gap-3 mb-3">
          <div className="flex flex-col items-center h-16 justify-center transition-all">
            {mood ? (
              <>
                <span className="text-3xl" aria-hidden="true">{MOOD_EMOJIS[mood - 1]?.emoji}</span>
                <span className="text-xs font-mono text-amber-400 mt-1">{MOOD_EMOJIS[mood - 1]?.label}</span>
              </>
            ) : (
              <>
                <span className="text-3xl opacity-30" aria-hidden="true">😐</span>
                <span className="text-xs font-mono text-os-text/40 mt-1">یکی را انتخاب کن</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2" role="radiogroup" aria-label="سطح حال روز">
            {MOOD_EMOJIS.map((m) => (
              <button
                key={m.value}
                onClick={() => {
                  setMood(m.value);
                  handleMoodCommit({ target: { value: m.value } });
                }}
                role="radio"
                aria-checked={mood === m.value}
                aria-label={m.label}
                className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-xl transition-all ${
                  mood === m.value
                    ? "border-amber-400 bg-amber-400/20 scale-110"
                    : "border-os-border bg-os-bg opacity-50 hover:opacity-80"
                }`}
              >
                {m.emoji}
              </button>
            ))}
          </div>
        </div>
        
        <label htmlFor="mood-note" className="sr-only">توضیح حال روز</label>
        <textarea
          id="mood-note"
          value={moodNote}
          onChange={handleMoodNoteChange}
          onBlur={handleMoodNoteBlur}
          placeholder="حالم امروز چطور بود؟ (اختیاری)"
          className="w-full h-16 bg-os-bg border border-os-border rounded p-2 text-xs text-white resize-none focus:outline-none focus:border-amber-400 transition"
        />
      </div>

      <div className="text-right">
        <h3 className="text-sm font-mono text-purple-400 mb-3 text-left">[ * ] DAILY JOURNAL</h3>
        <label htmlFor="journal-note" className="sr-only">یادداشت روزانه</label>
        <div className="mb-4">
          <span className="text-[10px] font-mono text-os-text/50 block mb-1">
            بزرگترین مانع امروز چه بود؟ <span className="text-os-text/30">(تحلیل موانع برای مشاور)</span>
          </span>
          <textarea
            id="journal-note"
            value={dayLog.journalNote || ""}
            onChange={handleJournalChange}
            onBlur={handleJournalBlur}
            placeholder="یادداشت کن..."
            className="w-full h-32 p-3 bg-os-card border border-os-border rounded-md text-sm text-os-text focus:outline-none focus:border-sky-400 resize-none transition"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={handleCopyReport}
            className="flex items-center justify-center gap-2 bg-sky-500/10 border border-sky-500 text-sky-400 py-3 rounded-lg font-mono text-sm hover:bg-sky-500/20 transition"
          >
            📋 کپی برای مشاور
          </button>
          <button
            onClick={handleSaveDayReport}
            className="flex items-center justify-center gap-2 bg-emerald-500/10 border border-emerald-500 text-emerald-400 py-3 rounded-lg font-mono text-sm hover:bg-emerald-500/20 transition"
          >
            ✓ ذخیره نهایی روز
          </button>
        </div>
      </div>
    </div>
  );
}