import test from "node:test";
import assert from "node:assert/strict";

import {
  getDayEnFromDateKey,
  getDayOfWeekFromDateKey,
  getPersianWeekKey,
  getPersianWeekRange,
  getLocalDateKey,
} from "../src/utils/date.js";
import {
  blockSignature,
  getDateRangeInclusive,
  isDateKey,
  SCHEDULE_MODES,
} from "../src/utils/schedule.js";
import { validateHabit } from "../src/domain/validation/habitValidator.js";
import {
  createMutation,
  OUTBOX_OPERATIONS,
  OUTBOX_STATUSES,
} from "../src/sync/SyncOutboxContract.js";
import {
  buildRestoreMutations,
  getRestorePayload,
  recordsHaveMeaningfulChanges,
} from "../src/app/restoreSync.js";
import { validateImportPayload } from "../src/domain/validation/importValidator.js";

test("date keys are validated strictly", () => {
  assert.equal(isDateKey("2026-08-29"), true);
  assert.equal(isDateKey("2026-02-29"), false);
  assert.equal(isDateKey("2026-8-9"), false);
  assert.equal(isDateKey("not-a-date"), false);
});

test("date range is inclusive and rejects reversed ranges", () => {
  assert.deepEqual(getDateRangeInclusive("2026-08-29", "2026-09-01"), [
    "2026-08-29",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
  ]);
  assert.deepEqual(getDateRangeInclusive("2026-09-01", "2026-08-29"), []);
});

test("Persian week starts on Saturday", () => {
  const saturday = new Date(2026, 7, 29);
  assert.equal(getDayOfWeekFromDateKey("2026-08-29"), 0);
  assert.equal(getDayEnFromDateKey("2026-08-29"), "saturday");
  assert.equal(getPersianWeekKey(saturday), "2026-W35");

  const range = getPersianWeekRange("2026-W35");
  assert.equal(range.startDate, "2026-08-29");
  assert.equal(range.endDate, "2026-09-04");
});

test("local date key uses the local calendar date", () => {
  assert.equal(getLocalDateKey(new Date(2026, 7, 29, 23, 59)), "2026-08-29");
});

test("schedule block signatures distinguish meaningful fields", () => {
  const base = {
    title: "مطالعه",
    startTime: "09:00",
    endTime: "10:00",
    type: "habit",
    domain: "learning",
  };
  assert.equal(blockSignature(base), "مطالعه|09:00|10:00|habit|learning");
  assert.notEqual(
    blockSignature(base),
    blockSignature({ ...base, endTime: "11:00" })
  );
  assert.equal(SCHEDULE_MODES.DATED, "dated_plan");
});

test("habit validation rejects empty weekly days", () => {
  const base = {
    name: "مطالعه",
    domain: "learning",
  };
  assert.equal(
    validateHabit({ ...base, recurrence: { type: "weekly", days: [] } }).valid,
    false
  );
  assert.equal(
    validateHabit({ ...base, recurrence: { type: "weekly", days: [0, 3, 6] } })
      .valid,
    true
  );
  assert.equal(
    validateHabit({ ...base, recurrence: { type: "weekly", days: [7] } }).valid,
    false
  );
});

test("outbox mutations have stable delivery metadata", () => {
  const mutation = createMutation({
    entity: "habits",
    entityId: "habit-1",
    payload: { id: "habit-1", name: "مطالعه" },
    baseVersion: 4,
    clientId: "device-1",
  });

  assert.equal(mutation.entity, "habits");
  assert.equal(mutation.entityId, "habit-1");
  assert.equal(mutation.operation, OUTBOX_OPERATIONS.UPSERT);
  assert.equal(mutation.baseVersion, 4);
  assert.equal(mutation.clientId, "device-1");
  assert.equal(mutation.status, OUTBOX_STATUSES.PENDING);
  assert.equal(mutation.attemptCount, 0);
  assert.notEqual(mutation.opId, "habit-1");
});

test("outbox rejects incomplete mutations", () => {
  assert.throws(
    () => createMutation({ entity: "habits" }),
    /entityId is required/
  );
  assert.throws(
    () => createMutation({ entity: "habits", entityId: "h", operation: "replace" }),
    /operation is invalid/
  );
});

