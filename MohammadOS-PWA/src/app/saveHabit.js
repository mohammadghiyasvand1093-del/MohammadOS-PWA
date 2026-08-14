// src/app/saveHabit.js

import { HabitRepository } from "../repositories/HabitRepository";
import { executeAction } from "../utils/actionExecutor";
import { EVENT_TYPES } from "../domain/events/eventTypes";
import { validateHabit } from "../domain/validation/habitValidator";
import { todayKey } from "../utils/date";

export async function saveHabit(habitData) {
  const now = new Date();
  const dateKey = todayKey();

  // FIX: domain هیچ‌وقت null نمی‌شود — "general" fallback
  const domain =
    habitData.domain === "none" || !habitData.domain
      ? "general"
      : habitData.domain;

  const newHabit = {
    id: crypto.randomUUID(),
    name: habitData.name,
    domain,
    recurrence: habitData.recurrence || { type: "daily" },
    isCritical: Boolean(habitData.isCritical),
    done: false,
    date: dateKey,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    // ✅ Batch 55: Neutral EMA baseline (0.5) — consistent with recalibrateHabits.js
    habitStrength: 0.5,
    lastEmaDate: null,
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