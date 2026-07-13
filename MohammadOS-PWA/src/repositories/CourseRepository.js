// src/repositories/CourseRepository.js

import { db } from "../db/database";
import { getLocalDateKey } from "../utils/date";

export const CourseRepository = {
  /**
   * دریافت تمام دوره‌ها همراه با محاسبه درصد پیشرفت و مرتب‌سازی
   */
  async getAll(options = {}) {
    const { sortBy = "name", order = "asc", criticalFirst = true } = options;

    const courses = await db.courses.toArray();

    const coursesWithProgress = await Promise.all(
      courses.map(async (course) => {
        const progress = await this.getProgress(course.id);
        return {
          ...course,
          progress,
        };
      })
    );

    // مرتب‌سازی
    coursesWithProgress.sort((a, b) => {
      // اول: دوره‌های حیاتی
      if (criticalFirst) {
        if (a.isCritical && !b.isCritical) return -1;
        if (!a.isCritical && b.isCritical) return 1;
      }

      // دوم: بر اساس sortBy
      let valA = a[sortBy] ?? "";
      let valB = b[sortBy] ?? "";

      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return order === "asc" ? -1 : 1;
      if (valA > valB) return order === "asc" ? 1 : -1;
      return 0;
    });

    return coursesWithProgress;
  },

  /**
   * خلاصه داشبورد برای StatusPage
   */
  async getDashboardSummary() {
    const courses = await db.courses.toArray();
    const sessions = await db.courseSessions.toArray();

    const totalCourses = courses.length;
    const criticalCourses = courses.filter((c) => c.isCritical).length;

    let totalProgress = 0;
    for (const course of courses) {
      totalProgress += await this.getProgress(course.id);
    }
    const avgProgress =
      totalCourses > 0 ? Math.round(totalProgress / totalCourses) : 0;

    const completedSessions = sessions.filter(
      (s) => s.status === "completed"
    ).length;

    return {
      totalCourses,
      criticalCourses,
      avgProgress,
      completedSessions,
    };
  },

  /**
   * دریافت دوره به همراه درصد پیشرفت
   */
  async getById(id) {
    const course = await db.courses.get(id);
    if (!course) return null;

    const progress = await this.getProgress(id);
    return {
      ...course,
      progress,
    };
  },

  /**
   * محاسبه درصد پیشرفت دوره
   */
  async getProgress(courseId, calculateByEpisodesField = false) {
    const course = await db.courses.get(courseId);
    if (!course || !course.totalEpisodes || course.totalEpisodes === 0) return 0;

    if (calculateByEpisodesField) {
      const percentage =
        (course.currentEpisode / course.totalEpisodes) * 100;
      return Math.min(100, Math.max(0, Math.round(percentage)));
    }

    const completedSessionsCount = await db.courseSessions
      .where({ courseId, status: "completed" })
      .count();

    const percentage =
      (completedSessionsCount / course.totalEpisodes) * 100;
    return Math.min(100, Math.max(0, Math.round(percentage)));
  },

  /**
   * ایجاد دوره جدید (با تراکنش امن)
   */
  async create(courseData) {
    const id = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = getLocalDateKey(now);
    const startEpisode = Number(courseData.currentEpisode) || 0;

    const course = {
      id,
      name: courseData.name.trim(),
      instructor: courseData.instructor?.trim() || "",
      totalEpisodes: Number(courseData.totalEpisodes) || 0,
      currentEpisode: startEpisode,
      link: courseData.link?.trim() || "",
      isCritical: courseData.isCritical || false,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.transaction("rw", [db.courses, db.courseSessions], async () => {
      await db.courses.put(course);

      if (startEpisode > 0) {
        const sessionPromises = [];
        for (let i = 1; i <= startEpisode; i++) {
          sessionPromises.push(
            db.courseSessions.put({
              id: crypto.randomUUID(),
              courseId: id,
              episodeNumber: i,
              status: "completed",
              note: "ثبت شده در زمان ایجاد دوره (مهاجرت داده)",
              date: dateStr,
              createdAt: nowIso,
            })
          );
        }
        await Promise.all(sessionPromises);
      }
    });

    return id;
  },

  /**
   * به‌روزرسانی اطلاعات دوره
   */
  async update(id, updatedData) {
    const now = new Date().toISOString();
    const currentData = await db.courses.get(id);
    if (!currentData) throw new Error("دوره یافت نشد.");

    const updateFields = {
      ...updatedData,
      updatedAt: now,
    };

    await db.courses.update(id, updateFields);
    return true;
  },

  /**
   * ثبت تکمیل یک قسمت از دوره
   */
  async completeEpisode(courseId, episodeNumber, note = "") {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error("دوره پیدا نشد.");

    const now = new Date();
    const dateStr = getLocalDateKey(now);

    await db.transaction("rw", [db.courses, db.courseSessions], async () => {
      // ۱. ساخت رکورد جلسه
      const session = {
        id: crypto.randomUUID(),
        courseId,
        episodeNumber,
        status: "completed",
        note: note.trim(),
        date: dateStr,
        createdAt: now.toISOString(),
      };

      await db.courseSessions.put(session);

      // ۲. آپدیت currentEpisode در جدول دوره
      const nextEpisode = Math.max(course.currentEpisode, episodeNumber);

      await db.courses.update(courseId, {
        currentEpisode: nextEpisode,
        updatedAt: now.toISOString(),
      });
    });

    return true;
  },

  /**
   * حذف دوره و جلسات وابسته
   */
  async delete(id) {
    await db.transaction("rw", [db.courses, db.courseSessions], async () => {
      await db.courses.delete(id);
      await db.courseSessions.where({ courseId: id }).delete();
    });
    return true;
  },

  /**
   * آمار روزانه جلسات درسی (برای نمایش جدا از هیت‌مپ عادت‌ها)
   */
  async getDailyStudyProgress() {
    const sessions = await db.courseSessions
      .where("status")
      .equals("completed")
      .toArray();

    const counts = {};
    sessions.forEach((s) => {
      const d = s.date;
      if (d) {
        counts[d] = (counts[d] || 0) + 1;
      }
    });

    return Object.keys(counts).map((date) => ({
      date,
      count: counts[date],
    }));
  },
};
