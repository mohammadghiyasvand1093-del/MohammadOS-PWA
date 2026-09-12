import { validateHabit } from "./habitValidator.js";
import { isDateKey } from "../../utils/schedule.js";

export const IMPORT_TABLES = Object.freeze([
  "dayLogs",
  "habits",
  "courses",
  "gates",
  "schedules",
  "courseSessions",
  "fixedEvents",
  "activeTimer",
  "drafts",
  "lifeWheelScores",
]);

const IMPORT_TABLE_SET = new Set(IMPORT_TABLES);
const TOP_LEVEL_METADATA = new Set([
  "app",
  "appName",
  "exportDate",
  "exportedAt",
  "range",
  "schemaVersion",
  "version",
]);

const VALID_SCHEDULE_MODES = new Set([
  "weekly_template",
  "dated_plan",
  "one_off_event",
]);
const VALID_DOMAINS = new Set([
  "learning",
  "fitness",
  "discipline",
  "work",
  "rest",
  "social",
  "general",
]);
const LIFE_WHEEL_DIMENSIONS = new Set([
  "career",
  "health",
  "learning",
  "discipline",
  "relationships",
  "recreation",
]);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function typeName(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function errorMessage({ store, record, field, reason, expected, actual }) {
  const location = store === "payload"
    ? `store=${store}`
    : `store=${store} record=${record}`;
  return [
    "Import validation failed:",
    location,
    field ? `field=${field}` : null,
    `reason=${reason}`,
    expected ? `expected=${expected}` : null,
    actual ? `actual=${actual}` : null,
  ].filter(Boolean).join(" ");
}

function requiredString(record, store, index, field, errors) {
  if (typeof record[field] !== "string" || record[field].trim() === "") {
    errors.push(errorMessage({
      store,
      record: index,
      field,
      reason: "required field missing or invalid",
      expected: "non-empty string",
      actual: typeName(record[field]),
    }));
  }
}

// D1.10-G: persisted temporal fields are canonical Civil Dates —
// isDateKey enforces both the YYYY-MM-DD shape and real calendar validity
// (2026-02-30 fails). Imported records are stored verbatim, so anything
// this validator accepts lands in the indexed date fields as-is.
function civilDateString(record, store, index, field, errors, { nullable = false } = {}) {
  const value = record[field];
  if (value === undefined || (nullable && value === null)) return;
  if (typeof value !== "string" || !isDateKey(value)) {
    errors.push(errorMessage({
      store,
      record: index,
      field,
      reason: "invalid civil date",
      expected: "YYYY-MM-DD calendar date",
      actual: typeName(value),
    }));
  }
}

function optionalValueType(value, store, index, field, expected, predicate, errors) {
  if (value !== undefined && !predicate(value)) {
    errors.push(errorMessage({
      store,
      record: index,
      field,
      reason: "invalid field type",
      expected,
      actual: typeName(value),
    }));
  }
}

function optionalType(record, store, index, field, expected, predicate, errors) {
  optionalValueType(record[field], store, index, field, expected, predicate, errors);
}

function optionalString(record, store, index, field, errors, { nullable = false } = {}) {
  optionalType(
    record,
    store,
    index,
    field,
    nullable ? "string or null" : "string",
    (value) => typeof value === "string" || (nullable && value === null),
    errors
  );
}

function optionalNumber(record, store, index, field, errors, { nullable = false } = {}) {
  optionalType(
    record,
    store,
    index,
    field,
    nullable ? "finite number or null" : "finite number",
    (value) => (typeof value === "number" && Number.isFinite(value)) || (nullable && value === null),
    errors
  );
}

function optionalBoolean(record, store, index, field, errors, { nullable = false } = {}) {
  optionalType(
    record,
    store,
    index,
    field,
    nullable ? "boolean or null" : "boolean",
    (value) => typeof value === "boolean" || (nullable && value === null),
    errors
  );
}

function optionalArray(record, store, index, field, errors) {
  optionalType(record, store, index, field, "array", Array.isArray, errors);
}

function optionalObject(record, store, index, field, errors) {
  optionalType(record, store, index, field, "object", isObject, errors);
}

function validateId(record, store, index, errors) {
  requiredString(record, store, index, "id", errors);
}

function validateHabitRecord(record, store, index) {
  const errors = [];
  if (!isObject(record)) {
    return [errorMessage({
      store,
      record: index,
      reason: "record must be an object",
      expected: "object",
      actual: typeName(record),
    })];
  }

  validateId(record, store, index, errors);
  if (typeof record.name !== "string") {
    errors.push(errorMessage({
      store,
      record: index,
      field: "name",
      reason: "required field missing or invalid",
      expected: "non-empty string",
      actual: typeName(record.name),
    }));
  }
  if (typeof record.recurrence !== "object" || record.recurrence === null || Array.isArray(record.recurrence)) {
    errors.push(errorMessage({
      store,
      record: index,
      field: "recurrence",
      reason: "required field missing or invalid",
      expected: "object",
      actual: typeName(record.recurrence),
    }));
  }

  if (errors.length === 0) {
    const habitValidation = validateHabit(record);
    errors.push(...habitValidation.errors.map((reason) => errorMessage({
      store,
      record: index,
      field: "habit",
      reason,
    })));
  }

  optionalType(record, store, index, "domain", "known domain string", (value) => typeof value === "string" && VALID_DOMAINS.has(value), errors);
  optionalBoolean(record, store, index, "isCritical", errors);
  optionalBoolean(record, store, index, "done", errors);
  civilDateString(record, store, index, "date", errors);
  optionalString(record, store, index, "createdAt", errors);
  optionalString(record, store, index, "updatedAt", errors);
  optionalNumber(record, store, index, "habitStrength", errors);
  optionalNumber(record, store, index, "strengthBeforeToday", errors);
  civilDateString(record, store, index, "lastEmaDate", errors, { nullable: true });
  return errors;
}

function validateNestedBlocks(record, store, index, field, errors) {
  if (record[field] === undefined) return;
  if (!Array.isArray(record[field])) {
    errors.push(errorMessage({
      store,
      record: index,
      field,
      reason: "invalid nested structure",
      expected: "array",
      actual: typeName(record[field]),
    }));
    return;
  }
  record[field].forEach((block, blockIndex) => {
    if (!isObject(block)) {
      errors.push(errorMessage({
        store,
        record: index,
        field: `${field}[${blockIndex}]`,
        reason: "nested record must be an object",
        expected: "object",
        actual: typeName(block),
      }));
      return;
    }
    for (const blockField of ["title", "task", "type", "domain", "startTime", "endTime", "note", "urgencyLevel"]) {
      if (block[blockField] !== undefined && typeof block[blockField] !== "string") {
        errors.push(errorMessage({
          store,
          record: index,
          field: `${field}[${blockIndex}].${blockField}`,
          reason: "invalid nested field type",
          expected: "string",
          actual: typeName(block[blockField]),
        }));
      }
    }
    if (block.isCritical !== undefined && typeof block.isCritical !== "boolean") {
      errors.push(errorMessage({
        store,
        record: index,
        field: `${field}[${blockIndex}].isCritical`,
        reason: "invalid nested field type",
        expected: "boolean",
        actual: typeName(block.isCritical),
      }));
    }
  });
}

function validateDayLogEntry(entry, store, index, entryIndex, errors) {
  if (!isObject(entry)) {
    errors.push(errorMessage({
      store,
      record: index,
      field: `entries[${entryIndex}]`,
      reason: "nested record must be an object",
      expected: "object",
      actual: typeName(entry),
    }));
    return;
  }
  for (const field of ["id", "refId", "title", "category", "domain", "plannedStart", "plannedEnd", "actualStart", "actualEnd", "note"]) {
    if (entry[field] !== undefined && typeof entry[field] !== "string" && entry[field] !== null) {
      errors.push(errorMessage({
        store,
        record: index,
        field: `entries[${entryIndex}].${field}`,
        reason: "invalid nested field type",
        expected: "string or null",
        actual: typeName(entry[field]),
      }));
    }
  }
  for (const field of ["done", "isCritical"]) {
    if (entry[field] !== undefined && typeof entry[field] !== "boolean") {
      errors.push(errorMessage({
        store,
        record: index,
        field: `entries[${entryIndex}].${field}`,
        reason: "invalid nested field type",
        expected: "boolean",
        actual: typeName(entry[field]),
      }));
    }
  }
}

function validateDayLogRecord(record, store, index) {
  const errors = [];
  if (!isObject(record)) {
    return [errorMessage({ store, record: index, reason: "record must be an object", expected: "object", actual: typeName(record) })];
  }
  if (!isDateKey(record.date)) {
    errors.push(errorMessage({ store, record: index, field: "date", reason: "required field missing or invalid", expected: "YYYY-MM-DD date", actual: typeName(record.date) }));
  }
  if (!Array.isArray(record.entries)) {
    errors.push(errorMessage({ store, record: index, field: "entries", reason: "required field missing or invalid", expected: "array", actual: typeName(record.entries) }));
  } else {
    record.entries.forEach((entry, entryIndex) => validateDayLogEntry(entry, store, index, entryIndex, errors));
  }
  for (const field of ["journalNote", "slipNote", "moodNote", "status"]) optionalString(record, store, index, field, errors, { nullable: true });
  for (const field of ["mood", "fullDayScore", "year", "month", "week", "dayOfWeek"]) optionalNumber(record, store, index, field, errors, { nullable: true });
  // D1.10-G: the year/month hierarchy feeds where({year, month}) queries
  // (monthly logs, vitals, monthly review) and lazyMigrateDayLog only
  // backfills MISSING hierarchy — a wrong number stays wrong forever and
  // silently drops the day from month queries. Absent/null stays legal
  // (lazyMigrate treats it as missing and repairs it from the Civil Date).
  if (isDateKey(record.date)) {
    const [dateYear, dateMonth] = record.date.split("-").map(Number);
    if (record.year !== undefined && record.year !== null && record.year !== dateYear) {
      errors.push(errorMessage({ store, record: index, field: "year", reason: "hierarchy does not match date", expected: String(dateYear), actual: typeName(record.year) }));
    }
    if (record.month !== undefined && record.month !== null && record.month !== dateMonth) {
      errors.push(errorMessage({ store, record: index, field: "month", reason: "hierarchy does not match date", expected: String(dateMonth), actual: typeName(record.month) }));
    }
  }
  optionalBoolean(record, store, index, "fullDay", errors);
  optionalString(record, store, index, "createdAt", errors);
  optionalString(record, store, index, "updatedAt", errors);
  return errors;
}

function validateSimpleIdRecord(record, store, index) {
  if (!isObject(record)) return [errorMessage({ store, record: index, reason: "record must be an object", expected: "object", actual: typeName(record) })];
  const errors = [];
  validateId(record, store, index, errors);
  return errors;
}

function validateCourse(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  requiredString(record, store, index, "name", errors);
  for (const field of ["instructor", "link", "createdAt", "updatedAt"]) optionalString(record, store, index, field, errors);
  for (const field of ["totalEpisodes", "currentEpisode"]) optionalNumber(record, store, index, field, errors);
  optionalBoolean(record, store, index, "isCritical", errors);
  return errors;
}

function validateCourseSession(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  for (const field of ["courseId", "status", "date", "createdAt"]) requiredString(record, store, index, field, errors);
  // D1.10-G: session.date is an indexed CIVIL_DATE (CourseRepository writes
  // getPolicyTodayKey()); a non-canonical value corrupts the date index.
  civilDateString(record, store, index, "date", errors);
  optionalNumber(record, store, index, "episodeNumber", errors);
  optionalString(record, store, index, "note", errors);
  return errors;
}

function validateFixedEvent(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  for (const field of ["dayOfWeek", "title", "startTime", "endTime"]) requiredString(record, store, index, field, errors);
  return errors;
}

function validateSchedule(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  requiredString(record, store, index, "dayOfWeek", errors);
  if (!Array.isArray(record.schedule)) {
    errors.push(errorMessage({ store, record: index, field: "schedule", reason: "required field missing or invalid", expected: "array", actual: typeName(record.schedule) }));
  } else {
    validateNestedBlocks(record, store, index, "schedule", errors);
  }
  if (record.scheduleMode !== undefined && (typeof record.scheduleMode !== "string" || !VALID_SCHEDULE_MODES.has(record.scheduleMode))) {
    errors.push(errorMessage({ store, record: index, field: "scheduleMode", reason: "invalid value", expected: "known schedule mode", actual: typeName(record.scheduleMode) }));
  }
  // D1.10-G: the schedule date fields are indexed and feed
  // getDateRangeInclusive; a non-canonical value corrupts the range logic.
  civilDateString(record, store, index, "dateKey", errors, { nullable: true });
  civilDateString(record, store, index, "startDate", errors, { nullable: true });
  civilDateString(record, store, index, "endDate", errors, { nullable: true });
  optionalString(record, store, index, "planId", errors, { nullable: true });
  for (const field of ["createdAt", "updatedAt"]) optionalString(record, store, index, field, errors);
  return errors;
}

function validateGate(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  requiredString(record, store, index, "title", errors);
  for (const field of ["description", "constraintNote", "deadlineNote", "evidenceLink"]) optionalString(record, store, index, field, errors, { nullable: true });
  // D1.10-G: deadline participates in civil string comparisons (overdue);
  // garbage values flip the comparison result.
  civilDateString(record, store, index, "deadline", errors, { nullable: true });
  for (const field of ["dependsOn", "criteria", "linkedRefIds"]) optionalArray(record, store, index, field, errors);
  if (Array.isArray(record.dependsOn)) {
    record.dependsOn.forEach((value, valueIndex) => {
      if (typeof value !== "string") {
        errors.push(errorMessage({ store, record: index, field: `dependsOn[${valueIndex}]`, reason: "invalid nested field type", expected: "string", actual: typeName(value) }));
      }
    });
  }
  if (Array.isArray(record.linkedRefIds)) {
    record.linkedRefIds.forEach((value, valueIndex) => {
      if (typeof value !== "string") {
        errors.push(errorMessage({ store, record: index, field: `linkedRefIds[${valueIndex}]`, reason: "invalid nested field type", expected: "string", actual: typeName(value) }));
      }
    });
  }
  if (Array.isArray(record.criteria)) {
    record.criteria.forEach((criterion, criterionIndex) => {
      if (!isObject(criterion)) {
        errors.push(errorMessage({ store, record: index, field: `criteria[${criterionIndex}]`, reason: "nested record must be an object", expected: "object", actual: typeName(criterion) }));
        return;
      }
      for (const field of ["id", "text", "assessmentResult", "evidenceLink"]) {
        optionalValueType(criterion[field], store, index, `criteria[${criterionIndex}].${field}`, "string or null", (value) => typeof value === "string" || value === null, errors);
      }
      optionalValueType(criterion.done, store, index, `criteria[${criterionIndex}].done`, "boolean", (value) => typeof value === "boolean", errors);
      optionalValueType(criterion.estimatedHours, store, index, `criteria[${criterionIndex}].estimatedHours`, "finite number or null", (value) => (typeof value === "number" && Number.isFinite(value)) || value === null, errors);
      optionalValueType(criterion.priority, store, index, `criteria[${criterionIndex}].priority`, "finite number", (value) => typeof value === "number" && Number.isFinite(value), errors);
    });
  }
  for (const field of ["order", "progress"]) optionalNumber(record, store, index, field, errors);
  return errors;
}

function validateActiveTimer(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  for (const field of ["taskRefId", "dayLogDate"]) requiredString(record, store, index, field, errors);
  civilDateString(record, store, index, "dayLogDate", errors);
  optionalNumber(record, store, index, "startTime", errors, { nullable: true });
  optionalNumber(record, store, index, "accumulatedTime", errors);
  optionalBoolean(record, store, index, "isRunning", errors);
  for (const field of ["createdAt", "updatedAt"]) optionalString(record, store, index, field, errors);
  return errors;
}

function validateDraft(record, store, index) {
  const errors = [];
  if (!isObject(record)) return [errorMessage({ store, record: index, reason: "record must be an object", expected: "object", actual: typeName(record) })];
  if (typeof record.key !== "string" || record.key.trim() === "") {
    errors.push(errorMessage({ store, record: index, field: "key", reason: "required field missing or invalid", expected: "non-empty string", actual: typeName(record.key) }));
  }
  optionalArray(record, store, index, "blocks", errors);
  optionalObject(record, store, index, "course", errors);
  optionalString(record, store, index, "timestamp", errors);
  return errors;
}

function validateLifeWheelScore(record, store, index) {
  const errors = validateSimpleIdRecord(record, store, index);
  if (!isObject(record)) return errors;
  requiredString(record, store, index, "periodKey", errors);
  if (!isObject(record.scores)) {
    errors.push(errorMessage({ store, record: index, field: "scores", reason: "required field missing or invalid", expected: "object", actual: typeName(record.scores) }));
  } else {
    for (const [dimension, value] of Object.entries(record.scores)) {
      if (LIFE_WHEEL_DIMENSIONS.has(dimension) && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
        errors.push(errorMessage({ store, record: index, field: `scores.${dimension}`, reason: "invalid nested field type", expected: "finite number or null", actual: typeName(value) }));
      }
    }
  }
  civilDateString(record, store, index, "startDate", errors);
  civilDateString(record, store, index, "endDate", errors);
  optionalString(record, store, index, "updatedAt", errors);
  // D1.10-G: year/month are indexed hierarchy fields. The app producer
  // always writes finite integers (never null), so imported nulls are
  // corruption, and the values must agree with startDate when both exist.
  for (const field of ["year", "month"]) {
    const value = record[field];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errors.push(errorMessage({ store, record: index, field, reason: "invalid hierarchy value", expected: "integer", actual: typeName(value) }));
    }
  }
  if (record.month !== undefined && Number.isInteger(record.month) && !(record.month >= 1 && record.month <= 12)) {
    errors.push(errorMessage({ store, record: index, field: "month", reason: "month out of range", expected: "1-12", actual: typeName(record.month) }));
  }
  if (isDateKey(record.startDate) && Number.isInteger(record.year) && Number.isInteger(record.month)) {
    const [startDateYear, startDateMonth] = record.startDate.split("-").map(Number);
    if (record.year !== startDateYear) {
      errors.push(errorMessage({ store, record: index, field: "year", reason: "hierarchy does not match startDate", expected: String(startDateYear), actual: typeName(record.year) }));
    }
    if (record.month !== startDateMonth) {
      errors.push(errorMessage({ store, record: index, field: "month", reason: "hierarchy does not match startDate", expected: String(startDateMonth), actual: typeName(record.month) }));
    }
  }
  optionalNumber(record, store, index, "week", errors, { nullable: true });
  return errors;
}

