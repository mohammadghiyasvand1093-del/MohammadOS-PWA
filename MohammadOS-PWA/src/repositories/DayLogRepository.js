// src/repositories/DayLogRepository.js

import { db } from "../db/database";
import { ScheduleRepository } from "./ScheduleRepository";
import {
  getDayOfWeekFromDateKey,
  normalizeToDateKey,
  getHierarchyFields
} from "../utils/date";
import {
  calculateDayLogMetrics,
  calculateHabitUpdates
} from "../domain/logCalculator";

const DEFAULT_SEED_SCHEDULE = {
  sunday: { schedule: [{ title: "Focus Work", type: "fixed", startTime: "09:00", endTime: "11:00" }] },
  monday: { schedule: [{ title: "Deep Work", type: "course", startTime: "10:00", endTime: "13:00" }] },
  tuesday: { schedule: [{ title: "Skill Building", type: "course", startTime: "10:00", endTime: "13:00" }] },
  wednesday: { schedule: [{ title: "Project Dev", type: "fixed", startTime: "09:00", endTime: "12:00" }] },
  thursday: { schedule: [{ title: "Review & Sync", type: "habit", startTime: "11:00", endTime: "12:00" }] },
  friday: { schedule: [] },
  saturday: { schedule: [{ title: "Planning Day", type: "habit", startTime: "09:00", endTime: "10:00" }] }
};

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// ✅ Batch 47: Exported for reuse in aggregationService
export function mapTypeToCategory(type) {
  switch (type) {
    case "course": return "study";
    case "habit": return "habit";
    case "fixed": return "work";
    case "break": return "rest";
    default: return "other";
  }
}

// ✅ Batch 48 (Reviewer 2 — Option A): Automatic domain mapping based on block.type
// Backward compatible: respects explicit block.domain if provided
export function mapTypeToDomain(type) {
  switch (type) {
    case "course": return "learning";
    case "habit":  return "discipline";
    case "fixed":  return "work";
    case "break":  return "rest";
    default:       return "general";
  }
}

function ensureEntriesShape(entries = []) {
  return entries.map((entry) => ({
    id: entry.id || crypto.randomUUID(),
    refId: entry.refId || null,
    title: entry.title || "",
    category: entry.category || "other",
    domain: entry.domain || "general",
    plannedStart: entry.plannedStart || null,
    plannedEnd: entry.plannedEnd || null,
    actualStart: entry.actualStart || null,
    actualEnd: entry.actualEnd || null,
    done: Boolean(entry.done),
    isCritical: Boolean(entry.isCritical || false),
    note: entry.note || ""
  }));
}

// ✅ Batch 47: Exported for reuse in aggregationService
// ✅ Batch 48 (Reviewer 2): Domain auto-mapped from block.type when block.domain missing
export function buildEntriesFromSchedule(scheduleBlocks = []) {
  return scheduleBlocks.map((block) => ({
    id: crypto.randomUUID(),
    refId: block.refId || null,
    title: block.title,
    category: mapTypeToCategory(block.type),
    domain: block.domain || mapTypeToDomain(block.type),
    plannedStart: block.startTime,
    plannedEnd: block.endTime,
    actualStart: null,
    actualEnd: null,
    done: false,
    isCritical: Boolean(block.isCritical || false),
    note: ""
  }));
}

function isHabitActiveOnDate(habit, dateStr) {
  if (!habit || !habit.recurrence) return false;

  const targetDate = normalizeToDateKey(dateStr);
  const startDate = normalizeToDateKey(habit.date || habit.createdAt);

  if (startDate && startDate > targetDate) {
    return false;
  }

  const dayOfWeek = getDayOfWeekFromDateKey(targetDate);

  if (habit.recurrence.type === "daily") {
    return dayOfWeek !== 6; // ✅ FIX Bug #4 regression: Friday = 6 in Persian index
  }

  if (habit.recurrence.type === "weekly") {
    return (habit.recurrence.days || []).includes(dayOfWeek);
  }

  return false;
}

