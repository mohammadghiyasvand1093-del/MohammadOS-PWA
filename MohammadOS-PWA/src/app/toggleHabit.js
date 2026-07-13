import { HabitRepository } from "../repositories/HabitRepository";
import { executeAction } from "../utils/actionExecutor";
import { EVENT_TYPES } from "../domain/events/eventTypes";

export async function toggleHabit(habit) {
  if (!habit.id) {
    throw new Error("Cannot toggle a habit without an id.");
  }

  const updatedHabit = {
    ...habit,
    done: !habit.done,
  };

  return executeAction({
    actionName: "Toggle Habit",
    source: "ToggleHabitUseCase",
    execute: async () => {
      return await HabitRepository.save(updatedHabit);
    },
    eventMetadata: {
      type: EVENT_TYPES.HABIT_UPDATED,
      aggregate: "Habit",
      aggregateId: updatedHabit.id,
      payload: updatedHabit,
    },
  });
}