test("record restore ignores sync metadata-only changes", () => {
  assert.equal(
    recordsHaveMeaningfulChanges(
      { id: "h1", name: "مطالعه", syncVersion: 2 },
      { id: "h1", name: "مطالعه", syncVersion: 7 }
    ),
    false
  );
  assert.deepEqual(
    getRestorePayload({ id: "h1", name: "مطالعه", syncVersion: 7 }),
    { id: "h1", name: "مطالعه" }
  );
});

test("record restore queues only added, changed, and deleted records", () => {
  const mutations = buildRestoreMutations({
    tableName: "habits",
    idField: "id",
    previousRecords: [
      { id: "same", name: "بدون تغییر", syncVersion: 2 },
      { id: "changed", name: "قدیمی", syncVersion: 3 },
      { id: "deleted", name: "حذف‌شده", syncVersion: 4 },
    ],
    importedRecords: [
      { id: "same", name: "بدون تغییر", syncVersion: 8 },
      { id: "changed", name: "جدید", syncVersion: 3 },
      { id: "added", name: "جدید اضافه‌شده" },
    ],
  });

  assert.deepEqual(
    mutations.map(({ entityId, operation = "upsert", baseVersion }) => ({
      entityId,
      operation,
      baseVersion,
    })),
    [
      { entityId: "changed", operation: "upsert", baseVersion: 3 },
      { entityId: "added", operation: "upsert", baseVersion: undefined },
      { entityId: "deleted", operation: "delete", baseVersion: 4 },
    ]
  );
});

test("import validator accepts the current export shape", () => {
  assert.doesNotThrow(() => validateImportPayload({
    app: "MohammadOS-PWA",
    schemaVersion: 2,
    range: "all",
    habits: [{
      id: "habit-1",
      name: "مطالعه",
      domain: "learning",
      recurrence: { type: "daily" },
      isCritical: false,
      done: false,
      date: "2026-09-08",
      createdAt: "2026-09-08T08:00:00.000Z",
      updatedAt: "2026-09-08T08:00:00.000Z",
      habitStrength: 0.5,
      lastEmaDate: null,
      strengthBeforeToday: 0,
    }],
    dayLogs: [{
      date: "2026-09-08",
      entries: [{ id: "entry-1", title: "مطالعه", done: false, isCritical: false }],
      mood: null,
      fullDay: false,
      fullDayScore: 0,
      status: "active",
    }],
    courses: [],
    courseSessions: [],
    schedules: [],
    gates: [],
    lifeWheelScores: [],
    fixedEvents: [],
  }));
});

test("import validator rejects malformed top-level payloads and unknown stores", () => {
  assert.throws(() => validateImportPayload(null), /top-level payload/);
  assert.throws(() => validateImportPayload([]), /top-level payload/);
  assert.throws(() => validateImportPayload({ app: "MohammadOS-PWA" }), /no import tables/);
  assert.throws(
    () => validateImportPayload({ habits: [], unknownStore: [] }),
    /unknown import store/
  );
  assert.throws(
    () => validateImportPayload({ tables: { habits: [] }, unknownField: true }),
    /unknown top-level field/
  );
});

test("import validator rejects missing required fields and invalid primary keys", () => {
  assert.throws(
    () => validateImportPayload({ habits: [{ id: "habit-1", recurrence: { type: "daily" } }] }),
    /store=habits.*field=name/
  );
  assert.throws(
    () => validateImportPayload({ habits: [{ name: "مطالعه", recurrence: { type: "daily" } }] }),
    /store=habits.*field=id/
  );
});

test("import validator rejects wrong primitive and nested types", () => {
  assert.throws(
    () => validateImportPayload({ habits: [{ id: "habit-1", name: "مطالعه", recurrence: { type: "daily" }, isCritical: "false" }] }),
    /field=isCritical/
  );
  assert.throws(
    () => validateImportPayload({ dayLogs: [{ date: "2026-09-08", entries: "invalid" }] }),
    /field=entries/
  );
  assert.throws(
    () => validateImportPayload({ dayLogs: [{ date: "2026-09-08", entries: [{ done: "false" }] }] }),
    /field=entries\[0\]\.done/
  );
  assert.throws(
    () => validateImportPayload({ schedules: [{ id: "schedule-1", dayOfWeek: "monday", schedule: [{ title: "درس", startTime: 9 }] }] }),
    /field=schedule\[0\]\.startTime/
  );
});
