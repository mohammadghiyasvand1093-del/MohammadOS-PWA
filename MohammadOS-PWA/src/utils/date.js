// src/utils/date.js

export function getLocalDateKey(input = new Date()) {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return null;

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}-${m}-${day}`;
}

export function normalizeToDateKey(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return getLocalDateKey(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }

    return getLocalDateKey(trimmed);
  }

  return getLocalDateKey(value);
}

export function parseDateKeyLocal(dateKey) {
  const normalized = normalizeToDateKey(dateKey);

  if (!normalized) {
    return new Date();
  }

  const [y, m, d] = normalized.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Returns the Gregorian week-of-month (1–5) based on day number.
 *
 * ⚠️  NOT suitable for Persian-calendar logic.
 * "Week of month" has no standard definition in the Persian calendar
 * because each Shamsi month starts on a different Gregorian weekday.
 *
 * Kept only for backward compatibility — no active caller in the
 * codebase depends on this as of v2.0.
 *
 * For Persian week identification use getPersianWeekKey() instead.
 */
export function getWeekOfMonth(date) {
  return Math.ceil(date.getDate() / 7);
}

/**
 * Extracts hierarchy fields from a date string for DB indexing.
 *
 * Only returns `year` and `month` (Gregorian) because:
 *   • database.js exclusively indexes by year & month
 *   • `week` was removed — "week of month" is ambiguous between
 *     Gregorian and Persian calendars and no caller reads it
 *   • `dayOfWeek` was removed — it stored the JS index (0=Sun)
 *     which contradicts the Persian index (0=Sat) used everywhere
 *     else in the system (TodayPage, SchedulePage, aggregationService)
 *
 * If you need the Persian day-of-week index, call getDayOfWeekFromDateKey().
 * If you need a week identifier, call getPersianWeekKey().
 */
export function getHierarchyFields(dateStr) {
  const d = parseDateKeyLocal(dateStr);

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
  };
}

export function getDayOfWeekFromDateKey(dateKey) {
  const d = parseDateKeyLocal(dateKey);
  if (!d) return null;
  // ✅ FIX Bug #4: Return Persian-calendar day index (Saturday=0 … Friday=6)
  // so it matches the daysOfWeek UI in TodayPage (id 0=شنبه, id 6=جمعه).
  const jsDay = d.getDay(); // 0=Sun, 6=Sat
  return (jsDay + 1) % 7;   // 0=Sat, 1=Sun, … 6=Fri
}

export function todayKey() {
  return getLocalDateKey(new Date());
}

export function getTodayEn() {
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][new Date().getDay()];
}

export function getISOWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);

  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ✅ FIX Bug #3: Persian-calendar week (Saturday-based)
// Aligns with SchedulePage, PlannerPage, and aggregationService.
export function getPersianWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const jsDay = d.getDay(); // 0=Sun … 6=Sat
  const daysSinceSat = (jsDay + 1) % 7;

  const saturday = new Date(d);
  saturday.setDate(d.getDate() - daysSinceSat);

  const jan1 = new Date(saturday.getFullYear(), 0, 1);
  const jan1Day = jan1.getDay();
  const daysFromJan1ToFirstSat = (6 - jan1Day + 7) % 7;
  const firstSaturday = new Date(saturday.getFullYear(), 0, 1 + daysFromJan1ToFirstSat);

  let weekNo;
  if (saturday < firstSaturday) {
    // Belongs to last week of previous year
    const prevFirstSat = new Date(saturday.getFullYear() - 1, 0, 1);
    const prevJan1Day = prevFirstSat.getDay();
    const prevDaysFromJan1ToFirstSat = (6 - prevJan1Day + 7) % 7;
    const prevYearFirstSat = new Date(saturday.getFullYear() - 1, 0, 1 + prevDaysFromJan1ToFirstSat);
    const diffDays = Math.floor((saturday - prevYearFirstSat) / 86400000);
    weekNo = Math.floor(diffDays / 7) + 1;
    return `${saturday.getFullYear() - 1}-W${String(weekNo).padStart(2, "0")}`;
  }

  const diffDays = Math.floor((saturday - firstSaturday) / 86400000);
  weekNo = Math.floor(diffDays / 7) + 1;

  return `${saturday.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

// ✅ FIX Bug #3: Persian-calendar week range (Saturday → Friday)
export function getPersianWeekRange(periodKey) {
  const [yearStr, weekStr] = String(periodKey || "").split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);

  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    const fallbackDate = new Date();
    const fallbackKey = getPersianWeekKey(fallbackDate);
    return getPersianWeekRange(fallbackKey);
  }

  // Find the first Saturday of the year
  const jan1 = new Date(year, 0, 1);
  const jan1Day = jan1.getDay();
  const daysFromJan1ToFirstSat = (6 - jan1Day + 7) % 7;
  const firstSaturday = new Date(year, 0, 1 + daysFromJan1ToFirstSat);

  const targetSaturday = new Date(firstSaturday);
  targetSaturday.setDate(firstSaturday.getDate() + (week - 1) * 7);

  const friday = new Date(targetSaturday);
  friday.setDate(targetSaturday.getDate() + 6);

  return {
    startDate: getLocalDateKey(targetSaturday),
    endDate: getLocalDateKey(friday),
    year: targetSaturday.getFullYear(),
    month: targetSaturday.getMonth() + 1,
    week,
  };
}

