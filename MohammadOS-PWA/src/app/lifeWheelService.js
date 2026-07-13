import { db } from "../db/database";

export const LIFE_WHEEL_DIMENSIONS = [
  { id: "career", label: "مسیر شغلی" },
  { id: "health", label: "سلامت" },
  { id: "learning", label: "یادگیری" },
  { id: "discipline", label: "انضباط" },
  { id: "relationships", label: "روابط" },
  { id: "recreation", label: "تفریح" },
];

const DIMENSION_IDS = LIFE_WHEEL_DIMENSIONS.map((dimension) => dimension.id);
const AUTO_EMPTY_DIMENSIONS = new Set(["relationships", "recreation"]);

function clampScore(value) {
  const numericValue = Number(value);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  return Math.min(10, Math.max(0, numericValue));
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function normalizeManualScores(rawScores = {}) {
  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const normalizedValue = clampScore(rawScores[dimensionId]);

    if (normalizedValue !== null) {
      scores[dimensionId] = normalizedValue;
    }

    return scores;
  }, {});
}

function calculateHabitDimensionScores(habits = []) {
  const grouped = new Map();

  habits.forEach((habit) => {
    const dimensionId = habit?.lifeWheelDimension;
    if (!dimensionId || !DIMENSION_IDS.includes(dimensionId)) {
      return;
    }

    const weight = Number(habit?.lifeWheelWeight ?? 1);
    const normalizedWeight =
      Number.isFinite(weight) && weight > 0 ? weight : 1;

    const current = grouped.get(dimensionId) ?? {
      totalWeight: 0,
      completedWeight: 0,
    };

    current.totalWeight += normalizedWeight;

    if (habit?.completedToday || habit?.completed === true) {
      current.completedWeight += normalizedWeight;
    }

    grouped.set(dimensionId, current);
  });

  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const totals = grouped.get(dimensionId);

    if (!totals || totals.totalWeight === 0) {
      scores[dimensionId] = null;
      return scores;
    }

    scores[dimensionId] = roundScore(
      (totals.completedWeight / totals.totalWeight) * 10
    );
    return scores;
  }, {});
}

function calculateCourseDimensionScores(courses = [], dayLogs = []) {
  const logsByCourseId = new Map();

  dayLogs.forEach((log) => {
    const courseId = log?.courseId;
    if (!courseId) {
      return;
    }

    const current = logsByCourseId.get(courseId) ?? {
      totalMinutes: 0,
      completedMinutes: 0,
    };

    const minutes = Number(log?.minutes ?? log?.duration ?? 0);
    const normalizedMinutes =
      Number.isFinite(minutes) && minutes > 0 ? minutes : 0;

    current.totalMinutes += normalizedMinutes;

    if (log?.completed === true || log?.done === true) {
      current.completedMinutes += normalizedMinutes;
    }

    logsByCourseId.set(courseId, current);
  });

  const grouped = new Map();

  courses.forEach((course) => {
    const dimensionId = course?.lifeWheelDimension;
    if (!dimensionId || !DIMENSION_IDS.includes(dimensionId)) {
      return;
    }

    const current = grouped.get(dimensionId) ?? [];
    current.push(course);
    grouped.set(dimensionId, current);
  });

  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const dimensionCourses = grouped.get(dimensionId) ?? [];

    if (dimensionCourses.length === 0) {
      scores[dimensionId] = null;
      return scores;
    }

    let totalMinutes = 0;
    let completedMinutes = 0;

    dimensionCourses.forEach((course) => {
      const logStats = logsByCourseId.get(course.id);

      if (logStats) {
        totalMinutes += logStats.totalMinutes;
        completedMinutes += logStats.completedMinutes;
      }
    });

    if (totalMinutes <= 0) {
      scores[dimensionId] = null;
      return scores;
    }

    scores[dimensionId] = roundScore((completedMinutes / totalMinutes) * 10);
    return scores;
  }, {});
}

function mergeAutoScores(habitScores, courseScores) {
  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const values = [habitScores[dimensionId], courseScores[dimensionId]].filter(
      (value) => typeof value === "number"
    );

    if (values.length === 0) {
      scores[dimensionId] = null;
      return scores;
    }

    const average =
      values.reduce((sum, value) => sum + value, 0) / values.length;

    scores[dimensionId] = roundScore(average);
    return scores;
  }, {});
}

export function calculateLifeWheelScores({
  habits = [],
  courses = [],
  dayLogs = [],
  manualScores = {},
}) {
  const normalizedManualScores = normalizeManualScores(manualScores);
  const habitScores = calculateHabitDimensionScores(habits);
  const courseScores = calculateCourseDimensionScores(courses, dayLogs);
  const autoScores = mergeAutoScores(habitScores, courseScores);

  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const auto = autoScores[dimensionId];
    const manual = normalizedManualScores[dimensionId];

    let final = null;

    if (typeof auto === "number" && typeof manual === "number") {
      final = roundScore((auto + manual) / 2);
    } else if (typeof auto === "number") {
      final = auto;
    } else if (typeof manual === "number") {
      final = manual;
    } else if (AUTO_EMPTY_DIMENSIONS.has(dimensionId)) {
      final = null;
    }

    scores[dimensionId] = {
      auto,
      manual,
      final,
    };

    return scores;
  }, {});
}

export async function getLifeWheelManualScores() {
  const settings = await db.settings.get("lifeWheelManualScores");
  return normalizeManualScores(settings?.value ?? {});
}

export async function saveLifeWheelManualScores(manualScores) {
  const normalizedScores = normalizeManualScores(manualScores);

  await db.settings.put({
    key: "lifeWheelManualScores",
    value: normalizedScores,
  });

  return normalizedScores;
}
