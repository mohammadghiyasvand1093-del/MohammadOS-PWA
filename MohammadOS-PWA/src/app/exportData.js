// src/app/exportData.js
import { db } from "../db/database";
// ✅ FIX 4.3: Added todayKey, toPersianDate
import { todayKey, toPersianDate } from "../utils/date";

function downloadFile(content, filename, type, addBOM = false) {
  const finalContent = addBOM
    ? new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type })
    : new Blob([content], { type });
  const url = URL.createObjectURL(finalContent);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ═══════════════════════════════════════════
// بچ ۷۲ — Data Compression (Export)
// ═══════════════════════════════════════════
async function compressGzip(text) {
  const encoder = new TextEncoder();
  const stream = new CompressionStream("gzip");
  const writer = stream.writable.getWriter();
  writer.write(encoder.encode(text));
  writer.close();
  const response = new Response(stream.readable);
  return await response.blob();
}

function getStartDate(range) {
  const today = new Date();
  if (range === "7") today.setDate(today.getDate() - 7);
  else if (range === "30") today.setDate(today.getDate() - 30);
  else if (range === "all") return new Date(0);
  return today;
}

function getDateLimitStr(range) {
  return getStartDate(range).toISOString().split("T")[0];
}

function escapeCsv(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function calculateDurationMin(startTime, endTime) {
  if (!startTime || !endTime) return "";
  try {
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return "";
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    const diff = endMin - startMin;
    return diff >= 0 ? diff : "";
  } catch {
    return "";
  }
}

export async function exportToCSV(range) {
  try {
    const dateLimitStr = getDateLimitStr(range);

    const logs =
      range === "all"
        ? await db.dayLogs.toArray()
        : await db.dayLogs.where("date").aboveOrEqual(dateLimitStr).toArray();

    const headers = [
      "تاریخ",
      "عنوان",
      "نوع",
      "شروع",
      "پایان",
      "مدت(دقیقه)",
      "انجام_شده",
      "حیاتی",
      "دامنه",
      "حال",
      "یادداشت",
    ];

    const rows = [headers.join(",")];

    logs.forEach((log) => {
      const baseRow = {
        date: toPersianDate(log.date),
        mood: log.mood ?? "",
        note: log.moodNote || log.journalNote || "",
      };

      const entries = Array.isArray(log.entries) ? log.entries : [];

      if (entries.length === 0) {
        rows.push(
          [
            escapeCsv(baseRow.date),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(""),
            escapeCsv(baseRow.mood),
            escapeCsv(baseRow.note),
          ].join(",")
        );
        return;
      }

      entries.forEach((entry) => {
        const duration = calculateDurationMin(entry.plannedStart, entry.plannedEnd);
        const row = [
          escapeCsv(baseRow.date),
          escapeCsv(entry.title),
          escapeCsv(entry.type || entry.category || ""),
          escapeCsv(entry.plannedStart),
          escapeCsv(entry.plannedEnd),
          escapeCsv(duration),
          escapeCsv(entry.done ? "بله" : "خیر"),
          escapeCsv(entry.isCritical ? "بله" : "خیر"),
          escapeCsv(entry.domain || ""),
          escapeCsv(baseRow.mood),
          escapeCsv(baseRow.note),
        ];
        rows.push(row.join(","));
      });
    });

    const csvContent = rows.join("\n");
    // ✅ FIX 4.1: Shamsi filename for CSV
    const filename = `MohammadOS_Logs_${range}d_${toPersianDate(todayKey())}.csv`;
    downloadFile(csvContent, filename, "text/csv;charset=utf-8;", true);
    return true;
  } catch (error) {
    console.error("Export to CSV failed:", error);
    throw error;
  }
}

export async function exportToJSON(range) {
  try {
    const dateLimitStr = getDateLimitStr(range);

    const dayLogsQuery =
      range === "all"
        ? db.dayLogs.toArray()
        : db.dayLogs.where("date").aboveOrEqual(dateLimitStr).toArray();

    const [
      habits,
      courses,
      courseSessions,
      schedules,
      gates,
      lifeWheelScores,
      fixedEvents,
      dayLogs,
    ] = await Promise.all([
      db.habits.toArray(),
      db.courses.toArray(),
      db.courseSessions.toArray(),
      db.schedules.toArray(),
      db.gates.toArray(),
      db.lifeWheelScores.toArray(),
      db.fixedEvents.toArray(),
      dayLogsQuery,
    ]);

    const data = {
      exportDate: new Date().toISOString(),
      appName: "MohammadOS-PWA",
      range: range,
      habits,
      courses,
      courseSessions,
      schedules,
      gates,
      lifeWheelScores,
      fixedEvents,
      dayLogs,
    };

    const jsonContent = JSON.stringify(data, null, 2);
    const compressed = await compressGzip(jsonContent);
    // ✅ FIX 4.2: Shamsi filename for JSON
    const filename = `MohammadOS_Backup_${range}d_${toPersianDate(todayKey())}.json.gz`;
    downloadBlob(compressed, filename);

    // Batch 8.6: Save last export timestamp to localStorage
    localStorage.setItem("mohammados_last_export", new Date().toISOString());
    
    return true;
  } catch (error) {
    console.error("Export to JSON failed:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════
// بچ ۷۴ — Auto-Backup Helpers
// ═══════════════════════════════════════════
export function getDaysSinceLastBackup() {
  const last = localStorage.getItem("mohammados_last_export");
  if (!last) return Infinity;
  const diffMs = Date.now() - new Date(last).getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function isBackupStale(thresholdDays = 7) {
  return getDaysSinceLastBackup() >= thresholdDays;
}