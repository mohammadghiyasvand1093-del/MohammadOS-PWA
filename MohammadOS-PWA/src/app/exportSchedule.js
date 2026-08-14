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

function downloadFile(filename, content) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportScheduleToIcs() {
  // فetch day by day to ensure safety
  const days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];
  const allSchedules = await Promise.all(
    days.map(d => ScheduleRepository.getDaySchedule(d).catch(() => null))
  );

  let hasEvents = false;

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MohammadOS//Personal Operating System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  // Find the Saturday of the current week to use as the base DTSTART
  const today = new Date();
  const currentDay = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const daysToSubtract = currentDay === 6 ? 0 : currentDay + 1;
  const saturdayDate = new Date(today);
  saturdayDate.setDate(today.getDate() - daysToSubtract);
  const startDateStr = saturdayDate
    .toISOString()
    .split("T")[0]
    .replace(/-/g, "");

  allSchedules.forEach((daySchedule, index) => {
    if (!daySchedule || !Array.isArray(daySchedule.schedule)) return;

    const dayOfWeek = days[index];
    const dayCode = dayMapToICS[dayOfWeek];
    if (!dayCode) return;

    daySchedule.schedule.forEach((block) => {
      if (!block || !block.startTime || !block.endTime) return;

      const uidBase = `${dayOfWeek}-${block.startTime}`.replace(/[^a-zA-Z0-9-]/g, "");
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
        `SUMMARY:${escapeIcsText(block.title || "ماموریت")}`,
        `CATEGORIES:${escapeIcsText((block.type || "general").toUpperCase())}`
      );

      if (block.note) {
        icsLines.push(`DESCRIPTION:${escapeIcsText(block.note)}`);
      }

      icsLines.push("END:VEVENT");
      hasEvents = true;
    });
  });

  icsLines.push("END:VCALENDAR");

  if (!hasEvents) {
    throw new Error("NO_SCHEDULE_DATA");
  }

  const icsContent = icsLines.join("\r\n");
  downloadFile("MohammadOS_Weekly_Schedule.ics", icsContent);
}