import { ScheduleRepository } from "../repositories/ScheduleRepository";

// تبدیل روز هفته به فرمت استاندارد ICS (SU, MO, TU, ...)
const dayMapToICS = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA"
};

// تبدیل فرمت زمان HH:mm به فرمت ICS (THHmmSS)
function formatTimeToICS(timeStr) {
  return timeStr.replace(":", "") + "00";
}

// ساخت رشته فایل ICS
function buildIcsContent(allSchedules) {
  let icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MohammadOS//Personal Operating System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  // یافتن تاریخ یکشنبه جاری برای شروع رویدادها
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0=Sunday
  const sundayDate = new Date(now);
  sundayDate.setDate(now.getDate() - dayOfWeek);
  const startDateStr = sundayDate.toISOString().split('T')[0].replace(/-/g, "");

  allSchedules.forEach(daySchedule => {
    if (!daySchedule || !daySchedule.schedule) return;
    
    const dayCode = dayMapToICS[daySchedule.dayOfWeek];
    
    daySchedule.schedule.forEach(block => {
      const uid = `${daySchedule.dayOfWeek}-${block.startTime}-${block.title}`.replace(/\s/g, "");
      const dtStart = `DTSTART;TZID=Asia/Tehran:${startDateStr}T${formatTimeToICS(block.startTime)}`;
      const dtEnd = `DTEND;TZID=Asia/Tehran:${startDateStr}T${formatTimeToICS(block.endTime)}`;
      
      icsLines.push(
        "BEGIN:VEVENT",
        `UID:${uid}@mohammados.local`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split('.')[0]}Z`,
        dtStart,
        dtEnd,
        `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`, // تکرار هفتگی
        `SUMMARY:${block.title}`,
        `CATEGORIES:${block.type.toUpperCase()}`,
        "END:VEVENT"
      );
    });
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}

export async function exportScheduleToIcs() {
  try {
    const allSchedules = await ScheduleRepository.getAllSchedules();
    
    if (!allSchedules || allSchedules.length === 0) {
      alert("برنامه‌ای برای خروجی دادن وجود ندارد.");
      return;
    }

    const icsContent = buildIcsContent(allSchedules);
    const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "MohammadOS_Weekly_Schedule.ics";
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to export ICS:", error);
    alert("خطا در ساخت فایل تقویم.");
  }
}