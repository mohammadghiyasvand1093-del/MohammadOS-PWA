// D1.10-E2 — ReportsPage temporal producer tests (Account TZ: Asia/Tehran).
//
// ReportsPage's month anchor is exposed as the named export
// getPolicyMonthAnchor(monthOffset) so the CIVIL_DATE month identity can be
// probed behaviorally: same Instant + same Account Timezone + different
// device TZ must give the same month, including the Tehran-midnight month
// rollover. The remaining migrated producers (dated defaults, week
// navigation, heatmap window) are covered by source-contract assertions that
// pair the absent device pattern with the required policy call path.
//
// The IndexedDB / repository / service layer is stubbed via a module load
// hook so the real ReportsPage module (and its real date/timePolicy
// imports) load inside a child process with a fixed device TZ and a fake
// Date for "now".

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

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "e2-reports-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": "export const db = {};",
  "src/repositories/ScheduleRepository.js": "export const ScheduleRepository = {};",
  "src/repositories/GateRepository.js": "export const GateRepository = { async getAll() { return []; } };",
  "src/service/aggregationService.js": "export const AggregationService = {};",
  "src/app/ImportService.js": "export const ImportService = {}; export const IMPORT_TABLES = []; export async function importDatedSchedule() {} export async function importWeeklySchedule() {}",
  "src/app/exportData.js": "export async function exportToJSON() {} export async function exportToCSV() {}",
  "src/sync/SyncOutbox.js": "export async function enqueueMutation() {}",
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

const PROBE_SOURCE = `
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(new URL("./hooks.mjs", import.meta.url));

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));

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

const { getPolicyMonthAnchor } = await import(${JSON.stringify(p("src/utils/date.js"))});
process.stdout.write(JSON.stringify(getPolicyMonthAnchor(scenario.offset ?? 0)));
`;

writeFileSync(path.join(TMP, "hooks.mjs"), HOOKS_SOURCE);
writeFileSync(path.join(TMP, "probe.mjs"), PROBE_SOURCE);

function runProbe(timeZone, scenario) {
  const scenarioFile = path.join(TMP, "scenario.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  return JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "probe.mjs"), scenarioFile], {
      env: { ...process.env, TZ: timeZone },
      encoding: "utf8",
    })
  );
}

// 1 — Behavioral month anchor: the month identity must follow the ACCOUNT
// civil date. At the Tehran midnight boundary 2026-09-30T20:30:00Z the
// account date rolls Sep→Oct, so the default report month must flip to
// October in every device timezone.
const MONTH_MATRIX = [
  { now: "2026-09-11T20:29:59Z", offset: 0, year: 2026, month: 9 },
  { now: "2026-09-30T20:29:59Z", offset: 0, year: 2026, month: 9 },
  { now: "2026-09-30T20:30:00Z", offset: 0, year: 2026, month: 10 },
  { now: "2026-09-30T20:30:01Z", offset: 0, year: 2026, month: 10 },
  // Year rollover through the account date.
  { now: "2026-12-31T20:30:00Z", offset: 0, year: 2027, month: 1 },
  { now: "2026-12-31T20:30:00Z", offset: -1, year: 2026, month: 12 },
  // Navigation arithmetic (no device day-of-month clamp).
  { now: "2026-09-30T20:30:00Z", offset: 1, year: 2026, month: 11 },
];

for (const { now, offset, year, month } of MONTH_MATRIX) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`report month anchor ${year}-${String(month).padStart(2, "0")} (offset ${offset}) at ${now} (device TZ ${tz})`, () => {
      const out = runProbe(tz, { now, offset });
      assert.deepEqual(out, { year, month }, JSON.stringify(out));
    });
  }
}

// 2 — Month-anchor overflow contract: with the account date 2026-01-31,
// "next month" must be February. The legacy device setMonth anchor clamped
// Jan-31 + 1 month into March (skip), which this migration intentionally
// corrects; the test pins the correct semantics in every device timezone.
for (const tz of EXECUTION_TIMEZONES) {
  test(`next month from account date 2026-01-31 is February (device TZ ${tz})`, () => {
    const out = runProbe(tz, { now: "2026-01-31T09:00:00Z", offset: 1 });
    assert.deepEqual(out, { year: 2026, month: 2 });
  });
}

// 3 — Source contracts: every migrated producer must project through the
// policy and must not keep a device-now anchor; each pairing is semantic
// (absent unsafe pattern + required policy path + intact call path).
test("dated export defaults use the policy date", () => {
  const source = src(REPORTS_PATH);
  assert.doesNotMatch(
    source.match(/const \[datedStartDate[\s\S]*?;[\s\S]*?const \[datedEndDate[\s\S]*?;/)?.[0] ?? "",
    /getLocalDateKey\(\s*new Date\(\)/,
    "device-now default must be absent"
  );
  assert.match(source, /useState\(getPolicyTodayKey\(\)\)/, "start default must be the policy date");
  assert.match(source, /addDaysToDateKey\(getPolicyTodayKey\(\), 29\)/, "end default must shift the policy date civilly");
});

test("week navigation anchors on the policy date with civil day shifts", () => {
  const source = src(REPORTS_PATH);
  assert.equal(
    /new Date\(nowMs\(\)\)\s*;?\s*base\.setDate/.test(source),
    false,
    "device-now week anchor must be absent"
  );
  assert.match(source, /addCivilDays\(getPolicyTodayKey\(\),\s*weekOffset \* 7\)/, "week anchor must be civil");
  assert.match(source, /getPersianWeekKey\(weekAnchorKey\)/, "week key must come from the civil anchor key");
  assert.match(source, /getWeeklyStats\(weekAnchorKey\)/, "weekly stats must receive the anchor Civil Date key directly (D1.10-F: no device-local bridge)");
});

test("month effect consumes the exported policy month anchor", () => {
  const source = src(REPORTS_PATH);
  assert.equal(
    /base\.setMonth\(base\.getMonth\(\) \+ monthOffset\)/.test(source),
    false,
    "device setMonth anchor must be absent"
  );
  assert.match(source, /getPolicyMonthAnchor\(monthOffset\)/, "month identity must come from the policy anchor");
  assert.match(source, /const monthAnchor = getPolicyMonthAnchor\(monthOffset\);/, "month anchor must come from the policy helper");
  assert.match(source, /getMonthStats\(monthAnchor\.year, monthAnchor\.month\)/, "getMonthStats call path must remain intact");
});

test("heatmap window is anchored on the policy date", () => {
  const source = src(REPORTS_PATH);
  const heatmap = source.match(/const heatmapDays = useMemo\([\s\S]*?\n {2}\}, \[heatmapMap\]\);/)?.[0] ?? "";
  assert.ok(heatmap, "heatmapDays block must exist");
  assert.doesNotMatch(heatmap, /new Date\(nowMs\(\)\)/, "device-now heatmap anchor must be absent");
  assert.match(heatmap, /const todayKey = getPolicyTodayKey\(\);/, "heatmap anchor must be the policy date");
  assert.match(heatmap, /addDaysToDateKey\(todayKey, -i\)/, "heatmap dates must shift the policy date civilly");
  assert.match(heatmap, /i >= 0; i--/, "90-day reverse iteration must remain intact");
});
