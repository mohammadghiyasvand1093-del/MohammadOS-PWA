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
  if (value instanceof Date) return getLocalDateKey(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    return getLocalDateKey(trimmed);
  }
  return getLocalDateKey(value);
}

export function parseDateKeyLocal(dateKey) {
  const normalized = normalizeToDateKey(dateKey);
  if (!normalized) return new Date();
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
    dayOfWeek: d.getDay()
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
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"
  ][new Date().getDay()];
}
