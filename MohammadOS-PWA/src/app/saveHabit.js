// src/app/saveHabit.js

import { HabitRepository } from "../repositories/HabitRepository";
import { executeAction } from "../utils/actionExecutor";
import { EVENT_TYPES } from "../domain/events/eventTypes";
import { validateHabit } from "../domain/validation/habitValidator";
import { todayKey } from "../utils/date";

export async function saveHabit(habitData) {
  const now = new Date();
  const dateKey = todayKey();

  const newHabit = {
    id: crypto.randomUUID(),
    name: habitData.name,
    domain: habitData.domain || "general",
    recurrence: habitData.recurrence || { type: "daily" },

    done: false,

    /**
     * IMPORTANT:
     * date is a day-level field, so it must be YYYY-MM-DD.
     * createdAt is a timestamp.
     */
    date: dateKey,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),

    habitStrength: 0,

    /**
     * Null means EMA has not been processed for any day yet.
     * It will be set to dayLog.date when recomputeAndSave runs.
     */
    lastEmaDate: null,

    /**
     * Baseline before current day's EMA calculation.
     */
    strengthBeforeToday: 0
  };

  const { valid, errors } = validateHabit(newHabit);
  if (!valid) {
    throw new Error(errors.join(" | "));
  }

  return executeAction({
    actionName: "Save Habit",
    source: "SaveHabitUseCase",
    execute: async () => {
      return await HabitRepository.save(newHabit);
    },
    eventMetadata: {
      type: EVENT_TYPES.HABIT_CREATED,
      aggregate: "Habit",
      aggregateId: newHabit.id,
      payload: newHabit
    }
  });
}
