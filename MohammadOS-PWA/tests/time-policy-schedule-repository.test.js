import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  getPolicyWeekRange,
  getPolicyWeekKey,
} from "../src/config/timePolicy.js";

const PROJECT_ROOT = process.cwd();
const REPOSITORY_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/repositories/ScheduleRepository.js"),
  "utf8"
);
const DATE_MODULE_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/config/timePolicy.js")
).href;

const EXECUTION_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "America/New_York",
];

const EXPECTED_WEEKS = {
  "2026-09-11": {
    weekKey: "2026-W36",
    startDateKey: "2026-09-05",
    endDateKey: "2026-09-11",
  },
  "2026-09-12": {
    weekKey: "2026-W37",
    startDateKey: "2026-09-12",
    endDateKey: "2026-09-18",
  },
  "2026-12-31": {
    weekKey: "2026-W52",
    startDateKey: "2026-12-26",
    endDateKey: "2027-01-01",
  },
  "2027-01-01": {
    weekKey: "2026-W52",
    startDateKey: "2026-12-26",
    endDateKey: "2027-01-01",
  },
  "2027-01-02": {
    weekKey: "2027-W01",
    startDateKey: "2027-01-02",
    endDateKey: "2027-01-08",
  },
};

function runPolicyWeekProbe(timeZone) {
  const probe = `
    import {
      getPolicyWeekKey,
      getPolicyWeekRange,
    } from ${JSON.stringify(DATE_MODULE_URL)};

    const dateKeys = ${JSON.stringify(Object.keys(EXPECTED_WEEKS))};
    const results = dateKeys.map((dateKey) => ({
      dateKey,
      weekKey: getPolicyWeekKey(dateKey),
      ...getPolicyWeekRange(dateKey),
    }));

    process.stdout.write(JSON.stringify(results));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

test("ScheduleRepository week contract preserves Saturday-Friday and year boundaries", () => {
  for (const [dateKey, expected] of Object.entries(EXPECTED_WEEKS)) {
    assert.deepEqual(
      {
        weekKey: getPolicyWeekKey(dateKey),
        ...getPolicyWeekRange(dateKey),
      },
      expected,
      dateKey
    );
  }
});

test("ScheduleRepository week contract is stable across execution timezones", () => {
  const observations = EXECUTION_TIMEZONES.map(runPolicyWeekProbe);

  for (const result of observations.slice(1)) {
    assert.deepEqual(result, observations[0]);
  }
});

test("ScheduleRepository getWeekSchedule uses policy week arithmetic without writes", () => {
  const functionStart = REPOSITORY_SOURCE.indexOf("async getWeekSchedule");
  assert.notEqual(functionStart, -1);

  const functionBody = REPOSITORY_SOURCE.slice(functionStart);

  assert.match(REPOSITORY_SOURCE, /parseCivilDateKey/);
  assert.match(functionBody, /getPolicyDateKey/);
  assert.match(functionBody, /getPolicyWeekRange/);
  assert.match(REPOSITORY_SOURCE, /getPolicyWeekKey/);
  assert.match(REPOSITORY_SOURCE, /getPolicyWeekRangeFromKey/);
  assert.match(functionBody, /addCivilDays/);
  assert.match(functionBody, /getScheduleForDate/);
  assert.match(functionBody, /Array\.from\(\{ length: 7 \}/);

  assert.doesNotMatch(functionBody, /getLocalDateKey/);
  assert.doesNotMatch(functionBody, /\.getDay\(\)/);
  assert.doesNotMatch(functionBody, /\.setDate\(/);
  assert.doesNotMatch(functionBody, /db\./);
  assert.doesNotMatch(functionBody, /\.(?:put|bulkPut|delete)\(/);
});
