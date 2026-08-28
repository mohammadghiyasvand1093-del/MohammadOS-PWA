// src/pages/PlannerPage.jsx
import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { db } from "../db/database";
import { toPersianDate, nowMs, getLocalDateKey } from "../utils/date";
import { importDatedSchedule, importWeeklySchedule } from "../app/ImportService";

const WEEK_DAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function getPersianWeekDates(reference = new Date(nowMs())) {
  const d = new Date(reference);
  const day = d.getDay();
  const daysSinceSat = (day + 1) % 7;
  const saturday = new Date(d);
  saturday.setDate(d.getDate() - daysSinceSat);

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

// ✅ FIX: New urgency config (replaces 1-5 priority UI, priority field kept for compatibility)
const URGENCY_CONFIG = {
  normal: { color: "#6B7280", label: "معمولی" },
  medium: { color: "#FBBF24", label: "متوسط" },
  critical: { color: "#F87171", label: "بحرانی" },
};

export default function PlannerPage() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [showAdvisorImport, setShowAdvisorImport] = useState(false);
  const [advisorJson, setAdvisorJson] = useState("");
  const [advisorMsg, setAdvisorMsg] = useState(null);
  const [formError, setFormError] = useState("");
  const [clockMs, setClockMs] = useState(() => nowMs());
  
  const [form, setForm] = useState({
    title: "",
    date: "",
    startTime: "09:00",
    endTime: "10:00",
    priority: 3,        // ← kept for compatibility, not shown in UI
    urgencyLevel: "normal", // ← NEW field
    note: ""
  });

  const weekDates = useMemo(() => {
    const reference = new Date(clockMs);
    reference.setDate(reference.getDate() + weekOffset * 7);
    return getPersianWeekDates(reference);
  }, [clockMs, weekOffset]);
  const todayDateKey = (() => {
    const d = new Date(clockMs);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();

  useEffect(() => {
    const timer = setInterval(() => setClockMs(nowMs()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    try {
      const all = await ScheduleRepository.getAllSchedules();
      const dateEvents = [];
      const seen = new Set();
      
      for (const record of all) {
        if (!record.dayOfWeek || !/^\d{4}-\d{2}-\d{2}$/.test(record.dayOfWeek)) continue;
        for (const block of record.schedule || []) {
          // ✅ FIX: Only type==="event" goes to Planner
          if (block.type !== "event") continue;
          
          const sig = `${record.dayOfWeek}|${block.title}|${block.startTime}|${block.endTime}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          dateEvents.push({ ...block, date: record.dayOfWeek, scheduleId: record.id, eventId: block.id || null, blockIndex: record.schedule.indexOf(block) });
        }
      }
      dateEvents.sort((a, b) => (a.date > b.date ? 1 : -1));
      setEvents(dateEvents);
    } catch (err) {
      console.error("Load events error:", err);
    }
  }

  async function handleSaveEvent(e) {
    e.preventDefault();
    setFormError("");
    if (!form.title.trim() || !form.date) {
      setFormError("عنوان و تاریخ رویداد را وارد کنید.");
      return;
    }
    if (form.startTime >= form.endTime) {
      setFormError("زمان پایان باید بعد از زمان شروع باشد.");
      return;
    }

    const block = {
      id: crypto.randomUUID(),
      title: form.title.trim(),
      type: "event",
      startTime: form.startTime,
      endTime: form.endTime,
      priority: Number(form.priority), // ← legacy compatibility
      urgencyLevel: form.urgencyLevel || "normal", // ← NEW
      note: form.note || ""
    };

    const existing = await ScheduleRepository.getDaySchedule(form.date);
    const current = existing?.schedule || [];
    
    // Prevent manual duplicates
    const isDuplicate = current.some(c => 
      c.title === block.title && c.startTime === block.startTime
    );
    if (isDuplicate) {
      alert("این رویداد قبلاً برای این تاریخ ثبت شده است.");
      return;
    }

    await ScheduleRepository.saveDaySchedule(form.date, [...current, block], {
      scheduleMode: "one_off_event",
      dateKey: form.date,
    });

    await loadEvents();
    setShowForm(false);
    setForm({ title: "", date: selectedDate || "", startTime: "09:00", endTime: "10:00", priority: 3, urgencyLevel: "normal", note: "" });
  }

  async function handleDeleteEvent(date, title, scheduleId, eventId, blockIndex) {
    const existing = scheduleId
      ? await db.schedules.get(scheduleId)
      : await ScheduleRepository.getDaySchedule(date);
    if (!existing?.schedule) return;
    const updated = existing.schedule.filter((b, index) => {
      if (eventId) return b.id !== eventId;
      if (Number.isInteger(blockIndex)) return index !== blockIndex;
      return !(b.title === title && b.type === "event");
    });
    if (updated.length === 0) {
      await ScheduleRepository.delete(existing.id);
    } else {
      await ScheduleRepository.saveDaySchedule(date, updated, {
        scheduleMode: existing.scheduleMode || "one_off_event",
        dateKey: existing.dateKey || date,
        planId: existing.planId,
      });
    }
    await loadEvents();
  }


  async function handleAdvisorImport() {
    setAdvisorMsg(null);
    try {
      const data = JSON.parse(advisorJson);
      const hasGates = data.gates && Array.isArray(data.gates);
      const hasDays = data.days && Array.isArray(data.days);
      const hasSchedule = data.schedule && Array.isArray(data.schedule);

      if (data.scheduleMode === "dated_plan") {
        const result = await importDatedSchedule(advisorJson);
        setAdvisorMsg({ type: "success", text: `${result.days} روز و ${result.totalBlocks} بلوک تاریخ‌محور import شد.` });
        setAdvisorJson("");
      } else if (data.scheduleMode === "weekly_template") {
        const result = await importWeeklySchedule(advisorJson);
        setAdvisorMsg({ type: "success", text: `${result.importedDays} روز از الگوی هفتگی import شد.` });
        setAdvisorJson("");
      } else if (hasGates) {
        // ── Roadmap Import ──
        const gatesToImport = data.gates;
        let importedCount = 0;
        for (const g of gatesToImport) {
          const gate = {
            id: g.id || crypto.randomUUID(),
            title: g.title?.trim() || "Untitled Gate",
            description: g.description?.trim() || "",
            constraintNote: g.constraintNote?.trim() || "",
            deadline: g.deadline || null,
            deadlineNote: g.deadlineNote?.trim() || "",
            order: g.order || 0,
            dependsOn: Array.isArray(g.dependsOn) ? g.dependsOn : [],
            criteria: (g.criteria || []).map((c) => ({
              id: c.id || crypto.randomUUID(),
              text: c.title?.trim() || c.text?.trim() || "",
              done: c.done || false,
              assessmentResult: c.assessment || c.assessmentResult || "pending",
              evidenceLink: c.evidenceLink || "",
              estimatedHours: c.estimatedHours || null,
              priority: c.priority || 3,
            })),
            evidenceLink: g.evidenceLink || null,
            linkedRefIds: g.linkedRefIds || [],
            progress: g.progress || 0,
          };
          const existing = await db.gates.get(gate.id);
          if (!existing) {
            await db.gates.put(gate);
            importedCount++;
          }
        }
        setAdvisorMsg({ type: "success", text: `${importedCount} دروازه جدید import شد. (تکراری‌ها نادیده گرفته شدند)` });
        setAdvisorJson("");
      } else if (hasDays || hasSchedule) {
        // ── Study Plan Import ──
        const days = hasDays
          ? data.days
          : [{ dayOfWeek: data.date || getLocalDateKey(new Date()), schedule: data.schedule }];

        let importedCount = 0;
        for (const day of days) {
          if (!day.dayOfWeek || !day.schedule) continue;
          const existing = await ScheduleRepository.getDaySchedule(day.dayOfWeek);
          const current = existing?.schedule || [];
          const sigs = new Set(current.map((c) => `${c.title}|${c.startTime}`));
          const merged = [...current];

          for (const b of day.schedule) {
            const block = {
              title: b.title || "",
              type: b.type || "course",
              startTime: b.startTime || "08:00",
              endTime: b.endTime || "09:00",
              isCritical: b.isCritical || false,
              priority: b.priority || 3,
              domain: b.domain || "general",
              id: b.id || crypto.randomUUID(),
            };
            const sig = `${block.title}|${block.startTime}`;
            if (!sigs.has(sig)) {
              merged.push(block);
              sigs.add(sig);
              importedCount++;
            }
          }
          await ScheduleRepository.saveDaySchedule(day.dayOfWeek, merged, {
            scheduleMode: /^\d{4}-\d{2}-\d{2}$/.test(day.dayOfWeek) ? "one_off_event" : "weekly_template",
            dateKey: /^\d{4}-\d{2}-\d{2}$/.test(day.dayOfWeek) ? day.dayOfWeek : null,
          });
        }
        setAdvisorMsg({ type: "success", text: `${importedCount} بلوک برنامهٔ درسی import شد.` });
        setAdvisorJson("");
      } else {
        throw new Error("نوع JSON شناسایی نشد. باید فیلد 'gates' (نقشه راه) یا 'days/schedule' (برنامه درسی) داشته باشد.");
      }
    } catch (err) {
      console.error("Advisor import error:", err);
      setAdvisorMsg({ type: "error", text: "خطا: " + (err.message || "نامشخص") });
    }
  }

  const filteredEvents = selectedDate
    ? events.filter(e => e.date === selectedDate)
    : events.filter(e => weekDates.includes(e.date));

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 font-vazir rtl text-os-text">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black mb-1">برنامه‌ریز هوشمند</h1>
        <p className="font-mono text-[10px] tracking-[0.3em] text-os-accent uppercase">
          Strategic Operations Planner
        </p>
      </div>

      {/* Week Grid */}
      <div className="mb-8 p-4 bg-os-card border border-os-border rounded-lg">
        <div className="flex items-center justify-between gap-2 mb-3">
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
            className="touch-target px-3 py-2 rounded border border-os-border text-xs font-mono hover:border-os-accent"
            aria-label="هفته قبل"
          >
            ← هفته قبل
          </button>
          <h3 className="text-sm font-mono text-os-accent text-center">[ ◈ ] مرور هفته</h3>
          <button
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
            className="touch-target px-3 py-2 rounded border border-os-border text-xs font-mono hover:border-os-accent"
            aria-label="هفته بعد"
          >
            هفته بعد →
          </button>
        </div>
        <div className="flex justify-center mb-3">
          <button
            type="button"
            onClick={() => { setWeekOffset(0); setSelectedDate(null); }}
            className={`touch-target px-3 py-1.5 rounded border text-[10px] font-mono ${
              weekOffset === 0
                ? "border-os-accent text-os-accent bg-os-accent/10"
                : "border-os-border text-os-text/60 hover:border-os-accent"
            }`}
          >
            بازگشت به هفته جاری
          </button>
        </div>
        <div className="grid grid-cols-7 gap-2 mb-2">
          {weekDates.map((dateKey, idx) => {
            const dayEvents = events.filter(e => e.date === dateKey);
            const isToday = dateKey === todayDateKey;
            return (
              <button
                key={dateKey}
                onClick={() => setSelectedDate(selectedDate === dateKey ? null : dateKey)}
                className={`touch-target flex flex-col items-center gap-1 p-2 rounded-lg border transition-all hover:scale-105 ${
                  isToday
                    ? "border-os-accent bg-os-accent/10"
                    : selectedDate === dateKey
                      ? "border-sky-400 bg-sky-400/10"
                      : "border-os-border/50 bg-os-bg/50"
                }`}
                aria-pressed={selectedDate === dateKey}
                aria-label={`${WEEK_DAYS_SHORT[idx]}، ${toPersianDate(dateKey)}، ${dayEvents.length} رویداد`}
              >
                <span className="text-[10px] font-mono text-os-text/50">{WEEK_DAYS_SHORT[idx]}</span>
                <span className={`text-sm font-bold ${isToday ? "text-os-accent" : "text-os-text"}`}>
                  {toPersianDate(dateKey).split("/")[2]}
                </span>
                <div className="flex gap-0.5">
                  {dayEvents.slice(0, 3).map((ev, i) => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: (URGENCY_CONFIG[ev.urgencyLevel] || URGENCY_CONFIG.normal).color }} />
                  ))}
                </div>
              </button>
            );
          })}
        </div>
        <div className="text-center">
          <span className="text-xs font-mono text-os-text/40">
            {selectedDate ? `فیلتر: ${toPersianDate(selectedDate)}` : "هفته جاری"}
          </span>
        </div>
      </div>

      {/* Advisor Import Section */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvisorImport(!showAdvisorImport)}
          className="w-full py-3 rounded-lg font-mono text-sm border border-os-border text-os-text hover:bg-os-card transition"
        >
          [ 📥 ] ورودی مشاور {showAdvisorImport ? "▲" : "▼"}
        </button>

        {showAdvisorImport && (
          <div className="mt-3 p-4 bg-os-card border border-os-border rounded-lg space-y-3">
            <p className="text-[10px] font-mono text-os-text/50">
              JSON مشاور را اینجا paste کنید. سیستم به‌صورت خودکار نوع را تشخیص می‌دهد:
            </p>
            <ul className="text-[10px] font-mono text-os-text/40 list-disc list-inside space-y-0.5">
              <li>اگر فیلد <code className="text-os-accent">gates</code> دارد → نقشه راه</li>
              <li>اگر <code className="text-os-accent">scheduleMode: dated_plan</code> دارد → برنامهٔ تاریخ‌محور</li>
              <li>اگر <code className="text-os-accent">scheduleMode: weekly_template</code> یا فیلد <code className="text-os-accent">days</code> دارد → برنامهٔ هفتگی</li>
            </ul>
            <textarea
              value={advisorJson}
              onChange={(e) => setAdvisorJson(e.target.value)}
              placeholder='{"scheduleMode":"dated_plan","startDate":"2026-09-01","endDate":"2026-09-30","days":[...]}'
              className="w-full h-32 bg-os-bg border border-os-border rounded p-3 font-mono text-[11px] focus:border-os-accent outline-none resize-none"
            />
            <button
              onClick={handleAdvisorImport}
              className="w-full py-2 text-xs font-mono border border-os-accent text-os-accent hover:bg-os-accent hover:text-os-bg rounded transition"
            >
              IMPORT & MERGE
            </button>
            {advisorMsg && (
              <div className={`p-2.5 rounded border text-xs font-mono ${
                advisorMsg.type === "success"
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border-red-500/30 text-red-400"
              }`}>
                {advisorMsg.text}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mb-6">
        <button
          onClick={() => {
            const date = selectedDate || todayDateKey;
            setSelectedDate(date);
            setForm((current) => ({ ...current, date }));
            setFormError("");
            setShowForm(true);
          }}
          className="touch-target w-full py-3 rounded-lg font-bold bg-os-accent/10 border border-os-accent text-os-accent hover:bg-os-accent hover:text-os-bg transition"
        >
          [ + ] رویداد جدید
        </button>
      </div>

      {/* Event Form */}
      {showForm && (
        <form onSubmit={handleSaveEvent} className="mb-6 p-4 bg-os-card border border-os-border rounded-lg space-y-3">
          <h4 className="text-sm font-mono text-os-accent text-left">[ + ] NEW EVENT</h4>
          {formError && (
            <div className="p-3 rounded border border-red-500/40 bg-red-500/10 text-red-400 text-xs" role="alert">
              {formError}
            </div>
          )}
          <label htmlFor="planner-event-title" className="sr-only">عنوان رویداد</label>
          <input
            id="planner-event-title"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="عنوان رویداد (امتحان، دکتر، مهمانی...)"
            className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text"
          />
          <div className="grid grid-cols-2 gap-3">
            <label htmlFor="planner-event-date" className="sr-only">تاریخ رویداد</label>
            <input
              id="planner-event-date"
              required
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              className="w-full px-4 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text"
            />
            <div className="flex gap-2">
              <label htmlFor="planner-event-start" className="sr-only">زمان شروع</label>
              <input
                id="planner-event-start"
                type="time"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full px-2 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text text-center"
                dir="ltr"
              />
              <label htmlFor="planner-event-end" className="sr-only">زمان پایان</label>
              <input
                id="planner-event-end"
                type="time"
                value={form.endTime}
                onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full px-2 py-3 border border-os-border bg-os-bg rounded-lg focus:outline-none focus:border-os-accent text-os-text text-center"
                dir="ltr"
              />
            </div>
          </div>
          
          {/* ✅ FIX: New Urgency Level UI replacing 1-5 priority */}
          <div>
            <span className="text-[10px] font-mono text-os-text/50 block mb-1">سطح فوریت</span>
            <div className="flex gap-2">
              {Object.entries(URGENCY_CONFIG).map(([key, cfg]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setForm({ ...form, urgencyLevel: key })}
                  className={`touch-target flex-1 py-2 rounded border text-xs font-mono transition ${
                    form.urgencyLevel === key
                      ? "border-os-accent text-os-accent bg-os-accent/10"
                      : "border-os-border text-os-text/50 hover:border-os-text/70"
                  }`}
                  aria-pressed={form.urgencyLevel === key}
                  aria-label={`سطح فوریت: ${cfg.label}`}
                >
                  <span className="inline-block w-2 h-2 rounded-full mr-1 align-middle" style={{ backgroundColor: cfg.color }} />
                  {cfg.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            id="planner-event-note"
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="یادداشت..."
            className="w-full h-20 bg-os-bg border border-os-border rounded p-3 text-xs focus:outline-none focus:border-os-accent resize-none"
          />
          <div className="flex gap-3">
            <button type="submit" className="touch-target flex-1 py-2 bg-os-accent text-os-bg rounded font-bold hover:bg-os-accent/90 transition">
              ثبت رویداد
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="touch-target px-4 py-2 border border-os-border rounded hover:bg-os-border transition">
              انصراف
            </button>
          </div>
        </form>
      )}

      {/* Event List */}
      <div className="space-y-3">
        <h3 className="text-sm font-mono text-os-accent mb-2 text-left">
          [ ≡ ] EVENTS {selectedDate ? `— ${toPersianDate(selectedDate)}` : "THIS WEEK"}
        </h3>
        {filteredEvents.length === 0 && (
          <div className="bg-os-card text-center py-12 opacity-50 border border-os-border rounded-lg">
            <p className="font-mono text-sm">NO EVENTS FOUND</p>
          </div>
        )}
        {filteredEvents.map((ev, idx) => {
          // ✅ FIX: Map old priority to new urgency config defensively if urgencyLevel is missing
          const uCfg = URGENCY_CONFIG[ev.urgencyLevel] || URGENCY_CONFIG.normal;
          return (
            <div key={`${ev.date}-${ev.title}-${idx}`} className="bg-os-card border border-os-border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="w-2 h-10 rounded-full" style={{ backgroundColor: uCfg.color }} />
                <div>
                  <h4 className="text-sm font-bold text-white">{ev.title}</h4>
                  <p className="text-[10px] font-mono text-os-text/50" dir="ltr">
                    {toPersianDate(ev.date)} • {ev.startTime} - {ev.endTime}
                  </p>
                  {ev.note && <p className="text-[10px] text-os-text/40 mt-1">{ev.note}</p>}
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 shrink-0">
                <span className="text-[10px] font-mono px-2 py-1 rounded border" style={{ color: uCfg.color, borderColor: `${uCfg.color}44`, backgroundColor: `${uCfg.color}11` }}>
                  {uCfg.label}
                </span>
                <button
                  onClick={() => navigate(`/?date=${ev.date}`)}
                  className="text-[10px] font-mono text-sky-400 border border-sky-400 px-2 py-1 rounded hover:bg-sky-400/10 transition"
                >
                  VIEW
                </button>
                <button
                  onClick={() => handleDeleteEvent(ev.date, ev.title, ev.scheduleId, ev.eventId, ev.blockIndex)}
                  className="text-[10px] font-mono text-red-400 border border-red-400 px-2 py-1 rounded hover:bg-red-400/10 transition"
                >
                  DEL
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
