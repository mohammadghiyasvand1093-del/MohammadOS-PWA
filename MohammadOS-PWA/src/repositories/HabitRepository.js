import { db } from "../db/database";

export const HabitRepository = {
  async getAll() {
    return await db.habits.toArray();
  },

  async getByDate(date) {
    return await db.habits.where("date").equals(date).toArray();
  },

  async save(habit) {
    // دیگر باگ id نداریم. چون UseCase باید id بفرستد.
    await db.habits.put(habit);
    return habit; // همان شیء ورودی را برمی‌گردانیم
  },

  async delete(id) {
    await db.habits.delete(id);
  },
};