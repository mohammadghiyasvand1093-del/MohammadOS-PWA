// src/pages/ReportsPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GateRepository } from "../repositories/GateRepository";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { ImportService } from "../app/ImportService";
import { AggregationService } from "../service/aggregationService";
import { exportToJSON, exportToCSV } from "../app/exportData";
import {
  getPersianWeekKey, getPersianWeekRange, getLocalDateKey, nowMs, toPersianDate, toPersianNumber, toPersianWeekRangeLabel,
} from "../utils/date";

import {
  WEEKLY_PLANNER_PROMPT,
  WEEKLY_PLANNER_GUIDE_TEXT,
  DATED_PLANNER_PROMPT,
  DATED_PLANNER_GUIDE_TEXT,
} from "../ai/weeklyPlannerPrompt";
import { importDatedSchedule, importWeeklySchedule } from "../app/ImportService";

const DOMAINS = [
  { key: "learning", label: "یادگیری", icon: "📚" }, { key: "fitness", label: "تناسب‌اندام", icon: "💪" },
  { key: "discipline", label: "انضباط", icon: "🎯" }, { key: "work", label: "کار", icon: "💼" },
  { key: "rest", label: "استراحت", icon: "🛌" }, { key: "social", label: "اجتماعی", icon: "🤝" },
];
const MOOD_LABELS = { 1: "😫 خیلی بد", 2: "😕 بد", 3: "😐 معمولی", 4: "🙂 خوب", 5: "😄 عالی" };
const HEATMAP_LEVELS = ["bg-os-border/20", "bg-emerald-500/30", "bg-emerald-500/50", "bg-emerald-500/70", "bg-emerald-500"];
const DOMAIN_COLORS = { learning: "#3B82F6", fitness: "#10B981", discipline: "#F59E0B", work: "#8B5CF6", rest: "#64748B", social: "#EC4899" };
const IMPORT_TABLES = ["dayLogs", "habits", "courses", "gates", "schedules", "courseSessions", "fixedEvents", "activeTimer", "drafts", "lifeWheelScores"];

