// src/app/lifeWheelService.js
import { db } from "../db/database";
import { getPersianWeekRange } from "../utils/date";

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
const DOMAIN_TO_DIMENSION = Object.freeze({
  learning: "learning",
  fitness: "health",
  discipline: "discipline",
  work: "career",
  rest: "recreation",
  social: "relationships",
});

function normalizeSelfScore(value) {
  if (value === null || value === undefined) {
    return { valid: true, value: null };
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return { valid: true, value: null };
    }
    value = trimmed;
  }
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || Number.isNaN(numericValue)) {
    return { valid: false, value: null };
  }
  return { valid: true, value: Math.min(10, Math.max(0, numericValue)) };
}

function clampScore(value) {
  const normalized = normalizeSelfScore(value);
  return normalized.value;
}

function roundScore(value) {
  return Math.round(value * 10) / 10;
}

function normalizeManualScores(rawScores = {}) {
  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const normalizedValue = clampScore(rawScores[dimensionId]);
    if (normalizedValue !== null) {
      scores[dimensionId] = normalizedValue;
    } else {
      scores[dimensionId] = null;
    }
    return scores;
  }, {});
}

function calculateHabitDimensionScores(dayLogs = []) {
  if (!Array.isArray(dayLogs)) dayLogs = [];
  const grouped = new Map();

  dayLogs.forEach((log) => {
    const entries = Array.isArray(log.entries) ? log.entries : [];
    entries.forEach((entry) => {
      if (entry?.category !== "habit") return;

      const dimensionId = DOMAIN_TO_DIMENSION[entry?.domain];
      if (!dimensionId) return;

      const weight = entry.isCritical ? 2 : 1;
      const current = grouped.get(dimensionId) ?? {
        totalWeight: 0,
        doneWeight: 0,
      };

      current.totalWeight += weight;

      if (entry.done === true) {
        current.doneWeight += weight;
      }

      grouped.set(dimensionId, current);
    });
  });

  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const totals = grouped.get(dimensionId);

    if (!totals || totals.totalWeight === 0) {
      scores[dimensionId] = null;
      return scores;
    }

    scores[dimensionId] = roundScore(
      (totals.doneWeight / totals.totalWeight) * 10
    );
    return scores;
  }, {});
}

function mergeAutoScores(habitScores) {
  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    scores[dimensionId] = habitScores[dimensionId] ?? null;
    return scores;
  }, {});
}

export function calculateLifeWheelScores({
  habits = [],
  courses = [],
  dayLogs = [],
  manualScores = {},
} = {}) {
  void habits;
  void courses;

  if (!Array.isArray(dayLogs)) dayLogs = [];

  const normalizedManualScores = normalizeManualScores(manualScores);
  const habitScores = calculateHabitDimensionScores(dayLogs);
  const autoScores = mergeAutoScores(habitScores);

  return DIMENSION_IDS.reduce((scores, dimensionId) => {
    const auto = autoScores[dimensionId];
    const manual = normalizedManualScores[dimensionId];

    let final = null;

    if (typeof auto === "number" && typeof manual === "number") {
      final = roundScore(auto * 0.6 + manual * 0.4);
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

/**
 * دریافت مقادیر امتیازدهی دستی مربوط به یک دوره زمانی مشخص
 * @param {string} periodKey کلید دوره زمانی مثل 2026-W29
 */
export async function getLifeWheelManualScores(periodKey) {
  if (!periodKey) return {};
  try {
    const record = await db.lifeWheelScores.get(periodKey);
    return record?.scores || {};
  } catch (error) {
    console.error("Error reading life wheel scores from Dexie:", error);
    return {};
  }
}

/**
 * ذخیره واقعی امتیازهای دستی چرخ زندگی در دیتابیس به همراه ایندکس‌های کامل
 * @param {string} periodKey کلید دوره زمانی مثل 2026-W29
 * @param {object} manualScores آبجکت امتیازهای ابعاد
 */
export async function saveLifeWheelManualScores(periodKey, manualScores = {}) {
  if (!periodKey) {
    throw new Error("Missing periodKey for saving life wheel scores.");
  }

  const normalized = normalizeManualScores(manualScores);
  const rangeInfo = getPersianWeekRange(periodKey);

  const documentToPut = {
    id: periodKey,
    periodKey,
    scores: normalized,
    startDate: rangeInfo.startDate,
    endDate: rangeInfo.endDate,
    year: rangeInfo.year,
    month: rangeInfo.month,
    week: rangeInfo.week,
    updatedAt: new Date().toISOString(),
  };

  try {
    await db.lifeWheelScores.put(documentToPut);
    return normalized;
  } catch (error) {
    console.error("Error persisting life wheel scores to Dexie:", error);
    throw error;
  }
}
