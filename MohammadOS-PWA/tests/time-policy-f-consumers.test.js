// D1.10-F — temporal consumer regression tests (Account TZ: Asia/Tehran).
//
// F traced two consumer-side device-TZ dependencies in the E2-migrated
// ReportsPage paths:
//
//   1. getWeeklyStats(parseDateKeyLocal(weekAnchorKey)) transports a
//      CIVIL_DATE through a device-local midnight Date; getWeekRange then
//      re-projects that Instant into Asia/Tehran, shifting the anchor one
//      civil day early for device TZs east of UTC+03:30 (Kolkata, Dubai,
//      Sydney, Auckland…), i.e. the stats show the previous Persian week.
//      The service contract accepts the canonical Civil Date key directly —
//      a Civil Date travels as a string, never through a device-local Date.
//
//   2. The advisor report label derived "today" from the DEVICE clock
//      (getLocalDateKey(new Date(nowMs()))). Around Tehran midnight the same
//      Instant projects to a different civil date depending on the device
//      timezone; the canonical identity is getPolicyTodayKey().
//
// Behavioral probes run the REAL modules in child processes with a fixed
// device TZ (module-load hooks stub IndexedDB/repository dependencies; the
// real utils/date.js and config/timePolicy.js always load). Expected values
// are explicit constants. Source contracts pin the corrected call paths.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const p = (rel) => pathToFileURL(path.resolve(PROJECT_ROOT, rel)).href;
const src = (rel) => readFileSync(path.resolve(PROJECT_ROOT, rel), "utf8");
const REPORTS_PATH = "src/pages/ReportsPage.jsx";

const EXECUTION_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "America/New_York",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

