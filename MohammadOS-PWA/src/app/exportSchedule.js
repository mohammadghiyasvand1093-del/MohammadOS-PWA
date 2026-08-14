// src/app/exportSchedule.js
import { ScheduleRepository } from "../repositories/ScheduleRepository";

const dayMapToICS = {
  sunday: "SU",
  monday: "MO",
  tuesday: "TU",
  wednesday: "WE",
  thursday: "TH",
  friday: "FR",
  saturday: "SA"
};

function formatTimeToICS(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return "000000";
  return timeStr.replace(/:/g, "") + "00";
}

// RFC 5545 TEXT value escaping
function escapeIcsText(text) {
  if (!text) return "";
  return String(text)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

function buildIcsContent(allSchedules) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const sundayDate = new Date(now);
  sundayDate.setDate(now.getDate() - dayOfWeek);
  const startDateStr = sundayDate
    .toISOString()
    .split("T")[0]
    .replace(/-/g, "");

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MohammadOS//Personal Operating System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  allSchedules.forEach((daySchedule) => {
    if (!daySchedule || !Array.isArray(daySchedule.schedule)) return;

    const dayCode = dayMapToICS[daySchedule.dayOfWeek];
    if (!dayCode) return;

    daySchedule.schedule.forEach((block) => {
      if (!block || !block.startTime || !block.endTime) return;

      // ✅ FIX: Removed unnecessary escape character before hyphen
      const uidBase = `${daySchedule.dayOfWeek}-${block.startTime}-${block.title || "event"}`
        .replace(/[^a-zA-Z0-9-]/g, "");
      const uid = `${uidBase}@mohammados.local`;
      const dtStart = `DTSTART;TZID=Asia/Tehran:${startDateStr}T${formatTimeToICS(block.startTime)}`;
      const dtEnd = `DTEND;TZID=Asia/Tehran:${startDateStr}T${formatTimeToICS(block.endTime)}`;

      icsLines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        dtStart,
        dtEnd,
        `RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`,
        `SUMMARY:${escapeIcsText(block.title)}`,
        `CATEGORIES:${escapeIcsText((block.type || "general").toUpperCase())}`,
        "END:VEVENT"
      );
    });
  });

  icsLines.push("END:VCALENDAR");
  return icsLines.join("\r\n");
}

export async function exportScheduleToIcs() {
  const allSchedules = await ScheduleRepository.getAllSchedules();

  if (!allSchedules || allSchedules.length === 0) {
    throw new Error("NO_SCHEDULE_DATA");
  }

  const icsContent = buildIcsContent(allSchedules);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  let a = null;

  try {
    a = document.createElement("a");
    a.href = url;
    a.download = "MohammadOS_Weekly_Schedule.ics";
    document.body.appendChild(a);
    a.click();
  } finally {
    if (a && a.parentNode) document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}