export function getISOWeekRange(periodKey) {
  const [yearStr, weekStr] = String(periodKey || "").split("-W");
  const year = Number(yearStr);
  const week = Number(weekStr);

  if (!Number.isFinite(year) || !Number.isFinite(week)) {
    const fallbackDate = new Date();
    const fallbackKey = getISOWeekKey(fallbackDate);
    return getISOWeekRange(fallbackKey);
  }

  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const week1Monday = new Date(year, 0, 4 - jan4Day + 1);

  const monday = new Date(week1Monday);
  monday.setDate(week1Monday.getDate() + (week - 1) * 7);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    startDate: getLocalDateKey(monday),
    endDate: getLocalDateKey(sunday),
    year: monday.getFullYear(),
    month: monday.getMonth() + 1,
    week,
  };
}

export function nowMs() {
  return Date.now();
}

export function getDayEnFromDateKey(dateKey) {
  const d = parseDateKeyLocal(dateKey);
  return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][d.getDay()];
}

export function toPersianDate(dateKey) {
  const d = parseDateKeyLocal(dateKey);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// Batch 19: Utility for converting English digits to Persian
// ✅ Defensive: Handles null/undefined safely to prevent runtime crashes
export function toPersianNumber(input) {
  if (input === null || input === undefined) return "";
  const persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return String(input).replace(/[0-9]/g, (d) => persianDigits[d]);
}

// ✅ Shamsi display helpers — used for UI labels, not for DB storage.
// DB always stores YYYY-MM-DD (Gregorian). These only convert for display.

/** Short Shamsi date: "۰۵/۲۸" (month/day) */
export function toPersianDateShort(dateKey) {
  if (!dateKey) return "";
  const d = parseDateKeyLocal(dateKey);
  const parts = new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const month = parts.find(p => p.type === "month")?.value || "";
  const day = parts.find(p => p.type === "day")?.value || "";
  return `${month}/${day}`;
}

/** Shamsi week range label: "۱۴۰۵/۰۵/۲۳ — ۱۴۰۵/۰۵/۲۹" */
export function toPersianWeekRangeLabel(startKey, endKey) {
  const s = startKey ? toPersianDate(startKey) : "";
  const e = endKey ? toPersianDate(endKey) : "";
  return s && e ? `${s} — ${e}` : s || e || "";
}

/** Shamsi month label: "مهر ۱۴۰۵" */
export function toPersianMonthLabel(year, month) {
  const d = new Date(year, month - 1, 15);
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    year: "numeric",
    month: "long",
  }).format(d);
}
