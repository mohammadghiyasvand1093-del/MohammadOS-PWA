// src/db/database.js
import Dexie from "dexie";
import { getHierarchyFields } from "../utils/date";

export const ACTIVE_ACCOUNT_STORAGE_KEY = "mohammados_active_account";
const LEGACY_DATABASE_NAME = "MohammadOS";
const activeAccountId = typeof localStorage !== "undefined"
  ? localStorage.getItem(ACTIVE_ACCOUNT_STORAGE_KEY)
  : null;
const databaseName = activeAccountId
  ? `${LEGACY_DATABASE_NAME}-${activeAccountId}`
  : LEGACY_DATABASE_NAME;

export const db = new Dexie(databaseName);

function readLegacyTable(tableName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LEGACY_DATABASE_NAME);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const legacyDb = request.result;
      if (!legacyDb.objectStoreNames.contains(tableName)) {
        legacyDb.close();
        resolve([]);
        return;
      }
      const transaction = legacyDb.transaction(tableName, "readonly");
      const getRequest = transaction.objectStore(tableName).getAll();
      getRequest.onsuccess = () => {
        legacyDb.close();
        resolve(getRequest.result || []);
      };
      getRequest.onerror = () => {
        legacyDb.close();
        reject(getRequest.error);
      };
    };
  });
}

/**
 * Move the pre-auth local data into the authenticated owner's private
 * database exactly once. Guest accounts deliberately skip this migration.
 */
export async function migrateLegacyDataToUser(userId, role) {
  if (!userId || role !== "owner" || databaseName === LEGACY_DATABASE_NAME) return false;

  const marker = `mohammados_legacy_migrated_${userId}`;
  if (localStorage.getItem(marker) === "true") return false;

  try {
    await db.open();
    for (const table of db.tables) {
      const rows = await readLegacyTable(table.name);
      if (rows.length > 0) await table.bulkPut(rows);
    }
    localStorage.setItem(marker, "true");
    return true;
  } catch (error) {
    console.error("Legacy data migration failed:", error);
    throw new Error("انتقال امن اطلاعات قبلی انجام نشد. لطفاً دوباره تلاش کنید.", { cause: error });
  }
}

/**
 * اصل مهم:
 * - نسخه‌های قبلی حذف یا بازنویسی نمی‌شوند
 * - migrationها فقط افزایشی‌اند
 * - مدل canonical برای recurrence:
 *   habit.recurrence = { type: "daily" }
 *   habit.recurrence = { type: "weekly", days: [...] }
 */

/* =========================
 * v3
 * ========================= */
db.version(3).stores({
  habits: "id, date, habitId",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  events: "id, type, aggregate, aggregateId, createdAt",
  logs: "id, level, createdAt",
  sync_queue: "id, eventId, status, createdAt",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate",
});

/* =========================
 * v4
 * domain support
 * ========================= */
db.version(4)
  .stores({
    habits: "id, date, habitId, domain",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs: "date, fullDay",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("habits").toCollection().modify((habit) => {
      if (!habit.domain) habit.domain = "general";
    });
  });

/* =========================
 * v5
 * ========================= */
db.version(5).stores({
  habits: "id, date, habitId, domain",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  events: "id, type, aggregate, aggregateId, createdAt",
  logs: "id, level, createdAt",
  sync_queue: "id, eventId, status, createdAt",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate",
});

/* =========================
 * v6
 * ========================= */
db.version(6).stores({
  habits: "id, date, habitId, domain",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  events: "id, type, aggregate, aggregateId, createdAt",
  logs: "id, level, createdAt",
  sync_queue: "id, eventId, status, createdAt",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate",
});

/* =========================
 * v7 — intentionally skipped
 * No schema changes between v6 and v8.
 * Version number reserved to avoid confusion
 * in case any client already auto-bumped to v7
 * during local development. This comment block
 * is the only artifact of v7.
 * ========================= */

/* =========================
 * v8
 * recurrence as object model
 * ========================= */
db.version(8)
  .stores({
    habits: "id, date, habitId, domain",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs: "date, fullDay",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("habits").toCollection().modify((habit) => {
      if (!habit.recurrence || typeof habit.recurrence !== "object") {
        habit.recurrence = { type: "daily" };
      } else {
        if (!habit.recurrence.type) habit.recurrence.type = "daily";
        if (
          habit.recurrence.type === "weekly" &&
          !Array.isArray(habit.recurrence.days)
        ) {
          habit.recurrence.days = [];
        }
      }
    });
  });

/* =========================
 * v9
 * EMA-related fields
 * ========================= */
