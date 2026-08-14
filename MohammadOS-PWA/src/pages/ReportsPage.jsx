// src/pages/ReportsPage.jsx
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { GateRepository } from "../repositories/GateRepository";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { ImportService } from "../app/ImportService";
import { AggregationService } from "../service/aggregationService";
import { exportToJSON, exportToCSV } from "../app/exportData";
import {
  getISOWeekKey,
  getISOWeekRange,
  getLocalDateKey,
  nowMs,
  toPersianDate,
  toPersianNumber,
} from "../utils/date";

// ✅ M1.8: AI Weekly Planner Imports
import { WEEKLY_PLANNER_PROMPT, WEEKLY_PLANNER_GUIDE_TEXT } from "../ai/weeklyPlannerPrompt";
import { importWeeklySchedule } from "../app/ImportService";

const DOMAINS = [
  { key: "learning", label: "یادگیری", icon: "📚" },
  { key: "fitness", label: "تناسب‌اندام", icon: "💪" },
  { key: "discipline", label: "انضباط", icon: "🎯" },
  { key: "work", label: "کار", icon: "💼" },
  { key: "rest", label: "استراحت", icon: "🛌" },
  { key: "social", label: "اجتماعی", icon: "🤝" },
];

const MOOD_LABELS = {
  1: "😫 خیلی بد",
  2: "😕 بد",
  3: "😐 معمولی",
  4: "🙂 خوب",
  5: "😄 عالی",
};

const HEATMAP_LEVELS = [
  "bg-os-border/20",
  "bg-emerald-500/30",
  "bg-emerald-500/50",
  "bg-emerald-500/70",
  "bg-emerald-500",
];

const DOMAIN_COLORS = {
  learning: "#3B82F6",
  fitness: "#10B981",
  discipline: "#F59E0B",
  work: "#8B5CF6",
  rest: "#64748B",
  social: "#EC4899",
};

