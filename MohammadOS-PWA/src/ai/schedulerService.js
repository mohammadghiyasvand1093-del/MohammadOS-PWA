// src/ai/schedulerService.js

const timeToMinutes = (t) => {
  if (!t) return 0;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

const minutesToTime = (mins) => {
  mins = mins % (24 * 60);
  if (mins < 0) mins += 24 * 60;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/**
 * Rule-Based Local Scheduler
 * Generates a daily schedule without external API calls.
 * 
 * @param {Object} params
 * @param {Array} params.courses - [{ name, totalEpisodes, currentEpisode }]
 * @param {Array} params.fixedEvents - [{ title, startTime, endTime, type }]
 * @returns {Promise<Array>} - [{ title, startTime, endTime, type, isCritical }]
 */
export async function generateDailySchedule({ courses, fixedEvents }) {
  const schedule = [];
  const intervals = [];

  // ۱. fixedEvents را ثابت قرار بده (isCritical = true)
  if (fixedEvents && fixedEvents.length > 0) {
    fixedEvents.forEach(ev => {
      let start = timeToMinutes(ev.startTime);
      let end = timeToMinutes(ev.endTime);
      if (end <= start) end += 24 * 60; // Handle overnight events (e.g., Sleep)
      
      schedule.push({
        title: ev.title,
        startTime: ev.startTime,
        endTime: ev.endTime,
        type: ev.type || "fixed",
        isCritical: true
      });
      
      intervals.push({ start, end });
    });
  }

  // Helper to check if a time range [s, e] is free
  const isFree = (s, e) => {
    for (let i = 0; i < intervals.length; i++) {
      const intv = intervals[i];
      if (s < intv.end && e > intv.start) return false;
    }
    return true;
  };

  // ۲. از ۰۶:۰۰ تا ۲۳:۰۰ روز را ۳۰-دقیقه‌ای slot بندی کن
  const startDay = 6 * 60; // 06:00
  const endDay = 23 * 60;  // 23:00

  // ۴. در slotهای خالی، به ترتیب courses را بچین
  if (courses && courses.length > 0) {
    let currentMin = startDay;
    let coursesScheduled = 0;

    while (currentMin <= endDay - 60 && coursesScheduled < courses.length) {
      let courseStart = -1;
      
      // Find next free 1-hour slot
      for (let t = currentMin; t <= endDay - 60; t += 15) {
        if (isFree(t, t + 60)) {
          courseStart = t;
          break;
        }
      }

      if (courseStart === -1) break; // No more free 1-hour slots

      const course = courses[coursesScheduled];
      const courseEnd = courseStart + 60; // ۱ ساعت (۰۲ slot)
      
      schedule.push({
        title: `مطالعه: ${course.name}`,
        startTime: minutesToTime(courseStart),
        endTime: minutesToTime(courseEnd),
        type: "course",
        isCritical: false
      });
      
      intervals.push({ start: courseStart, end: courseEnd });
      coursesScheduled++;

      // بین هر ۲ course یک break ۱۵ دقیقه‌ای
      if (coursesScheduled < courses.length && courseEnd + 15 <= endDay) {
        if (isFree(courseEnd, courseEnd + 15)) {
          schedule.push({
            title: "استراحت کوتاه",
            startTime: minutesToTime(courseEnd),
            endTime: minutesToTime(courseEnd + 15),
            type: "break",
            isCritical: false
          });
          intervals.push({ start: courseEnd, end: courseEnd + 15 });
          currentMin = courseEnd + 15;
        } else {
          currentMin = courseEnd + 15;
        }
      } else {
        currentMin = courseEnd;
      }
    }
  }

  // Sort schedule by start time
  schedule.sort((a, b) => {
    const aMins = timeToMinutes(a.startTime);
    const bMins = timeToMinutes(b.startTime);
    return aMins - bMins;
  });

  return schedule;
}