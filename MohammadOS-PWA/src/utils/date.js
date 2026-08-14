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

export function getWeekOfMonth(date) {
  return Math.ceil(date.getDate() / 7);
}

export function getHierarchyFields(dateStr) {
  const d = parseDateKeyLocal(dateStr);

  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    week: getWeekOfMonth(d),
    dayOfWeek: d.getDay(),
  };
}

export function getDayOfWeekFromDateKey(dateKey) {
  const d = parseDateKeyLocal(dateKey);
  return d ? d.getDay() : null;
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