const IMPORT_TABLES = ["dayLogs", "habits", "courses", "gates", "schedules", "timers", "drafts", "lifeWheel"];

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
  
  // ✅ بچ ۷۵: Analytics State
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

  // ✅ M1.8: AI Schedule Wizard State
  const [importMode, setImportMode] = useState("backup"); // 'backup' | 'schedule'
  const [scheduleJsonText, setScheduleJsonText] = useState("");
  const [schedulePreview, setSchedulePreview] = useState(null);
  const [scheduleImportStatus, setScheduleImportStatus] = useState("");
  const [scheduleImportLoading, setScheduleImportLoading] = useState(false);
  const [aiGuideStep, setAiGuideStep] = useState(1); // 1: Guide, 2: Paste, 3: Preview

  const lastExportRaw = localStorage.getItem("mohammados_last_export");
  const lastExportDate = lastExportRaw
    ? new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(lastExportRaw))
    : null;

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [vits, hm, gatesData, dt, aTrend, mDist] = await Promise.all([
          AggregationService.getVitals(),
          AggregationService.getHeatmapData(90),
          GateRepository.getAll(),
          AggregationService.getDomainTrend(6),
          AggregationService.getAnalyticsTrend(12), // ✅ بچ ۷۵
          AggregationService.getMoodDistribution(90) // ✅ بچ ۷۵
        ]);
        if (!mounted) return;
        setVitals(vits);
        setHeatmapData(hm);
        setGates(gatesData);
        setDomainTrend(dt || []);
        setAnalyticsTrend(aTrend || []);
        setMoodDist(mDist || []);
      } catch (err) {
        console.error("ReportsPage core load error:", err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadSchedules() {
      try {
        const days = ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"];
        const all = await Promise.all(days.map(d => ScheduleRepository.getDaySchedule(d).catch(() => null)));
        if (mounted) setScheduleBlocks(all.filter(Boolean).flatMap(d => d.schedule || []));
      } catch (err) {
        console.error("Schedule load error:", err);
      }
    }
    loadSchedules();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadWeekly() {
      try {
        const base = new Date(nowMs());
        base.setDate(base.getDate() + weekOffset * 7);
        const wStats = await AggregationService.getWeeklyStats(base);
        if (!mounted) return;
        setWeeklyStats(wStats);
      } catch (err) {
        console.error("ReportsPage weekly load error:", err);
      }
    }
    loadWeekly();
    return () => { mounted = false; };
  }, [weekOffset]);

  const weekRange = useMemo(() => {
    const base = new Date(nowMs());
    base.setDate(base.getDate() + weekOffset * 7);
    const key = getISOWeekKey(base);
    return getISOWeekRange(key);
  }, [weekOffset]);

  const monthMeta = useMemo(() => {
    const base = new Date(nowMs());
    base.setMonth(base.getMonth() + monthOffset);
    return {
      year: base.getFullYear(),
      month: base.getMonth() + 1,
      label: new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long" }).format(base),
    };
  }, [monthOffset]);

  const weekLogs = useMemo(() => weeklyStats?.weeklyDayLogs || [], [weeklyStats]);
  
  const filteredWeekLogs = useMemo(() => {
    if (!searchQuery.trim()) return weekLogs;
    const q = searchQuery.trim().toLowerCase();
    return weekLogs.filter((log) => {
      const entries = log.entries || [];
      return entries.some((e) => {
        const titleMatch = e.title?.toLowerCase().includes(q);
        const domainMatch = e.domain?.toLowerCase().includes(q);
        return titleMatch || domainMatch;
      });
    });
  }, [weekLogs, searchQuery]);
  
  const moodTrend = useMemo(() => weeklyStats?.moodTrend || [], [weeklyStats]);

  const weekDerived = useMemo(() => {
    const activeWeekLogs = weekLogs.filter((l) => {
      if (!l.date) return false;
      const parts = l.date.split('-');
      if (parts.length < 3) return false;
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.getDay() !== 5; 
    });
    
    const totalDays = activeWeekLogs.length;
    const fullDays = activeWeekLogs.filter((l) => l.fullDay).length;
    const frozenDays = activeWeekLogs.filter((l) => l.status === "frozen").length;
    const activeDays = activeWeekLogs.filter((l) => l.status !== "frozen");
    const moodEntries = activeDays.filter((l) => l.mood != null);
    const avgMood = moodEntries.length > 0
      ? (moodEntries.reduce((sum, l) => sum + (l.mood || 0), 0) / moodEntries.length).toFixed(1)
      : "-";

    const domainStats = {};
    DOMAINS.forEach((d) => (domainStats[d.key] = { done: 0, total: 0 }));

    activeWeekLogs.forEach((log) => {
      (log.entries || []).forEach((entry) => {
        if (entry && entry.domain && domainStats[entry.domain]) {
          domainStats[entry.domain].total++;
          if (entry.done) domainStats[entry.domain].done++;
        }
      });
    });

    return { totalDays, fullDays, frozenDays, avgMood, domainStats, moodEntries: moodEntries.length };
  }, [weekLogs]);

  const heatmapMap = useMemo(() => {
    const map = new Map();
    heatmapData.forEach((d) => map.set(d.date, d.level));
    return map;
  }, [heatmapData]);

  const heatmapDays = useMemo(() => {
    const days = [];
    const today = new Date(nowMs());
    for (let i = 89; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      days.push({ date: key, level: heatmapMap.get(key) || 0 });
    }
    return days;
  }, [heatmapMap]);

  const roadmapProgress = useMemo(() => {
    if (!gates.length) return { total: 0, completed: 0, percent: 0 };
    const totalCriteria = gates.reduce((sum, g) => sum + (g.criteria?.length || 0), 0);
    const completedCriteria = gates.reduce((sum, g) => {
      return sum + (g.criteria?.filter((c) => c && (c.assessmentResult === "completed" || c.assessment === "completed")).length || 0);
    }, 0);
    return {
      total: totalCriteria,
      completed: completedCriteria,
      percent: totalCriteria > 0 ? Math.round((completedCriteria / totalCriteria) * 100) : 0,
    };
  }, [gates]);

  const pvaData = useMemo(() => {
    const daysMap = {
      saturday: { name: "شنبه", planned: 0, actual: 0 },
      sunday: { name: "یکشنبه", planned: 0, actual: 0 },
      monday: { name: "دوشنبه", planned: 0, actual: 0 },
      tuesday: { name: "سه‌شنبه", planned: 0, actual: 0 },
      wednesday: { name: "چهارشنبه", planned: 0, actual: 0 },
      thursday: { name: "پنجشنبه", planned: 0, actual: 0 },
      friday: { name: "جمعه", planned: 0, actual: 0 },
    };

    scheduleBlocks.forEach((item) => {
      let dayKey = item.dayOfWeek || item.day;
      if (typeof dayKey === 'number') {
        dayKey = ["saturday","sunday","monday","tuesday","wednesday","thursday","friday"][dayKey];
      }
      if (dayKey && daysMap[dayKey]) {
        const duration = Number(item.duration) || 60;
        daysMap[dayKey].planned += duration;
      }
    });

    const jsToPersian = [1, 2, 3, 4, 5, 6, 0];
    const daysArr = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

    weekLogs.forEach((log) => {
      const dateObj = new Date(log.date);
      const persianIdx = jsToPersian[dateObj.getDay()];
      const dayKey = daysArr[persianIdx];
      
      if (dayKey && daysMap[dayKey]) {
        const actualMins = Number(log.totalMinutes) || 0;
        daysMap[dayKey].actual += actualMins;
      }
    });

    const dataArray = Object.values(daysMap);
    const maxMins = Math.max(...dataArray.map(d => Math.max(d.planned, d.actual)), 60);
    return { dataArray, maxMins };
  }, [scheduleBlocks, weekLogs]);

  const pvaDomainSummary = useMemo(() => {
    const summary = {};
    scheduleBlocks.forEach(item => {
      const domain = item.domain || item.type || "Misc";
      const duration = Number(item.duration) || 60;
      if (!summary[domain]) summary[domain] = { planned: 0, actual: 0 };
      summary[domain].planned += duration;
    });
    return Object.entries(summary);
  }, [scheduleBlocks]);

  const generateAdvisorMarkdown = useCallback(() => {
    const { startDate, endDate } = weekRange;
    let md = `# 📋 گزارش هفتگی MohammadOS\n\n`;
    md += `**دوره:** ${toPersianDate(startDate)} تا ${toPersianDate(endDate)}\n`;
    md += `**تولید شده در:** ${toPersianDate(getLocalDateKey(new Date(nowMs())))}\n\n`;
    md += `---\n\n`;

    md += `## 🎯 خلاصه کلی\n\n`;
    md += `- **Full Day Rate:** ${weekDerived?.fullDays || 0}/${weekDerived?.totalDays || 0} روز\n`;
    md += `- **میانگین حال روز:** ${weekDerived?.avgMood && weekDerived.avgMood !== "-" ? weekDerived.avgMood + " / 5" : "ثبت نشده"}\n`;
    md += `- **Grace Days استفاده شده:** ${weekDerived?.frozenDays || 0}\n`;
    md += `- **استریک فعلی:** ${vitals?.streak || 0} روز\n`;
    md += `- **Consistency:** ${vitals?.consistency || 0}%\n\n`;

    md += `## 📅 جزئیات روزانه\n\n`;
    md += `| تاریخ | وضعیت | Mood | Critical Done | Notes |\n`;
    md += `|-------|-------|------|---------------|-------|\n`;

    weekLogs.forEach((log) => {
      const status = log.status === "frozen" ? "❄️ Grace" : log.fullDay ? "✅ Full" : "⏳ Partial";
      const mood = log.mood && MOOD_LABELS[log.mood] ? MOOD_LABELS[log.mood] : "-";
      const criticalTotal = (log.entries || []).filter((e) => e && e.isCritical).length;
      const criticalDone = (log.entries || []).filter((e) => e && e.isCritical && e.done).length;
      const criticalStr = criticalTotal > 0 ? `${criticalDone}/${criticalTotal}` : "-";
      const note = log.journalNote ? "📝" : "-";
      md += `| ${toPersianDate(log.date)} | ${status} | ${mood} | ${criticalStr} | ${note} |\n`;
    });

    md += `\n## 🏆 دامنه‌ها\n\n`;
    DOMAINS.forEach((d) => {
      const stat = weekDerived?.domainStats?.[d.key] || { done: 0, total: 0 };
      const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
      const bar = "█".repeat(Math.round(pct / 10)) + "░".repeat(10 - Math.round(pct / 10));
      md += `- ${d.icon} **${d.label}:** ${stat.done}/${stat.total} (${pct}%) ${bar}\n`;
    });

    md += `\n## 🗺️ نقشه راه\n\n`;
    md += `- **پیشرفت Gates:** ${roadmapProgress.completed}/${roadmapProgress.total} معیار (${roadmapProgress.percent}%)\n`;

    md += `\n## 📝 یادداشت‌های روزانه\n\n`;
    weekLogs.filter((l) => l.journalNote).forEach((log) => {
      md += `### ${toPersianDate(log.date)}\n${log.journalNote}\n\n`;
    });

    md += `\n---\n*Generated by MohammadOS Reports Hub*\n`;
    return md;
  }, [weekLogs, weekDerived, weekRange, vitals, roadmapProgress]);

  const handleCopyMarkdown = useCallback(() => {
    const md = generateAdvisorMarkdown();
    navigator.clipboard.writeText(md);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 3000);
  }, [generateAdvisorMarkdown]);

  const handleDownloadMarkdown = useCallback(() => {
    const md = generateAdvisorMarkdown();
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      const a = document.createElement("a");
      a.href = url;
      a.download = `mohammados-report-${weekRange.startDate}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } finally {
      URL.revokeObjectURL(url);
    }
  }, [generateAdvisorMarkdown, weekRange]);

  const handleExportJSON = useCallback(async () => {
    setExportStatus("EXPORTING JSON...");
    try {
      await exportToJSON(exportRange);
      setExportStatus("✅ JSON EXPORTED");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setExportStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus("❌ EXPORT FAILED");
    }
  }, [exportRange]);

  const handleExportCSV = useCallback(async () => {
    setExportStatus("EXPORTING CSV...");
    try {
      await exportToCSV(exportRange);
      setExportStatus("✅ CSV EXPORTED");
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setExportStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setExportStatus("❌ EXPORT FAILED");
    }
  }, [exportRange]);

  const validateAndPreview = useCallback((json) => {
    const tables = json?.tables || json;
    const isMohammadOS = json?.app === "MohammadOS" || json?.version?.includes("mohammados");

    if (!tables?.dayLogs || !Array.isArray(tables.dayLogs)) {
      setImportStatus("❌ NOT A MOHAMMADOS EXPORT");
      return;
    }

    const hasValidDayLogs = tables.dayLogs.every(d => 
      d && typeof d.date === 'string' && Array.isArray(d.entries) && 'mood' in d
    );

    if (!isMohammadOS && !hasValidDayLogs) {
      setImportStatus("❌ INVALID FILE STRUCTURE");
      return;
    }

    const preview = {};
    let totalRecords = 0;

    IMPORT_TABLES.forEach((tableName) => {
      const records = Array.isArray(tables[tableName]) ? tables[tableName] : [];
      if (records.length > 0) {
        preview[tableName] = records.length;
        totalRecords += records.length;
      }
    });

    if (totalRecords === 0) {
      setImportStatus("❌ NO DATA FOUND IN FILE");
      return;
    }

    setImportPreview(preview);
    setImportStatus(`✅ READY — ${totalRecords} records found`);
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setImportStatus("READING FILE...");
    setImportPreview(null);

    try {
      const json = await ImportService.parseFile(file);
      setImportFileContent(json);
      validateAndPreview(json);
    } catch (err) {
      console.error("File read error:", err);
      setImportStatus("❌ INVALID FILE STRUCTURE");
      setImportPreview(null);
    }
  }, [validateAndPreview]);

  const handleImportConfirm = useCallback(async () => {
    if (!importPreview || !importFileContent) return;
    if (!window.confirm("⚠️ این عمل داده‌های فعلی را بازنویسی می‌کند. ادامه می‌دهی؟")) return;

    setImportStatus("IMPORTING...");

    try {
      const tables = importFileContent?.tables || importFileContent;
      await ImportService.importData(tables);

      setImportStatus("✅ IMPORT COMPLETE — Reloading page...");
      setTimeout(() => window.location.reload(), 1500);
    } catch (err) {
      console.error("Import error:", err);
      setImportStatus("❌ IMPORT FAILED: " + err.message);
    }
  }, [importFileContent, importPreview]);

  const handleClearImport = useCallback(() => {
    setImportFile(null);
    setImportFileContent(null);
    setImportPreview(null);
    setImportStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleCopyWeekReport = useCallback(() => {
    let text = `📅 گزارش هفتگی MohammadOS\n`;
    text += `${toPersianDate(weekRange.startDate)} تا ${toPersianDate(weekRange.endDate)}\n\n`;
    
    weekLogs.forEach((log) => {
      const date = toPersianDate(log.date);
      const status = log.status === "frozen" ? "❄️ Grace" : log.fullDay ? "✅ Full Day" : "⏳ Partial";
      text += `▸ ${date} — ${status}\n`;
      
      if (log.mood && MOOD_LABELS[log.mood]) {
        text += `  😊 حال: ${MOOD_LABELS[log.mood]}\n`;
      }
      
      const entries = log.entries || [];
      if (entries.length > 0) {
        entries.forEach((e) => {
          const done = e.done ? "✅" : "⬜";
          const domain = DOMAINS.find((d) => d.key === e.domain)?.label || e.domain;
          text += `  ${done} ${e.title}`;
          if (domain && e.domain !== "general") text += ` [${domain}]`;
          if (e.isCritical) text += " 🔴";
          text += `\n`;
        });
      } else {
        text += `  — هیچ موردی ثبت نشده\n`;
      }
      text += `\n`;
    });
    
    navigator.clipboard.writeText(text);
    setWeekCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setWeekCopied(false), 3000);
  }, [weekLogs, weekRange]);

  // ✅ M1.8: AI Schedule Handlers
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(WEEKLY_PLANNER_PROMPT);
      setScheduleImportStatus("✅ پرامپت با موفقیت کپی شد!");
      setTimeout(() => setScheduleImportStatus(""), 2000);
    } catch {
      setScheduleImportStatus("❌ کپی ناموفق - دستی کپی کنید");
    }
  };

  const handleParseScheduleJson = () => {
    try {
      const parsed = JSON.parse(scheduleJsonText);
      if (!Array.isArray(parsed)) throw new Error("باید آرایه باشد");
      setSchedulePreview(parsed);
      setScheduleImportStatus("");
      setAiGuideStep(3);
    } catch (e) {
      setScheduleImportStatus("❌ JSON نامعتبر: " + e.message);
      setSchedulePreview(null);
    }
  };

  const handleImportSchedule = async () => {
    if (!schedulePreview) return;
    setScheduleImportLoading(true);
    try {
      const result = await importWeeklySchedule(scheduleJsonText);
      setScheduleImportStatus(`✅ برنامه وارد شد! ${result.importedDays} روز، ${result.totalBlocks} بلوک زمانی`);
      setSchedulePreview(null);
      setScheduleJsonText("");
      setAiGuideStep(1);
    } catch (e) {
      setScheduleImportStatus("❌ " + e.message);
    } finally {
      setScheduleImportLoading(false);
    }
  };

  // ✅ بچ ۷۵: Analytics Chart Renderers
  const renderProductivityCurve = () => {
    if (!analyticsTrend.length) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای نمایش وجود ندارد.</p>;

    const width = 600;
    const height = 200;
    const padding = 30;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const maxFullDays = 7;

    const stepX = chartW / (analyticsTrend.length - 1 || 1);

    const pointsConsistency = analyticsTrend.map((w, i) => {
      const x = padding + i * stepX;
      const y = padding + chartH - (w.consistency / 100) * chartH;
      return `${x},${y}`;
    }).join(" ");

    const pointsFullDays = analyticsTrend.map((w, i) => {
      const x = padding + i * stepX;
      const y = padding + chartH - (w.fullDays / maxFullDays) * chartH;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="نمودار بهره‌وری ۱۲ هفته اخیر">
        {[0, 25, 50, 75, 100].map((tick) => {
          const y = padding + chartH - (tick / 100) * chartH;
          return (
            <g key={tick}>
              <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity="0.05" strokeWidth="1" />
              <text x={padding - 5} y={y + 3} textAnchor="end" fill="currentColor" fontSize="9" fontFamily="monospace" opacity="0.5">
                {toPersianNumber(tick)}%
              </text>
            </g>
          );
        })}
        
        <polyline fill="none" stroke="#3B82F6" strokeWidth="2" points={pointsConsistency} strokeLinecap="round" strokeLinejoin="round" />
        <polyline fill="none" stroke="#10B981" strokeWidth="2" points={pointsFullDays} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2" />
        
        {analyticsTrend.map((w, i) => {
          const x = padding + i * stepX;
          const y = padding + chartH - (w.consistency / 100) * chartH;
          return <circle key={i} cx={x} cy={y} r="3" fill="#3B82F6" />;
        })}
        
        <text x={width / 2} y={height - 5} textAnchor="middle" fill="currentColor" fontSize="9" fontFamily="monospace" opacity="0.5">
          12 Weeks Trend
        </text>
      </svg>
    );
  };

  const renderMoodDonut = () => {
    const total = moodDist.reduce((sum, m) => sum + m.count, 0);
    if (total === 0) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای Mood وجود ندارد.</p>;

    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;

    return (
      <div className="flex flex-col md:flex-row items-center justify-center gap-6">
        <svg viewBox="0 0 160 160" className="w-40 h-40">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.1" strokeWidth="20" />
          {moodDist.map((m) => {
            const length = (m.count / total) * circumference;
            const dasharray = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={m.level}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={m.color}
                strokeWidth="20"
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
                transform="rotate(-90 80 80)"
              />
            );
            offset += length;
            return circle;
          })}
          <text x="80" y="75" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="bold">
            {toPersianNumber(total)}
          </text>
          <text x="80" y="90" textAnchor="middle" fill="currentColor" fontSize="9" fontFamily="monospace" opacity="0.5">
            Entries
          </text>
        </svg>
        <div className="flex flex-col gap-2">
          {moodDist.map((m) => (
            <div key={m.level} className="flex items-center gap-2 text-xs">
              <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: m.color }}></span>
              <span className="text-os-text/70 w-16">{m.label}</span>
              <span className="font-mono text-os-text/50">{toPersianNumber(m.count)} بار</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDomainRadar = () => {
    if (!domainTrend.length) return <p className="text-os-text/50 text-sm text-center py-4">داده‌ای برای نمایش رادار وجود ندارد.</p>;

    const latestWeek = domainTrend[domainTrend.length - 1];
    const size = 200;
    const center = size / 2;
    const radius = 70;

    const angles = DOMAINS.map((_, i) => (Math.PI * 2 * i) / DOMAINS.length - Math.PI / 2);

    const getPoint = (perc, i) => ({
      x: center + radius * perc * Math.cos(angles[i]),
      y: center + radius * perc * Math.sin(angles[i])
    });

    const polygonPoints = DOMAINS.map((d, i) => {
      const val = latestWeek.domains[d.key] || 0;
      const p = getPoint(val / 100, i);
      return `${p.x},${p.y}`;
    }).join(" ");

    return (
      <svg viewBox={`0 0 ${size} ${size}`} className="w-48 h-48 mx-auto">
        {[0.25, 0.5, 0.75, 1].map((lvl, idx) => (
          <polygon
            key={idx}
            points={DOMAINS.map((_, i) => {
              const p = getPoint(lvl, i);
              return `${p.x},${p.y}`;
            }).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.1"
            strokeWidth="1"
          />
        ))}
        {angles.map((ang, i) => {
          const p1 = { x: center, y: center };
          const p2 = { x: center + radius * Math.cos(ang), y: center + radius * Math.sin(ang) };
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />;
        })}
        <polygon points={polygonPoints} fill="rgba(245, 166, 35, 0.2)" stroke="#F5A623" strokeWidth="2" />
        {DOMAINS.map((d, i) => {
          const val = latestWeek.domains[d.key] || 0;
          const p = getPoint(val / 100, i);
          return <circle key={i} cx={p.x} cy={p.y} r="3" fill={DOMAIN_COLORS[d.key]} />;
        })}
      </svg>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[300px]" role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-os-border border-t-os-accent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-[10px] font-mono text-os-text/40 tracking-wider uppercase">Loading Report Data...</span>
        </div>
      </div>
    );
  }

  const renderMoodTrend = () => {
    const trendData = moodTrend
      .map(m => (m && typeof m === 'object' ? m.mood : m))
      .filter(m => typeof m === 'number');
    
    if (!trendData.length) return <p className="text-os-text/50 text-sm text-center py-4">دادهٔ Mood کافی نیست.</p>;
    
    const width = 600;
    const height = 120;
    const padding = 20;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const maxMood = 5;
    const minMood = 1;
    const stepX = chartW / (trendData.length - 1 || 1);

    const points = trendData.map((m, i) => {
      const x = padding + i * stepX;
      const y = padding + chartH - ((m - minMood) / (maxMood - minMood)) * chartH;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32" role="img" aria-label="نمودار روند حال روز">
        {[1, 2, 3, 4, 5].map((val) => {
          const y = padding + chartH - ((val - minMood) / (maxMood - minMood)) * chartH;
          return <line key={val} x1={padding} y1={y} x2={width - padding} y2={y} stroke="currentColor" strokeOpacity="0.1" strokeWidth="1" />;
        })}
        <polyline
          fill="none"
          stroke="#f5a623"
          strokeWidth="2"
          points={points}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {trendData.map((m, i) => {
          const x = padding + i * stepX;
          const y = padding + chartH - ((m - minMood) / (maxMood - minMood)) * chartH;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r="4" fill="#f5a623" stroke="#0a0a0a" strokeWidth="2" />
              <text x={x} y={y - 8} textAnchor="middle" fill="currentColor" fontSize="10" fontFamily="monospace" opacity="0.7">
                {m}
              </text>
            </g>
          );
        })}
      </svg>
    );
  };

  const renderDomainTrendChart = () => {
    if (!domainTrend || domainTrend.length === 0) {
      return <p className="text-os-text/50 text-sm text-center py-4">دادهٔ کافی برای نمایش روند دامنه‌ها وجود ندارد.</p>;
    }

    const width = 700;
    const height = 340;
    const padding = { top: 20, right: 10, bottom: 70, left: 44 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const weeks = domainTrend.length;
    const domainKeys = DOMAINS.map((d) => d.key);
    const barCount = domainKeys.length;
    const groupWidth = chartW / weeks;
    const barWidth = (groupWidth * 0.72) / barCount;
    const groupGap = groupWidth * 0.14;

    const yTicks = [0, 25, 50, 75, 100];

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="نمودار روند دامنه‌ها">
        {yTicks.map((tick) => {
          const y = padding.top + chartH - (tick / 100) * chartH;
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
              <text x={padding.left - 6} y={y + 3} textAnchor="end" fill="currentColor" fontSize="9" fontFamily="monospace" opacity="0.5">
                {toPersianNumber(tick)}%
              </text>
            </g>
          );
        })}

        {domainTrend.map((week, weekIdx) => {
          const groupX = padding.left + weekIdx * groupWidth + groupGap;
          return (
            <g key={weekIdx}>
              {domainKeys.map((dk, dIdx) => {
                const val = week.domains[dk] || 0;
                const barH = (val / 100) * chartH;
                const x = groupX + dIdx * barWidth;
                const y = padding.top + chartH - barH;
                return (
                  <rect
                    key={dk}
                    x={x}
                    y={y}
                    width={Math.max(barWidth - 2, 2)}
                    height={barH}
                    fill={DOMAIN_COLORS[dk]}
                    rx={2}
                    opacity={0.88}
                  />
                );
              })}
              <text
                x={groupX + (barCount * barWidth) / 2}
                y={height - padding.bottom + 18}
                textAnchor="middle"
                fill="currentColor"
                fontSize="9"
                fontFamily="monospace"
                opacity="0.55"
              >
                {week.weekLabel}
              </text>
            </g>
          );
        })}

        <g transform={`translate(${padding.left}, ${height - 28})`}>
          {DOMAINS.map((d, i) => (
            <g key={d.key} transform={`translate(${i * 96}, 0)`}>
              <rect x={0} y={-7} width={8} height={8} fill={DOMAIN_COLORS[d.key]} rx={2} />
              <text x={12} y={0} fill="currentColor" fontSize="9" fontFamily="monospace" opacity="0.7">
                {d.label}
              </text>
            </g>
          ))}
        </g>
      </svg>
    );
  };

  const tabs = [
    { id: "weekly", label: "📅 هفتگی" },
    { id: "monthly", label: "📊 ماهانه" },
    { id: "analytics", label: "📈 تحلیلی" },
    { id: "trends", label: "📉 روند" },
    { id: "domainTrend", label: "🏆 دامنه‌ها" },
    { id: "roadmap", label: "🗺️ نقشه راه" },
    { id: "advisor", label: "📝 مشاور" },
    { id: "export", label: "📥 خروجی" },
    { id: "import", label: "📤 ورودی" },
    { id: "pva", label: "⚖️ برنامه vs عملکرد" },
  ];

  return (
    <div className="max-w-3xl mx-auto p-6 font-vazir rtl text-os-text">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black mb-1">گزارش‌ساز هوشمند</h1>
        <p className="font-mono text-[10px] tracking-[0.3em] text-os-accent uppercase">Intelligence Reports Hub</p>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto pb-1" role="tablist" aria-label="تب‌های گزارش">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            className={`flex-1 min-w-[80px] py-3 rounded-lg font-bold text-sm transition-all border ${
              activeTab === tab.id
                ? "bg-os-accent/10 border-os-accent text-os-accent"
                : "bg-os-card border-os-border text-os-text/60 hover:border-os-text/40"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "weekly" && (
        <div id="panel-weekly" role="tabpanel" className="space-y-6">
          <div className="flex items-center justify-between bg-os-card border border-os-border rounded-lg p-3">
            <button
              onClick={() => setWeekOffset((o) => o - 1)}
              className="px-3 py-1.5 rounded border border-os-border text-os-text/70 hover:border-os-accent hover:text-os-accent transition text-xs font-mono"
            >
              ← هفته قبل
            </button>
            <span className="text-sm font-bold">
              {toPersianDate(weekRange.startDate)} تا {toPersianDate(weekRange.endDate)}
              {weekOffset === 0 && <span className="text-os-accent text-[10px] mr-2">(جاری)</span>}
            </span>
            <button
              onClick={() => setWeekOffset((o) => o + 1)}
              className="px-3 py-1.5 rounded border border-os-border text-os-text/70 hover:border-os-accent hover:text-os-accent transition text-xs font-mono"
            >
              هفته بعد →
            </button>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleCopyWeekReport}
              className={`px-3 py-1.5 rounded border text-xs font-mono transition ${
                weekCopied
                  ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                  : "bg-os-card border-os-border text-os-text/70 hover:border-os-accent hover:text-os-accent"
              }`}
            >
              {weekCopied ? "✅ کپی شد!" : "📋 کپی گزارش هفتگی"}
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-emerald-400">{toPersianNumber(weekDerived.fullDays)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">FULL DAYS</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-sky-400">{toPersianNumber(weekDerived.totalDays - weekDerived.frozenDays)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">ACTIVE DAYS</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-amber-400">{toPersianNumber(weekDerived.avgMood)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">AVG MOOD</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-blue-400">{toPersianNumber(weekDerived.frozenDays)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">GRACE DAYS</div>
            </div>
          </div>

          <div className="mb-4">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="🔍 جستجو در عادت‌ها..."
                className="w-full px-4 py-2.5 pr-10 bg-os-bg border border-os-border rounded-lg text-sm text-os-text focus:outline-none focus:border-os-accent transition placeholder:text-os-text/30"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-os-text/30 text-sm">🔍</span>
            </div>
          </div>

          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] WEEK BREAKDOWN</h3>
            <div className="space-y-2">
              {filteredWeekLogs.length === 0 && (
                <p className="text-os-text/50 text-sm text-center py-4">
                  {searchQuery.trim() ? "نتیجه‌ای برای این جستجو یافت نشد." : "داده‌ای برای این هفته یافت نشد."}
                </p>
              )}
              {filteredWeekLogs.map((log) => {
                const total = (log.entries || []).length;
                const done = (log.entries || []).filter((e) => e && e.done).length;
                const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                const isFrozen = log.status === "frozen";
                const isFull = log.fullDay;
                const entries = log.entries || [];
                return (
                  <div key={log.date} className="flex flex-col gap-2 p-3 rounded border border-os-border/50 bg-os-bg/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-10 rounded-full shrink-0 ${isFrozen ? "bg-blue-400" : isFull ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                          <span className="text-sm font-bold">{toPersianDate(log.date)}</span>
                          <span className="text-[10px] font-mono">
                            {isFrozen ? "❄️ Grace" : isFull ? "✅ Full" : `${toPersianNumber(done ?? 0)} از ${toPersianNumber(total ?? 0)} انجام‌شده`}
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-os-border rounded-full mt-1.5 overflow-hidden" role="progressbar" aria-valuenow={isFrozen ? 100 : pct} aria-valuemin="0" aria-valuemax="100" aria-label={`پیشرفت ${toPersianDate(log.date)}`}>
                          <div className={`h-full rounded-full transition-all ${isFrozen ? "bg-blue-400" : isFull ? "bg-emerald-400" : "bg-amber-400"}`} style={{ width: `${isFrozen ? 100 : pct}%` }} aria-hidden="true" />
                        </div>
                      </div>
                      {log.mood && MOOD_LABELS[log.mood] && (
                        <span className="text-lg shrink-0" title={MOOD_LABELS[log.mood]} aria-label={MOOD_LABELS[log.mood]}>
                          {MOOD_LABELS[log.mood].split(" ")[0]}
                        </span>
                      )}
                    </div>
                    
                    {!isFrozen && entries.length > 0 && (
                      <div className="pr-5 space-y-1">
                        {entries.map((entry) => (
                          <div key={entry.id} className="flex items-center gap-2 text-[11px]">
                            <span className={entry.done ? "text-emerald-400" : "text-os-text/30"}>
                              {entry.done ? "✓" : "○"}
                            </span>
                            <span className={entry.done ? "text-os-text/60 line-through" : "text-os-text"}>
                              {entry.title}
                            </span>
                            {entry.isCritical && <span className="text-red-400 text-[9px]">🔴</span>}
                            {entry.domain && entry.domain !== "general" && (
                              <span className="text-[9px] text-os-text/40 mr-auto">
                                {DOMAINS.find((d) => d.key === entry.domain)?.icon || entry.domain}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DOMAIN BREAKDOWN</h3>
            <div className="space-y-2">
              {DOMAINS.map((d) => {
                const stat = weekDerived.domainStats[d.key];
                const pct = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
                return (
                  <div key={d.key} className="flex items-center gap-3">
                    <span className="text-lg w-6 text-center" aria-hidden="true">{d.icon}</span>
                    <span className="text-xs w-16 text-os-text/70">{d.label}</span>
                    <div className="flex-1 h-2 bg-os-border rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`پیشرفت ${d.label}`}>
                      <div className="h-full bg-os-accent rounded-full transition-all" style={{ width: `${pct}%` }} aria-hidden="true" />
                    </div>
                    <span className="text-[10px] font-mono w-10 text-right">{toPersianNumber(pct ?? 0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {activeTab === "monthly" && (
        <div id="panel-monthly" role="tabpanel" className="space-y-6">
          <div className="flex items-center justify-between bg-os-card border border-os-border rounded-lg p-3">
            <button onClick={() => setMonthOffset((o) => o - 1)} className="px-3 py-1.5 rounded border border-os-border text-os-text/70 hover:border-os-accent hover:text-os-accent transition text-xs font-mono">← ماه قبل</button>
            <span className="text-sm font-bold">{monthMeta.label}{monthOffset === 0 && <span className="text-os-accent text-[10px] mr-2">(جاری)</span>}</span>
            <button onClick={() => setMonthOffset((o) => o + 1)} className="px-3 py-1.5 rounded border border-os-border text-os-text/70 hover:border-os-accent hover:text-os-accent transition text-xs font-mono">ماه بعد →</button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-emerald-400">{toPersianNumber(vitals?.monthRate ?? 0)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">MONTH RATE %</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-sky-400">{toPersianNumber(vitals?.streak ?? 0)}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">STREAK</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-amber-400">{toPersianNumber(vitals?.avgMood ?? "-")}</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">AVG MOOD</div>
            </div>
            <div className="bg-os-card border border-os-border rounded-lg p-4 text-center">
              <div className="text-2xl font-black text-blue-400">{toPersianNumber(vitals?.consistency ?? 0)}%</div>
              <div className="text-[10px] font-mono text-os-text/50 mt-1">CONSISTENCY</div>
            </div>
          </div>

          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] 90-DAY HEATMAP</h3>
            <div className="flex flex-wrap gap-1" role="grid" aria-label="heatmap ۹۰ روز اخیر">
              {heatmapDays.map((d, i) => (
                <div
                  key={i}
                  className={`w-3 h-3 rounded-sm ${HEATMAP_LEVELS[d.level] || HEATMAP_LEVELS[0]} transition-colors`}
                  title={d.date}
                  role="gridcell"
                  aria-label={`${d.date}: سطح ${d.level}`}
                />
              ))}
            </div>
            <div className="flex items-center gap-3 mt-3 text-[9px] font-mono text-os-text/40">
              <span>کمتر</span>
              {HEATMAP_LEVELS.map((cls, i) => (
                <div key={i} className={`w-3 h-3 rounded-sm ${cls}`} aria-hidden="true" />
              ))}
              <span>بیشتر</span>
            </div>
          </div>
        </div>
      )}

      {/* ✅ بچ ۷۵: Analytics Dashboard UI */}
      {activeTab === "analytics" && (
        <div id="panel-analytics" role="tabpanel" className="space-y-6">
          
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] PRODUCTIVITY CURVE (12 WEEKS)</h3>
            <div className="flex justify-center gap-6 mb-4 text-[10px] font-mono">
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-sky-400"></div>
                <span className="text-os-text/60">Consistency %</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-0.5 bg-emerald-400 border-dashed"></div>
                <span className="text-os-text/60">Full Days</span>
              </div>
            </div>
            {renderProductivityCurve()}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-os-card border border-os-border rounded-lg p-4">
              <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] MOOD DISTRIBUTION (90 DAYS)</h3>
              {renderMoodDonut()}
            </div>

            <div className="bg-os-card border border-os-border rounded-lg p-4">
              <h3 className="text-sm font-mono text-os-accent mb-4 text-left">[ ◈ ] DOMAIN BALANCE (RADAR)</h3>
              {renderDomainRadar()}
              <p className="text-center text-[10px] font-mono text-os-text/40 mt-2">Latest Week Status</p>
            </div>
          </div>

        </div>
      )}

      {activeTab === "trends" && (
        <div id="panel-trends" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] MOOD TREND</h3>
            {renderMoodTrend()}
          </div>

          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] VITALS</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30">
                <div className="text-[10px] font-mono text-os-text/50">STREAK</div>
                <div className="text-xl font-black text-amber-400">{toPersianNumber(vitals?.streak ?? 0)} <span className="text-xs font-normal text-os-text/40">روز</span></div>
              </div>
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30">
                <div className="text-[10px] font-mono text-os-text/50">CONSISTENCY</div>
                <div className="text-xl font-black text-emerald-400">{toPersianNumber(vitals?.consistency ?? 0)}%</div>
              </div>
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30">
                <div className="text-[10px] font-mono text-os-text/50">GRACE USED</div>
                <div className="text-xl font-black text-blue-400">{toPersianNumber(vitals?.graceUsed ?? 0)} / {toPersianNumber(vitals?.graceTotal ?? 2)}</div>
              </div>
              <div className="p-3 rounded border border-os-border/50 bg-os-bg/30">
                <div className="text-[10px] font-mono text-os-text/50">AVG MOOD</div>
                <div className="text-xl font-black text-purple-400">{toPersianNumber(vitals?.avgMood ?? "-")}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "domainTrend" && (
        <div id="panel-domainTrend" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DOMAIN TREND (۶ هفته)</h3>
            {renderDomainTrendChart()}
          </div>

          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DOMAIN TABLE</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-os-border/50 text-os-text/50 font-mono">
                    <th className="text-right py-2 px-2">دامنه</th>
                    {domainTrend.map((w, i) => (
                      <th key={i} className="text-center py-2 px-1 font-mono">{w.weekLabel}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DOMAINS.map((d) => (
                    <tr key={d.key} className="border-b border-os-border/20">
                      <td className="py-2 px-2">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-sm inline-block shrink-0" style={{ backgroundColor: DOMAIN_COLORS[d.key] }} />
                          <span>{d.label}</span>
                        </div>
                      </td>
                      {domainTrend.map((w, i) => {
                        const val = w.domains[d.key] || 0;
                        return (
                          <td key={i} className={`text-center py-2 px-1 font-mono ${val >= 80 ? 'text-emerald-400' : val >= 50 ? 'text-amber-400' : 'text-os-text/60'}`}>
                            {toPersianNumber(val)}%
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === "roadmap" && (
        <div id="panel-roadmap" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] ROADMAP PROGRESS</h3>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm font-bold">پیشرفت کلی Gates</span>
              <span className="text-sm font-mono text-os-accent">{toPersianNumber(roadmapProgress.percent)}%</span>
            </div>
            <div className="w-full h-2 bg-os-border rounded-full overflow-hidden mb-4" role="progressbar" aria-valuenow={roadmapProgress.percent} aria-valuemin="0" aria-valuemax="100" aria-label="پیشرفت نقشه راه">
              <div className="h-full bg-os-accent rounded-full transition-all" style={{ width: `${roadmapProgress.percent}%` }} aria-hidden="true" />
            </div>
            <div className="text-[10px] font-mono text-os-text/50 text-center">
              {toPersianNumber(roadmapProgress.completed)} / {toPersianNumber(roadmapProgress.total)} معیار تکمیل شده
            </div>
          </div>

          <div className="space-y-3">
            {gates.length === 0 && <p className="text-os-text/50 text-sm text-center py-4">هیچ Gate ثبت نشده است.</p>}
            {gates.map((gate) => {
              const total = gate.criteria?.length || 0;
              const done = gate.criteria?.filter((c) => c && (c.assessmentResult === "completed" || c.assessment === "completed")).length || 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={gate.id || gate.title} className="bg-os-card border border-os-border rounded-lg p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="text-sm font-bold">{gate.title}</h4>
                    <span className="text-[10px] font-mono text-os-accent">{toPersianNumber(pct)}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-os-border rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label={`پیشرفت ${gate.title}`}>
                    <div className="h-full bg-emerald-400 rounded-full transition-all" style={{ width: `${pct}%` }} aria-hidden="true" />
                  </div>
                  <p className="text-[10px] font-mono text-os-text/50 mt-2">{toPersianNumber(done)} / {toPersianNumber(total)} معیار</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeTab === "advisor" && (
        <div id="panel-advisor" role="tabpanel" className="space-y-4">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] ADVISOR EXPORT</h3>
            <p className="text-xs text-os-text/60 mb-4">گزارش Markdown خودکار برای ارسال به مشاور. شامل Mood، وضعیت روزانه، دامنه‌ها، نقشه راه و یادداشت‌ها.</p>
            <div className="bg-os-bg border border-os-border rounded-lg p-4 font-mono text-[11px] text-os-text/80 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto" role="document" aria-label="پیش‌نمایش گزارش مشاور">
              {generateAdvisorMarkdown()}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleCopyMarkdown} className={`flex-1 py-3 rounded-lg font-bold text-sm transition-all border ${copied ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-os-accent/10 border-os-accent text-os-accent hover:bg-os-accent hover:text-os-bg"}`}>
                {copied ? "✅ کپی شد!" : "📋 کپی Markdown"}
              </button>
              <button onClick={handleDownloadMarkdown} className="flex-1 py-3 rounded-lg font-bold text-sm transition-all border bg-sky-500/10 border-sky-500 text-sky-400 hover:bg-sky-500 hover:text-os-bg">⬇ دانلود .md</button>
            </div>
          </div>
        </div>
      )}

      {activeTab === "export" && (
        <div id="panel-export" role="tabpanel" className="space-y-6">
          <div className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DATA EXPORT</h3>
            <p className="text-xs text-os-text/60 mb-4">خروجی JSON شامل تمام جداول سیستم است و به‌صورت فشرده (Gzip) دانلود می‌شود. CSV فقط گزارش‌های روزانه را به‌صورت flattened export می‌کند.</p>
            <div className="mb-4">
              <label className="text-[10px] font-mono text-os-text/60 block mb-2 uppercase">TIME RANGE:</label>
              <select value={exportRange} onChange={(e) => setExportRange(e.target.value)} className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text focus:border-os-accent outline-none transition">
                <option value="7">۷ روز اخیر</option>
                <option value="30">۳۰ روز اخیر</option>
                <option value="all">تمام داده‌ها</option>
              </select>
            </div>
            <div className="flex gap-3">
              <button onClick={handleExportJSON} className="flex-1 bg-emerald-500/10 border border-emerald-500 text-emerald-400 py-3 rounded-lg font-mono text-xs hover:bg-emerald-500 hover:text-os-bg transition">📥 EXPORT JSON (Gzip)</button>
              <button onClick={handleExportCSV} className="flex-1 bg-sky-500/10 border border-sky-500 text-sky-400 py-3 rounded-lg font-mono text-xs hover:bg-sky-500 hover:text-os-bg transition">📥 EXPORT CSV</button>
            </div>
            {exportStatus && <p className="text-[10px] font-mono text-os-text/50 mt-3 text-center" role="status" aria-live="polite">{exportStatus}</p>}
          </div>
        </div>
      )}

      {/* ✅ M1.8: Advanced Import Tab (Backup + AI Schedule) */}
      {activeTab === "import" && (
        <div id="panel-import" role="tabpanel" className="space-y-6">
          
          <div className="flex gap-2 p-1 bg-os-bg border border-os-border rounded-lg">
            <button
              onClick={() => setImportMode("backup")}
              className={`flex-1 py-2 text-xs font-mono rounded transition ${
                importMode === "backup" ? "bg-os-accent text-os-bg" : "text-os-text/60 hover:text-os-text"
              }`}
            >
              📦 بکاپ کامل
            </button>
            <button
              onClick={() => setImportMode("schedule")}
              className={`flex-1 py-2 text-xs font-mono rounded transition ${
                importMode === "schedule" ? "bg-os-accent text-os-bg" : "text-os-text/60 hover:text-os-text"
              }`}
            >
              🤖 برنامهٔ هفتگی AI
            </button>
          </div>

          {importMode === "backup" && (
            <div className="bg-os-card border border-os-border rounded-lg p-4">
              <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] DATA IMPORT</h3>
              <p className="text-xs text-os-text/60 mb-4">فایل خروجی MohammadOS (چه فشرده .gz و چه ساده .json) را انتخاب کن. این عمل داده‌های فعلی را بازنویسی می‌کند.</p>
              <div className="mb-4">
                <input ref={fileInputRef} type="file" accept=".json,.gz,application/json,application/gzip" onChange={handleFileSelect} className="w-full text-xs text-os-text file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:bg-os-accent/20 file:text-os-accent file:font-mono hover:file:bg-os-accent/30 transition" />
                {!importFile && <p className="text-[10px] font-mono text-os-text/40 mt-2">{lastExportDate ? `📦 Last backup: ${lastExportDate}` : "📦 No previous backup found"}</p>}
              </div>
              {importStatus && (
                <div className={`mb-4 p-3 rounded-lg border text-xs font-mono ${importStatus.startsWith("✅") ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : importStatus.startsWith("❌") ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-amber-500/10 border-amber-500/30 text-amber-400"}`} role="status" aria-live="polite">
                  {importStatus}
                </div>
              )}
              {importPreview && (
                <div className="mb-4 bg-os-bg border border-os-border rounded-lg p-3">
                  <h4 className="text-[10px] font-mono text-os-text/60 mb-2 uppercase">PREVIEW</h4>
                  <div className="space-y-1">
                    {Object.entries(importPreview).map(([table, count]) => (
                      <div key={table} className="flex justify-between text-xs font-mono"><span className="text-os-text/70">{table}</span><span className="text-os-accent">{toPersianNumber(count)} records</span></div>
                    ))}
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button onClick={handleImportConfirm} className="flex-1 bg-emerald-500/10 border border-emerald-500 text-emerald-400 py-2 rounded-lg font-mono text-xs hover:bg-emerald-500 hover:text-os-bg transition">✅ CONFIRM IMPORT</button>
                    <button onClick={handleClearImport} className="flex-1 border border-os-border text-os-text/60 py-2 rounded-lg font-mono text-xs hover:bg-os-border/30 transition">CLEAR</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {importMode === "schedule" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {[1, 2, 3].map(s => (
                  <div key={s} className={`flex-1 h-1 rounded-full transition ${aiGuideStep >= s ? 'bg-os-accent' : 'bg-os-border'}`} />
                ))}
              </div>

              {aiGuideStep === 1 && (
                <div className="bg-os-card border border-os-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">🤖</span>
                    <h3 className="text-sm font-bold text-os-accent">راهنمای ساخت برنامه با AI</h3>
                  </div>
                  
                  <div className="text-xs text-os-text/70 leading-relaxed whitespace-pre-line bg-os-bg/50 p-4 rounded-lg border border-os-border/50">
                    {WEEKLY_PLANNER_GUIDE_TEXT}
                  </div>

                  <div className="bg-os-bg/50 p-4 rounded-lg border border-os-border/50 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-os-text">📋 پرامپت مشاور برنامه‌ریز</span>
                      <button
                        onClick={handleCopyPrompt}
                        className="text-[10px] font-mono bg-os-accent/10 text-os-accent border border-os-accent/30 px-3 py-1.5 rounded hover:bg-os-accent/20 transition"
                      >
                        {scheduleImportStatus.includes("کپی شد") ? "✅ کپی شد!" : "📋 کپی پرامپت"}
                      </button>
                    </div>
                    <div className="max-h-48 overflow-y-auto text-[10px] font-mono text-os-text/50 bg-os-bg p-3 rounded border border-os-border/30 leading-relaxed whitespace-pre-wrap">
                      {WEEKLY_PLANNER_PROMPT}
                    </div>
                  </div>

                  <button
                    onClick={() => setAiGuideStep(2)}
                    className="w-full py-3 bg-os-accent text-os-bg font-mono text-xs rounded-lg hover:opacity-90 transition"
                  >
                    مرحله بعد: Paste JSON →
                  </button>
                </div>
              )}

              {aiGuideStep === 2 && (
                <div className="bg-os-card border border-os-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">📥</span>
                    <h3 className="text-sm font-bold text-os-accent">Paste JSON برنامهٔ هفتگی</h3>
                  </div>
                  
                  <p className="text-xs text-os-text/60">
                    خروجی JSON را از هوش مصنوعی کپی کنید و اینجا پیست کنید:
                  </p>
                  
                  <textarea
                    value={scheduleJsonText}
                    onChange={(e) => setScheduleJsonText(e.target.value)}
                    placeholder={`[\n  {\n    "dayOfWeek": "saturday",\n    "schedule": [...]\n  }\n]`}
                    className="w-full h-64 bg-os-bg border border-os-border rounded-lg p-3 text-[11px] font-mono text-os-text focus:outline-none focus:border-os-accent transition resize-none"
                    dir="ltr"
                  />
                  
                  {scheduleImportStatus && (
                    <div className={`text-xs p-2 rounded ${scheduleImportStatus.startsWith("✅") ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      {scheduleImportStatus}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setAiGuideStep(1)} className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:text-os-text transition">← قبلی</button>
                    <button onClick={handleParseScheduleJson} disabled={!scheduleJsonText.trim()} className="flex-1 py-2 bg-os-accent text-os-bg font-mono text-xs rounded hover:opacity-90 transition disabled:opacity-50">بررسی و Preview →</button>
                  </div>
                </div>
              )}

              {aiGuideStep === 3 && schedulePreview && (
                <div className="bg-os-card border border-os-border rounded-lg p-4 space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-lg">👁️</span>
                    <h3 className="text-sm font-bold text-os-accent">پیش‌نمایش برنامهٔ هفتگی</h3>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {schedulePreview.map((day, idx) => (
                      <div key={idx} className="bg-os-bg/50 rounded-lg border border-os-border/50 p-3">
                        <div className="text-xs font-bold text-os-accent mb-2 capitalize">
                          {day.dayOfWeek} ({day.schedule.length} بلوک)
                        </div>
                        <div className="space-y-1.5">
                          {day.schedule.map((block, bidx) => (
                            <div key={bidx} className="flex items-center gap-2 text-[11px]">
                              <span className="font-mono text-os-text/40 w-20 shrink-0">{block.startTime}-{block.endTime}</span>
                              <span className="flex-1 text-os-text truncate">{block.title}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${
                                block.type === 'work' ? 'bg-blue-500/10 text-blue-400' :
                                block.type === 'learning' ? 'bg-emerald-500/10 text-emerald-400' :
                                block.type === 'fitness' ? 'bg-red-500/10 text-red-400' :
                                block.type === 'break' ? 'bg-slate-500/10 text-slate-400' :
                                block.type === 'social' ? 'bg-pink-500/10 text-pink-400' :
                                'bg-amber-500/10 text-amber-400'
                              }`}>{block.type}</span>
                              <span className="text-os-text/30 text-[9px]">{block.domain}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {scheduleImportStatus && (
                    <div className={`text-xs p-2 rounded ${scheduleImportStatus.startsWith("✅") ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"}`}>
                      {scheduleImportStatus}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <button onClick={() => setAiGuideStep(2)} className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:text-os-text transition">← ویرایش JSON</button>
                    <button onClick={handleImportSchedule} disabled={scheduleImportLoading} className="flex-1 py-2 bg-emerald-500 text-white font-mono text-xs rounded hover:opacity-90 transition disabled:opacity-50">
                      {scheduleImportLoading ? "..." : "✅ Import برنامه"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === "pva" && (
        <div id="panel-pva" role="tabpanel" className="space-y-6">
          <section className="bg-os-card border border-os-border rounded-lg p-4">
            <h3 className="text-sm font-mono text-os-accent mb-3 text-left">[ ◈ ] PLANNED VS ACTUAL (MINUTES)</h3>
            
            <div className="flex items-end justify-between gap-2 h-40 px-2 mb-4">
              {pvaData.dataArray.map((day, idx) => {
                const plannedHeight = (day.planned / pvaData.maxMins) * 100;
                const actualHeight = (day.actual / pvaData.maxMins) * 100;
                
                return (
                  <div key={idx} className="flex flex-col items-center gap-2 flex-1 h-full justify-end">
                    <div className="flex items-end gap-1 w-full justify-center h-full">
                      <div 
                        className="w-3 border border-os-accent/40 bg-os-accent/5 rounded-t transition-all"
                        style={{ height: `${plannedHeight}%` }}
                        title={`Planned: ${day.planned}m`}
                      ></div>
                      <div 
                        className="w-3 bg-os-accent rounded-t shadow-[0_0_8px_rgba(245,166,35,0.4)] transition-all"
                        style={{ height: `${actualHeight}%` }}
                        title={`Actual: ${day.actual}m`}
                      ></div>
                    </div>
                    <span className="text-[9px] font-mono text-os-text/60">
                      {day.name}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-center gap-6 mb-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 border border-os-accent/40 bg-os-accent/5 rounded"></div>
                <span className="text-[10px] font-mono text-os-text/60">Planned</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-os-accent rounded shadow-[0_0_6px_rgba(245,166,35,0.4)]"></div>
                <span className="text-[10px] font-mono text-os-text/60">Actual</span>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-os-border/50">
              <h4 className="text-xs font-mono text-os-text/60 uppercase mb-3">Domain Planned Summary</h4>
              <div className="grid grid-cols-2 gap-3">
                {pvaDomainSummary.length === 0 ? (
                  <p className="text-[10px] text-os-text/50 col-span-2">NO SCHEDULED DOMAINS</p>
                ) : (
                  pvaDomainSummary.map(([domain, data]) => (
                    <div key={domain} className="bg-os-bg/50 p-3 rounded border border-os-border/30">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-os-text">{domain}</span>
                        <span className={`w-2 h-2 rounded-full ${DOMAIN_COLORS[domain] || "bg-os-accent"}`}></span>
                      </div>
                      <div className="text-xs font-mono text-os-accent">
                        {toPersianNumber(Math.round(data.planned / 60))}h {toPersianNumber(data.planned % 60)}m
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}