function buildHabitEntry(habit) {
  return {
    id: crypto.randomUUID(),
    refId: habit.id,
    title: habit.name,
    category: "habit",
    domain: habit.domain || "discipline",
    plannedStart: null,
    plannedEnd: null,
    actualStart: null,
    actualEnd: null,
    done: false,
    isCritical: Boolean(habit.isCritical || false),
    note: ""
  };
}

async function buildEntriesFromHabits(dateStr) {
  const allHabits = await db.habits.toArray();
  const todaysHabits = allHabits.filter((habit) => isHabitActiveOnDate(habit, dateStr));
  return todaysHabits.map(buildHabitEntry);
}

async function syncHabitEntriesIntoDayLog(dayLog) {
  if (!dayLog) return null;

  const dateStr = normalizeToDateKey(dayLog.date);
  const entries = ensureEntriesShape(dayLog.entries || []);

  const existingHabitRefIds = new Set(
    entries
      .filter((entry) => entry.category === "habit" && entry.refId)
      .map((entry) => entry.refId)
  );

  const allHabits = await db.habits.toArray();

  const missingHabitEntries = allHabits
    .filter((habit) => isHabitActiveOnDate(habit, dateStr))
    .filter((habit) => !existingHabitRefIds.has(habit.id))
    .map(buildHabitEntry);

  if (missingHabitEntries.length === 0) {
    return { ...dayLog, date: dateStr, entries };
  }

  const updated = {
    ...dayLog,
    date: dateStr,
    entries: [...entries, ...missingHabitEntries],
    updatedAt: new Date().toISOString()
  };

  await db.dayLogs.put(updated);
  return updated;
}

async function lazyMigrateDayLog(dayLog) {
  if (!dayLog) return null;

  const dateKey = normalizeToDateKey(dayLog.date);
  const hierarchyMissing = dayLog.year == null || dayLog.month == null;
  const entries = Array.isArray(dayLog.entries) ? dayLog.entries : [];
  const refShapeMissing = entries.some((entry) => !("refId" in entry));

  if (dayLog.date !== dateKey || hierarchyMissing || refShapeMissing || !dayLog.status) {
    const now = new Date().toISOString();
    const hierarchy = getHierarchyFields(dateKey);

    const migrated = {
      ...dayLog,
      date: dateKey,
      ...hierarchy,
      entries: ensureEntriesShape(entries),
      status: dayLog.status || "active",
      updatedAt: now
    };

    if (dayLog.date !== dateKey) {
      await db.dayLogs.delete(dayLog.date);
    }
    await db.dayLogs.put(migrated);

    return migrated;
  }

  return { ...dayLog, date: dateKey, entries: ensureEntriesShape(entries) };
}

