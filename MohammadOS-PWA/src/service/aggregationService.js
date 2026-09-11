// src/service/aggregationService.js
/**
 * Aggregation Service — Single Source of Truth for all aggregate data.
 */

import { db } from "../db/database";
import { DayLogRepository, buildEntriesFromSchedule } from "../repositories/DayLogRepository";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { TimerRepository } from "../repositories/TimerRepository";
import {
  nowMs,
  toPersianDateShort,
  toPersianWeekRangeLabel
} from "../utils/date";
import {
  getPolicyDateKey,
  getPolicyTodayKey
} from "../config/timePolicy";

const DOMAINS = [
  { key: "learning", label: "یادگیری" },
  { key: "fitness", label: "تناسب‌اندام" },
  { key: "discipline", label: "انضباط" },
  { key: "work", label: "کار" },
  { key: "rest", label: "استراحت" },
  { key: "social", label: "اجتماعی" },
];

const GRACE_MONTHLY_LIMIT = 2;

/* ============================================================
 * Internal Helpers
 * ============================================================ */

// D1.9: civil-date identity comes from the Account Timezone (Time Policy),
// never from the device timezone. Calendar arithmetic below runs on UTC
// midnight of the policy Civil Date so results are device-TZ invariant.

function getPolicyTodayParts() {
  const todayKey = getPolicyTodayKey();
  const [year, month] = todayKey.split("-").map(Number);
  return { todayKey, year, month };
}

function civilDateAddDays(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d));
  utcDate.setUTCDate(utcDate.getUTCDate() + days);
  return utcDate.toISOString().slice(0, 10);
}

