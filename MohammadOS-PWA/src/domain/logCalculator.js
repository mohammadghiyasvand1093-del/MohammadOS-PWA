// src/domain/logCalculator.js

/**
 * LOCKED FORMULA CONSTANTS (V1 Stable)
 * EMA_ALPHA: 0.1 (Exponential Moving Average factor for habit strength)
 * FULL_DAY_THRESHOLD: 90 (Minimum rawScore required for fullDay status)
 * These values are strictly locked and must not be changed without architectural approval.
 */
const EMA_ALPHA = 0.1;
const FULL_DAY_THRESHOLD = 90;

const WEIGHTS = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0.5,
};

function roundToTwo(value) {
  return Math.round(value * 100) / 100;
}

function roundToOne(value) {
  return Math.round(value * 10) / 10;
}

export function computeEntryWeight(entry = {}) {
  if (entry.isCritical) return WEIGHTS.critical;
  if (entry.category === "study") return WEIGHTS.high;
  if (entry.category === "habit") return WEIGHTS.medium;
  return WEIGHTS.low;
}

export function calculateDayLogMetrics(entries = []) {
  let totalWeight = 0;
  let doneWeight = 0;

  for (const entry of entries) {
    const weight = computeEntryWeight(entry);
    totalWeight += weight;
    if (entry.done) doneWeight += weight;
  }

  const rawScore = totalWeight > 0 ? (doneWeight / totalWeight) * 100 : 0;
  const fullDayScore = roundToOne(rawScore);

  const criticalEntries = entries.filter((entry) => entry.isCritical);
  const allCriticalDone =
    criticalEntries.length === 0 ||
    criticalEntries.every((entry) => Boolean(entry.done));

  // Applied locked threshold
  const fullDay = allCriticalDone && rawScore >= FULL_DAY_THRESHOLD;

  return {
    totalWeight,
    doneWeight,
    score: fullDayScore,
    fullDayScore,
    allCriticalDone,
    fullDay,
  };
}

export function calculateHabitUpdates(dayLog, habits = []) {
  if (!dayLog || !Array.isArray(dayLog.entries) || !Array.isArray(habits)) {
    return [];
  }

  const dateKey = dayLog.date;
  if (!dateKey) return [];

  const habitMap = new Map();
  for (const habit of habits) {
    if (habit?.id) habitMap.set(habit.id, habit);
  }

  const latestHabitEntries = new Map();
  for (const entry of dayLog.entries) {
    if (entry?.category !== "habit" || !entry?.refId) continue;
    latestHabitEntries.set(entry.refId, entry);
  }

  const updates = [];

  for (const [habitId, entry] of latestHabitEntries.entries()) {
    const habit = habitMap.get(habitId);
    if (!habit) continue;

    const doneSignal = entry.done ? 1 : 0;
    const currentStrength =
      typeof habit.habitStrength === "number" ? habit.habitStrength : 0;
    const alreadyProcessedToday = habit.lastEmaDate === dateKey;

    const baselineStrength = alreadyProcessedToday
      ? typeof habit.strengthBeforeToday === "number"
        ? habit.strengthBeforeToday
        : currentStrength
      : currentStrength;

    // Applied locked EMA Alpha
    const newStrength = roundToTwo(
      EMA_ALPHA * doneSignal + (1 - EMA_ALPHA) * baselineStrength
    );

    updates.push({
      id: habit.id,
      habitStrength: newStrength,
      lastEmaDate: dateKey,
      strengthBeforeToday: alreadyProcessedToday
        ? baselineStrength
        : currentStrength,
      updatedAt: new Date().toISOString(),
    });
  }

  return updates;
}