export const DayLogRepository = {
  async getOrCreateByDate(dateStr, dayOfWeekInput) {
    const dateKey = normalizeToDateKey(dateStr);

    return db.transaction("rw", db.dayLogs, db.habits, db.schedules, async () => {
      let dayLog = await db.dayLogs.get(dateKey);

      if (dayLog) {
        dayLog = await lazyMigrateDayLog(dayLog);
        dayLog = await syncHabitEntriesIntoDayLog(dayLog);
        return dayLog;
      }

      const hierarchy = getHierarchyFields(dateKey);
      const now = new Date().toISOString();

      let dayKey;

      if (typeof dayOfWeekInput === "number") {
        dayKey = DAY_NAMES[dayOfWeekInput];
      } else if (dayOfWeekInput) {
        dayKey = String(dayOfWeekInput).toLowerCase();
      } else {
        dayKey = DAY_NAMES[hierarchy.dayOfWeek];
      }

      let schedule = await ScheduleRepository.getScheduleForDate(dateKey, dayKey);

      if (!schedule || !schedule.schedule) {
        const fallbackData = DEFAULT_SEED_SCHEDULE[dayKey];
        if (fallbackData) {
          schedule = { schedule: fallbackData.schedule };
        }
      }

      const scheduleEntries = schedule ? buildEntriesFromSchedule(schedule.schedule) : [];
      const habitEntries = await buildEntriesFromHabits(dateKey);

      dayLog = {
        date: dateKey,
        entries: [...scheduleEntries, ...habitEntries],
        journalNote: "",
        slipNote: "",
        mood: null,
        moodNote: "",
        fullDay: false,
        fullDayScore: 0,
        status: "active",
        ...hierarchy,
        createdAt: now,
        updatedAt: now
      };

      await db.dayLogs.put(dayLog);
      return dayLog;
    });
  },

  async recomputeAndSave(dayLog) {
    if (!dayLog) return null;

    const dateKey = normalizeToDateKey(dayLog.date);
    const hierarchy = getHierarchyFields(dateKey);
    const now = new Date().toISOString();

    const normalizedDayLog = {
      ...dayLog,
      date: dateKey,
      entries: ensureEntriesShape(dayLog.entries || []),
      status: dayLog.status || "active",
      ...hierarchy
    };

    const { fullDay, fullDayScore } = calculateDayLogMetrics(normalizedDayLog.entries);

    const finalDayLog = {
      ...normalizedDayLog,
      fullDay,
      fullDayScore,
      updatedAt: now
    };

    let savedDayLog = finalDayLog;

    await db.transaction("rw", db.dayLogs, db.habits, async () => {
      await db.dayLogs.put(finalDayLog);

      const hasHabitEntries = finalDayLog.entries.some(
        (entry) => entry.category === "habit" && entry.refId
      );

      if (!hasHabitEntries) {
        savedDayLog = finalDayLog;
        return;
      }

      const allHabits = await db.habits.toArray();
      const habitUpdates = calculateHabitUpdates(finalDayLog, allHabits);

      for (const update of habitUpdates) {
        await db.habits.update(update.id, update);
      }

      savedDayLog = finalDayLog;
    });

    return savedDayLog;
  },

  async freezeDay(dateStr) {
    const dateKey = normalizeToDateKey(dateStr);
    return db.transaction("rw", db.dayLogs, async () => {
      let dayLog = await db.dayLogs.get(dateKey);
      if (!dayLog) return false;

      dayLog = await lazyMigrateDayLog(dayLog);

      const monthFrozenCount = await db.dayLogs
        .where({ year: dayLog.year, month: dayLog.month, status: "frozen" })
        .count();

      if (monthFrozenCount >= 2) return false;

      dayLog.status = "frozen";
      dayLog.fullDay = false;
      dayLog.fullDayScore = 0;
      dayLog.updatedAt = new Date().toISOString();

      await db.dayLogs.put(dayLog);
      return true;
    });
  },

  async unfreezeDay(dateStr) {
    const dateKey = normalizeToDateKey(dateStr);
    return db.transaction("rw", db.dayLogs, async () => {
      let dayLog = await db.dayLogs.get(dateKey);
      if (!dayLog) return false;

      dayLog = await lazyMigrateDayLog(dayLog);
      dayLog.status = "active";
      dayLog.updatedAt = new Date().toISOString();

      const { fullDay, fullDayScore } = calculateDayLogMetrics(dayLog.entries);
      dayLog.fullDay = fullDay;
      dayLog.fullDayScore = fullDayScore;

      await db.dayLogs.put(dayLog);
      return true;
    });
  },

  async getMonthLogs(year, month) {
    return db.dayLogs.where({ year, month }).toArray();
  },

  async getByDate(dateStr) {
    const dateKey = normalizeToDateKey(dateStr);
    const log = await db.dayLogs.get(dateKey);
    if (!log) return null;
    return {
      ...log,
      date: dateKey,
      entries: ensureEntriesShape(log.entries || [])
    };
  }
};