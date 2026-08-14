import { HabitRepository } from "../repositories/HabitRepository";
import { executeAction } from "../utils/actionExecutor";
import { EVENT_TYPES } from "../domain/events/eventTypes";

export async function deleteHabit(id) {
  return executeAction({
    actionName: "Delete Habit",
    source: "DeleteHabitUseCase",

    execute: async () => {
      await HabitRepository.delete(id);
      return id;
    },

    eventMetadata: {
      type: EVENT_TYPES.HABIT_DELETED,
      aggregate: "Habit",
      aggregateId: id,
      payload: {},
    },
  });
}