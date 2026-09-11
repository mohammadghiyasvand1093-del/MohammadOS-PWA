// D1.10-D — date.js Civil-Date utility tests (deterministic weekday semantics).
//
// src/utils/date.js is a pure ESM module, so the real utilities are imported
// directly in child processes whose only variable is the device timezone
// (TZ=UTC / Asia/Tehran / America/New_York). Expected weekday values are
// explicit constants — never recomputed with a Date.
//
// Persian index contract (as documented in src/utils/date.js and used by the
// whole system): 0=Saturday, 1=Sunday, 2=Monday, 3=Tuesday, 4=Wednesday,
// 5=Thursday, 6=Friday. English names: sunday..saturday (JS index).

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const DATE_SOURCE_PATH = path.resolve(PROJECT_ROOT, "src/utils/date.js");
const DATE_URL = pathToFileURL(DATE_SOURCE_PATH).href;

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "d10d-dateutils-"));

// Simple probe: import the real date.js in a child process with a fixed TZ
// and evaluate a scenario of utility calls.
const PROBE_SOURCE = `
import { readFileSync } from "node:fs";

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
const utils = await import(${JSON.stringify(DATE_URL)});

const results = {};
for (const call of scenario.calls) {
  const value = await utils[call.fn](...call.args);
  results[call.as || call.fn + ":" + JSON.stringify(call.args)] =
    value instanceof Date
      ? { year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate() }
      : value;
}

process.stdout.write(JSON.stringify(results));
`;

writeFileSync(path.join(TMP, "probe.mjs"), PROBE_SOURCE);

function runProbe(timeZone, calls) {
  const scenarioFile = path.join(TMP, "scenario.json");
  writeFileSync(scenarioFile, JSON.stringify({ calls }));
  const stdout = execFileSync(
    process.execPath,
    [path.join(TMP, "probe.mjs"), scenarioFile],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" }
  );
  return JSON.parse(stdout);
}

const CIVIL_DATES = [
  "2026-09-10", // Thursday
  "2026-09-11", // Friday
  "2026-09-12", // Saturday
  "2026-12-31", // Thursday
  "2027-01-01", // Friday
  "2027-01-02", // Saturday
];

const PERSIAN_INDEX = {
  "2026-09-10": 5,
  "2026-09-11": 6,
  "2026-09-12": 0,
  "2026-12-31": 5,
  "2027-01-01": 6,
  "2027-01-02": 0,
};

const EN_NAME = {
  "2026-09-10": "thursday",
  "2026-09-11": "friday",
  "2026-09-12": "saturday",
  "2026-12-31": "thursday",
  "2027-01-01": "friday",
  "2027-01-02": "saturday",
};

// Architecture guard: the exported Civil-Date weekday helpers must derive
// weekday deterministically from the Civil Date, not through the
// device-local parseDateKeyLocal → Date.getDay() path.
test("weekday helpers must not source weekday from parseDateKeyLocal/getDay", () => {
  const source = readFileSync(DATE_SOURCE_PATH, "utf8");
  const helperBodies = {
    getDayOfWeekFromDateKey: source.match(
      /export function getDayOfWeekFromDateKey[\s\S]*?\n\}/
    )?.[0],
    getDayEnFromDateKey: source.match(
      /export function getDayEnFromDateKey[\s\S]*?\n\}/
    )?.[0],
  };
  assert.ok(helperBodies.getDayOfWeekFromDateKey, "helper must exist");
  assert.ok(helperBodies.getDayEnFromDateKey, "helper must exist");
  assert.doesNotMatch(
    helperBodies.getDayOfWeekFromDateKey,
    /parseDateKeyLocal|\.getDay\(\)/,
    "Persian weekday must be UTC-calendar deterministic"
  );
  assert.doesNotMatch(
    helperBodies.getDayEnFromDateKey,
    /parseDateKeyLocal|\.getDay\(\)/,
    "English weekday must be UTC-calendar deterministic"
  );
});

