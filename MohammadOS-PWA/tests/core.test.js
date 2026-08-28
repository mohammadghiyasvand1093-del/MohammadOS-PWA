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