db.version(9)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs: "date, fullDay",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("habits").toCollection().modify((habit) => {
      if (!("lastEmaDate" in habit)) habit.lastEmaDate = null;
      if (!("strengthBeforeToday" in habit)) habit.strengthBeforeToday = 0;
    });
  });

/* =========================
 * v10
 * dayLogs hierarchy fields
 * ========================= */
db.version(10)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs: "date, fullDay, year, month, week, dayOfWeek, [year+month]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("dayLogs").toCollection().modify((d) => {
      Object.assign(d, getHierarchyFields(d.date));
    });
  });

/* =========================
 * v11
 * dayLogs status + optimized indexes
 * ========================= */
db.version(11)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("dayLogs").toCollection().modify((d) => {
      Object.assign(d, getHierarchyFields(d.date));
      if (!d.status) d.status = "active";
    });
  });

/* =========================
 * v12
 * corrective migration
 * ========================= */
db.version(12)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores: "id, periodKey, startDate, endDate",
  })
  .upgrade(async (tx) => {
    await tx.table("habits").toCollection().modify((habit) => {
      const hasObjectRecurrence =
        habit.recurrence &&
        typeof habit.recurrence === "object" &&
        !Array.isArray(habit.recurrence);

      if (!hasObjectRecurrence) {
        const flatType = habit.recurrenceType;
        const flatDays = habit.recurrenceDays;

        if (flatType === "weekly") {
          habit.recurrence = {
            type: "weekly",
            days: Array.isArray(flatDays) ? flatDays : [],
          };
        } else {
          habit.recurrence = { type: "daily" };
        }
      } else {
        if (!habit.recurrence.type) habit.recurrence.type = "daily";
        if (
          habit.recurrence.type === "weekly" &&
          !Array.isArray(habit.recurrence.days)
        ) {
          habit.recurrence.days = [];
        }
      }

      if ("recurrenceType" in habit) delete habit.recurrenceType;
      if ("recurrenceInterval" in habit) delete habit.recurrenceInterval;
      if ("recurrenceDays" in habit) delete habit.recurrenceDays;
      if ("startDate" in habit) delete habit.startDate;
      if ("endDate" in habit) delete habit.endDate;

      if (!("lastEmaDate" in habit)) habit.lastEmaDate = null;
      if (!("strengthBeforeToday" in habit)) habit.strengthBeforeToday = 0;
      if (!habit.domain) habit.domain = "general";
    });

    await tx.table("dayLogs").toCollection().modify((d) => {
      Object.assign(d, getHierarchyFields(d.date));
      if (!d.status) d.status = "active";
    });
  });

/* =========================
 * v13
 * lifeWheelScores history indexes
 * ========================= */
db.version(13)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions: "id, courseId, date, episodeNumber, status",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores:
      "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  })
  .upgrade(async (tx) => {
    await tx.table("lifeWheelScores").toCollection().modify((score) => {
      if (score.startDate) {
        const { year, month } = getHierarchyFields(score.startDate);
        score.year = year;
        score.month = month;
      }

      if (!("week" in score)) score.week = null;
    });
  });

/* =========================
 * v14
 * (settings table removed - violation of schema policy)
 * ========================= */
db.version(14).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  events: "id, type, aggregate, aggregateId, createdAt",
  logs: "id, level, createdAt",
  sync_queue: "id, eventId, status, createdAt",
  schedules: "id, dayOfWeek",
  dayLogs:
    "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title",
  drafts: "key",
  lifeWheelScores:
    "id, periodKey, startDate, endDate, year, month, week, [year+month]",
});

/* =========================
 * v15
 * courseSessions compound index
 * (settings table removed - violation of schema policy)
 * ========================= */
db.version(15).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions:
    "id, courseId, date, episodeNumber, status, [courseId+status]",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  events: "id, type, aggregate, aggregateId, createdAt",
  logs: "id, level, createdAt",
  sync_queue: "id, eventId, status, createdAt",
  schedules: "id, dayOfWeek",
  dayLogs:
    "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title",
  drafts: "key",
  lifeWheelScores:
    "id, periodKey, startDate, endDate, year, month, week, [year+month]",
});

/* =========================
 * v16
 * corrective migration for legacy life-wheel ids
 * ========================= */