function civilDateWeekday(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// D1.10-B: weekday comes from the Civil Date itself (UTC calendar), never
// from a device-local Date parse. The guard preserves the legacy contract of
// returning false (never throwing) for missing or non-canonical inputs.
function isFriday(dateStr) {
  if (typeof dateStr !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  return civilDateWeekday(dateStr) === 5;
}

function computeStreak(allLogs, todayKey) {
  const logMap = new Map(allLogs.map((l) => [l.date, l]));
  const todayLog = logMap.get(todayKey);

  let streak = 0;
  // D1.9: cursor is UTC midnight of the policy Civil Date instead of the
  // device-local "now"; traversal logic is unchanged.
  const [cy, cm, cd] = todayKey.split("-").map(Number);
  let cursor = new Date(Date.UTC(cy, cm - 1, cd));

  if (todayLog && todayLog.fullDay) {
    // include today
  } else if (!todayLog || todayLog.status === "frozen") {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } else {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  while (true) {
    const dk = cursor.toISOString().slice(0, 10);

    if (cursor.getUTCDay() === 5) {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }

    const log = logMap.get(dk);
    if (!log) break;
    if (log.status === "frozen") {
      cursor.setUTCDate(cursor.getUTCDate() - 1);
      continue;
    }
    if (log.fullDay) {
      streak++;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

function computeMonthRate(monthLogs, todayKey) {
  const activeMonthLogs = monthLogs.filter(
    (l) => l.status !== "frozen" && l.date <= todayKey && !isFriday(l.date)
  );
  if (activeMonthLogs.length === 0) return 0;
  const fullDays = activeMonthLogs.filter((l) => l.fullDay).length;
  return Math.round((fullDays / activeMonthLogs.length) * 100);
}

function computeAvgMood(logs) {
  const moodLogs = logs.filter((l) => l.mood != null && l.status !== "frozen");
  if (moodLogs.length === 0) return "-";
  return (moodLogs.reduce((s, l) => s + l.mood, 0) / moodLogs.length).toFixed(1);
}

function computeGraceUsed(monthLogs, todayKey) {
  return monthLogs.filter(
    (l) => l.status === "frozen" && l.date <= todayKey
  ).length;
}

function computeConsistency(allLogs, todayKey) {
  const activeAllTimeLogs = allLogs.filter(
    (l) => l.status !== "frozen" && l.date <= todayKey && !isFriday(l.date)
  );
  if (activeAllTimeLogs.length === 0) return 0;
  const fullDays = activeAllTimeLogs.filter((l) => l.fullDay).length;
  return Math.round((fullDays / activeAllTimeLogs.length) * 100);
}

function getWeekRange(referenceDate = new Date(nowMs())) {
  // D1.9: the reference Instant is projected onto the Account Timezone civil
  // date first; Saturday..Friday boundaries are then pure Civil Date math.
  const referenceKey = getPolicyDateKey(referenceDate);
  const daysSinceSat = (civilDateWeekday(referenceKey) + 1) % 7;

  const startDateStr = civilDateAddDays(referenceKey, -daysSinceSat);
  const endDateStr = civilDateAddDays(startDateStr, 6);

  return { startDateStr, endDateStr };
}

/* ============================================================
 * Public API
 * ============================================================ */

export const AggregationService = {
  async getTodayStats() {
    const { todayKey, year, month } = getPolicyTodayParts();

    const [dayLog, monthLogs, allLogs, timer] = await Promise.all([
      DayLogRepository.getByDate(todayKey),
      DayLogRepository.getMonthLogs(year, month),
      db.dayLogs.where("date").belowOrEqual(todayKey).toArray(),
      TimerRepository.getActive(),
    ]);

    const graceUsed = computeGraceUsed(monthLogs, todayKey);
    const streak = computeStreak(allLogs, todayKey);

    let elapsedMs = 0;
    if (timer) {
      const start = timer.startTime || 0;
      const accumulated = timer.accumulatedTime || 0;
      elapsedMs = timer.isRunning && start ? accumulated + (nowMs() - start) : accumulated;
    }

    return {
      dayLog,
      mood: dayLog?.mood ?? null,
      fullDayScore: dayLog?.fullDayScore ?? 0,
      graceUsed,
      graceTotal: GRACE_MONTHLY_LIMIT,
      streak,
      timer,
      elapsedMs,
    };
  },

  async getVitals() {
    const { todayKey, year, month } = getPolicyTodayParts();

    const [monthLogs, allLogs] = await Promise.all([
      DayLogRepository.getMonthLogs(year, month),
      db.dayLogs.where("date").belowOrEqual(todayKey).toArray(),
    ]);

    const activeMonthLogs = monthLogs.filter(
      (l) => l.status !== "frozen" && l.date <= todayKey
    );

    return {
      streak: computeStreak(allLogs, todayKey),
      monthRate: computeMonthRate(monthLogs, todayKey),
      avgMood: computeAvgMood(activeMonthLogs),
      graceUsed: computeGraceUsed(monthLogs, todayKey),
      graceTotal: GRACE_MONTHLY_LIMIT,
      consistency: computeConsistency(allLogs, todayKey),
    };
  },

  async getMonthStats(year, month) {
    const todayKey = getPolicyTodayKey();
    const logs = await DayLogRepository.getMonthLogs(year, month);
    const visibleLogs = logs.filter((log) => log.date <= todayKey);
    const activeLogs = visibleLogs.filter((log) => log.status !== "frozen");
    const rateLogs = activeLogs.filter((log) => !isFriday(log.date));
    const fullDays = rateLogs.filter((log) => log.fullDay).length;
    const moodLogs = activeLogs.filter((log) => log.mood != null);

    return {
      totalDays: rateLogs.length,
      fullDays,
      frozenDays: visibleLogs.filter((log) => log.status === "frozen").length,
      monthRate: rateLogs.length ? Math.round((fullDays / rateLogs.length) * 100) : 0,
      avgMood: moodLogs.length
        ? (moodLogs.reduce((sum, log) => sum + Number(log.mood), 0) / moodLogs.length).toFixed(1)
        : "-",
    };
  },

  async getWeeklyStats(referenceDate) {
    const { startDateStr, endDateStr } = getWeekRange(referenceDate);

    const weeklyDayLogs = await db.dayLogs
      .where("date")
      .between(startDateStr, endDateStr, true, true)
      .toArray();

    const todayKey = getPolicyTodayKey();
    const validMoodLogs = weeklyDayLogs
      .filter((l) => l.date <= todayKey && l.mood != null)
      .sort((a, b) => a.date.localeCompare(b.date));

    // ✅ FIX 2.1: تبدیل لیبل میلادی به شمسی کوتاه
    const moodTrend = validMoodLogs.map((l) => ({
      date: l.date,
      mood: l.mood,
      label: toPersianDateShort(l.date),
    }));

    let bestDay = null;
    let worstDay = null;
    if (validMoodLogs.length > 0) {
      const sorted = [...validMoodLogs].sort((a, b) => a.mood - b.mood);
      worstDay = sorted[0];
      bestDay = sorted[sorted.length - 1];
    }

    return {
      weeklyDayLogs,
      moodTrend,
      bestDay: bestDay ? { date: bestDay.date, mood: bestDay.mood } : null,
      worstDay: worstDay ? { date: worstDay.date, mood: worstDay.mood } : null,
    };
  },

  async getHeatmapData(days = 90) {
    // D1.9: window anchored on the policy Civil Date; iteration logic unchanged.
    const todayKey = getPolicyTodayKey();
    const cutoffStr = civilDateAddDays(todayKey, -days);

    const logs = await db.dayLogs
      .where("date")
      .aboveOrEqual(cutoffStr)
      .toArray();

    const logMap = new Map(logs.map((l) => [l.date, l]));

    const result = [];
    for (let i = days - 1; i >= 0; i--) {
      const dateStr = civilDateAddDays(todayKey, -i);

      const log = logMap.get(dateStr);
      let level = 0;

      if (log) {
        if (log.status === "frozen") {
          level = 1;
        } else if (log.fullDay) {
          level = 4;
        } else if (Array.isArray(log.entries) && log.entries.some((e) => e.done)) {
          level = 2;
        } else {
          level = 1;
        }
      }

      result.push({ date: dateStr, count: level, level });
    }

    return result;
  },

  async syncScheduleToToday(dateKey, dayEn) {
    let dayLog = await DayLogRepository.getByDate(dateKey);

    if (!dayLog) {
      return await DayLogRepository.getOrCreateByDate(dateKey, dayEn);
    }

    const schedule = await ScheduleRepository.getScheduleForDate(dateKey, dayEn);
    if (!schedule || !schedule.schedule || schedule.schedule.length === 0) {
      return dayLog;
    }

    const scheduleEntries = buildEntriesFromSchedule(schedule.schedule);

    const existingSignatures = new Set(
      (dayLog.entries || []).map(
        (e) => `${e.title}|${e.plannedStart}|${e.plannedEnd}`
      )
    );

    const missingEntries = scheduleEntries.filter(
      (se) =>
        !existingSignatures.has(`${se.title}|${se.plannedStart}|${se.plannedEnd}`)
    );

    if (missingEntries.length === 0) {
      return dayLog;
    }

    const updated = {
      ...dayLog,
      entries: [...(dayLog.entries || []), ...missingEntries],
      updatedAt: new Date().toISOString(),
    };

    return await DayLogRepository.recomputeAndSave(updated);
  },

  async getTimerElapsed() {
    const timer = await TimerRepository.getActive();
    if (!timer) return 0;
    const start = timer.startTime || 0;
    const accumulated = timer.accumulatedTime || 0;
    return timer.isRunning && start ? accumulated + (nowMs() - start) : accumulated;
  },

  async getDomainTrend(weeks = 6) {
    // D1.9: week windows anchored on the policy Civil Date.
    const todayKey = getPolicyTodayKey();
    const daysSinceSat = (civilDateWeekday(todayKey) + 1) % 7;
    const result = [];

    const weekPromises = [];
    const weekBoundaries = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const startStr = civilDateAddDays(todayKey, -(daysSinceSat + w * 7));
      const nominalEndStr = civilDateAddDays(startStr, 6);
      const endStr = nominalEndStr > todayKey ? todayKey : nominalEndStr;

      weekBoundaries.push({ startStr, endStr });
      weekPromises.push(
        db.dayLogs.where("date").between(startStr, endStr, true, true).toArray()
      );
    }

    const weeklyLogsArray = await Promise.all(weekPromises);

    for (let i = 0; i < weeklyLogsArray.length; i++) {
      const weekLogs = weeklyLogsArray[i];
      const { startStr, endStr } = weekBoundaries[i];

      const activeLogs = weekLogs.filter((l) => {
        return civilDateWeekday(l.date) !== 5 && l.status !== "frozen";
      });

      const domainStats = {};
      DOMAINS.forEach((d) => (domainStats[d.key] = { done: 0, total: 0 }));

      activeLogs.forEach((log) => {
        (log.entries || []).forEach((entry) => {
          if (entry && entry.domain && domainStats[entry.domain]) {
            domainStats[entry.domain].total++;
            if (entry.done) domainStats[entry.domain].done++;
          }
        });
      });

      const domains = {};
      DOMAINS.forEach((d) => {
        const stat = domainStats[d.key];
        domains[d.key] = stat.total > 0 ? Math.round((stat.done / stat.total) * 100) : 0;
      });

      // ✅ FIX 2.2: تبدیل لیبل بازه هفته به فرمت شمسی
      result.push({
        weekStart: startStr,
        weekEnd: endStr,
        weekLabel: toPersianWeekRangeLabel(startStr, endStr),
        domains,
      });
    }

    return result;
  },

  // ✅ بچ ۷۵: Analytics Trend (Productivity & Consistency over 12 weeks)
  async getAnalyticsTrend(weeks = 12) {
    // D1.9: week windows anchored on the policy Civil Date.
    const todayKey = getPolicyTodayKey();
    const daysSinceSat = (civilDateWeekday(todayKey) + 1) % 7;
    const result = [];
    const weekPromises = [];
    const weekBoundaries = [];

    for (let w = weeks - 1; w >= 0; w--) {
      const startStr = civilDateAddDays(todayKey, -(daysSinceSat + w * 7));
      const nominalEndStr = civilDateAddDays(startStr, 6);
      const endStr = nominalEndStr > todayKey ? todayKey : nominalEndStr;

      weekBoundaries.push({ startStr, endStr });
      weekPromises.push(
        db.dayLogs.where("date").between(startStr, endStr, true, true).toArray()
      );
    }

    const weeklyLogsArray = await Promise.all(weekPromises);

    for (let i = 0; i < weeklyLogsArray.length; i++) {
      const weekLogs = weeklyLogsArray[i];
      const { startStr } = weekBoundaries[i];

      // فقط روزهای گذشته این هفته محاسبه شوند
      const activeLogs = weekLogs.filter((l) => {
        return (
          civilDateWeekday(l.date) !== 5 &&
          l.status !== "frozen" &&
          l.date <= todayKey
        );
      });

      const fullDays = activeLogs.filter((l) => l.fullDay).length;
      const activeDaysCount = activeLogs.length;
      const consistency = activeDaysCount > 0 ? Math.round((fullDays / activeDaysCount) * 100) : 0;

      // ✅ FIX 2.3: تبدیل لیبل محور نمودار به فرمت شمسی کوتاه
      result.push({
        weekLabel: toPersianDateShort(startStr),
        fullDays,
        activeDays: activeDaysCount,
        consistency,
      });
    }

    return result;
  },

  // ✅ بچ ۷۵: Mood Distribution (Last 90 days)
  async getMoodDistribution(days = 90) {
    // D1.9: window anchored on the policy Civil Date.
    const todayKey = getPolicyTodayKey();
    const cutoffStr = civilDateAddDays(todayKey, -days);

    const logs = await db.dayLogs.where("date").aboveOrEqual(cutoffStr).toArray();

    const dist = [0, 0, 0, 0, 0, 0]; // index 1 to 5 used
    logs.forEach(l => {
      if (l.date <= todayKey && l.status !== "frozen" && l.mood != null && l.mood >= 1 && l.mood <= 5) {
        dist[l.mood]++;
      }
    });

    return [
      { level: 1, count: dist[1], label: "خیلی بد", color: "#EF4444" },
      { level: 2, count: dist[2], label: "بد", color: "#F97316" },
      { level: 3, count: dist[3], label: "معمولی", color: "#EAB308" },
      { level: 4, count: dist[4], label: "خوب", color: "#84CC16" },
      { level: 5, count: dist[5], label: "عالی", color: "#22C55E" },
    ];
  }
};

export default AggregationService;