function addDaysToDateKey(dateKey, amount) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + amount);
  return getLocalDateKey(date);
}

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("weekly");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [weekCopied, setWeekCopied] = useState(false);
  const [weeklyStats, setWeeklyStats] = useState(null);
  const [vitals, setVitals] = useState(null);
  const [heatmapData, setHeatmapData] = useState([]);
  const [gates, setGates] = useState([]);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [domainTrend, setDomainTrend] = useState([]);
  const [analyticsTrend, setAnalyticsTrend] = useState([]);
  const [moodDist, setMoodDist] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [scheduleBlocks, setScheduleBlocks] = useState([]);
  const [exportRange, setExportRange] = useState("30");
  const [exportStatus, setExportStatus] = useState("");
  const [importFile, setImportFile] = useState(null);
  const [importFileContent, setImportFileContent] = useState(null);
  const [importStatus, setImportStatus] = useState("");
  const [importPreview, setImportPreview] = useState(null);
  const fileInputRef = useRef(null);
  const timeoutRef = useRef(null);

  const [importMode, setImportMode] = useState("backup");
  const [scheduleJsonText, setScheduleJsonText] = useState("");
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [scheduleImportStatus, setScheduleImportStatus] = useState("");
  const [scheduleImportLoading, setScheduleImportLoading] = useState(false);
  const [aiGuideStep, setAiGuideStep] = useState(1);
  const [scheduleMode, setScheduleMode] = useState("weekly_template");
  const [datedStartDate, setDatedStartDate] = useState(getLocalDateKey(new Date()));
  const [datedEndDate, setDatedEndDate] = useState(addDaysToDateKey(getLocalDateKey(new Date()), 29));

  const lastExportRaw = localStorage.getItem("mohammados_last_export");
  const lastExportDate = lastExportRaw ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastExportRaw)) : null;

  useEffect(() => { return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }; }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [vits, hm, gatesData, dt, aTrend, mDist] = await Promise.all([
          AggregationService.getVitals(), AggregationService.getHeatmapData(90), GateRepository.getAll(),
          AggregationService.getDomainTrend(6), AggregationService.getAnalyticsTrend(12), AggregationService.getMoodDistribution(90)
        ]);
        if (!mounted) return;
        setVitals(vits); setHeatmapData(hm); setGates(gatesData); setDomainTrend(dt || []); setAnalyticsTrend(aTrend || []); setMoodDist(mDist || []);
      } catch (err) { console.error("ReportsPage core load error:", err); }
      finally { if (mounted) setLoading(false); }
    }
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadSchedules() {
      try {
        const days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
        const all = await Promise.all(days.map(d => ScheduleRepository.getDaySchedule(d).catch(() => null)));
        if (mounted) setScheduleBlocks(all.filter(Boolean).flatMap(d => d.schedule || []));
      } catch (err) { console.error("Schedule load error:", err); }
    }
    loadSchedules();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadWeekly() {
      try {
        const base = new Date(nowMs()); base.setDate(base.getDate() + weekOffset * 7);
        const wStats = await AggregationService.getWeeklyStats(base);
        if (!mounted) return; setWeeklyStats(wStats);
      } catch (err) { console.error("ReportsPage weekly load error:", err); }
    }
    loadWeekly();
    return () => { mounted = false; };
  }, [weekOffset]);

  const weekRange = useMemo(() => {
    const base = new Date(nowMs()); base.setDate(base.getDate() + weekOffset * 7);
    return getPersianWeekRange(getPersianWeekKey(base));
  }, [weekOffset]);

  const monthMeta = useMemo(() => {
    const base = new Date(nowMs()); base.setMonth(base.getMonth() + monthOffset);
    return { year: base.getFullYear(), month: base.getMonth() + 1, label: new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long" }).format(base) };
  }, [monthOffset]);

  const weekLogs = useMemo(() => weeklyStats?.weeklyDayLogs || [], [weeklyStats]);
  const filteredWeekLogs = useMemo(() => {
    if (!searchQuery.trim()) return weekLogs;
    const q = searchQuery.trim().toLowerCase();
    return weekLogs.filter(log => (log.entries || []).some(e => e.title?.toLowerCase().includes(q) || e.domain?.toLowerCase().includes(q)));
  }, [weekLogs, searchQuery]);
  const moodTrend = useMemo(() => weeklyStats?.moodTrend || [], [weeklyStats]);

  const weekDerived = useMemo(() => {
    const activeWeekLogs = weekLogs.filter(l => {
      if (!l.date) return false; const p = l.date.split('-'); if (p.length < 3) return false;
      return new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2])).getDay() !== 5;
    });
    const totalDays = activeWeekLogs.length;
    const fullDays = activeWeekLogs.filter(l => l.fullDay).length;
    const frozenDays = activeWeekLogs.filter(l => l.status === "frozen").length;
    const activeDays = activeWeekLogs.filter(l => l.status !== "frozen");
    const moodEntries = activeDays.filter(l => l.mood != null);
    const avgMood = moodEntries.length > 0 ? (moodEntries.reduce((s, l) => s + (l.mood || 0), 0) / moodEntries.length).toFixed(1) : "-";
    const domainStats = {}; DOMAINS.forEach(d => domainStats[d.key] = { done: 0, total: 0 });
    activeWeekLogs.forEach(log => (log.entries || []).forEach(e => { if (e && e.domain && domainStats[e.domain]) { domainStats[e.domain].total++; if (e.done) domainStats[e.domain].done++; } }));
    return { totalDays, fullDays, frozenDays, avgMood, domainStats, moodEntries: moodEntries.length };
  }, [weekLogs]);

  const heatmapMap = useMemo(() => { const m = new Map(); heatmapData.forEach(d => m.set(d.date, d.level)); return m; }, [heatmapData]);
  const heatmapDays = useMemo(() => {
    const days = []; const today = new Date(nowMs());
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i);
      days.push({ date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`, level: heatmapMap.get(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`) || 0 });
    }
    return days;
  }, [heatmapMap]);

  const roadmapProgress = useMemo(() => {
    if (!gates.length) return { total: 0, completed: 0, percent: 0 };
    const totalCriteria = gates.reduce((s, g) => s + (g.criteria?.length || 0), 0);
    const completedCriteria = gates.reduce((s, g) => s + (g.criteria?.filter(c => c && (c.assessmentResult === "completed" || c.assessment === "completed")).length || 0), 0);
    return { total: totalCriteria, completed: completedCriteria, percent: totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 0 };
  }, [gates]);

  const pvaData = useMemo(() => {
    const daysMap = { saturday: { name: "شنبه", planned: 0, actual: 0 }, sunday: { name: "یکشنبه", planned: 0, actual: 0 }, monday: { name: "دوشنبه", planned: 0, actual: 0 }, tuesday: { name: "سه‌شنبه", planned: 0, actual: 0 }, wednesday: { name: "چهارشنبه", planned: 0, actual: 0 }, thursday: { name: "پنجشنبه", planned: 0, actual: 0 }, friday: { name: "جمعه", planned: 0, actual: 0 } };
    scheduleBlocks.forEach(item => {
      let dayKey = item.dayOfWeek || item.day;
      if (typeof dayKey === 'number') dayKey = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"][dayKey];
      if (dayKey && daysMap[dayKey]) daysMap[dayKey].planned += Number(item.duration) || 60;
    });
    const jsToPersian = [1, 2, 3, 4, 5, 6, 0]; const daysArr = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
    weekLogs.forEach(log => {
      const dateObj = new Date(log.date); const dayKey = daysArr[jsToPersian[dateObj.getDay()]];
      if (dayKey && daysMap[dayKey]) daysMap[dayKey].actual += Number(log.totalMinutes) || 0;
    });
    const dataArray = Object.values(daysMap);
    return { dataArray, maxMins: Math.max(...dataArray.map(d => Math.max(d.planned, d.actual)), 60) };
  }, [scheduleBlocks, weekLogs]);

  const pvaDomainSummary = useMemo(() => {
    const summary = {};
    scheduleBlocks.forEach(item => {
      const domain = item.domain || item.type || "general";
      if (!summary[domain]) summary[domain] = { planned: 0, done: 0 };
      summary[domain].planned += 1;
    });
    weekLogs.forEach(log => {
      if (log.status === "frozen") return;
      (log.entries || []).forEach(entry => {
        if (entry.domain && entry.done) {
          if (!summary[entry.domain]) summary[entry.domain] = { planned: 0, done: 0 };
          summary[entry.domain].done += 1;
        }
      });
    });
    return Object.entries(summary)
      .filter(([, v]) => v.planned > 0 || v.done > 0)
      .map(([key, val]) => ({
        key,
        ...val,
        color: DOMAIN_COLORS[key] || "#64748B",
        icon: DOMAINS.find(d => d.key === key)?.icon || "📌",
        label: DOMAINS.find(d => d.key === key)?.label || key
      }))
      .sort((a, b) => b.planned - a.planned);
  }, [scheduleBlocks, weekLogs]);

  const generateAdvisorMarkdown = useCallback(() => {
    const { startDate, endDate } = weekRange;
    let md = `# 📋 گزارش هفتگی MohammadOS\n\n**دوره:** ${toPersianDate(startDate)} تا ${toPersianDate(endDate)}\n**تولید شده در:** ${toPersianDate(getLocalDateKey(new Date(nowMs())))}\n\n---\n\n## 🎯 خلاصه کلی\n\n- **Full Day Rate:** ${weekDerived?.fullDays || 0}/${weekDerived?.totalDays || 0} روز\n- **میانگین حال روز:** ${weekDerived?.avgMood && weekDerived.avgMood !== "-" ? weekDerived.avgMood + " / 5" : "ثبت نشده"}\n- **Grace Days استفاده شده:** ${weekDerived?.frozenDays || 0}\n- **استریک فعلی:** ${vitals?.streak || 0} روز\n- **Consistency:** ${vitals?.consistency || 0}%\n\n## 📅 جزئیات روزانه\n\n| تاریخ | وضعیت | Mood | Critical Done | Notes |\n|-------|-------|------|---------------|-------|\n`;
    weekLogs.forEach(log => {
      const status = log.status === "frozen" ? "❄️ Grace" : log.fullDay ? "✅ Full" : "⏳ Partial";
      const mood = log.mood && MOOD_LABELS[log.mood] ? MOOD_LABELS[log.mood] : "-";
      const cTotal = (log.entries || []).filter(e => e && e.isCritical).length;
      const cDone = (log.entries || []).filter(e => e && e.isCritical && e.done).length;
      md += `| ${toPersianDate(log.date)} | ${status} | ${mood} | ${cTotal > 0 ? `${cDone}/${cTotal}` : "-"} | ${log.journalNote ? "📝" : "-"} |\n`;
    });
    md += `\n## 🏆 دامنه‌ها\n\n`;
    DOMAINS.forEach(d => {
      const s = weekDerived?.domainStats?.[d.key] || { done: 0, total: 0 };
      const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0;
      md += `- ${d.icon} **${d.label}:** ${s.done}/${s.total} (${pct}%) ${"█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10))}\n`;
    });
    md += `\n## 🗺️ نقشه راه\n\n- **پیشرفت Gates:** ${roadmapProgress.completed}/${roadmapProgress.total} معیار (${roadmapProgress.percent}%)\n\n## 📝 یادداشت‌های روزانه\n\n`;
    weekLogs.filter(l => l.journalNote).forEach(log => { md += `### ${toPersianDate(log.date)}\n${log.journalNote}\n\n`; });
    return md + `\n---\n*Generated by MohammadOS Reports Hub*\n`;
  }, [weekLogs, weekDerived, weekRange, vitals, roadmapProgress]);

  const handleCopyMarkdown = useCallback(() => {
    navigator.clipboard.writeText(generateAdvisorMarkdown());
    setCopied(true); if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 3000);
  }, [generateAdvisorMarkdown]);

  const handleDownloadMarkdown = useCallback(() => {
    const blob = new Blob([generateAdvisorMarkdown()], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `mohammados-report-${weekRange.startDate}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }, [generateAdvisorMarkdown, weekRange]);

  const handleExportJSON = useCallback(async () => {
    setExportStatus("EXPORTING JSON..."); try { await exportToJSON(exportRange); setExportStatus("✅ JSON EXPORTED"); if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => setExportStatus(""), 3000); } catch { setExportStatus("❌ EXPORT FAILED"); }
  }, [exportRange]);

  const handleExportCSV = useCallback(async () => {
    setExportStatus("EXPORTING CSV..."); try { await exportToCSV(exportRange); setExportStatus("✅ CSV EXPORTED"); if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => setExportStatus(""), 3000); } catch { setExportStatus("❌ EXPORT FAILED"); }
  }, [exportRange]);

  const validateAndPreview = useCallback((json) => {
    const tables = json?.tables || json;
    if (!tables?.dayLogs || !Array.isArray(tables.dayLogs)) { setImportStatus("❌ NOT A MOHAMMADOS EXPORT"); return; }
    const isMohammadOS = ["MohammadOS", "MohammadOS-PWA"].includes(json?.app)
      || ["MohammadOS", "MohammadOS-PWA"].includes(json?.appName)
      || json?.version?.toLowerCase?.().includes("mohammados");
    if (!isMohammadOS && !tables.dayLogs.every(d => d && typeof d.date === 'string' && Array.isArray(d.entries) && 'mood' in d)) { setImportStatus("❌ INVALID FILE STRUCTURE"); return; }
    const preview = {}; let totalRecords = 0;
    IMPORT_TABLES.forEach(t => { const r = Array.isArray(tables[t]) ? tables[t] : []; if (r.length > 0) { preview[t] = r.length; totalRecords += r.length; } });
    if (totalRecords === 0) { setImportStatus("❌ NO DATA FOUND IN FILE"); return; }
    setImportPreview(preview); setImportStatus(`✅ READY — ${totalRecords} records found`);
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    setImportFile(file); setImportStatus("READING FILE..."); setImportPreview(null);
    try { const json = await ImportService.parseFile(file); setImportFileContent(json); validateAndPreview(json); } catch { setImportStatus("❌ INVALID FILE STRUCTURE"); setImportPreview(null); }
  }, [validateAndPreview]);

  const handleImportConfirm = useCallback(async () => {
    if (!importPreview || !importFileContent) return;
    if (!window.confirm("⚠️ این عمل داده‌های فعلی را بازنویسی می‌کند. ادامه می‌دهی؟")) return;
    setImportStatus("IMPORTING...");
    try { await ImportService.importData(importFileContent?.tables || importFileContent); setImportStatus("✅ IMPORT COMPLETE — Reloading page..."); setTimeout(() => window.location.reload(), 1500); } catch (err) { setImportStatus("❌ IMPORT FAILED: " + err.message); }
  }, [importFileContent, importPreview]);

  const handleClearImport = useCallback(() => { setImportFile(null); setImportFileContent(null); setImportPreview(null); setImportStatus(""); if (fileInputRef.current) fileInputRef.current.value = ""; }, []);

  const handleCopyWeekReport = useCallback(() => {
    let text = `📅 گزارش هفتگی MohammadOS\n${toPersianDate(weekRange.startDate)} تا ${toPersianDate(weekRange.endDate)}\n\n`;
    weekLogs.forEach(log => {
      const status = log.status === "frozen" ? "❄️ Grace" : log.fullDay ? "✅ Full Day" : "⏳ Partial";
      text += `▸ ${toPersianDate(log.date)} — ${status}\n`;
      if (log.mood && MOOD_LABELS[log.mood]) text += `  😊 حال: ${MOOD_LABELS[log.mood]}\n`;
      if ((log.entries || []).length > 0) log.entries.forEach(e => { text += `  ${e.done ? "✅" : "⬜"} ${e.title}${e.domain !== "general" ? ` [${DOMAINS.find(d => d.key === e.domain)?.label || e.domain}]` : ""}${e.isCritical ? " 🔴" : ""}\n`; });
      text += `\n`;
    });
    navigator.clipboard.writeText(text); setWeekCopied(true); if (timeoutRef.current) clearTimeout(timeoutRef.current); timeoutRef.current = setTimeout(() => setWeekCopied(false), 3000);
  }, [weekLogs, weekRange]);

  const activePlannerPrompt = scheduleMode === "dated_plan" ? DATED_PLANNER_PROMPT : WEEKLY_PLANNER_PROMPT;
  const activePlannerGuide = scheduleMode === "dated_plan" ? DATED_PLANNER_GUIDE_TEXT : WEEKLY_PLANNER_GUIDE_TEXT;
  const schedulePreviewDays = Array.isArray(schedulePreview) ? schedulePreview : schedulePreview?.days || [];

  const handleCopyPrompt = async () => {
    try {
      const rangeHint = scheduleMode === "dated_plan"
        ? `\n\nبازه انتخابی من: از ${datedStartDate} تا ${datedEndDate}\n`
        : "";
      await navigator.clipboard.writeText(activePlannerPrompt + rangeHint);
      setScheduleImportStatus("✅ پرامپت با موفقیت کپی شد!");
      setTimeout(() => setScheduleImportStatus(""), 2000);
    } catch {
      setScheduleImportStatus("❌ کپی ناموفق - دستی کپی کنید");
    }
  };
  const handleParseScheduleJson = () => {
    try {
      const parsed = JSON.parse(scheduleJsonText);
      if (!Array.isArray(parsed) && (!parsed || !Array.isArray(parsed.days))) throw new Error("باید آرایه یا شیء دارای days باشد");
      setSchedulePreview(parsed);
      setScheduleImportStatus("");
      setAiGuideStep(3);
    } catch (e) {
      setScheduleImportStatus("❌ JSON نامعتبر: " + e.message);
      setSchedulePreview(null);
    }
  };
  const handleImportSchedule = async () => {
    if (!schedulePreview) return; setScheduleImportLoading(true);
    try {
      const parsed = JSON.parse(scheduleJsonText);
      const isDated = scheduleMode === "dated_plan" || parsed?.scheduleMode === "dated_plan";
      const result = isDated ? await importDatedSchedule(scheduleJsonText) : await importWeeklySchedule(scheduleJsonText);
      setScheduleImportStatus(isDated
        ? `✅ برنامه تاریخ‌محور وارد شد! ${result.days} روز، ${result.totalBlocks} بلوک`
        : `✅ برنامه وارد شد! ${result.importedDays} روز، ${result.totalBlocks} بلوک زمانی`);
      setSchedulePreview(null); setScheduleJsonText(""); setAiGuideStep(1);
    } catch (e) {
      setScheduleImportStatus("❌ " + e.message);
    } finally {
      setScheduleImportLoading(false);
    }
  };

  const renderProductivityCurve = () => {
    if (!analyticsTrend.length) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای نمایش وجود ندارد.</p>;
    const width = 600, height = 200, padding = 30, chartW = width - padding * 2, chartH = height - padding * 2, maxFullDays = 7, stepX = chartW / (analyticsTrend.length - 1 || 1);
    const pointsConsistency = analyticsTrend.map((w, i) => `${padding + i * stepX},${padding + chartH - (w.consistency / 100) * chartH}`).join(" ");
    const pointsFullDays = analyticsTrend.map((w, i) => `${padding + i * stepX},${padding + chartH - (w.fullDays / maxFullDays) * chartH}`).join(" ");
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="نمودار بهره‌وری ۱۲ هفته اخیر">
        {[0, 25, 50, 75, 100].map(t => { const y = padding + chartH - (t / 100) * chartH; return <g key={t}><line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity="0.05" /><text x={padding - 5} y={y + 3} textAnchor="end" fill="currentColor" fontSize="9" opacity="0.5">{toPersianNumber(t)}%</text></g>; })}
        <polyline fill="none" stroke="#3B82F6" strokeWidth="2" points={pointsConsistency} />
        <polyline fill="none" stroke="#10B981" strokeWidth="2" points={pointsFullDays} strokeDasharray="4 2" />
        {analyticsTrend.map((w, i) => <circle key={i} cx={padding + i * stepX} cy={padding + chartH - (w.consistency / 100) * chartH} r="3" fill="#3B82F6" />)}
      </svg>
    );
  };

  const renderMoodDonut = () => {
    const total = moodDist.reduce((s, m) => s + m.count, 0); if (total === 0) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای Mood وجود ندارد.</p>;
    const radius = 60, circumference = 2 * Math.PI * radius; let offset = 0;
    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-6">
        <svg viewBox="0 0 160 160" className="w-40 h-40">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="20" />
          {moodDist.map(m => { const length = (m.count / total) * circumference; const c = <circle key={m.level} cx="80" cy="80" r={radius} fill="none" stroke={m.color} strokeWidth="20" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 80 80)" />; offset += length; return c; })}
          <text x="80" y="75" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="bold">{toPersianNumber(total)}</text>
          <text x="80" y="90" textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.5">Entries</text>
        </svg>
        <div className="flex flex-col gap-2">{moodDist.map(m => <div key={m.level} className="flex items-center gap-2 text-xs"><span className="w-3 h-3 rounded-sm" style={{ backgroundColor: m.color }}></span><span className="text-os-text/70 w-16">{m.label}</span><span className="font-mono text-os-text/50">{toPersianNumber(m.count)} بار</span></div>)}</div>
      </div>
    );
  };

  const renderDomainRadar = () => {
    if (!domainTrend.length) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای نمایش رادار وجود ندارد.</p>;
    const latestWeek = domainTrend[domainTrend.length - 1], size = 200, center = 100, radius = 70;
    const angles = DOMAINS.map((_, i) => (Math.PI * 2 * i) / DOMAINS.length - Math.PI / 2);
    const getPoint = (p, i) => ({ x: center + radius * p * Math.cos(angles[i]), y: center + radius * p * Math.sin(angles[i]) });
    const polygonPoints = DOMAINS.map((d, i) => { const p = getPoint((latestWeek.domains[d.key] || 0) / 100, i); return `${p.x},${p.y}`; }).join(" ");
    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-48 h-48 mx-auto">
        {[0.25, 0.5, 0.75, 1].map((lvl, idx) => <polygon key={idx} points={DOMAINS.map((_, i) => { const p = getPoint(lvl, i); return `${p.x},${p.y}`; }).join(" ")} fill="none" stroke="currentColor" strokeOpacity="0.1" />)}
        {angles.map((ang, i) => <line key={i} x1={center} y1={center} x2={center + radius * Math.cos(ang)} y2={center + radius * Math.sin(ang)} stroke="currentColor" strokeOpacity="0.1" />)}
        <polygon points={polygonPoints} fill="rgba(245, 166, 35, 0.2)" stroke="#F5A623" strokeWidth="2" />
        {DOMAINS.map((d, i) => { const p = getPoint((latestWeek.domains[d.key] || 0) / 100, i); return <circle key={i} cx={p.x} cy={p.y} r="3" fill={DOMAIN_COLORS[d.key]} />; })}
      </svg>
    );
  };

  const renderMoodTrend = () => {
    const trendData = moodTrend.map(m => (m && typeof m === 'object' ? m.mood : m)).filter(m => typeof m === 'number');
    if (!trendData.length) return <p className="text-os-text/50 text-sm text-center py-4">دادهٔ Mood کافی نیست.</p>;
    const width = 600, height = 120, padding = 20, chartW = width - padding * 2, chartH = height - padding * 2, stepX = chartW / (trendData.length - 1 || 1);
    const points = trendData.map((m, i) => `${padding + i * stepX},${padding + chartH - ((m - 1) / 4) * chartH}`).join(" ");
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" role="img" aria-label="نمودار روند حال روز">
        {[1, 2, 3, 4, 5].map(val => { const y = padding + chartH - ((val - 1) / 4) * chartH; return <line key={val} x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity="0.1" />; })}
        <polyline fill="none" stroke="#f5a623" strokeWidth="2" points={points} />
        {trendData.map((m, i) => { const x = padding + i * stepX; const y = padding + chartH - ((m - 1) / 4) * chartH; return <g key={i}><circle cx={x} cy={y} r="4" fill="#f5a623" /><text x={x} y={y - 8} textAnchor="middle" fill="currentColor" fontSize="10" opacity="0.7">{m}</text></g>; })}
      </svg>
    );
  };

  const renderDomainTrendChart = () => {
    if (!domainTrend || domainTrend.length === 0) return <p className="text-os-text/50 text-sm text-center py-4">دادهٔ کافی برای نمایش روند دامنه‌ها وجود ندارد.</p>;
    const width = 700, height = 340, padding = { top: 20, right: 10, bottom: 70, left: 44 }, chartW = width - padding.left - padding.right, chartH = height - padding.top - padding.bottom;
    const weeks = domainTrend.length, domainKeys = DOMAINS.map(d => d.key), barCount = domainKeys.length, groupWidth = chartW / weeks, barWidth = (groupWidth * 0.72) / barCount, groupGap = groupWidth * 0.14;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="نمودار روند دامنه‌ها">
        {[0, 25, 50, 75, 100].map(t => { const y = padding.top + chartH - (t / 100) * chartH; return <g key={t}><line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeOpacity="0.08" /><text x={padding.left - 6} y={y + 3} textAnchor="end" fill="currentColor" fontSize="9" opacity="0.5">{toPersianNumber(t)}%</text></g>; })}
        {domainTrend.map((week, weekIdx) => {
          const groupX = padding.left + weekIdx * groupWidth + groupGap;
          return (
            <g key={weekIdx}>
              {domainKeys.map((dk, dIdx) => { const val = week.domains[dk] || 0; const barH = (val / 100) * chartH; return <rect key={dk} x={groupX + dIdx * barWidth} y={padding.top + chartH - barH} width={Math.max(barWidth - 2, 2)} height={barH} fill={DOMAIN_COLORS[dk]} rx={2} opacity={0.88} />; })}
              <text x={groupX + (barCount * barWidth) / 2} y={height - padding.bottom + 18} textAnchor="middle" fill="currentColor" fontSize="9" opacity="0.55">{week.weekLabel}</text>
            </g>
          );
        })}
        <g transform={`translate(${padding.left}, ${height - 28})`}>{DOMAINS.map((d, i) => <g key={d.key} transform={`translate(${i * 96}, 0)`}><rect x={0} y={-7} width={8} height={8} fill={DOMAIN_COLORS[d.key]} rx={2} /><text x={12} y={0} fill="currentColor" fontSize="9" opacity="0.7">{d.label}</text></g>)}</g>
      </svg>
    );
  };

  if (loading) return <div className="flex items-center justify-center h-full min-h-[300px]" role="status"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-os-border border-t-os-accent rounded-full animate-spin" /><span className="text-[10px] font-mono text-os-text/40 uppercase">Loading Report Data...</span></div></div>;

  const tabs = [
    { id: "weekly", label: "📅 هفتگی" },
    { id: "monthly", label: "📊 ماهانه" },
    { id: "analytics", label: "📈 تحلیلی" },
    { id: "pva", label: "⚖️ برنامه vs عملکرد" },
    { id: "roadmap", label: "🗺️ نقشه راه" },
    { id: "advisor", label: "📝 مشاور" },
    { id: "export", label: "📥 خروجی" },
    { id: "import", label: "📤 ورودی" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 font-vazir rtl text-os-text">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black mb-1">گزارش‌ساز هوشمند</h1>
        <p className="font-mono text-[10px] tracking-[0.3em] text-os-accent uppercase">Intelligence Reports Hub</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="tablist" aria-label="تب‌های گزارش">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} role="tab" aria-selected={activeTab === tab.id} className={`flex-1 min-w-[80px] py-3 rounded-lg font-bold text-sm transition-all border ${activeTab === tab.id ? "bg-os-accent/10 border-os-accent text-os-accent" : "bg-os-card border-os-border text-os-text/60 hover:border-os-text/40"}`}>{tab.label}</button>
        ))}
      </div>

      {activeTab === "weekly" && (
        <div id="panel-weekly" role="tabpanel" className="space-y-6">
          <div className="flex items-center justify-between bg-os-card border border-os-border rounded-lg p-3">
            <button onClick={() => setWeekOffset(o => o - 1)} className="px-3 py-1.5 rounded border border-os-border text-xs font-mono hover:border-os-accent">← هفته قبل</button>
            <span className="text-sm font-bold">{toPersianWeekRangeLabel(weekRange.startDate, weekRange.endDate)}{weekOffset === 0 && <span className="text-os-accent text-[10px] mr-2">(جاری)</span>}</span>
            <button onClick={() => setWeekOffset(o => o + 1)} className="px-3 py-1.5 rounded border border-os-border text-xs font-mono hover:border-os-accent">هفته بعد →</button>
          </div>
          <div className="flex justify-end">
            <button onClick={handleCopyWeekReport} className={`px-3 py-1.5 rounded border text-xs font-mono ${weekCopied ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-os-card border-os-border text-os-text/70 hover:border-os-accent"}`}>{weekCopied ? "✅ کپی شد!" : "📋 کپی گزارش هفتگی"}</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-emerald-400">{toPersianNumber(weekDerived.fullDays)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">FULL DAYS</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-sky-400">{toPersianNumber(weekDerived.totalDays - weekDerived.frozenDays)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">ACTIVE DAYS</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-amber-400">{toPersianNumber(weekDerived.avgMood)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">AVG MOOD</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-blue-400">{toPersianNumber(weekDerived.frozenDays)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">GRACE DAYS</div></div>
          </div>
          <div className="mb-4"><div className="relative"><input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="🔍 جستجو در عادت‌ها..." className="w-full px-4 py-2.5 pr-10 bg-os-bg border border-os-border rounded-lg text-sm focus:outline-none focus:border-os-accent" /><span className="absolute right-3 top-1/2 -translate-y-1/2 text-os-text/30">🔍</span></div></div>
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] WEEK BREAKDOWN</h3>
            <div className="space-y-2">
              {filteredWeekLogs.length === 0 && <p className="text-os-text/50 text-sm text-center py-4">{searchQuery.trim() ? "نتیجه‌ای یافت نشد." : "داده‌ای برای این هفته یافت نشد."}</p>}
              {filteredWeekLogs.map(log => {
                const total = (log.entries || []).length, done = (log.entries || []).filter(e => e && e.done).length, pct = total > 0 ? Math.round((done / total) * 100) : 0, isFrozen = log.status === "frozen", isFull = log.fullDay;
                return (
                  <div key={log.date} className="flex flex-col gap-2 p-3 rounded border border-os-border/50 bg-os-bg/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-10 rounded-full shrink-0 ${isFrozen ? "bg-blue-400" : isFull ? "bg-emerald-400" : "bg-amber-400"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center"><span className="text-sm font-bold">{toPersianDate(log.date)}</span><span className="text-[10px] font-mono">{isFrozen ? "❄️ Grace" : isFull ? "✅ Full" : `${toPersianNumber(done)} از ${toPersianNumber(total)}`}</span></div>
                        <div className="w-full h-1.5 bg-os-border rounded-full mt-1.5 overflow-hidden"><div className={`h-full rounded-full ${isFrozen ? "bg-blue-400" : isFull ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${isFrozen ? 100 : pct}%` }} /></div>
                      </div>
                      {log.mood && MOOD_LABELS[log.mood] && <span className="text-lg shrink-0" title={MOOD_LABELS[log.mood]}>{MOOD_LABELS[log.mood].split(" ")[0]}</span>}
                    </div>
                    {!isFrozen && (log.entries || []).length > 0 && (
                      <div className="pr-5 space-y-1">{log.entries.map(e => <div key={e.id} className="flex items-center gap-2 text-[11px]"><span className={e.done ? "text-emerald-400" : "text-os-text/30"}>{e.done ? "✓" : "○"}</span><span className={e.done ? "text-os-text/60 line-through" : "text-os-text"}>{e.title}</span>{e.isCritical && <span className="text-red-400 text-[9px]">🔴</span>}{e.domain !== "general" && <span className="text-[9px] text-os-text/40 mr-auto">{DOMAINS.find(d => d.key === e.domain)?.icon || e.domain}</span>}</div>)}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DOMAIN BREAKDOWN</h3>
            <div className="space-y-2">
              {DOMAINS.map(d => { const s = weekDerived.domainStats[d.key]; const pct = s.total > 0 ? Math.round((s.done / s.total) * 100) : 0; return <div key={d.key} className="flex items-center gap-3"><span className="text-lg w-6 text-center">{d.icon}</span><span className="text-xs w-16 text-os-text/70">{d.label}</span><div className="flex-1 h-2 bg-os-border rounded-full overflow-hidden"><div className="h-full bg-os-accent rounded-full" style={{ width: `${pct}%` }} /></div><span className="text-[10px] font-mono w-10 text-right">{toPersianNumber(pct)}%</span></div>; })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "monthly" && (
        <div id="panel-monthly" role="tabpanel" className="space-y-6">
          <div className="flex items-center justify-between bg-os-card border border-os-border rounded-lg p-3">
            <button onClick={() => setMonthOffset(o => o - 1)} className="px-3 py-1.5 rounded border border-os-border text-xs font-mono">← ماه قبل</button>
            <span className="text-sm font-bold">{monthMeta.label}{monthOffset === 0 && <span className="text-os-accent text-[10px] mr-2">(جاری)</span>}</span>
            <button onClick={() => setMonthOffset(o => o + 1)} className="px-3 py-1.5 rounded border border-os-border text-xs font-mono">ماه بعد →</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-emerald-400">{toPersianNumber(vitals?.monthRate ?? 0)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">MONTH RATE %</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-sky-400">{toPersianNumber(vitals?.streak ?? 0)}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">STREAK</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-amber-400">{toPersianNumber(vitals?.avgMood ?? "-")}</div><div className="text-[10px] font-mono text-os-text/50 mt-1">AVG MOOD</div></div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center"><div className="text-2xl font-black text-blue-400">{toPersianNumber(vitals?.consistency ?? 0)}%</div><div className="text-[10px] font-mono text-os-text/50 mt-1">CONSISTENCY</div></div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] 90-DAY HEATMAP</h3>
            <div className="flex flex-wrap gap-1">{heatmapDays.map((d, i) => <div key={i} className={`w-3 h-3 rounded-sm ${HEATMAP_LEVELS[d.level] || HEATMAP_LEVELS[0]}`} title={d.date} />)}</div>
            <div className="flex items-center gap-3 mt-3 text-[9px] font-mono text-os-text/40"><span>کمتر</span>{HEATMAP_LEVELS.map((cls, i) => <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} />)}<span>بیشتر</span></div>
          </div>
        </div>
      )}

      {activeTab === "analytics" && (
        <div id="panel-analytics" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] PRODUCTIVITY CURVE (12 WEEKS)</h3>
            <div className="flex justify-center gap-6 mb-4 text-[10px] font-mono"><div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-sky-400"></div><span className="text-os-text/60">Consistency %</span></div><div className="flex items-center gap-2"><div className="w-4 h-0.5 bg-emerald-400 border-dashed"></div><span className="text-os-text/60">Full Days</span></div></div>
            {renderProductivityCurve()}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-os-card border border-os-border rounded-lg p-4"><h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] MOOD DISTRIBUTION (90 DAYS)</h3>{renderMoodDonut()}</div>
            <div className="bg-os-card border border-os-border rounded-lg p-4"><h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] DOMAIN BALANCE (RADAR)</h3>{renderDomainRadar()}<p className="text-center text-[10px] font-mono text-os-text/40 mt-2">Latest Week Status</p></div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] MOOD TREND</h3>
            {renderMoodTrend()}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30"><div className="text-[10px] font-mono text-os-text/50">STREAK</div><div className="text-xl font-black text-amber-400">{toPersianNumber(vitals?.streak ?? 0)} <span className="text-xs text-os-text/40">روز</span></div></div>
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30"><div className="text-[10px] font-mono text-os-text/50">CONSISTENCY</div><div className="text-xl font-black text-emerald-400">{toPersianNumber(vitals?.consistency ?? 0)}%</div></div>
            </div>
          </div>
          <div className="bg-os-card border border-os-border rounded-lg p-4"><h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DOMAIN TREND (۶ هفته)</h3>{renderDomainTrendChart()}</div>
        </div>
      )}

      {activeTab === "pva" && (
        <div id="panel-pva" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] PLAN vs ACTUAL (DAILY MINUTES)</h3>
            <div className="space-y-3">
              {pvaData.dataArray.map((day, i) => {
                const plannedPct = Math.min((day.planned / pvaData.maxMins) * 100, 100);
                const actualPct = Math.min((day.actual / pvaData.maxMins) * 100, 100);
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold">{day.name}</span>
                      <span className="font-mono text-os-text/50">{toPersianNumber(day.actual)} / {toPersianNumber(day.planned)} دقیقه</span>
                    </div>
                    <div className="relative h-3 bg-os-border rounded-full overflow-hidden">
                      <div className="absolute top-0 left-0 h-full bg-sky-500/30 rounded-full" style={{ width: `${plannedPct}%` }} />
                      <div className="absolute top-0 left-0 h-full bg-emerald-400 rounded-full" style={{ width: `${actualPct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-center gap-6 mt-4 text-[10px] font-mono text-os-text/50">
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-sky-500/30 rounded-sm"></div>برنامه‌ریزی شده</div>
              <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-400 rounded-sm"></div>انجام شده</div>
            </div>
          </div>

          {pvaDomainSummary.length > 0 && (
            <div className="bg-os-card border border-os-border rounded-lg p-4">
              <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] PLAN vs ACTUAL (DOMAIN TASKS)</h3>
              <div className="space-y-3">
                {pvaDomainSummary.map(domain => {
                  const maxVal = Math.max(domain.planned, domain.done, 1);
                  return (
                    <div key={domain.key} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold flex items-center gap-2">
                          <span>{domain.icon}</span>
                          <span>{domain.label}</span>
                        </span>
                        <span className="font-mono text-os-text/50">
                          {toPersianNumber(domain.done)} انجام / {toPersianNumber(domain.planned)} برنامه‌ریزی
                        </span>
                      </div>
                      <div className="relative h-2.5 bg-os-border rounded-full overflow-hidden">
                        <div className="absolute top-0 left-0 h-full rounded-full opacity-40" style={{ width: `${(domain.planned / maxVal) * 100}%`, backgroundColor: domain.color }} />
                        <div className="absolute top-0 left-0 h-full rounded-full" style={{ width: `${(domain.done / maxVal) * 100}%`, backgroundColor: domain.color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-6 mt-4 text-[10px] font-mono text-os-text/50">
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-os-accent/40 rounded-sm"></div>تسک‌های برنامه‌ریزی شده</div>
                <div className="flex items-center gap-2"><div className="w-3 h-3 bg-os-accent rounded-sm"></div>تسک‌های انجام شده</div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "roadmap" && (
        <div id="panel-roadmap" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] ROADMAP PROGRESS</h3>
            <div className="flex items-center justify-between mb-4"><span className="text-sm font-bold">پیشرفت کلی Gates</span><span className="text-sm font-mono text-os-accent">{toPersianNumber(roadmapProgress.percent)}%</span></div>
            <div className="w-full h-2 bg-os-border rounded-full overflow-hidden mb-4"><div className="h-full bg-os-accent rounded-full" style={{ width: `${roadmapProgress.percent}%` }} /></div>
            <div className="text-[10px] font-mono text-os-text/50 text-center">{toPersianNumber(roadmapProgress.completed)} / {toPersianNumber(roadmapProgress.total)} معیار تکمیل شده</div>
          </div>
          <div className="space-y-3">
            {gates.length === 0 && <p className="text-os-text/50 text-sm text-center py-4">هیچ Gate ثبت نشده است.</p>}
            {gates.map(gate => { const total = gate.criteria?.length || 0; const done = gate.criteria?.filter(c => c && (c.assessmentResult === "completed" || c.assessment === "completed")).length || 0; const pct = total > 0 ? Math.round((done / total) * 100) : 0; return <div key={gate.id || gate.title} className="bg-os-card border border-os-border rounded-lg p-4"><div className="flex justify-between items-center mb-2"><h4 className="text-sm font-bold">{gate.title}</h4><span className="text-[10px] font-mono text-os-accent">{toPersianNumber(pct)}%</span></div><div className="w-full h-1.5 bg-os-border rounded-full overflow-hidden"><div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} /></div><p className="text-[10px] font-mono text-os-text/50 mt-2">{toPersianNumber(done)} / {toPersianNumber(total)} معیار</p></div>; })}
          </div>
        </div>
      )}

      {activeTab === "advisor" && (
        <div id="panel-advisor" role="tabpanel" className="space-y-4">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] ADVISOR EXPORT</h3>
            <p className="text-xs text-os-text/60 mb-4">گزارش Markdown خودکار برای ارسال به مشاور. شامل Mood، وضعیت روزانه، دامنه‌ها، نقشه راه و یادداشت‌ها.</p>
            <div className="bg-os-bg border border-os-border rounded-lg p-4 font-mono text-[11px] text-os-text/80 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">{generateAdvisorMarkdown()}</div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleCopyMarkdown} className={`flex-1 py-3 rounded-lg font-bold text-sm border ${copied ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-os-accent/10 border-os-accent text-os-accent hover:bg-os-accent hover:text-os-bg"}`}>{copied ? "✅ کپی شد!" : "📋 کپی Markdown"}</button>
              <button onClick={handleDownloadMarkdown} className="flex-1 py-3 rounded-lg font-bold text-sm border bg-sky-500/10 border-sky-500 text-sky-400 hover:bg-sky-500 hover:text-os-bg">⬇ دانلود .md</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "export" && (
        <div id="panel-export" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DATA EXPORT</h3>
            <p className="text-xs text-os-text/60 mb-4">خروجی JSON شامل تمام جداول سیستم است و به‌صورت فشرده (Gzip) دانلود می‌شود. CSV فقط گزارش‌های روزانه را به‌صورت flattened export می‌کند.</p>
            <div className="mb-4"><label className="text-[10px] font-mono text-os-text/60 block mb-2 uppercase">TIME RANGE:</label><select value={exportRange} onChange={e => setExportRange(e.target.value)} className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm focus:border-os-accent outline-none"><option value="7">۷ روز اخیر</option><option value="30">۳۰ روز اخیر</option><option value="all">تمام داده‌ها</option></select></div>
            <div className="flex gap-3">
              <button onClick={handleExportJSON} className="flex-1 bg-emerald-500/10 border border-emerald-500 text-emerald-400 py-3 rounded-lg font-mono text-xs hover:bg-emerald-500 hover:text-os-bg">📥 EXPORT JSON (Gzip)</button>
              <button onClick={handleExportCSV} className="flex-1 bg-sky-500/10 border border-sky-500 text-sky-400 py-3 rounded-lg font-mono text-xs hover:bg-sky-500 hover:text-os-bg">📥 EXPORT CSV</button>
            </div>
            {exportStatus && <p className="text-[10px] font-mono text-os-text/50 mt-3 text-center">{exportStatus}</p>}
          </div>
        </div>
      )}

      {activeTab === "import" && (
        <div id="panel-import" role="tabpanel" className="space-y-6">
          <div className="flex gap-2 p-1 bg-os-bg border border-os-border rounded-lg">
            <button onClick={() => setImportMode("backup")} className={`flex-1 py-2 text-xs font-mono rounded ${importMode === "backup" ? "bg-os-accent text-os-bg" : "text-os-text/60"}`}>📦 بکاپ کامل</button>
            <button onClick={() => setImportMode("schedule")} className={`flex-1 py-2 text-xs font-mono rounded ${importMode === "schedule" ? "bg-os-accent text-os-bg" : "text-os-text/60"}`}>🤖 برنامه AI</button>
          </div>

          {importMode === "backup" && (
            <div className="bg-os-card border border-os-border rounded-lg p-4">
              <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DATA IMPORT</h3>
              <p className="text-xs text-os-text/60 mb-4">فایل خروجی MohammadOS را انتخاب کن. این عمل داده‌های فعلی را بازنویسی می‌کند.</p>
              <div className="mb-4"><input ref={fileInputRef} type="file" accept=".json,.gz,application/json,application/gzip" onChange={handleFileSelect} className="w-full text-xs text-os-text file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-os-accent/20 file:text-os-accent file:font-mono" />{!importFile && <p className="text-[10px] font-mono text-os-text/40 mt-2">{lastExportDate ? `📦 Last backup: ${lastExportDate}` : "📦 هنوز بکاپی گرفته نشده"}</p>}</div>
              {importStatus && <p className="text-[10px] font-mono text-os-text/60 mb-3 text-center">{importStatus}</p>}
              {importPreview && (
                <div className="bg-os-bg border border-os-border rounded-lg p-3 mb-4">
                  <p className="text-[10px] font-mono text-os-accent mb-2">PREVIEW:</p>
                  <div className="grid grid-cols-2 gap-1">{Object.entries(importPreview).map(([table, count]) => <div key={table} className="flex justify-between text-[10px] font-mono"><span className="text-os-text/60">{table}</span><span className="text-os-text">{toPersianNumber(count)}</span></div>)}</div>
                </div>
              )}
              <div className="flex gap-3">
                {importPreview && <button onClick={handleImportConfirm} className="flex-1 bg-emerald-500/10 border border-emerald-500 text-emerald-400 py-3 rounded-lg font-mono text-xs hover:bg-emerald-500 hover:text-os-bg">✅ تایید و وارد کن</button>}
                {importFile && <button onClick={handleClearImport} className="flex-1 bg-red-500/10 border border-red-500 text-red-400 py-3 rounded-lg font-mono text-xs hover:bg-red-500 hover:text-os-bg">❌ لغو</button>}
              </div>
            </div>
          )}

          {importMode === "schedule" && (
            <div className="space-y-4">
              <div className="bg-os-card border border-os-border rounded-lg p-4">
                <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] AI SCHEDULE IMPORT</h3>
                <div className="space-y-3">
                  <div className="flex gap-2 p-1 bg-os-bg border border-os-border rounded-lg">
                    <button onClick={() => setScheduleMode("weekly_template")} className={`flex-1 py-2 text-[10px] font-mono rounded ${scheduleMode === "weekly_template" ? "bg-os-accent text-os-bg" : "text-os-text/60"}`}>الگوی هفتگی</button>
                    <button onClick={() => setScheduleMode("dated_plan")} className={`flex-1 py-2 text-[10px] font-mono rounded ${scheduleMode === "dated_plan" ? "bg-os-accent text-os-bg" : "text-os-text/60"}`}>برنامه تاریخ‌محور</button>
                  </div>
                  {scheduleMode === "dated_plan" && (
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[10px] font-mono text-os-text/60">شروع<input type="date" value={datedStartDate} onChange={e => setDatedStartDate(e.target.value)} className="mt-1 w-full bg-os-bg border border-os-border rounded p-2 text-xs" /></label>
                      <label className="text-[10px] font-mono text-os-text/60">پایان<input type="date" value={datedEndDate} onChange={e => setDatedEndDate(e.target.value)} className="mt-1 w-full bg-os-bg border border-os-border rounded p-2 text-xs" /></label>
                      <div className="col-span-2 flex gap-2">
                        {[7, 14, 30].map(days => <button key={days} onClick={() => setDatedEndDate(addDaysToDateKey(datedStartDate, days - 1))} className="flex-1 py-1.5 text-[10px] border border-os-border rounded hover:border-os-accent">{days} روز</button>)}
                      </div>
                    </div>
                  )}
                  <div className={`p-3 rounded border ${aiGuideStep === 1 ? "border-os-accent bg-os-accent/5" : "border-os-border/50 bg-os-bg/30"}`}>
                    <div className="flex items-center gap-2 mb-2"><span className="text-xs font-mono text-os-accent">STEP 1</span></div>
                    <p className="text-xs text-os-text/70 mb-2">ابتدا پرامپت زیر را کپی کرده و به AI بده:</p>
                    <div className="bg-os-bg border border-os-border rounded p-3 font-mono text-[10px] text-os-text/60 whitespace-pre-wrap max-h-32 overflow-y-auto mb-2">{activePlannerPrompt.slice(0, 300)}...</div>
                    <button onClick={handleCopyPrompt} className="w-full py-2 bg-os-accent/10 border border-os-accent text-os-accent rounded text-xs font-mono hover:bg-os-accent hover:text-os-bg">📋 کپی پرامپت</button>
                  </div>
                  <div className={`p-3 rounded border ${aiGuideStep === 2 ? "border-os-accent bg-os-accent/5" : "border-os-border/50 bg-os-bg/30"}`}>
                    <div className="flex items-center gap-2 mb-2"><span className="text-xs font-mono text-os-accent">STEP 2</span></div>
                    <p className="text-xs text-os-text/70 mb-2">پاسخ JSON AI را اینجا قرار بده:</p>
                    <textarea value={scheduleJsonText} onChange={e => { setScheduleJsonText(e.target.value); setAiGuideStep(2); }} placeholder="JSON را اینجا paste کنید..." className="w-full h-32 bg-os-bg border border-os-border rounded-lg p-3 text-xs font-mono text-os-text focus:border-os-accent outline-none resize-none" />
                    <button onClick={handleParseScheduleJson} className="w-full mt-2 py-2 bg-sky-500/10 border border-sky-500 text-sky-400 rounded text-xs font-mono hover:bg-sky-500 hover:text-os-bg">🔍 تجزیه و پیش‌نمایش</button>
                  </div>
                  {aiGuideStep === 3 && schedulePreview && (
                    <div className="p-3 rounded border border-os-accent bg-os-accent/5">
                      <div className="flex items-center gap-2 mb-2"><span className="text-xs font-mono text-os-accent">STEP 3 — PREVIEW</span></div>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {schedulePreviewDays.map((day, idx) => (
                          <div key={idx} className="bg-os-bg border border-os-border rounded p-2">
                            <p className="text-xs font-bold">{day.date || day.dayOfWeek || day.day || `روز ${idx + 1}`}</p>
                            <div className="space-y-0.5 mt-1">{(day.blocks || day.schedule || []).map((block, bIdx) => <p key={bIdx} className="text-[10px] font-mono text-os-text/60">{block.startTime || ""} — {block.endTime || ""} | {block.title || block.task || ""}</p>)}</div>
                          </div>
                        ))}
                      </div>
                      <button onClick={handleImportSchedule} disabled={scheduleImportLoading} className="w-full mt-3 py-2 bg-emerald-500/10 border border-emerald-500 text-emerald-400 rounded text-xs font-mono hover:bg-emerald-500 hover:text-os-bg disabled:opacity-50">{scheduleImportLoading ? "⏳ در حال وارد کردن..." : "✅ تایید و وارد کن"}</button>
                    </div>
                  )}
                  {scheduleImportStatus && <p className="text-[10px] font-mono text-os-text/60 text-center">{scheduleImportStatus}</p>}
                </div>
              </div>
              <div className="bg-os-card border border-os-border rounded-lg p-4">
                <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] GUIDE</h3>
                <div className="text-xs text-os-text/60 whitespace-pre-wrap leading-relaxed">{activePlannerGuide}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
