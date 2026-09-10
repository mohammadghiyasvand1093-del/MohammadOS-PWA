import test from "node:test";
import assert from "node:assert/strict";

const ACCOUNT_TIMEZONE = "Asia/Tehran";

function civilDateFromInstant(instant, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));

  const values = Object.fromEntries(
    parts
      .filter(({ type }) => type !== "literal")
      .map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function civilDateToUtc(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function saturdayWeekStart(dateKey) {
  const date = civilDateToUtc(dateKey);
  const daysSinceSaturday = (date.getUTCDay() + 1) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceSaturday);

  return date.toISOString().slice(0, 10);
}

function canonicalCivilDate(value) {
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  return value;
}

test("Time Policy contract: UTC Instant converts to Asia/Tehran Civil Date", () => {
  assert.equal(
    civilDateFromInstant("2026-09-10T20:30:00Z", ACCOUNT_TIMEZONE),
    "2026-09-11"
  );
});

test("Time Policy contract: the Instant before Tehran midnight remains on the previous Civil Date", () => {
  assert.equal(
    civilDateFromInstant("2026-09-10T20:29:59Z", ACCOUNT_TIMEZONE),
    "2026-09-10"
  );
});

test("Time Policy contract: the exact Tehran midnight changes the Civil Date", () => {
  assert.equal(
    civilDateFromInstant("2026-09-10T20:30:00Z", ACCOUNT_TIMEZONE),
    "2026-09-11"
  );
});

test("Time Policy contract: the Instant after Tehran midnight remains on the new Civil Date", () => {
  assert.equal(
    civilDateFromInstant("2026-09-10T20:30:01Z", ACCOUNT_TIMEZONE),
    "2026-09-11"
  );
});

test("Time Policy contract: a Civil Date is stable as a canonical date identity", () => {
  const civilDate = canonicalCivilDate("2026-09-10");

  assert.equal(civilDate, "2026-09-10");
  assert.notEqual(civilDate, "2026-09-09");
  assert.notEqual(civilDate, "2026-09-11");
});

test("Time Policy contract: Friday and Saturday belong to different Saturday-Friday weeks", () => {
  assert.equal(saturdayWeekStart("2026-09-11"), "2026-09-05");
  assert.equal(saturdayWeekStart("2026-09-12"), "2026-09-12");
  assert.notEqual(
    saturdayWeekStart("2026-09-11"),
    saturdayWeekStart("2026-09-12")
  );
});

test("Time Policy contract: the Saturday-Friday week remains correct across the year boundary", () => {
  assert.equal(saturdayWeekStart("2026-12-31"), "2026-12-26");
  assert.equal(saturdayWeekStart("2027-01-01"), "2026-12-26");
  assert.equal(saturdayWeekStart("2027-01-02"), "2027-01-02");
  assert.notEqual(
    saturdayWeekStart("2027-01-01"),
    saturdayWeekStart("2027-01-02")
  );
});