// Invalid input contract (documented as canonical-input-only): the helpers
// must return the documented null fallback, never consult the device clock.
test("invalid input returns the documented null fallback (no device-clock fallback)", () => {
  const results = runProbe(process.env.TZ || "UTC", [
    { fn: "getDayOfWeekFromDateKey", args: [null] },
    { fn: "getDayOfWeekFromDateKey", args: ["garbage"] },
    { fn: "getDayOfWeekFromDateKey", args: ["2026-13-40"] },
    { fn: "getDayEnFromDateKey", args: [null] },
    { fn: "getDayEnFromDateKey", args: ["garbage"] },
    { fn: "getDayEnFromDateKey", args: ["2026"] },
  ]);
  assert.equal(results["getDayOfWeekFromDateKey:[null]"], null);
  assert.equal(results['getDayOfWeekFromDateKey:["garbage"]'], null);
  assert.equal(results['getDayOfWeekFromDateKey:["2026-13-40"]'], null);
  assert.equal(results["getDayEnFromDateKey:[null]"], null);
  assert.equal(results['getDayEnFromDateKey:["garbage"]'], null);
  assert.equal(results['getDayEnFromDateKey:["2026"]'], null);
});

for (const tz of EXECUTION_TIMEZONES) {
  test(`getDayOfWeekFromDateKey Persian index is TZ-invariant (device TZ ${tz})`, () => {
    const results = runProbe(tz, CIVIL_DATES.map((d) => ({
      fn: "getDayOfWeekFromDateKey",
      args: [d],
      as: d,
    })));
    for (const d of CIVIL_DATES) assert.equal(results[d], PERSIAN_INDEX[d], d);
  });

  test(`getDayEnFromDateKey English name is TZ-invariant (device TZ ${tz})`, () => {
    const results = runProbe(tz, CIVIL_DATES.map((d) => ({
      fn: "getDayEnFromDateKey",
      args: [d],
      as: d,
    })));
    for (const d of CIVIL_DATES) assert.equal(results[d], EN_NAME[d], d);
  });

  test(`getHierarchyFields returns the Civil Date's own year/month (device TZ ${tz})`, () => {
    const results = runProbe(tz, [
      { fn: "getHierarchyFields", args: ["2026-09-11"], as: "sep" },
      { fn: "getHierarchyFields", args: ["2026-12-31"], as: "dec" },
      { fn: "getHierarchyFields", args: ["2027-01-01"], as: "jan" },
    ]);
    assert.deepEqual(results.sep, { year: 2026, month: 9 });
    assert.deepEqual(results.dec, { year: 2026, month: 12 });
    assert.deepEqual(results.jan, { year: 2027, month: 1 });
  });

  test(`parseDateKeyLocal maps a Civil Date to its own local calendar day (device TZ ${tz})`, () => {
    const results = runProbe(tz, [
      { fn: "parseDateKeyLocal", args: ["2026-09-11"], as: "sep" },
      { fn: "parseDateKeyLocal", args: ["2027-01-02"], as: "jan" },
    ]);
    // The probe returns the local calendar components of the parsed Date;
    // they must equal the input Civil Date's components in the executing TZ.
    assert.deepEqual(results.sep, { year: 2026, month: 9, day: 11 });
    assert.deepEqual(results.jan, { year: 2027, month: 1, day: 2 });
  });
}

// Regression: the weekday/hierarchy utilities stay identical across device
// timezones for every canonical Civil Date.
test("weekday and hierarchy utilities are identical across device timezones", () => {
  for (const d of ["2026-09-10", "2026-09-11", "2026-09-12", "2026-12-31", "2027-01-01", "2027-01-02"]) {
    const runs = EXECUTION_TIMEZONES.map((tz) =>
      JSON.stringify({
        w: runProbe(tz, [{ fn: "getDayOfWeekFromDateKey", args: [d] }]),
        e: runProbe(tz, [{ fn: "getDayEnFromDateKey", args: [d] }]),
        h: runProbe(tz, [{ fn: "getHierarchyFields", args: [d] }]),
      })
    );
    assert.ok(runs.every((r) => r === runs[0]), d);
  }
});
