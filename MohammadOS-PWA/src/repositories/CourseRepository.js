// src/repositories/CourseRepository.js

import { db } from "../db/database";
import { getLocalDateKey } from "../utils/date";
import { enqueueMutation, enqueueMutations } from "../sync/SyncOutbox";

function toSafeNumber(value, fallback = 0) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export const CourseRepository = {
  /**
   * دریافت تمام دوره‌ها همراه با محاسبه درصد پیشرفت و مرتب‌سازی
   */
  async getAll(options = {}) {
    const {
      sortBy = "name",
      order = "asc",
      criticalFirst = true,
      calculateByEpisodesField = false,
    } = options;

    const courses = await db.courses.toArray();

    const coursesWithProgress = await Promise.all(
      courses.map(async (course) => {
        const progress = await this.getProgress(
          course.id,
          calculateByEpisodesField
        );

        return {
          ...course,
          progress,
        };
      })
    );

    coursesWithProgress.sort((a, b) => {
      if (criticalFirst) {
        if (a.isCritical && !b.isCritical) return -1;
        if (!a.isCritical && b.isCritical) return 1;
      }

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
  async getDashboardSummary(options = {}) {
    const { calculateByEpisodesField = true } = options;

    const courses = await db.courses.toArray();
    const sessions = await db.courseSessions.toArray();

    const totalCourses = courses.length;
    const criticalCourses = courses.filter((c) => c.isCritical).length;

    let totalProgress = 0;

    for (const course of courses) {
      totalProgress += await this.getProgress(
        course.id,
        calculateByEpisodesField
      );
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
  async getById(id, options = {}) {
    const { calculateByEpisodesField = false } = options;

    const course = await db.courses.get(id);
    if (!course) return null;

    const progress = await this.getProgress(id, calculateByEpisodesField);

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
    if (!course) return 0;

    const totalEpisodes = toSafeNumber(course.totalEpisodes);
    if (totalEpisodes <= 0) return 0;

    if (calculateByEpisodesField) {
      const currentEpisode = clampNumber(
        toSafeNumber(course.currentEpisode),
        0,
        totalEpisodes
      );

      const percentage = (currentEpisode / totalEpisodes) * 100;
      return clampNumber(Math.round(percentage), 0, 100);
    }

    const completedSessions = await db.courseSessions
      .where("courseId")
      .equals(courseId)
      .filter((session) => session.status === "completed")
      .toArray();

    const completedEpisodeNumbers = new Set(
      completedSessions
        .map((session) => toSafeNumber(session.episodeNumber))
        .filter((episodeNumber) => episodeNumber > 0)
    );

    const completedSessionsCount = completedEpisodeNumbers.size;
    const percentage = (completedSessionsCount / totalEpisodes) * 100;

    return clampNumber(Math.round(percentage), 0, 100);
  },

  /**
   * ایجاد دوره جدید (با تراکنش امن)
   */
  async create(courseData) {
    const id = crypto.randomUUID();
    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = getLocalDateKey(now);

    const totalEpisodes = Math.max(
      0,
      Math.floor(toSafeNumber(courseData.totalEpisodes))
    );

    const startEpisode = clampNumber(
      Math.floor(toSafeNumber(courseData.currentEpisode)),
      0,
      totalEpisodes
    );

    const course = {
      id,
      name: courseData.name.trim(),
      instructor: courseData.instructor?.trim() || "",
      totalEpisodes,
      currentEpisode: startEpisode,
      link: courseData.link?.trim() || "",
      isCritical: Boolean(courseData.isCritical),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await db.transaction("rw", [db.courses, db.courseSessions, db.syncOutbox], async () => {
      await db.courses.put(course);

      if (startEpisode > 0) {
        const sessions = [];

        for (let i = 1; i <= startEpisode; i++) {
          sessions.push({
            id: crypto.randomUUID(),
            courseId: id,
            episodeNumber: i,
            status: "completed",
            note: "ثبت شده در زمان ایجاد دوره",
            date: dateStr,
            createdAt: nowIso,
          });
        }

        await db.courseSessions.bulkPut(sessions);
        await enqueueMutations(sessions.map((session) => ({
          entity: "courseSessions",
          entityId: session.id,
          payload: session,
        })), db.syncOutbox);
      }
      await enqueueMutation({
        entity: "courses",
        entityId: course.id,
        payload: course,
      }, db.syncOutbox);
    });

    return id;
  },

  /**
   * به‌روزرسانی اطلاعات دوره
   */
  async update(id, updatedData) {
    const nowIso = new Date().toISOString();
    const currentData = await db.courses.get(id);

    if (!currentData) throw new Error("دوره یافت نشد.");

    const updateFields = {
      ...updatedData,
      updatedAt: nowIso,
    };

    if (Object.prototype.hasOwnProperty.call(updatedData, "totalEpisodes")) {
      updateFields.totalEpisodes = Math.max(
        0,
        Math.floor(toSafeNumber(updatedData.totalEpisodes))
      );
    }

    if (Object.prototype.hasOwnProperty.call(updatedData, "currentEpisode")) {
      const totalEpisodes = Object.prototype.hasOwnProperty.call(
        updateFields,
        "totalEpisodes"
      )
        ? updateFields.totalEpisodes
        : toSafeNumber(currentData.totalEpisodes);

      updateFields.currentEpisode = clampNumber(
        Math.floor(toSafeNumber(updatedData.currentEpisode)),
        0,
        Math.max(0, totalEpisodes)
      );
    }

    const updatedCourse = { ...currentData, ...updateFields };
    await db.transaction("rw", [db.courses, db.syncOutbox], async () => {
      await db.courses.update(id, updateFields);
      await enqueueMutation({
        entity: "courses",
        entityId: id,
        payload: updatedCourse,
        baseVersion: currentData.syncVersion,
      }, db.syncOutbox);
    });
    return true;
  },

  /**
   * ثبت تکمیل یک قسمت از دوره
   */
  async completeEpisode(courseId, episodeNumber, note = "") {
    const course = await db.courses.get(courseId);
    if (!course) throw new Error("دوره پیدا نشد.");

    const totalEpisodes = toSafeNumber(course.totalEpisodes);
    if (totalEpisodes <= 0) {
      throw new Error("تعداد کل قسمت‌های دوره معتبر نیست.");
    }

    const safeEpisodeNumber = clampNumber(
      Math.floor(toSafeNumber(episodeNumber)),
      1,
      totalEpisodes
    );

    const now = new Date();
    const nowIso = now.toISOString();
    const dateStr = getLocalDateKey(now);

    await db.transaction("rw", [db.courses, db.courseSessions, db.syncOutbox], async () => {
      const existingCompletedSession = await db.courseSessions
        .where("courseId")
        .equals(courseId)
        .filter(
          (session) =>
            session.status === "completed" &&
            toSafeNumber(session.episodeNumber) === safeEpisodeNumber
        )
        .first();

      if (!existingCompletedSession) {
        const session = {
          id: crypto.randomUUID(),
          courseId,
          episodeNumber: safeEpisodeNumber,
          status: "completed",
          note: note.trim(),
          date: dateStr,
          createdAt: nowIso,
        };
        await db.courseSessions.put(session);
        await enqueueMutation({
          entity: "courseSessions",
          entityId: session.id,
          payload: session,
        }, db.syncOutbox);
      }

      const currentEpisode = toSafeNumber(course.currentEpisode);
      const nextEpisode = clampNumber(
        Math.max(currentEpisode, safeEpisodeNumber),
        0,
        totalEpisodes
      );

      await db.courses.update(courseId, {
        currentEpisode: nextEpisode,
        updatedAt: nowIso,
      });
      await enqueueMutation({
        entity: "courses",
        entityId: courseId,
        payload: { ...course, currentEpisode: nextEpisode, updatedAt: nowIso },
        baseVersion: course.syncVersion,
      }, db.syncOutbox);
    });

    return true;
  },

  /**
   * حذف دوره و جلسات وابسته
   */
  async delete(id) {
    await db.transaction("rw", [db.courses, db.courseSessions, db.syncOutbox], async () => {
      const course = await db.courses.get(id);
      const sessions = await db.courseSessions.where("courseId").equals(id).toArray();
      await db.courses.delete(id);
      await db.courseSessions.where("courseId").equals(id).delete();
      await enqueueMutation({
        entity: "courses",
        entityId: id,
        operation: "delete",
        payload: { id },
        baseVersion: course?.syncVersion,
      }, db.syncOutbox);
      await enqueueMutations(sessions.map((session) => ({
        entity: "courseSessions",
        entityId: session.id,
        operation: "delete",
        payload: { id: session.id, courseId: id },
      })), db.syncOutbox);
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

    sessions.forEach((session) => {
      const date = session.date;

      if (date) {
        counts[date] = (counts[date] || 0) + 1;
      }
    });

    return Object.keys(counts).map((date) => ({
      date,
      count: counts[date],
    }));
  },
};
