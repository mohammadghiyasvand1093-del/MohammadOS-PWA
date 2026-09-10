export const DEFAULT_TIME_ZONE = "Asia/Tehran";
export const DEFAULT_LOCALE = "fa-IR";

export const WEEK_START_DAY = "Saturday";
export const WEEK_END_DAY = "Friday";

const CIVIL_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const POLICY_WEEK_KEY_PATTERN = /^(\d{4})-W(\d{2})$/;
const UTC_INSTANT_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/;

function getDateFormatter(timeZone) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    throw new RangeError(`Invalid IANA timezone: ${timeZone}`);
  }
}

function parseInstant(instant) {
  if (instant instanceof Date) {
    if (Number.isNaN(instant.getTime())) {
      throw new RangeError("Invalid Instant.");
    }
    return new Date(instant.getTime());
  }

  if (typeof instant !== "string" || !UTC_INSTANT_PATTERN.test(instant)) {
    throw new TypeError(
      "Instant must be a UTC ISO-8601 string ending in Z or a valid Date."
    );
  }

  const match = instant.match(UTC_INSTANT_PATTERN);
  const date = new Date(instant);

  if (Number.isNaN(date.getTime())) {
    throw new RangeError("Invalid Instant.");
  }

  const [, year, month, day, hour, minute, second] = match;
  const matchesUtcFields =
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() + 1 === Number(month) &&
    date.getUTCDate() === Number(day) &&
    date.getUTCHours() === Number(hour) &&
    date.getUTCMinutes() === Number(minute) &&
    date.getUTCSeconds() === Number(second);

  if (!matchesUtcFields) {
    throw new RangeError("Invalid Instant calendar value.");
  }

  return date;
}

function formatCivilDate(formatter, instant) {
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function formatCivilDateParts(year, month, day) {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function civilDateToUtcDate(civilDate) {
  const date = new Date(
    Date.UTC(civilDate.year, civilDate.month - 1, civilDate.day)
  );

  if (
    date.getUTCFullYear() !== civilDate.year ||
    date.getUTCMonth() + 1 !== civilDate.month ||
    date.getUTCDate() !== civilDate.day
  ) {
    throw new RangeError("Invalid Civil Date calendar value.");
  }

  return date;
}

function getFirstSaturdayOfYear(year) {
  const januaryFirst = new Date(Date.UTC(year, 0, 1));
  const daysToSaturday = (6 - januaryFirst.getUTCDay() + 7) % 7;
  januaryFirst.setUTCDate(januaryFirst.getUTCDate() + daysToSaturday);
  return januaryFirst;
}

function getWeekNumberFromSaturday(firstSaturday, saturday) {
  let weekNumber = 1;
  const cursor = new Date(firstSaturday);

  while (cursor < saturday) {
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    weekNumber += 1;
  }

  return weekNumber;
}

function getPolicyWeekStartDateFromKey(periodKey) {
  const match = String(periodKey || "").match(POLICY_WEEK_KEY_PATTERN);

  if (!match) {
    throw new TypeError("Week key must use the YYYY-Wnn format.");
  }

  const [, yearString, weekString] = match;
  const year = Number(yearString);
  const week = Number(weekString);

  if (week < 1 || week > 53) {
    throw new RangeError("Week number must be between 01 and 53.");
  }

  const saturday = getFirstSaturdayOfYear(year);
  saturday.setUTCDate(saturday.getUTCDate() + (week - 1) * 7);
  return saturday;
}

function formatPolicyWeekRange(saturday) {
  const friday = new Date(saturday);
  friday.setUTCDate(friday.getUTCDate() + 6);

  return {
    startDateKey: formatCivilDateParts(
      saturday.getUTCFullYear(),
      saturday.getUTCMonth() + 1,
      saturday.getUTCDate()
    ),
    endDateKey: formatCivilDateParts(
      friday.getUTCFullYear(),
      friday.getUTCMonth() + 1,
      friday.getUTCDate()
    ),
  };
}

function getPolicyWeekStartDate(civilDateKey) {
  const civilDate = parseCivilDateKey(civilDateKey);
  const saturday = civilDateToUtcDate(civilDate);
  const daysSinceSaturday = (saturday.getUTCDay() + 1) % 7;

  saturday.setUTCDate(saturday.getUTCDate() - daysSinceSaturday);
  return saturday;
}

/**
 * Converts a UTC Instant to the canonical Civil Date for an account timezone.
 * This helper never reads the machine timezone.
 */
export function getPolicyDateKey(
  instant = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  const date = parseInstant(instant);
  return formatCivilDate(getDateFormatter(timeZone), date);
}

/**
 * Returns the policy Civil Date for an injected Instant or the current Instant.
 */
export function getPolicyTodayKey(
  instant = new Date(),
  timeZone = DEFAULT_TIME_ZONE
) {
  return getPolicyDateKey(instant, timeZone);
}

/**
 * Parses a Civil Date without constructing a local or UTC Instant for callers.
 */
export function parseCivilDateKey(dateKey) {
  if (typeof dateKey !== "string") {
    throw new TypeError("Civil Date must be a YYYY-MM-DD string.");
  }

  const match = dateKey.match(CIVIL_DATE_PATTERN);
  if (!match) {
    throw new TypeError("Civil Date must use the YYYY-MM-DD format.");
  }

  const [, year, month, day] = match;
  const civilDate = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };

  civilDateToUtcDate(civilDate);
  return civilDate;
}

/**
 * Returns the Saturday-to-Friday policy week containing a Civil Date.
 */
export function getPolicyWeekRange(civilDateKey) {
  return formatPolicyWeekRange(getPolicyWeekStartDate(civilDateKey));
}

/**
 * Returns the Saturday-to-Friday range identified by an existing YYYY-Wnn key.
 */
export function getPolicyWeekRangeFromKey(periodKey) {
  return formatPolicyWeekRange(getPolicyWeekStartDateFromKey(periodKey));
}

/**
 * Uses the existing YYYY-Wnn convention with Saturday as the week anchor.
 */
export function getPolicyWeekKey(civilDateKey) {
  const saturday = getPolicyWeekStartDate(civilDateKey);
  const year = saturday.getUTCFullYear();
  const firstSaturday = getFirstSaturdayOfYear(year);

  if (saturday < firstSaturday) {
    const previousFirstSaturday = getFirstSaturdayOfYear(year - 1);
    const previousWeekNumber = getWeekNumberFromSaturday(
      previousFirstSaturday,
      saturday
    );
    return `${year - 1}-W${String(previousWeekNumber).padStart(2, "0")}`;
  }

  const weekNumber = getWeekNumberFromSaturday(firstSaturday, saturday);
  return `${year}-W${String(weekNumber).padStart(2, "0")}`;
}
