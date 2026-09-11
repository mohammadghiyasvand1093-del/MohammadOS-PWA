// D1.9 — Aggregation "today" anchor tests (Account Timezone: Asia/Tehran).
//
// The real aggregationService is exercised in child processes. Its IndexedDB
// dependencies (src/db/database, repositories, SyncOutbox) are stubbed via a
// module load hook backed by globalThis.__D19; the temporal modules
// (src/utils/date.js, src/config/timePolicy.js) load unmodified. "Now" is
// injected with node:test mock timers so instant boundaries are deterministic.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const AGGREGATION_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/service/aggregationService.js")
).href;

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "d19-agg-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
const rows = (name) => (globalThis.__D19 && globalThis.__D19[name]) || [];
const keyOf = (r) => (r.date !== undefined ? r.date : r.id);
function makeTable(name) {
  return {
    async toArray() { return rows(name).slice(); },
    async get(key) { return rows(name).find((r) => keyOf(r) === key); },
    async put(rec) {
      const rs = rows(name);
      const i = rs.findIndex((r) => keyOf(r) === keyOf(rec));
      if (i >= 0) rs[i] = rec; else rs.push(rec);
      return keyOf(rec);
    },
    async delete(key) {
      const rs = rows(name);
      const i = rs.findIndex((r) => keyOf(r) === key);
      if (i >= 0) rs.splice(i, 1);
    },
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
  async getOrCreateByDate() { throw new Error("D1.9 stub: getOrCreateByDate not expected"); },
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
globalThis.__D19 = { dayLogs: scenario.dayLogs || [], habits: scenario.habits || [] };
const before = JSON.stringify(globalThis.__D19);

if (scenario.now) {
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
}

const { AggregationService } = await import(${JSON.stringify(AGGREGATION_URL)});

const results = {};
for (const call of scenario.calls) {
  const args = (call.args || []).map((a) =>
    a && typeof a === "object" && a.__date ? new Date(a.__date) : a
  );
  results[call.as || call.fn + ":" + (call.args || []).length] =
    await AggregationService[call.fn](...args);
}

process.stdout.write(
  JSON.stringify({ results, mutated: before !== JSON.stringify(globalThis.__D19) })
);
`;

writeFileSync(path.join(TMP, "hooks.mjs"), HOOKS_SOURCE);
writeFileSync(path.join(TMP, "probe.mjs"), PROBE_SOURCE);

function runAggregationProbe(timeZone, scenario) {
  const scenarioFile = path.join(TMP, "scenario.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  const stdout = execFileSync(
    process.execPath,
    [path.join(TMP, "probe.mjs"), scenarioFile],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" }
  );
  return JSON.parse(stdout);
}

// Tehran civil-day boundary: 20:30:00Z === 00:00:00 +0330 next day.
const MIDNIGHT_MATRIX = [
  { now: "2026-09-10T20:29:59Z", expectedToday: "2026-09-10" },
  { now: "2026-09-10T20:30:00Z", expectedToday: "2026-09-11" },
  { now: "2026-09-10T20:30:01Z", expectedToday: "2026-09-11" },
];

function dayLog(date, { fullDay = true, status = "active", mood = 3 } = {}) {
  const [year, month] = date.split("-").map(Number);
  return { date, year, month, fullDay, status, mood, entries: [] };
}

// A + B + C + H — today identity, TZ independence, correct DayLog read,
// and no regression when device TZ == Asia/Tehran.
for (const { now, expectedToday } of MIDNIGHT_MATRIX) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`getTodayStats reads the Account Civil Date ${expectedToday} at ${now} (device TZ ${tz})`, async () => {
      const out = runAggregationProbe(tz, {
        now,
        dayLogs: [dayLog("2026-09-10", { mood: 1 }), dayLog("2026-09-11", { mood: 5 })],
        calls: [{ fn: "getTodayStats" }],
      });

      assert.equal(out.results["getTodayStats:0"].dayLog.date, expectedToday);
      assert.equal(out.results["getTodayStats:0"].mood, expectedToday === "2026-09-11" ? 5 : 1);
      assert.equal(out.mutated, false, "aggregation must be read-only");
    });
  }
}

// D — streak via the real getTodayStats path.
// At 2026-09-11T20:30:00Z the Account today is Sat 2026-09-12 (full), Fri
// 2026-09-11 is excluded, 2026-09-10 is full, 2026-09-09 is missing.
// Policy streak = 2. The legacy device anchor computes "today" as Fri
// 2026-09-11 in UTC/NY, skips it, and returns 1.
for (const tz of EXECUTION_TIMEZONES) {
  test(`computeStreak (via getTodayStats) counts the Account Civil Date (device TZ ${tz})`, async () => {
    const out = runAggregationProbe(tz, {
      now: "2026-09-11T20:30:00Z",
      dayLogs: [
        dayLog("2026-09-12"),
        dayLog("2026-09-10"),
      ],
      calls: [{ fn: "getTodayStats" }, { fn: "getVitals" }],
    });

    assert.equal(out.results["getTodayStats:0"].streak, 2);
    assert.equal(out.results["getVitals:0"].streak, 2);
    assert.equal(out.mutated, false);
  });

  test(`streak keeps Friday exclusion and frozen skip on Account dates (device TZ ${tz})`, async () => {
    // Account today: Sat 2026-09-12 (not full). Fri 2026-09-11 must be
    // skipped; frozen 2026-09-09 skipped; full 09-10, 09-08 counted.
    const out = runAggregationProbe(tz, {
      now: "2026-09-12T08:00:00Z",
      dayLogs: [
        dayLog("2026-09-12", { fullDay: false }),
        dayLog("2026-09-11"),
        dayLog("2026-09-10"),
        dayLog("2026-09-09", { status: "frozen" }),
        dayLog("2026-09-08"),
      ],
      calls: [{ fn: "getTodayStats" }],
    });

    assert.equal(out.results["getTodayStats:0"].streak, 2);
  });
}

// E — heatmap window is anchored on the Account Civil Date.
for (const tz of EXECUTION_TIMEZONES) {
  test(`getHeatmapData window ends on the Account Civil Date (device TZ ${tz})`, async () => {
    const out = runAggregationProbe(tz, {
      now: "2026-09-10T20:30:00Z", // Account today: 2026-09-11
      dayLogs: [],
      calls: [{ fn: "getHeatmapData", args: [7] }],
    });

    const days = out.results["getHeatmapData:1"];
    assert.equal(days.length, 7);
    assert.deepEqual(
      days.map((d) => d.date),
      ["2026-09-05", "2026-09-06", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11"]
    );
    assert.equal(out.mutated, false);
  });
}

// F — getWeekRange regression via getWeeklyStats: Saturday..Friday identity
// must remain identical for the five reference instants, in every timezone.
const WEEK_REFERENCES = [
  { ref: "2026-09-11T12:00:00Z", expected: ["2026-09-05", "2026-09-11"] },
  { ref: "2026-09-12T12:00:00Z", expected: ["2026-09-12", "2026-09-18"] },
  { ref: "2026-12-31T12:00:00Z", expected: ["2026-12-26", "2027-01-01"] },
  { ref: "2027-01-01T12:00:00Z", expected: ["2026-12-26", "2027-01-01"] },
  { ref: "2027-01-02T12:00:00Z", expected: ["2027-01-02", "2027-01-08"] },
];

for (const tz of EXECUTION_TIMEZONES) {
  for (const { ref, expected } of WEEK_REFERENCES) {
    test(`getWeeklyStats keeps Saturday..Friday week for ${ref.slice(0, 10)} (device TZ ${tz})`, async () => {
      const seed = [];
      // One log inside the expected week and one in each adjacent week.
      seed.push(dayLog(expected[0]));
      seed.push(dayLog(expected[1]));
      const before = expected[0] < "2026-09-05" ? "2025-12-01" : "2026-01-01";
      const [y, m] = before.split("-").map(Number);
      seed.push({ date: before, year: y, month: m, fullDay: true, status: "active", mood: 3, entries: [] });
      seed.push(dayLog("2027-12-31"));

      const out = runAggregationProbe(tz, {
        now: ref, // only used as the reference-date fallback; explicit ref below
        dayLogs: seed,
        calls: [{ fn: "getWeeklyStats", args: [{ __date: ref }] }],
      });

      const logs = out.results["getWeeklyStats:1"].weeklyDayLogs;
      assert.ok(logs.every((l) => l.date >= expected[0] && l.date <= expected[1]));
      assert.ok(logs.some((l) => l.date === expected[0]));
      assert.ok(logs.some((l) => l.date === expected[1]));
      assert.equal(out.mutated, false);
    });
  }
}

// H — regression: with device TZ == Asia/Tehran results are unchanged and
// identical across all device timezones for the same instant.
test("aggregation results are identical across device timezones (regression + independence)", async () => {
  const scenario = {
    now: "2026-09-10T20:30:00Z",
    dayLogs: [
      dayLog("2026-09-11"),
      dayLog("2026-09-10"),
      dayLog("2026-09-09", { status: "frozen" }),
      dayLog("2026-09-08"),
    ],
    calls: [
      { fn: "getTodayStats" },
      { fn: "getVitals" },
      { fn: "getHeatmapData", args: [90] },
      { fn: "getDomainTrend", args: [6] },
      { fn: "getAnalyticsTrend", args: [12] },
      { fn: "getMoodDistribution", args: [90] },
    ],
  };

  const runs = EXECUTION_TIMEZONES.map((tz) => JSON.stringify(runAggregationProbe(tz, scenario)));
  assert.ok(runs.every((r) => r === runs[0]), "results must not depend on the device timezone");
});