const RECORD_VALIDATORS = {
  dayLogs: validateDayLogRecord,
  habits: validateHabitRecord,
  courses: validateCourse,
  gates: validateGate,
  schedules: validateSchedule,
  courseSessions: validateCourseSession,
  fixedEvents: validateFixedEvent,
  activeTimer: validateActiveTimer,
  drafts: validateDraft,
  lifeWheelScores: validateLifeWheelScore,
};

function validateTopLevelMetadata(payload, errors) {
  for (const field of ["app", "appName", "exportDate", "exportedAt", "range", "version"]) {
    if (payload[field] !== undefined && typeof payload[field] !== "string") {
      errors.push(errorMessage({ store: "payload", field, reason: "invalid metadata type", expected: "string", actual: typeName(payload[field]) }));
    }
  }
  if (payload.schemaVersion !== undefined && (typeof payload.schemaVersion !== "number" || !Number.isFinite(payload.schemaVersion))) {
    errors.push(errorMessage({ store: "payload", field: "schemaVersion", reason: "invalid metadata type", expected: "finite number", actual: typeName(payload.schemaVersion) }));
  }
}

export function validateImportPayload(payload) {
  const errors = [];
  if (!isObject(payload)) {
    throw new Error(errorMessage({ store: "payload", reason: "top-level payload must be an object", expected: "object", actual: typeName(payload) }));
  }

  const tables = isObject(payload.tables) ? payload.tables : payload;
  if (payload.tables !== undefined && !isObject(payload.tables)) {
    throw new Error(errorMessage({ store: "payload", field: "tables", reason: "invalid wrapper", expected: "object", actual: typeName(payload.tables) }));
  }
  validateTopLevelMetadata(payload, errors);

  const wrapperUnknownKeys = payload.tables === undefined
    ? []
    : Object.keys(payload).filter((key) => key !== "tables" && !TOP_LEVEL_METADATA.has(key));
  if (wrapperUnknownKeys.length > 0) {
    errors.push(errorMessage({ store: "payload", field: wrapperUnknownKeys[0], reason: "unknown top-level field", expected: "known metadata or tables", actual: "unknown key" }));
  }

  const tableKeys = Object.keys(tables);
  const unknownKeys = tableKeys.filter((key) => !IMPORT_TABLE_SET.has(key));
  if (tables === payload) {
    unknownKeys.splice(0, unknownKeys.length, ...unknownKeys.filter((key) => !TOP_LEVEL_METADATA.has(key)));
  }
  if (unknownKeys.length > 0) {
    errors.push(errorMessage({ store: "payload", field: unknownKeys[0], reason: "unknown import store", expected: "known import store", actual: "unknown key" }));
  }

  const knownKeys = tableKeys.filter((key) => IMPORT_TABLE_SET.has(key));
  if (knownKeys.length === 0) {
    errors.push(errorMessage({ store: "payload", reason: "no import tables found", expected: "at least one known store", actual: "none" }));
  }

  for (const tableName of knownKeys) {
    const records = tables[tableName];
    if (!Array.isArray(records)) {
      errors.push(errorMessage({ store: tableName, field: tableName, reason: "table must be an array", expected: "array", actual: typeName(records) }));
      continue;
    }
    if (records.length > 10000) {
      errors.push(errorMessage({ store: tableName, field: tableName, reason: "table exceeds record limit", expected: "at most 10000 records", actual: "too many records" }));
      continue;
    }
    for (let index = 0; index < records.length; index += 1) {
      errors.push(...RECORD_VALIDATORS[tableName](records[index], tableName, index));
    }
  }

  if (errors.length > 0) throw new Error(errors.join("\n"));
  return tables;
}
