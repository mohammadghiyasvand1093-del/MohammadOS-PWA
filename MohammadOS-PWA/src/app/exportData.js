import { db } from "../db/database";

function downloadFile(content, filename, type, addBOM = false) {
  // برای فایل‌های CSV متنی یونیکد، اضافه کردن BOM به اکسل کمک می‌کند فارسی را درست نشان دهد
  const finalContent = addBOM ? new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), content], { type }) : new Blob([content], { type });
  const url = URL.createObjectURL(finalContent);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function getStartDate(range) {
  const today = new Date();
  if (range === "7") today.setDate(today.getDate() - 7);
  else if (range === "30") today.setDate(today.getDate() - 30);
  else if (range === "all") return new Date(0); // شروع تاریخ لینوکس/کامپیوتر برای دریافت همه داده‌ها
  return today;
}

export async function exportToCSV(range) {
  try {
    const startDate = getStartDate(range);
    const dateLimitStr = startDate.toISOString().split('T')[0];
    
    // واکشی گزارش‌ها بر اساس فیلتر تاریخ
    const logs = await db.dayLogs
      .where("date")
      .aboveOrEqual(dateLimitStr)
      .toArray();
    
    const headers = [
      "تاریخ",
      "عنوان فعالیت",
      "دسته‌بندی",
      "شروع برنامه‌ریزی شده",
      "پایان برنامه‌ریزی شده",
      "شروع واقعی",
      "پایان واقعی",
      "مدت زمان (دقیقه)",
      "وضعیت انجام",
      "یادداشت روزانه"
    ];
    
    const rows = [headers.join(",")];

    logs.forEach(log => {
      if (log.entries && Array.isArray(log.entries)) {
        log.entries.forEach(entry => {
          let durationMin = "";
          if (entry.actualStart && entry.actualEnd) {
            const start = new Date(`1970-01-01T${entry.actualStart}Z`);
            const end = new Date(`1970-01-01T${entry.actualEnd}Z`);
            const diffMs = end - start;
            if (diffMs >= 0) {
              durationMin = Math.round(diffMs / 60000);
            }
          }
          
          const row = [
            log.date,
            `"${(entry.title || "").replace(/"/g, '""')}"`,
            entry.category || "",
            entry.plannedStart || "",
            entry.plannedEnd || "",
            entry.actualStart || "",
            entry.actualEnd || "",
            durationMin,
            entry.done ? "انجام شده" : "تعلیق/ناتمام",
            `"${(log.journalNote || "").replace(/"/g, '""')}"`
          ];
          rows.push(row.join(","));
        });
      }
    });

    const csvContent = rows.join("\n");
    downloadFile(csvContent, `MohammadOS_Logs_${range}d.csv`, "text/csv;charset=utf-8;", true);
    return true;
  } catch (error) {
    console.error("Export to CSV failed:", error);
    throw error;
  }
}

export async function exportToJSON(range) {
  try {
    const startDate = getStartDate(range);
    const dateLimitStr = startDate.toISOString().split('T')[0];

    // پشتیبان‌گیری کامل از تمام جداول محلی سیستم
    const data = {
      exportDate: new Date().toISOString(),
      range: range,
      habits: await db.habits.toArray(),
      courses: await db.courses.toArray(),
      schedules: await db.schedules.toArray(),
      gates: await db.gates.toArray(),
      dayLogs: await db.dayLogs.where("date").aboveOrEqual(dateLimitStr).toArray()
    };

    const jsonContent = JSON.stringify(data, null, 2);
    downloadFile(jsonContent, `MohammadOS_Backup_${range}d.json`, "application/json");
    return true;
  } catch (error) {
    console.error("Export to JSON failed:", error);
    throw error;
  }
}
