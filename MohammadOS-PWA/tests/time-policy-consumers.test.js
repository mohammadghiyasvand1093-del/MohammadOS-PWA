import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { getPersianWeekRange } from "../src/utils/date.js";

const PROJECT_ROOT = process.cwd();
const DATE_MODULE_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/utils/date.js")
).href;
const SCHEDULE_PAGE_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/pages/SchedulePage.jsx"),
  "utf8"
);
const PLANNER_PAGE_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/pages/PlannerPage.jsx"),
  "utf8"
);

const EXECUTION_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "America/New_York",
];

const EXPECTED_WEEKS = {
  "2026-09-11": {
    weekKey: "2026-W36",
    startDate: "2026-09-05",
    endDate: "2026-09-11",
  },
  "2026-09-12": {
    weekKey: "2026-W37",
    startDate: "2026-09-12",
    endDate: "2026-09-18",
  },
  "2026-12-31": {
    weekKey: "2026-W52",
    startDate: "2026-12-26",
    endDate: "2027-01-01",
  },
  "2027-01-01": {
    weekKey: "2026-W52",
    startDate: "2026-12-26",
    endDate: "2027-01-01",
  },
  "2027-01-02": {
    weekKey: "2027-W01",
    startDate: "2027-01-02",
    endDate: "2027-01-08",
  },
};

function runConsumerWeekProbe(timeZone) {
  const probe = `
    import {
      getPersianWeekKey,
      getPersianWeekRange,
    } from ${JSON.stringify(DATE_MODULE_URL)};

    const dates = ${JSON.stringify(Object.keys(EXPECTED_WEEKS))};
    const results = dates.map((dateKey) => {
      const [year, month, day] = dateKey.split("-").map(Number);
      const weekKey = getPersianWeekKey(new Date(year, month - 1, day));
      const range = getPersianWeekRange(weekKey);

      return {
        dateKey,
        weekKey,
        startDate: range.startDate,
        endDate: range.endDate,
        year: range.year,
        month: range.month,
        week: range.week,
      };
    });

    process.stdout.write(JSON.stringify({ timeZone: ${JSON.stringify(
      timeZone
    )}, results }));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

test("consumer-facing Persian week API preserves Friday/Saturday and year boundaries", () => {
  const result = runConsumerWeekProbe("UTC");

  for (const observation of result.results) {
    assert.deepEqual(observation, {
      dateKey: observation.dateKey,
      ...EXPECTED_WEEKS[observation.dateKey],
      year: Number(observation.startDate.slice(0, 4)),
      month: Number(observation.startDate.slice(5, 7)),
      week: Number(observation.weekKey.slice(6)),
    });
  }
});

test("consumer-facing Persian week output is stable across execution timezones", () => {
  const observationsByTimezone = EXECUTION_TIMEZONES.map((timeZone) =>
    runConsumerWeekProbe(timeZone)
  );
  const baseline = observationsByTimezone[0].results;

  for (const result of observationsByTimezone) {
    assert.deepEqual(result.results, baseline, result.timeZone);
  }
});

test("week calculation reads period-like data without mutating persisted values", () => {
  const persistedLikeRecords = [
    {
      periodKey: "2026-W36",
      startDate: "2026-09-05",
      endDate: "2026-09-11",
      year: 2026,
      month: 9,
      week: 36,
    },
    {
      periodKey: "2026-W52",
      startDate: "2026-12-26",
      endDate: "2027-01-01",
      year: 2026,
      month: 12,
      week: 52,
    },
  ];
  const before = structuredClone(persistedLikeRecords);

  for (const record of persistedLikeRecords) {
    const range = getPersianWeekRange(record.periodKey);

    assert.deepEqual(
      {
        startDate: range.startDate,
        endDate: range.endDate,
        year: range.year,
        month: range.month,
        week: range.week,
      },
      {
        startDate: record.startDate,
        endDate: record.endDate,
        year: record.year,
        month: record.month,
        week: record.week,
      }
    );
  }

  assert.deepEqual(persistedLikeRecords, before);
});

test("SchedulePage and PlannerPage week helpers use policy arithmetic only", () => {
  const scheduleWeekSection = SCHEDULE_PAGE_SOURCE.slice(
    SCHEDULE_PAGE_SOURCE.indexOf("function addCivilDays"),
    SCHEDULE_PAGE_SOURCE.indexOf("export default")
  );
  const plannerWeekSection = PLANNER_PAGE_SOURCE.slice(
    PLANNER_PAGE_SOURCE.indexOf("function addCivilDays"),
    PLANNER_PAGE_SOURCE.indexOf("// ✅ FIX: New urgency config")
  );

  for (const section of [scheduleWeekSection, plannerWeekSection]) {
    assert.match(section, /getPolicyDateKey/);
    assert.match(section, /getPolicyWeekRange/);
    assert.match(section, /getPolicyWeekKey/);
    assert.match(section, /parseCivilDateKey/);
    assert.doesNotMatch(section, /\.getDay\(\)/);
    assert.doesNotMatch(section, /\.setDate\(/);
    assert.doesNotMatch(section, /\bdb\./);
    assert.doesNotMatch(section, /\.(?:put|bulkPut|delete)\(/);
  }
});
