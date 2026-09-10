// src/repositories/ScheduleRepository.js

import { db } from "../db/database";
import {
  SCHEDULE_MODES,
  blockSignature,
  getDateRangeInclusive,
  isDateKey,
} from "../utils/schedule";
import { getDayEnFromDateKey } from "../utils/date";
import {
  getPolicyDateKey,
  getPolicyWeekKey,
  getPolicyWeekRange,
  getPolicyWeekRangeFromKey,
  parseCivilDateKey,
} from "../config/timePolicy";
import { enqueueMutation, enqueueMutations } from "../sync/SyncOutbox";

function validateBlocks(scheduleData) {
  if (!Array.isArray(scheduleData)) {
    throw new Error("Invalid scheduleData: must be an array");
  }
  for (const block of scheduleData) {
    if (block?.domain !== undefined && block?.domain !== null && typeof block.domain !== "string") {
      throw new Error("Invalid block.domain: must be a string when provided");
    }
  }
}

function normalizeMode(dayOfWeek, options = {}) {
  if (options.scheduleMode) return options.scheduleMode;
  return isDateKey(dayOfWeek) ? SCHEDULE_MODES.ONE_OFF : SCHEDULE_MODES.WEEKLY;
}

function sortBlocks(blocks) {
  return [...blocks].sort((a, b) => {
    const [ah, am] = (a.startTime || "99:99").split(":").map(Number);
    const [bh, bm] = (b.startTime || "99:99").split(":").map(Number);
    return (ah * 60 + am) - (bh * 60 + bm);
  });
}

