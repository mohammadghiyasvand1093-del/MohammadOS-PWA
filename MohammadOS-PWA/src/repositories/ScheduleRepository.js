import { db } from "../db/database";

export const ScheduleRepository = {
  // ذخیره یا جایگزینی برنامه یک روز خاص
  async saveDaySchedule(dayOfWeek, scheduleData) {
    const existing = await db.schedules.where("dayOfWeek").equals(dayOfWeek).first();

    const record = {
      id: existing?.id ?? crypto.randomUUID(),
      dayOfWeek,
      schedule: scheduleData,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await db.schedules.put(record);
    return record;
  },

  // گرفتن برنامه یک روز خاص
  async getDaySchedule(dayOfWeek) {
    return await db.schedules.where("dayOfWeek").equals(dayOfWeek).first();
  },

  // گرفتن همه برنامه‌های هفته
  async getAllSchedules() {
    return await db.schedules.toArray();
  },
};
