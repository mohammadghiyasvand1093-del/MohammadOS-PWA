import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import process from "node:process";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  getPolicyTodayKey,
  parseCivilDateKey,
} from "../src/config/timePolicy.js";

const PROJECT_ROOT = process.cwd();
const TODAY_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/pages/TodayPage.jsx"),
  "utf8"
);
const POLICY_MODULE_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/config/timePolicy.js")
).href;

const EXECUTION_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "America/New_York",
];

const BOUNDARY_CASES = [
  ["2026-09-10T20:29:59Z", "2026-09-10"],
  ["2026-09-10T20:30:00Z", "2026-09-11"],
  ["2026-09-10T20:30:01Z", "2026-09-11"],
];

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

function runPolicyDateProbe(executionTimeZone) {
  const probe = `
    import { getPolicyDateKey } from ${JSON.stringify(POLICY_MODULE_URL)};
    const instants = ${JSON.stringify(BOUNDARY_CASES.map(([instant]) => instant))};
    process.stdout.write(JSON.stringify(
      instants.map((instant) => getPolicyDateKey(instant, "Asia/Tehran"))
    ));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TZ: executionTimeZone },
      encoding: "utf8",
    })
  );
}

function addCivilDaysForExpectation(dateKey, days) {
  const { year, month, day } = parseCivilDateKey(dateKey);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("Today policy date follows the exact Asia/Tehran midnight boundary", () => {
  for (const [instant, expectedDateKey] of BOUNDARY_CASES) {
    assert.equal(getPolicyTodayKey(instant, "Asia/Tehran"), expectedDateKey);
  }
});

test("Today policy date is independent of the machine timezone", () => {
  const observations = EXECUTION_TIMEZONES.map(runPolicyDateProbe);

  for (const result of observations.slice(1)) {
    assert.deepEqual(result, observations[0]);
  }
});

test("Civil Date identity remains exact for Today inputs", () => {
  for (const dateKey of [
    "2026-09-10",
    "2026-09-11",
    "2026-12-31",
    "2027-01-01",
  ]) {
    assert.deepEqual(parseCivilDateKey(dateKey), {
      year: Number(dateKey.slice(0, 4)),
      month: Number(dateKey.slice(5, 7)),
      day: Number(dateKey.slice(8, 10)),
    });
  }
});

test("Civil Date yesterday arithmetic preserves month and year boundaries", () => {
  assert.equal(addCivilDaysForExpectation("2026-10-01", -1), "2026-09-30");
  assert.equal(addCivilDaysForExpectation("2027-01-01", -1), "2026-12-31");
});

test("TodayPage uses policy Civil Date for current-day identity", () => {
  const dateIdentitySection = sourceSection(
    TODAY_SOURCE,
    "const currentDateKey",
    "const [dayLog"
  );
  const civilDateArithmeticSection = sourceSection(
    TODAY_SOURCE,
    "function addCivilDays",
    "export default"
  );

  assert.match(dateIdentitySection, /getPolicyTodayKey/);
  assert.match(dateIdentitySection, /getDayEnFromDateKey\(targetDateKey\)/);
  assert.match(civilDateArithmeticSection, /parseCivilDateKey/);
  assert.doesNotMatch(dateIdentitySection, /\btodayKey\(\)/);
  assert.doesNotMatch(dateIdentitySection, /\bgetTodayEn\(\)/);
  assert.doesNotMatch(
    dateIdentitySection,
    /new Date\(nowMs\(\)\)|\.setDate\(|\.getDate\(|\.getMonth\(|\.getFullYear\(/
  );
  assert.doesNotMatch(dateIdentitySection, /Asia\/Tehran/);
});

test("TodayPage date identity path does not write persistence", () => {
  const dateIdentitySection = sourceSection(
    TODAY_SOURCE,
    "const currentDateKey",
    "const [dayLog"
  );

  assert.doesNotMatch(dateIdentitySection, /\.put\(|\.bulkPut\(|\.delete\(/);
});
