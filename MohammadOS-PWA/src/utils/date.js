// src/utils/date.js

import {
  getPolicyDateKey,
  getPolicyTodayKey,
  getPolicyWeekKey,
  getPolicyWeekRangeFromKey,
  parseCivilDateKey,
} from "../config/timePolicy.js";

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
  const normalized = normalizeToDateKey(dateStr);
  try {
    // D1.10-D: year/month come from the Civil Date itself (Time Policy
    // validator + explicit components), never from a device-local Date.
    const { year, month } = parseCivilDateKey(normalized);
    return { year, month };
  } catch {
    // Invalid input is outside the contract; deterministic NaN replaces the
    // legacy device-clock fallback.
    return { year: NaN, month: NaN };
  }
}

// D1.10-D: deterministic weekday primitive for canonical Civil Dates.
// Reuses the Time Policy validator and the UTC calendar so the result never
// depends on the device timezone. Invalid input is outside the contract and
// yields NaN.
function civilDateToJsWeekday(dateKey) {
  if (typeof dateKey !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return NaN;
  }
  try {
    const { year, month, day } = parseCivilDateKey(dateKey);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  } catch {
    return NaN;
  }
}

export function getDayOfWeekFromDateKey(dateKey) {
  const jsDay = civilDateToJsWeekday(dateKey);
  if (Number.isNaN(jsDay)) return null;
  // ✅ FIX Bug #4: Return Persian-calendar day index (Saturday=0 … Friday=6)
  // so it matches the daysOfWeek UI in TodayPage (id 0=شنبه, id 6=جمعه).
  return (jsDay + 1) % 7;   // 0=Sat, 1=Sun, … 6=Fri
}

export function todayKey() {
  return getLocalDateKey(new Date());
}

// D1.10-E1: today's weekday is the Account-Timezone civil day, not the
// device clock. Reuses the policy projection and the deterministic weekday.
export function getTodayEn() {
  return getDayEnFromDateKey(getPolicyTodayKey());
}

// D1.10-E1: shared civil-date day arithmetic on the UTC calendar. Canonical
// input required (see parseCivilDateKey); the result never depends on the
// device timezone.
export function addCivilDays(dateKey, days) {
  const { year, month, day } = parseCivilDateKey(dateKey);
  const shifted = new Date(Date.UTC(year, month - 1, day));
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

// D1.10-E2: report month identity = policy Civil Date's month shifted by
// whole months. Pure month arithmetic — no device clock and no day-of-month
// clamp (a device setMonth anchor skips a month from e.g. Jan 31).
export function getPolicyMonthAnchor(monthOffset = 0) {
  const [year, month] = getPolicyTodayKey().split("-").map(Number);
  const totalMonths = year * 12 + (month - 1) + monthOffset;
  return { year: Math.floor(totalMonths / 12), month: (totalMonths % 12) + 1 };
}

export function getISOWeekKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const dayNum = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - dayNum);

  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function toPolicyCivilDateKey(date) {
  if (date === undefined) {
    return getPolicyTodayKey();
  }

  if (typeof date === "string") {
    parseCivilDateKey(date);
    return date;
  }

  if (date instanceof Date) {
    return getPolicyDateKey(date);
  }

  throw new TypeError("Week date must be a Date or YYYY-MM-DD Civil Date.");
}

// ✅ FIX Bug #3: Persian-calendar week (Saturday-based)
// Delegates Civil Date and week arithmetic to the centralized Time Policy.
export function getPersianWeekKey(date) {
  return getPolicyWeekKey(toPolicyCivilDateKey(date));
}

// ✅ FIX Bug #3: Persian-calendar week range (Saturday → Friday)
export function getPersianWeekRange(periodKey) {
  const normalizedPeriodKey = /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(
    String(periodKey || "")
  )
    ? periodKey
    : getPolicyWeekKey(getPolicyTodayKey());
  const { startDateKey, endDateKey } =
    getPolicyWeekRangeFromKey(normalizedPeriodKey);
  const { year, month } = parseCivilDateKey(startDateKey);
  const week = Number(normalizedPeriodKey.slice(6));

  return {
    startDate: startDateKey,
    endDate: endDateKey,
    year,
    month,
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
  const jsDay = civilDateToJsWeekday(dateKey);
  if (Number.isNaN(jsDay)) return null;
  return ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"][jsDay];
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
