// D1.10-B — weekday helper tests (Civil Date → deterministic weekday).
//
// The real aggregationService is exercised in child processes (only the
// IndexedDB dependencies are stubbed via a module load hook). The behavioral
// tests assert the real Friday-exclusion business rules with explicit
// expected values (never recomputed with a Date). The source test is the
// architectural RED guard: Civil Dates must not be parsed into device-local
// Date objects for weekday decisions.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const AGGREGATION_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/service/aggregationService.js")
).href;
const AGGREGATION_SOURCE_PATH = path.resolve(
  PROJECT_ROOT,
  "src/service/aggregationService.js"
);

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "d10b-weekday-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
const rows = (name) => (globalThis.__D19 && globalThis.__D19[name]) || [];
function makeTable(name) {
  return {
    async toArray() { return rows(name).slice(); },
    async get(key) { return rows(name).find((r) => r.date === key); },
    async put(rec) { rows(name).push(rec); return rec.date; },
    async delete(key) {},
    where(spec) {
      if (typeof spec === "string") {
        return {
          belowOrEqual: (v) => ({ toArray: async () => rows(name).filter((r) => r.date <= v) }),
          aboveOrEqual: (v) => ({ toArray: async () => rows(name).filter((r) => r.date >= v) }),
          between: (a, b) => ({ toArray: async () => rows(name).filter((r) => r.date >= a && r.date <= b) }),
        };
      }
      return { toArray: async () => rows(name).filter((r) => r.year === spec.year && r.month === spec.month) };
    },
  };
}
export const db = { dayLogs: makeTable("dayLogs"), habits: makeTable("habits") };
\`,
  "src/repositories/DayLogRepository.js": \`
const rows = () => (globalThis.__D19 && globalThis.__D19.dayLogs) || [];
export const DayLogRepository = {
  async getByDate(dateKey) { return rows().find((r) => r.date === dateKey) || null; },
  async getMonthLogs(year, month) { return rows().filter((r) => r.year === year && r.month === month); },
  async recomputeAndSave(dayLog) { return dayLog; },
};
export function buildEntriesFromSchedule() { return []; }
\`,
  "src/repositories/ScheduleRepository.js": \`
export const ScheduleRepository = { async getScheduleForDate() { return null; } };
\`,
  "src/repositories/TimerRepository.js": \`
export const TimerRepository = { async getActive() { return null; } };
\`,
  "src/sync/SyncOutbox.js": \`
export async function enqueueMutation() {}
\`,
};

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".") && !specifier.endsWith(".js")) {
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

const PROBE_SOURCE = `
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(new URL("./hooks.mjs", import.meta.url));

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
globalThis.__D19 = { dayLogs: scenario.dayLogs || [], habits: [] };

const RealDate = globalThis.Date;
const FIXED = RealDate.parse(scenario.now);
class FakeDate extends RealDate {
  constructor(...args) {
    if (args.length === 0) super(FIXED);
    else super(...args);
  }
  static now() { return FIXED; }
}
globalThis.Date = FakeDate;

const { AggregationService } = await import(${JSON.stringify(AGGREGATION_URL)});

const results = {};
for (const call of scenario.calls) {
  results[call.as || call.fn] = await AggregationService[call.fn](...(call.args || []));
}

