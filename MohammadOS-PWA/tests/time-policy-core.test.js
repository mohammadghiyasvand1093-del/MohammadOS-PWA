import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_LOCALE,
  DEFAULT_TIME_ZONE,
  WEEK_END_DAY,
  WEEK_START_DAY,
  getPolicyDateKey,
  getPolicyTodayKey,
  getPolicyWeekKey,
  getPolicyWeekRange,
  parseCivilDateKey,
} from "../src/config/timePolicy.js";

test("Time Policy exposes the locked v1 defaults", () => {
  assert.equal(DEFAULT_TIME_ZONE, "Asia/Tehran");
  assert.equal(DEFAULT_LOCALE, "fa-IR");
  assert.equal(WEEK_START_DAY, "Saturday");
  assert.equal(WEEK_END_DAY, "Friday");
});

test("policy Civil Date is correct before Tehran midnight", () => {
  assert.equal(
    getPolicyDateKey("2026-09-10T20:29:59Z"),
    "2026-09-10"
  );
});

test("policy Civil Date changes at exact Tehran midnight", () => {
  assert.equal(
    getPolicyDateKey("2026-09-10T20:30:00Z"),
    "2026-09-11"
  );
});

test("policy Civil Date remains on the new date one second after midnight", () => {
  assert.equal(
    getPolicyDateKey("2026-09-10T20:30:01Z"),
    "2026-09-11"
  );
});

test("explicit timezone controls conversion instead of the machine timezone", () => {
  const instant = "2026-09-10T23:30:00Z";

  assert.equal(getPolicyDateKey(instant, "America/New_York"), "2026-09-10");
  assert.equal(getPolicyDateKey(instant, "Asia/Tehran"), "2026-09-11");
});

test("injected Instant makes policy today deterministic", () => {
  assert.equal(
    getPolicyTodayKey("2026-09-10T20:30:00Z", DEFAULT_TIME_ZONE),
    "2026-09-11"
  );
});

test("Civil Date parsing preserves date identity without Date string parsing", () => {
  assert.deepEqual(parseCivilDateKey("2026-09-10"), {
    year: 2026,
    month: 9,
    day: 10,
  });
});

test("Friday and Saturday produce a policy week transition", () => {
  assert.deepEqual(getPolicyWeekRange("2026-09-11"), {
    startDateKey: "2026-09-05",
    endDateKey: "2026-09-11",
  });
  assert.deepEqual(getPolicyWeekRange("2026-09-12"), {
    startDateKey: "2026-09-12",
    endDateKey: "2026-09-18",
  });
  assert.notEqual(getPolicyWeekKey("2026-09-11"), getPolicyWeekKey("2026-09-12"));
});

test("policy week remains deterministic across the year boundary", () => {
  assert.equal(getPolicyWeekKey("2026-12-31"), "2026-W52");
  assert.equal(getPolicyWeekKey("2027-01-01"), "2026-W52");
  assert.equal(getPolicyWeekKey("2027-01-02"), "2027-W01");
});

test("invalid Instant values are rejected instead of normalized", () => {
  assert.throws(
    () => getPolicyDateKey("not-an-instant"),
    /UTC ISO-8601 string/
  );
  assert.throws(
    () => getPolicyDateKey("2026-02-30T12:00:00Z"),
    /Invalid Instant/
  );
  assert.throws(
    () => getPolicyDateKey("2026-09-10T20:30:00+03:30"),
    /UTC ISO-8601 string/
  );
  assert.throws(
    () => getPolicyDateKey("2026-09-10T20:30:00Z", "Not/A-Timezone"),
    /Invalid IANA timezone/
  );
});

test("invalid Civil Date values are rejected instead of normalized", () => {
  assert.throws(
    () => parseCivilDateKey("2026-9-10"),
    /YYYY-MM-DD format/
  );
  assert.throws(
    () => parseCivilDateKey("2026-02-30"),
    /Invalid Civil Date calendar value/
  );
  assert.throws(() => getPolicyWeekRange("2026-02-30"), /Invalid Civil Date/);
});
