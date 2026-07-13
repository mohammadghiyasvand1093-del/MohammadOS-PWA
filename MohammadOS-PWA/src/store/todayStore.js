import { create } from "zustand";

export const useTodayStore = create((set) => ({
  habits: [],
  isInitialLoading: true, // فقط برای بار اول لود صفحه
  error: null,

  setInitialLoading: (val) => set({ isInitialLoading: val }),
  setError: (error) => set({ error }),
  
  setHabits: (habits) => set({ habits }),

  // آپدیت Optimistic: فوری در UI تغییر می‌کند، اما در حال سینک است
  toggleHabitOptimistic: (id) =>
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === id ? { ...h, done: !h.done, syncing: true } : h
      ),
    })),

  // وقتی دیتابیس با موفقیت ذخیره کرد
  updateHabitSuccess: (savedHabit) =>
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === savedHabit.id ? { ...savedHabit, syncing: false } : h
      ),
    })),

  // اگر ذخیره در دیتابیس خطا داد، به حالت قبل برمی‌گردیم (Rollback)
  updateHabitError: (id, originalHabit) =>
    set((state) => ({
      habits: state.habits.map((h) =>
        h.id === id ? { ...originalHabit, syncing: false, error: true } : h
      ),
    })),

  addHabit: (habit) => set((state) => ({ habits: [...state.habits, habit] })),
  removeHabit: (id) => set((state) => ({ habits: state.habits.filter((h) => h.id !== id) })),
}));