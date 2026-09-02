import { HabitRepository } from "../repositories/HabitRepository";
import { db } from "../db/database";

const BASELINE_STRENGTH = 0.5;

export async function recalibrateAllHabits() {
  return db.transaction("rw", [db.habits, db.syncOutbox], async () => {
    const habits = await HabitRepository.getAll();
    let count = 0;

    for (const habit of habits) {
      await HabitRepository.save({
        ...habit,
        habitStrength: BASELINE_STRENGTH,
        lastEmaDate: null,
        strengthBeforeToday: null,
        updatedAt: new Date().toISOString(),
      });
      count++;
    }

    return { count, baseline: BASELINE_STRENGTH };
  });
}
