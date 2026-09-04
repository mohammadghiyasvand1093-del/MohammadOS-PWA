// src/repositories/HabitRepository.js

import { db } from "../db/database";
import { enqueueMutation } from "../sync/SyncOutbox";

// ✅ Batch 48 (Reviewer 2 — P1): Domain whitelist validation
// Matches the domains produced by mapTypeToDomain in DayLogRepository
const VALID_DOMAINS = [
  "learning",
  "fitness",
  "discipline",
  "work",
  "rest",
  "social",
  "general"
];

export const HabitRepository = {
  async getAll() {
    return await db.habits.toArray();
  },

  async getById(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid id: must be a non-empty string');
    }
    return await db.habits.get(id);
  },

  async getByDate(date) {
    if (!date || typeof date !== 'string') {
      throw new Error('Invalid date: must be a non-empty string');
    }
    return await db.habits.where("date").equals(date).toArray();
  },

  async save(habit) {
    if (!habit || typeof habit !== 'object') {
      throw new Error('Invalid habit: must be an object');
    }
    if (!habit.id || typeof habit.id !== 'string') {
      throw new Error('Invalid habit: id is required and must be a string');
    }
    if (!habit.name || typeof habit.name !== 'string') {
      throw new Error('Invalid habit: name is required and must be a string');
    }
    if (!habit.recurrence || typeof habit.recurrence !== 'object') {
      throw new Error('Invalid habit: recurrence must be an object');
    }
    if (!['daily', 'weekly'].includes(habit.recurrence.type)) {
      throw new Error('Invalid habit: recurrence.type must be "daily" or "weekly"');
    }

    // ✅ Batch 48 (Reviewer 2 — P1): Validate domain against whitelist
    // Empty/undefined domain is allowed (will fall back to "general" downstream)
    if (habit.domain !== undefined && habit.domain !== null) {
      if (typeof habit.domain !== 'string') {
        throw new Error('Invalid habit: domain must be a string when provided');
      }
      if (!VALID_DOMAINS.includes(habit.domain)) {
        throw new Error(
          `Invalid domain: must be one of [${VALID_DOMAINS.join(", ")}]`
        );
      }
    }

    await db.transaction("rw", [db.habits, db.syncOutbox], async () => {
      await db.habits.put(habit);
      await enqueueMutation({
        entity: "habits",
        entityId: habit.id,
        payload: habit,
        baseVersion: habit.syncVersion,
      }, db.syncOutbox);
    });
    return habit;
  },

  async delete(id) {
    if (!id || typeof id !== 'string') {
      throw new Error('Invalid id: must be a non-empty string');
    }
    await db.transaction("rw", [db.habits, db.syncOutbox], async () => {
      const existing = await db.habits.get(id);
      await db.habits.delete(id);
      await enqueueMutation({
        entity: "habits",
        entityId: id,
        operation: "delete",
        payload: { id },
        baseVersion: existing?.syncVersion,
      }, db.syncOutbox);
    });
  },
};
