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

  // اعتبارسنجی Recurrence
  if (!habit.recurrence) {
    errors.push("Recurrence is required.");
  } else {
    if (!["daily", "weekly"].includes(habit.recurrence.type)) {
      errors.push("Invalid recurrence type.");
    }
    if (habit.recurrence.type === "weekly") {
      if (!Array.isArray(habit.recurrence.days) || habit.recurrence.days.length === 0) {
        errors.push("Weekly habits must have at least one day selected.");
      } else {
        const validDays = habit.recurrence.days.every(d => Number.isInteger(d) && d >= 0 && d <= 6);
        if (!validDays) {
          errors.push("Invalid days selected for weekly habit.");
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}