function addCivilDays(dateKey, days) {
  const { year, month, day } = parseCivilDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export const ScheduleRepository = {
  async saveDaySchedule(dayOfWeek, scheduleData, options = {}) {
    if (!dayOfWeek || typeof dayOfWeek !== 'string') {
      throw new Error('Invalid dayOfWeek: must be a non-empty string');
    }
    validateBlocks(scheduleData);
    const scheduleMode = normalizeMode(dayOfWeek, options);
    const dateKey = options.dateKey || (isDateKey(dayOfWeek) ? dayOfWeek : null);
    const existing = await db.schedules
      .where("dayOfWeek").equals(dayOfWeek)
      .filter((record) =>
        (record.scheduleMode || normalizeMode(record.dayOfWeek)) === scheduleMode &&
        (scheduleMode === SCHEDULE_MODES.DATED
          ? record.dateKey === dateKey
          : scheduleMode !== SCHEDULE_MODES.ONE_OFF || record.dateKey === dateKey)
      )
      .first();

    const record = {
      id: existing?.id ?? crypto.randomUUID(),
      dayOfWeek,
      schedule: scheduleData,
      scheduleMode,
      dateKey,
      planId: options.planId || existing?.planId || null,
      startDate: options.startDate || existing?.startDate || null,
      endDate: options.endDate || existing?.endDate || null,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.transaction("rw", [db.schedules, db.syncOutbox], async () => {
      await db.schedules.put(record);
      await enqueueMutation({
        entity: "schedules",
        entityId: record.id,
        payload: record,
        baseVersion: record.syncVersion,
      }, db.syncOutbox);
    });
    return record;
  },

  async saveWeeklySchedule(dayOfWeek, scheduleData) {
    return this.saveDaySchedule(dayOfWeek, scheduleData, {
      scheduleMode: SCHEDULE_MODES.WEEKLY,
    });
  },

  async saveDatedPlan({ planId = crypto.randomUUID(), title = "", startDate, endDate, days }) {
    const dates = getDateRangeInclusive(startDate, endDate);
    if (!dates.length || dates.length > 62) {
      throw new Error("بازه برنامه باید بین ۱ تا ۶۲ روز باشد.");
    }
    if (!Array.isArray(days)) throw new Error("days باید آرایه باشد.");
    const byDate = new Map(days.map((day) => [day.date || day.dayOfWeek, day]));
    if (byDate.size !== dates.length || dates.some((date) => !byDate.has(date))) {
      throw new Error("برنامه تاریخ‌محور باید برای تک‌تک تاریخ‌های بازه ورودی داشته باشد.");
    }
    const now = new Date().toISOString();
    const records = dates.map((dateKey) => {
      const day = byDate.get(dateKey);
      validateBlocks(day.schedule || day.blocks || []);
      return {
        id: crypto.randomUUID(),
        scheduleMode: SCHEDULE_MODES.DATED,
        planId,
        title,
        dateKey,
        dayOfWeek: getDayEnFromDateKey(dateKey),
        startDate,
        endDate,
        schedule: day.schedule || day.blocks || [],
        createdAt: now,
        updatedAt: now,
      };
    });
    await db.transaction("rw", [db.schedules, db.syncOutbox], async () => {
      const previousRecords = await db.schedules.where("planId").equals(planId).toArray();
      await db.schedules.where("planId").equals(planId).delete();
      for (const previous of previousRecords) {
        await enqueueMutation({
          entity: "schedules",
          entityId: previous.id,
          operation: "delete",
          payload: { id: previous.id, planId },
          baseVersion: previous.syncVersion,
        }, db.syncOutbox);
      }
      await db.schedules.bulkPut(records);
      await enqueueMutations(
        records.map((record) => ({
          entity: "schedules",
          entityId: record.id,
          payload: record,
          baseVersion: record.syncVersion,
        })),
        db.syncOutbox
      );
    });
    return { planId, startDate, endDate, days: records.length, totalBlocks: records.reduce((sum, day) => sum + day.schedule.length, 0) };
  },

  async getDatedPlanRecordsInRange(startDate, endDate) {
    return db.schedules
      .where("dateKey").between(startDate, endDate, true, true)
      .filter((record) => record.scheduleMode === SCHEDULE_MODES.DATED)
      .toArray();
  },

  async deleteDatedPlan(planId) {
    if (!planId) return;
    await db.transaction("rw", [db.schedules, db.syncOutbox], async () => {
      const records = await db.schedules.where("planId").equals(planId).toArray();
      await db.schedules.where("planId").equals(planId).delete();
      for (const record of records) {
        await enqueueMutation({
          entity: "schedules",
          entityId: record.id,
          operation: "delete",
          payload: { id: record.id, planId },
          baseVersion: record.syncVersion,
        }, db.syncOutbox);
      }
    });
  },

  async getDaySchedule(dayOfWeek) {
    if (!dayOfWeek || typeof dayOfWeek !== 'string') {
      throw new Error('Invalid dayOfWeek: must be a non-empty string');
    }
    return await db.schedules.where("dayOfWeek").equals(dayOfWeek).first();
  },

  // ✅ FIX Bug #5: Merge date-specific and weekly template schedules
  async getScheduleForDate(dateStr, dayOfWeekFallback) {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error('Invalid dateStr');
    }

    const dateRecords = await db.schedules.where("dayOfWeek").equals(dateStr).toArray();
    const datedRecords = await db.schedules.where("dateKey").equals(dateStr)
      .filter((record) => record.scheduleMode === SCHEDULE_MODES.DATED)
      .toArray();
    const explicit = [...dateRecords, ...datedRecords].filter((record, index, list) =>
      list.findIndex((item) => item.id === record.id) === index
    );
    const dated = explicit.filter((record) => record.scheduleMode === SCHEDULE_MODES.DATED);
    const oneOff = explicit.filter((record) =>
      (record.scheduleMode || (isDateKey(record.dayOfWeek) ? SCHEDULE_MODES.ONE_OFF : null)) === SCHEDULE_MODES.ONE_OFF
    );
    const weekly = dayOfWeekFallback
      ? await db.schedules.where("dayOfWeek").equals(dayOfWeekFallback)
        .filter((record) => (record.scheduleMode || SCHEDULE_MODES.WEEKLY) === SCHEDULE_MODES.WEEKLY)
        .first()
      : null;
    const sourceRecords = dated.length ? [...dated, ...oneOff] : [...(weekly ? [weekly] : []), ...oneOff];
    if (!sourceRecords.length) return null;
    const merged = [];
    const seen = new Set();
    for (const record of sourceRecords) {
      for (const block of record.schedule || []) {
        const signature = blockSignature(block);
        if (!seen.has(signature)) {
          seen.add(signature);
          merged.push(block);
        }
      }
    }
    return {
      dayOfWeek: dateStr,
      dateKey: dateStr,
      schedule: sortBlocks(merged),
      source: dated.length ? SCHEDULE_MODES.DATED : (oneOff.length ? (weekly ? "weekly_with_event" : SCHEDULE_MODES.ONE_OFF) : SCHEDULE_MODES.WEEKLY),
      isExplicit: dated.length > 0 || oneOff.length > 0,
      planId: dated[0]?.planId || null,
    };
  },

  async getAllSchedules() {
    return await db.schedules.toArray();
  },

  async delete(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid id: must be a non-empty string');
    }
    await db.transaction("rw", [db.schedules, db.syncOutbox], async () => {
      const existing = await db.schedules.get(id);
      await db.schedules.delete(id);
      await enqueueMutation({
        entity: "schedules",
        entityId: id,
        operation: "delete",
        payload: { id },
        baseVersion: existing?.syncVersion,
      }, db.syncOutbox);
    });
  },

  async getWeekSchedule(weekOffset = 0) {
    const todayDateKey = getPolicyDateKey(new Date());
    const currentWeekRange = getPolicyWeekRange(todayDateKey);
    const targetDateKey = addCivilDays(
      currentWeekRange.startDateKey,
      weekOffset * 7
    );
    const targetWeekKey = getPolicyWeekKey(targetDateKey);
    const targetWeekRange = getPolicyWeekRangeFromKey(targetWeekKey);

    return Promise.all(Array.from({ length: 7 }, (_, index) => {
      const dateKey = addCivilDays(targetWeekRange.startDateKey, index);
      return this.getScheduleForDate(dateKey, getDayEnFromDateKey(dateKey));
    }));
  },
};
