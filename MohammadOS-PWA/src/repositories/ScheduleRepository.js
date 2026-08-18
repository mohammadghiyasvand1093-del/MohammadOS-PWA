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

  // ✅ FIX Bug #5: Merge date-specific and weekly template schedules
  async getScheduleForDate(dateStr, dayOfWeekFallback) {
    if (!dateStr || typeof dateStr !== 'string') {
      throw new Error('Invalid dateStr');
    }

    const merged = [];
    const seen = new Set();

    // 1. Date-specific schedule (imported study plans, one-off events)
    const dateSchedules = await db.schedules.where("dayOfWeek").equals(dateStr).toArray();
    for (const rec of dateSchedules) {
      for (const block of rec.schedule || []) {
        const sig = `${block.title}|${block.startTime}|${block.endTime}`;
        if (!seen.has(sig)) {
          seen.add(sig);
          merged.push(block);
        }
      }
    }

    // 2. Weekly template — always merge (never discard)
    if (dayOfWeekFallback) {
      const weeklyRec = await this.getDaySchedule(dayOfWeekFallback);
      if (weeklyRec) {
        for (const block of weeklyRec.schedule || []) {
          const sig = `${block.title}|${block.startTime}|${block.endTime}`;
          if (!seen.has(sig)) {
            seen.add(sig);
            merged.push(block);
          }
        }
      }
    }

    if (merged.length === 0) return null;

    // Sort by startTime so blocks appear in chronological order
    merged.sort((a, b) => {
      const ta = (a.startTime || '99:99').split(':').map(Number);
      const tb = (b.startTime || '99:99').split(':').map(Number);
      return (ta[0] * 60 + ta[1]) - (tb[0] * 60 + tb[1]);
    });

    return { dayOfWeek: dateStr, schedule: merged };
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