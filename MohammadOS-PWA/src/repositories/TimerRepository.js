import { db } from "../db/database";

function nowMs() {
  return Date.now();
}

function isoNow() {
  return new Date().toISOString();
}

function computeElapsedMs(timer, atMs = nowMs()) {
  if (!timer) return 0;
  const base = timer.accumulatedTime || 0;
  if (!timer.isRunning) return base;
  const start = timer.startTime ?? atMs;
  return base + Math.max(0, atMs - start);
}

async function getSingleActiveTimer() {
  // چون ما invariant داریم که فقط یک رکورد نگه می‌داریم،
  // ساده‌ترین و پایدارترین راه همین است.
  const list = await db.activeTimer.toArray();
  return list[0] || null;
}

export const TimerRepository = {
  /**
   * گرفتن تایمر فعال (یا null)
   */
  async getActive() {
    return await getSingleActiveTimer();
  },

  /**
   * گرفتن تایمر فعال + زمان سپری‌شده تا این لحظه (بدون نوشتن در DB)
   */
  async getActiveWithElapsed() {
    const timer = await getSingleActiveTimer();
    if (!timer) return null;
    return {
      ...timer,
      elapsedMs: computeElapsedMs(timer)
    };
  },

  /**
   * شروع تایمر جدید برای یک entry در یک dayLog
   * - تایمر قبلی را حذف می‌کند (فقط یک تایمر همزمان)
   */
  async start(entryRefId, dayLogDate) {
    await db.activeTimer.clear();

    const t = nowMs();
    const timer = {
      id: crypto.randomUUID(),
      taskRefId: entryRefId, // اسمش taskRefId است، اما عملاً ref به entry است
      dayLogDate,
      startTime: t,
      accumulatedTime: 0,
      isRunning: true,
      createdAt: isoNow(),
      updatedAt: isoNow()
    };

    await db.activeTimer.put(timer);
    return timer;
  },

  /**
   * توقف موقت (Pause) بدون حذف رکورد
   * accumulatedTime += delta
   * startTime = null
   * isRunning = false
   */
  async pause() {
    const timer = await getSingleActiveTimer();
    if (!timer) return null;

    if (!timer.isRunning) {
      return {
        ...timer,
        elapsedMs: computeElapsedMs(timer)
      };
    }

    const total = computeElapsedMs(timer);
    const next = {
      ...timer,
      accumulatedTime: total,
      startTime: null,
      isRunning: false,
      updatedAt: isoNow()
    };

    await db.activeTimer.put(next);
    return {
      ...next,
      elapsedMs: total
    };
  },

  /**
   * ادامه دادن (Resume) تایمر paused
   */
  async resume() {
    const timer = await getSingleActiveTimer();
    if (!timer) return null;

    if (timer.isRunning) {
      return {
        ...timer,
        elapsedMs: computeElapsedMs(timer)
      };
    }

    const next = {
      ...timer,
      startTime: nowMs(),
      isRunning: true,
      updatedAt: isoNow()
    };

    await db.activeTimer.put(next);
    return {
      ...next,
      elapsedMs: computeElapsedMs(next)
    };
  },

  /**
   * Stop نهایی:
   * - زمان نهایی را محاسبه می‌کند
   * - رکورد activeTimer را حذف می‌کند
   * - خروجی برای ثبت در dayLog entry (actualStart/actualEnd یا totalMs) مناسب است
   */
  async stop() {
    const timer = await getSingleActiveTimer();
    if (!timer) return null;

    const totalMs = computeElapsedMs(timer);
    await db.activeTimer.clear();

    return {
      taskRefId: timer.taskRefId,
      dayLogDate: timer.dayLogDate,
      totalMs
    };
  },

  /**
   * ریست کامل تایمر (حذف رکورد)
   */
  async reset() {
    await db.activeTimer.clear();
    return true;
  },

  /**
   * ابزار UI: برای رندر هر ثانیه (بدون نوشتن در DB)
   * اگر تایمر نبود null برمی‌گرداند.
   */
  async tick() {
    const timer = await getSingleActiveTimer();
    if (!timer) return null;
    return {
      ...timer,
      elapsedMs: computeElapsedMs(timer)
    };
  },

  /**
   * اگر کاربر وارد یک entry جدید شد:
   * - اگر تایمر برای همان entry است چیزی تغییر نمی‌کند
   * - اگر برای entry دیگری است، تایمر قبلی stop می‌شود و تایمر جدید start می‌شود
   * خروجی: { stopped, started }
   */
  async switchTo(entryRefId, dayLogDate) {
    const current = await getSingleActiveTimer();

    if (current && current.taskRefId === entryRefId && current.dayLogDate === dayLogDate) {
      return {
        stopped: null,
        started: null,
        active: { ...current, elapsedMs: computeElapsedMs(current) }
      };
    }

    const stopped = current ? await this.stop() : null;
    const started = await this.start(entryRefId, dayLogDate);

    return { stopped, started, active: { ...started, elapsedMs: 0 } };
  }
};
