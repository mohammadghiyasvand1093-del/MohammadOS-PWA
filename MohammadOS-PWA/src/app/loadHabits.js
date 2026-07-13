import { HabitRepository } from "../repositories/HabitRepository";
import { useTodayStore } from "../store/todayStore";

export async function loadHabits() {
  const store = useTodayStore.getState();
  
  try {
    store.setInitialLoading(true);
    const habits = await HabitRepository.getAll();
    store.setHabits(habits);
    store.setError(null);
  } catch (error) {
    store.setError("Failed to load habits.");
    console.error(error);
  } finally {
    store.setInitialLoading(false);
  }
}