process.stdout.write(JSON.stringify({ results }));
`;

writeFileSync(path.join(TMP, "hooks.mjs"), HOOKS_SOURCE);
writeFileSync(path.join(TMP, "probe.mjs"), PROBE_SOURCE);

function runProbe(timeZone, scenario) {
  const scenarioFile = path.join(TMP, "scenario.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  const stdout = execFileSync(
    process.execPath,
    [path.join(TMP, "probe.mjs"), scenarioFile],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" }
  );
  return JSON.parse(stdout).results;
}

function dayLog(date, { fullDay = true, status = "active", entries = [] } = {}) {
  const [year, month] = date.split("-").map(Number);
  return { date, year, month, fullDay, status, mood: 3, entries };
}

// Architectural RED guard — fails while Civil Dates are parsed into
// device-local Dates ("...T00:00:00") for weekday decisions.
test("weekday decisions must not parse Civil Dates into device-local Dates", () => {
  const source = readFileSync(AGGREGATION_SOURCE_PATH, "utf8");
  assert.equal(
    /new Date\([^)]*T00:00:00/.test(source),
    false,
    "aggregationService must derive weekday from the Civil Date itself, not a local-timezone Date"
  );
});

// Test A/B/C + calendar matrix — September 2026 (Thu 10, Fri 11, Sat 12,
// Thu 17, Fri 18, Sat 19). Fridays must be excluded from month rates:
// rateable days = 4 (10, 12, 17, 19), of which 2 are full → 50%.
// If Friday were (wrongly) included: 3/5 → 60%.
for (const tz of EXECUTION_TIMEZONES) {
  test(`September 2026 Friday exclusion via getMonthStats (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      now: "2026-09-20T10:00:00Z",
      dayLogs: [
        dayLog("2026-09-10", { fullDay: false }),
        dayLog("2026-09-11"), // Friday — must be excluded
        dayLog("2026-09-12"),
        dayLog("2026-09-17", { fullDay: false }),
        dayLog("2026-09-18"), // Friday — must be excluded
        dayLog("2026-09-19"),
      ],
      calls: [{ fn: "getMonthStats", args: [2026, 9] }],
    });

    const stats = results.getMonthStats;
    assert.equal(stats.totalDays, 4);
    assert.equal(stats.fullDays, 2);
    assert.equal(stats.monthRate, 50);
  });

  // Year boundary: Thu 2026-12-31, Fri 2027-01-01, Sat 2027-01-02.
  // January 2027 rateable days exclude Friday 01-01 → only 01-02,
  // which is not full → 0%. If Friday were included: 1/2 → 50%.
  test(`year boundary Friday exclusion via getMonthStats (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      now: "2027-01-03T10:00:00Z",
      dayLogs: [
        dayLog("2026-12-31"),
        dayLog("2027-01-01"), // Friday — must be excluded
        dayLog("2027-01-02", { fullDay: false }),
      ],
      calls: [{ fn: "getMonthStats", args: [2027, 1] }],
    });

    const stats = results.getMonthStats;
    assert.equal(stats.totalDays, 1);
    assert.equal(stats.fullDays, 0);
    assert.equal(stats.monthRate, 0);
  });

  // getDomainTrend: the week containing Friday 2026-09-11 must exclude it.
  // Week w=1 spans 2026-09-05..2026-09-11; only seeded log is Friday's
  // fitness entry → fitness must be 0%. If Friday were included: 100%.
  // Current week (w=0, 09-12..09-14) sanity: 1 of 2 learning entries done → 50%.
  test(`getDomainTrend excludes Friday entries (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      now: "2026-09-14T10:00:00Z",
      dayLogs: [
        dayLog("2026-09-11", {
          entries: [{ id: "e1", domain: "fitness", done: true }],
        }),
        dayLog("2026-09-12", {
          entries: [{ id: "e2", domain: "learning", done: true }],
        }),
        dayLog("2026-09-13", {
          entries: [{ id: "e3", domain: "learning", done: false }],
        }),
      ],
      calls: [{ fn: "getDomainTrend", args: [2] }],
    });

    const trend = results.getDomainTrend;
    assert.equal(trend.length, 2);
    // Weeks are emitted oldest-first: trend[0] = 09-05..09-11 (Friday-only
    // seeded week), trend[1] = current week 09-12..09-14.
    assert.equal(trend[0].domains.fitness, 0, "Friday 2026-09-11 entries must be excluded");
    assert.equal(trend[0].domains.learning, 0);
    assert.equal(trend[1].domains.learning, 50);
  });
}
