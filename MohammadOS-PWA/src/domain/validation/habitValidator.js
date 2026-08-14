// src/domain/validation/habitValidator.js

export function validateHabit(habit) {
  const errors = [];

  if (!habit) {
    errors.push("Habit is required.");
  }

  const name = habit?.name?.trim();

  if (!name) {
    errors.push("Habit name is required.");
  }

  if (name && name.length < 2) {
    errors.push("Habit name must be at least 2 characters.");
  }

  if (name && name.length > 50) {
    errors.push("Habit name must be less than 50 characters.");
  }

  // اعتبارسنجی Recurrence (جایگزین dayOfWeek)
  if (!habit.recurrence || typeof habit.recurrence !== 'object') {
    errors.push('Invalid recurrence: must be an object');
  } else {
    if (!['daily', 'weekly'].includes(habit.recurrence.type)) {
      errors.push('Invalid recurrence.type: must be "daily" or "weekly"');
    }
    if (habit.recurrence.type === 'weekly') {
      if (!Array.isArray(habit.recurrence.days) || habit.recurrence.days.length === 0) {
        errors.push('Weekly habits require at least one day');
      } else {
        const validDays = habit.recurrence.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
        if (!validDays) {
          errors.push('Invalid days selected for weekly habit');
        }
      }
    }
  }

  // ✅ Batch 48 (Reviewer 2 - P1): Domain validation aligned with VALID_DOMAINS
  const VALID_DOMAINS = ["learning", "fitness", "discipline", "work", "rest", "social", "general"];
  if (habit.domain !== undefined && habit.domain !== null) {
    if (!VALID_DOMAINS.includes(habit.domain)) {
      errors.push(`Invalid domain: must be one of ${VALID_DOMAINS.join(", ")}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}