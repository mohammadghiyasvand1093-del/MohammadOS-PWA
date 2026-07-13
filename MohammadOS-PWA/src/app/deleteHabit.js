import { HabitRepository } from "../repositories/HabitRepository";
import { executeAction } from "../utils/actionExecutor";
import { EVENT_TYPES } from "../domain/events/eventTypes";
import { useTodayStore } from "../store/todayStore";

export async function deleteHabit(id) {
  return executeAction({
    actionName: "Delete Habit",
    source: "DeleteHabitUseCase",

    execute: async () => {
      await HabitRepository.delete(id);

      useTodayStore.getState().removeHabit(id);

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