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
const SCHEDULE_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/pages/SchedulePage.jsx"),
  "utf8"
);
const PLANNER_SOURCE = readFileSync(
  path.resolve(PROJECT_ROOT, "src/pages/PlannerPage.jsx"),
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

function runPolicyTodayProbe(timeZone) {
  const probe = `
    import { getPolicyTodayKey } from ${JSON.stringify(POLICY_MODULE_URL)};
    const instants = ${JSON.stringify(BOUNDARY_CASES.map(([instant]) => instant))};
    process.stdout.write(JSON.stringify(
      instants.map((instant) => getPolicyTodayKey(instant, "Asia/Tehran"))
    ));
  `;

  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
      cwd: PROJECT_ROOT,
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

function sourceSection(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = endMarker ? source.indexOf(endMarker, start) : source.length;
  assert.notEqual(end, -1, `Missing source marker: ${endMarker}`);
  return source.slice(start, end);
}

test("policy today detection observes the exact Asia/Tehran midnight boundary", () => {
  for (const [instant, expectedDateKey] of BOUNDARY_CASES) {
    assert.equal(getPolicyTodayKey(instant, "Asia/Tehran"), expectedDateKey);
  }
});

test("policy today detection is independent of execution timezone", () => {
  const observations = EXECUTION_TIMEZONES.map(runPolicyTodayProbe);

  for (const result of observations.slice(1)) {
    assert.deepEqual(result, observations[0]);
  }
});

test("Civil Date identity is preserved without local Date timestamp semantics", () => {
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

test("SchedulePage current-day paths use policy Civil Dates and avoid local-midnight parsing", () => {
  const todaySection = sourceSection(
    SCHEDULE_SOURCE,
    "const todayDateKey",
    "const selectedDateKey"
  );
  const rolloverSection = sourceSection(
    SCHEDULE_SOURCE,
    "useEffect(() => {\n    const timer",
    "  }, [weekOffset]);"
  );
  const dayIndexSection = sourceSection(
    SCHEDULE_SOURCE,
    "function getPolicyDayIndex",
    "function getWeekDates"
  );
  const weekStatusSection = sourceSection(
    SCHEDULE_SOURCE,
    "async function loadWeekStatus()",
    "    loadWeekStatus();"
  );

  assert.match(todaySection, /getPolicyTodayKey/);
  assert.doesNotMatch(todaySection, /getFullYear|getMonth|getDate/);

  assert.match(rolloverSection, /getPolicyTodayKey/);
  assert.match(rolloverSection, /getPolicyDayIndex/);
  assert.doesNotMatch(rolloverSection, /getFullYear|getMonth|getDate|getDay\(\)/);

  assert.match(dayIndexSection, /parseCivilDateKey/);
  assert.match(dayIndexSection, /getUTCDay/);
  assert.doesNotMatch(dayIndexSection, /\.getDay\(\)/);

  assert.doesNotMatch(weekStatusSection, /T00:00:00/);
  assert.doesNotMatch(weekStatusSection, /new Date\(dateKey/);
  assert.doesNotMatch(weekStatusSection, /setHours\(/);
  assert.match(weekStatusSection, /dateKey > todayDateKey/);
  assert.match(weekStatusSection, /dateKey === todayDateKey/);
});

test("PlannerPage current-day detection uses policy Civil Dates", () => {
  const todaySection = sourceSection(
    PLANNER_SOURCE,
    "const todayDateKey",
    "\n\n  useEffect"
  );

  assert.match(todaySection, /getPolicyTodayKey/);
  assert.doesNotMatch(todaySection, /getFullYear|getMonth|getDate/);
  assert.doesNotMatch(todaySection, /new Date\(.*T00:00:00/);
});

test("SchedulePage and PlannerPage preserve Civil Date values without persistence mutation", () => {
  const migratedSections = [
    sourceSection(
      SCHEDULE_SOURCE,
      "const todayDateKey",
      "const selectedDateKey"
    ),
    sourceSection(
      SCHEDULE_SOURCE,
      "async function loadWeekStatus()",
      "    loadWeekStatus();"
    ),
    sourceSection(
      PLANNER_SOURCE,
      "const todayDateKey",
      "\n\n  useEffect"
    ),
  ];

  for (const section of migratedSections) {
    assert.doesNotMatch(section, /\.put\(/);
    assert.doesNotMatch(section, /\.bulkPut\(/);
    assert.doesNotMatch(section, /\.delete\(/);
  }
});
