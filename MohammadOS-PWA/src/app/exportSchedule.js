// src/app/exportSchedule.js
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { addCivilDays, getDayEnFromDateKey, getDayOfWeekFromDateKey } from "../utils/date";
import { getPolicyTodayKey } from "../config/timePolicy";
import { getDateRangeInclusive, SCHEDULE_MODES } from "../utils/schedule";

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

export async function exportScheduleToIcs({ mode = SCHEDULE_MODES.WEEKLY, startDate, endDate } = {}) {
  const days = ["saturday", "sunday", "monday", "tuesday", "wednesday", "thursday", "friday"];

  let hasEvents = false;

  const icsLines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//MohammadOS//Personal Operating System//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH"
  ];

  // D1.10-E1: the weekly anchor is the Account-Timezone civil week
  // (Saturday → Friday) derived from the policy date, never the device clock.
  const todayKeyStr = getPolicyTodayKey();
  const daysSinceSaturday = getDayOfWeekFromDateKey(todayKeyStr); // Persian: Sat = 0
  const saturdayKey = addCivilDays(todayKeyStr, -daysSinceSaturday);
  const weeklyStart = saturdayKey;
  const weeklyRecords = mode === SCHEDULE_MODES.WEEKLY
    ? await Promise.all(days.map((day) => ScheduleRepository.getDaySchedule(day).catch(() => null)))
    : [];
  const datedRecords = mode === SCHEDULE_MODES.DATED && startDate && endDate
    ? await ScheduleRepository.getDatedPlanRecordsInRange(startDate, endDate)
    : [];
  const datedByDate = new Map(datedRecords.map((record) => [record.dateKey, record]));
  const dates = mode === SCHEDULE_MODES.DATED
    ? getDateRangeInclusive(startDate, endDate)
    : days.map((_, index) => addCivilDays(saturdayKey, index));

  dates.forEach((dateKey, index) => {
    const dayOfWeek = mode === SCHEDULE_MODES.DATED
      ? getDayEnFromDateKey(dateKey)
      : days[index];
    const daySchedule = mode === SCHEDULE_MODES.DATED
      ? datedByDate.get(dateKey)
      : weeklyRecords[index];
    if (!daySchedule || !Array.isArray(daySchedule.schedule)) return;
    const dayCode = dayMapToICS[dayOfWeek];
    daySchedule.schedule.forEach((block, blockIndex) => {
      if (!block || !block.startTime || !block.endTime) return;

      const uidBase = `${dateKey}-${block.id || blockIndex}-${block.startTime}`.replace(/[^a-zA-Z0-9-]/g, "");
      const uid = `${uidBase}@mohammados.local`;
      const icsDate = dateKey.replace(/-/g, "");
      const dtStart = `DTSTART;TZID=Asia/Tehran:${icsDate}T${formatTimeToICS(block.startTime)}`;
      const dtEnd = `DTEND;TZID=Asia/Tehran:${icsDate}T${formatTimeToICS(block.endTime)}`;

      icsLines.push(
        "BEGIN:VEVENT",
        `UID:${uid}`,
        `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
        dtStart,
        dtEnd,
        ...(mode === SCHEDULE_MODES.WEEKLY ? [`RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`] : []),
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
  downloadFile(
    mode === SCHEDULE_MODES.DATED
      ? `MohammadOS_Dated_Schedule_${startDate}_${endDate}.ics`
      : `MohammadOS_Weekly_Schedule_${weeklyStart}.ics`,
    icsContent
  );
}