const TMP = mkdtempSync(path.join(tmpdir(), "f-consumers-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
    const rows = (globalThis.__F && globalThis.__F.dayLogs) || [];
    const chain = {
      equals: () => chain,
      between: (a, b) => { chain.range = [a, b]; return chain; },
      aboveOrEqual: () => chain,
      belowOrEqual: () => chain,
      filter: () => chain,
      first: async () => undefined,
      toArray: async () => {
        if (!chain.range) return rows.slice();
        const [a, b] = chain.range;
        return rows.filter((r) => r.date >= a && r.date <= b);
      },
    };
    export const db = { dayLogs: { where: () => chain } };
  \`,
  "src/repositories/DayLogRepository.js":
    "export const DayLogRepository = {}; export function buildEntriesFromSchedule() { return []; }",
  "src/repositories/ScheduleRepository.js":
    "export const ScheduleRepository = {};",
  "src/repositories/TimerRepository.js": "export const TimerRepository = {};",
};

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !specifier.endsWith(".js") && !specifier.endsWith(".jsx")) {
      return nextResolve(specifier + ".js", context);
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  for (const [suffix, source] of Object.entries(STUBS)) {
    if (url.endsWith(suffix)) {
      return { format: "module", shortCircuit: true, source };
    }
  }
  return nextLoad(url, context);
}
`;

const WEEKLY_PROBE_SOURCE = `
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(new URL("./hooks.mjs", import.meta.url));

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
globalThis.__F = { dayLogs: scenario.dayLogs || [] };

const { AggregationService } = await import(${JSON.stringify(p("src/service/aggregationService.js"))});

const stats = await AggregationService.getWeeklyStats(scenario.reference);
process.stdout.write(JSON.stringify({
  range: stats.__range || null,
  dates: stats.weeklyDayLogs.map((l) => l.date),
}));
`;

const LABEL_PROBE_SOURCE = `
import { getLocalDateKey } from ${JSON.stringify(p("src/utils/date.js"))};
import { getPolicyTodayKey } from ${JSON.stringify(p("src/config/timePolicy.js"))};

const instant = process.argv[2];
const now = new Date(new Date(instant).getTime());
const accountKey = getPolicyTodayKey(now);
const [accountYear, accountMonth] = accountKey.split("-").map(Number);
process.stdout.write(JSON.stringify({
  device: getLocalDateKey(now),
  account: accountKey,
  deviceMonth: { year: now.getFullYear(), month: now.getMonth() + 1 },
  accountMonth: { year: accountYear, month: accountMonth },
}));
`;

writeFileSync(path.join(TMP, "hooks.mjs"), HOOKS_SOURCE);
writeFileSync(path.join(TMP, "weekly-probe.mjs"), WEEKLY_PROBE_SOURCE);
writeFileSync(path.join(TMP, "label-probe.mjs"), LABEL_PROBE_SOURCE);

function runWeeklyProbe(timeZone, scenario) {
  const scenarioFile = path.join(TMP, "weekly-scenario.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  return JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "weekly-probe.mjs"), scenarioFile], {
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

function runLabelProbe(timeZone, instant) {
  return JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "label-probe.mjs"), instant], {
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

// 1 — Behavioral weekly anchor: getWeeklyStats must accept the canonical
// Civil Date key and anchor the Saturday..Friday week OF THAT CIVIL DATE in
// every device timezone. 2026-09-12 is a Saturday; the seeded logs belong to
// the week 2026-09-12..2026-09-18. A device-local bridge (the E2 transport)
// re-projects the anchor into Asia/Tehran and lands on 2026-09-11 for
// east-of-Tehran devices — the previous week.
const WEEK_ANCHOR = "2026-09-12";
const WEEK_LOGS = [
  { date: "2026-09-12", mood: 4, status: "active", fullDay: false, entries: [] },
  { date: "2026-09-16", mood: 2, status: "active", fullDay: false, entries: [] },
];
const EXPECTED_DATES = ["2026-09-12", "2026-09-16"];

for (const tz of EXECUTION_TIMEZONES) {
  test(`weekly stats anchored on civil key ${WEEK_ANCHOR} in device TZ ${tz}`, () => {
    const out = runWeeklyProbe(tz, { reference: WEEK_ANCHOR, dayLogs: WEEK_LOGS });
    assert.deepEqual(out.dates, EXPECTED_DATES, JSON.stringify(out));
  });
}

// 1b — Calendar-boundary anchors: the week identity must stay pure civil
// arithmetic across month, year, and leap boundaries in every device TZ.
// Expected weeks are explicit Sat..Fri constants:
//   2026-09-30 → 2026-09-26..2026-10-02 (month boundary)
//   2026-12-31 → 2026-12-26..2027-01-01 (year boundary)
//   2028-02-29 → 2028-02-26..2028-03-03 (leap day)
const BOUNDARY_ANCHORS = [
  { anchor: "2026-09-30", expected: ["2026-09-26", "2026-10-02"] },
  { anchor: "2026-12-31", expected: ["2026-12-26", "2027-01-01"] },
  { anchor: "2028-02-29", expected: ["2028-02-26", "2028-03-03"] },
];
for (const { anchor, expected } of BOUNDARY_ANCHORS) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`weekly stats boundary anchor ${anchor} in device TZ ${tz}`, () => {
      const out = runWeeklyProbe(tz, {
        reference: anchor,
        dayLogs: expected.map((date) => ({ date, mood: 3, status: "active", fullDay: false, entries: [] })),
      });
      assert.deepEqual(out.dates, expected, JSON.stringify(out));
    });
  }
}

// 2 — Source contract: the weekly stats path must receive the Civil Date key
// directly. parseDateKeyLocal is a device-local PRESENTATION bridge; routing
// a Civil Date through it launders the account identity into the device
// clock before aggregationService re-projects it into the Account Timezone.
test("ReportsPage weekly stats must receive the policy civil anchor key (no device-local bridge)", () => {
  const source = src(REPORTS_PATH);
  assert.doesNotMatch(
    source,
    /getWeeklyStats\(parseDateKeyLocal/,
    "parseDateKeyLocal must not transport the week anchor: device-local midnight re-projected into Asia/Tehran shifts east-of-Tehran devices to the previous civil day"
  );
  assert.match(
    source,
    /getWeeklyStats\(weekAnchorKey\)/,
    "weekly stats must receive the policy civil anchor key directly"
  );
});

// 3 — Behavioral boundary probe for the advisor label: at Tehran midnight
// (20:30:00Z, Iran is UTC+03:30 fixed) the account civil date has rolled
// forward while a device in America/New_York is still on the previous date;
// conversely, Auckland is already on the next civil date while the account
// is still on the previous one. A CIVIL_DATE derived from the device clock
// therefore disagrees with the account identity around the boundary.
test("Tehran-midnight boundary: device-clock civil key diverges from the account civil key", () => {
  const nyBoundary = runLabelProbe("America/New_York", "2026-09-11T20:30:00Z");
  assert.equal(nyBoundary.device, "2026-09-11", "at Tehran midnight New York is still on the previous civil date");
  assert.equal(nyBoundary.account, "2026-09-12", "the account has rolled to the next civil date");
  const nyBefore = runLabelProbe("America/New_York", "2026-09-11T20:29:59Z");
  assert.equal(nyBefore.device, "2026-09-11", "one second before Tehran midnight the device date is unchanged");
  assert.equal(nyBefore.account, "2026-09-11", "one second before Tehran midnight both agree");
  const aklAhead = runLabelProbe("Pacific/Auckland", "2026-09-11T14:00:00Z");
  assert.equal(aklAhead.device, "2026-09-12", "Auckland runs a half-day ahead of Tehran around midday UTC");
  assert.equal(aklAhead.account, "2026-09-11", "the account is still on the previous civil date");
});

// 4 — Source contract: the advisor report label must project "now" through
// the Account Timezone (getPolicyTodayKey), not through the device clock.
test("advisor report label must use the account civil date, not the device clock", () => {
  const source = src(REPORTS_PATH);
  assert.doesNotMatch(
    source,
    /getLocalDateKey\(new Date\(nowMs\(\)\)\)/,
    "the generated-on label must not derive the civil date from the device clock"
  );
  assert.match(
    source,
    /toPersianDate\(getPolicyTodayKey\(\)\)/,
    "the generated-on label must project now through the Account Timezone"
  );
});

// 5 — Behavioral month-boundary matrix for the coach monthly review: the
// ACCOUNT civil month must flip 2026-09 → 2026-10 exactly at Tehran midnight
// (20:30:00Z, Iran is UTC+03:30 fixed) in every device timezone, while the
// DEVICE month demonstrably diverges (Kolkata/Dubai/Sydney/Auckland are
// already in October at 20:29:59Z). The review queries dayLogs by the CIVIL
// {year, month} hierarchy (getHierarchyFields contract), so a device-clock
// month would fetch the wrong month's logs.
const MONTH_BOUNDARY_MATRIX = [
  { instant: "2026-09-30T20:29:59Z", accountMonth: { year: 2026, month: 9 } },
  { instant: "2026-09-30T20:30:00Z", accountMonth: { year: 2026, month: 10 } },
  { instant: "2026-10-01T20:29:59Z", accountMonth: { year: 2026, month: 10 } },
  { instant: "2026-10-01T20:30:00Z", accountMonth: { year: 2026, month: 10 } },
];
for (const { instant, accountMonth } of MONTH_BOUNDARY_MATRIX) {
  test(`account civil month at ${instant} is device-TZ invariant`, () => {
    for (const tz of EXECUTION_TIMEZONES) {
      const out = runLabelProbe(tz, instant);
      assert.deepEqual(out.accountMonth, accountMonth, `device TZ ${tz}: ${JSON.stringify(out)}`);
    }
  });
}
test("month boundary: device-clock month diverges from the account month", () => {
  const out = runLabelProbe("Asia/Kolkata", "2026-09-30T20:29:59Z");
  assert.deepEqual(out.deviceMonth, { year: 2026, month: 10 }, "Kolkata is already in October before Tehran midnight");
  assert.deepEqual(out.accountMonth, { year: 2026, month: 9 }, "the account is still in September");
});

// 6 — Source contract: the coach monthly review must identify the month via
// the policy anchor (the E2 month helper), not the device clock.
test("monthly review must anchor the queried month on the policy civil date", () => {
  const source = src("src/pages/RoadmapPage.jsx");
  assert.doesNotMatch(
    source,
    /const year = now\.getFullYear\(\)/,
    "handleMonthlyReview must not derive the month from the device clock: around month boundaries devices outside Tehran fetch the previous month's logs"
  );
  assert.match(
    source,
    /getPolicyMonthAnchor\(0\)/,
    "handleMonthlyReview must use the policy month anchor"
  );
});

// 7 — Source contract: the roadmap markdown "generated-on" label must use
// the account civil date (same class as finding 2), not the device clock.
test("roadmap markdown label must use the account civil date, not the device clock", () => {
  const source = src("src/pages/RoadmapPage.jsx");
  assert.doesNotMatch(
    source,
    /new Date\(\)\.toLocaleDateString/,
    "the generated-on label must not format the device-clock date"
  );
  assert.match(
    source,
    /تاریخ تولید:\*\* \$\{toPersianDate\(getPolicyTodayKey\(\)\)\}/,
    "the generated-on label must project now through the Account Timezone"
  );
});
