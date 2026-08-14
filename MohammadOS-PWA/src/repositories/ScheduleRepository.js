// src/repositories/ScheduleRepository.js

import { db } from "../db/database";

export const ScheduleRepository = {
  async saveDaySchedule(dayOfWeek, scheduleData) {
    if (!dayOfWeek || typeof dayOfWeek !== 'string') {
      throw new Error('Invalid dayOfWeek: must be a non-empty string');
    }
    if (!Array.isArray(scheduleData)) {
      throw new Error('Invalid scheduleData: must be an array');
    }

    // ✅ Batch 48 (Reviewer 2 — P2): Validate optional block.domain
    // Allows UI to start emitting domain in the future without schema breakage
    for (const block of scheduleData) {
      if (
        block &&
        block.domain !== undefined &&
        block.domain !== null &&
        typeof block.domain !== 'string'
      ) {
        throw new Error('Invalid block.domain: must be a string when provided');
      }
    }

    const existing = await db.schedules.where("dayOfWeek").equals(dayOfWeek).first();

    const record = {
      id: existing?.id ?? crypto.randomUUID(),
      dayOfWeek,
      schedule: scheduleData,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.schedules.put(record);
    return record;
  },

  async getDaySchedule(dayOfWeek) {
    if (!dayOfWeek || typeof dayOfWeek !== 'string') {
      throw new Error('Invalid dayOfWeek: must be a non-empty string');
    }
    return await db.schedules.where("dayOfWeek").equals(dayOfWeek).first();
  },

  // ✅ FIX: Merge and deduplicate all records for a specific date
  async getScheduleForDate(dateStr, dayOfWeekFallback) {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error('Invalid dateStr');
    }
    // 1. Date-specific schedule (imported study plans)
    const dateSchedules = await db.schedules.where("dayOfWeek").equals(dateStr).toArray();
    if (dateSchedules.length > 0) {
      // Merge all schedules for this date and deduplicate
      const merged = [];
      const seen = new Set();
      
      for (const rec of dateSchedules) {
        for (const block of rec.schedule || []) {
          const sig = `${block.title}|${block.startTime}|${block.endTime}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            merged.push(block);
          }
        }
      }
      
      return { dayOfWeek: dateStr, schedule: merged };
    }
    
    // 2. Fall back to weekly template
    if (dayOfWeekFallback) {
      return await this.getDaySchedule(dayOfWeekFallback);
    }
    return null;
  },

  async getAllSchedules() {
    return await db.schedules.toArray();
  },

  async delete(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid id: must be a non-empty string');
    }
    await db.schedules.delete(id);
  },

  async getWeekSchedule(weekOffset = 0) {
    void weekOffset;
    const all = await this.getAllSchedules();
    return all;
  },
};