db.version(16)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions:
      "id, courseId, date, episodeNumber, status, [courseId+status]",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title",
    drafts: "key",
    lifeWheelScores:
      "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  })
  .upgrade(async (tx) => {
    const scoresTable = tx.table("lifeWheelScores");
    const allRecords = await scoresTable.toArray();

    for (const record of allRecords) {
      if (
        typeof record?.id !== "string" ||
        !record.id.startsWith("life-wheel:")
      ) {
        continue;
      }

      const cleanKey = record.id.slice("life-wheel:".length);
      const existingCleanRecord = await scoresTable.get(cleanKey);

      if (existingCleanRecord) {
        await scoresTable.put({
          ...record,
          ...existingCleanRecord,
          id: cleanKey,
          periodKey: cleanKey,
          scores: {
            ...(record.scores || {}),
            ...(existingCleanRecord.scores || {}),
          },
        });
      } else {
        await scoresTable.put({
          ...record,
          id: cleanKey,
          periodKey: cleanKey,
        });
      }

      await scoresTable.delete(record.id);
    }
  });

/* =========================
 * v17
 * Roadmap constraintNote + extended gate fields
 * ========================= */
db.version(17)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions:
      "id, courseId, date, episodeNumber, status, [courseId+status]",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    events: "id, type, aggregate, aggregateId, createdAt",
    logs: "id, level, createdAt",
    sync_queue: "id, eventId, status, createdAt",
    schedules: "id, dayOfWeek",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title, order",
    drafts: "key",
    lifeWheelScores:
      "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  })
  .upgrade(async (tx) => {
    await tx.table("gates").toCollection().modify((gate) => {
      if (!("constraintNote" in gate)) gate.constraintNote = "";
      if (!("deadline" in gate)) gate.deadline = null;
      if (!("deadlineNote" in gate)) gate.deadlineNote = "";
      if (!("description" in gate)) gate.description = "";
      if (!("order" in gate)) gate.order = 0;
      if (!("dependsOn" in gate)) gate.dependsOn = [];
      if (!("progress" in gate)) gate.progress = 0;
    });
  });

/* =========================
 * v18
 * Dropping dead tables: events, logs, sync_queue
 * These tables were never used in any repository or service.
 * ========================= */
db.version(18).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions:
    "id, courseId, date, episodeNumber, status, [courseId+status]",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  schedules: "id, dayOfWeek",
  dayLogs:
    "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title, order",
  drafts: "key",
  lifeWheelScores:
    "id, periodKey, startDate, endDate, year, month, week, [year+month]",
});

/* =========================
 * v19 (Batch 58 & 61 Setup)
 * Added importHistory table to track JSON imports
 * ========================= */
db.version(19).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status, [courseId+status]",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title, order",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  // 🟢 جدول جدید برای لاگ‌های Import
  importHistory: "id, type, importedAt"
});

/* =========================
 * v20 — future sync contract
 * Keep an append-only event stream and a retryable queue available for the
 * future account/sync phase. No network sync is enabled in the personal build.
 * ========================= */
db.version(20).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status, [courseId+status]",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title, order",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  importHistory: "id, type, importedAt",
  events: "id, type, aggregate, aggregateId, createdAt",
  sync_queue: "id, eventId, status, createdAt, retryAt",
});

/* =========================
 * v21 — explicit schedule modes
 * weekly_template: repeats by weekday
 * dated_plan: one exact plan for every date in a range
 * one_off_event: one exact date, including manually-created events
 * ========================= */
db.version(21)
  .stores({
    habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
    courses: "id, name, instructor",
    courseSessions:
      "id, courseId, date, episodeNumber, status, [courseId+status]",
    fixedEvents: "id, dayOfWeek, title, startTime, endTime",
    schedules:
      "id, scheduleMode, dayOfWeek, dateKey, planId, startDate, endDate",
    dayLogs:
      "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
    activeTimer: "id, taskRefId, isRunning",
    gates: "id, title, order",
    drafts: "key",
    lifeWheelScores:
      "id, periodKey, startDate, endDate, year, month, week, [year+month]",
    importHistory: "id, type, importedAt",
    events: "id, type, aggregate, aggregateId, createdAt",
    sync_queue: "id, eventId, status, createdAt, retryAt",
  })
  .upgrade(async (tx) => {
    await tx.table("schedules").toCollection().modify((record) => {
      if (!record.scheduleMode) {
        record.scheduleMode = /^\d{4}-\d{2}-\d{2}$/.test(record.dayOfWeek)
          ? "one_off_event"
          : "weekly_template";
      }
      if (record.scheduleMode !== "weekly_template" && !record.dateKey) {
        record.dateKey = /^\d{4}-\d{2}-\d{2}$/.test(record.dayOfWeek)
          ? record.dayOfWeek
          : null;
      }
    });
  });

export default db;
