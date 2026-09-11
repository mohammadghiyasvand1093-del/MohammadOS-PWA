// D1.10-C — Habit recurrence weekday tests (Civil Date → deterministic weekday).
//
// The REAL DayLogRepository is exercised in child processes; only its IndexedDB
// and sync dependencies (db/database, ScheduleRepository, SyncOutbox) are
// stubbed via a module load hook. Recurrence observability uses the real
// getOrCreateByDate path: with no schedule provider stubbed, the created
// dayLog's entries contain exactly the habit entries that
// isHabitActiveOnDate admitted.
//
// Expected weekday values are explicit constants (2026-09-11 is a Friday,
// 2026-12-31 a Thursday, 2027-01-01 a Friday, 2027-01-02 a Saturday) — never
// recomputed with a Date. The Persian index used by recurrence is 0=Saturday
// … 6=Friday (as documented in src/utils/date.js).

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const REPO_SOURCE_PATH = path.resolve(
  PROJECT_ROOT,
  "src/repositories/DayLogRepository.js"
);
const REPO_URL = pathToFileURL(REPO_SOURCE_PATH).href;

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "d10c-recurrence-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
const rows = (name) => (globalThis.__D19 && globalThis.__D19[name]) || [];
function makeTable(name) {
  return {
    async toArray() { return rows(name).slice(); },
    async get(key) { return rows(name).find((r) => r.date === key); },
    async put(rec) { rows(name).push(rec); return rec.date; },
    async delete() {},
    update() {},
    where() { return { count: async () => 0, toArray: async () => [] }; },
  };
}
export const db = {
  dayLogs: makeTable("dayLogs"),
  habits: makeTable("habits"),
  schedules: makeTable("schedules"),
  syncOutbox: makeTable("syncOutbox"),
  transaction(...args) { return args[args.length - 1](); },
};
\`,
  "src/repositories/ScheduleRepository.js": \`
export const ScheduleRepository = { async getScheduleForDate() { return null; } };
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
globalThis.__D19 = { habits: scenario.habits || [], dayLogs: [] };

const { DayLogRepository } = await import(${JSON.stringify(REPO_URL)});

const results = {};
for (const dateKey of scenario.dates) {
  const dayLog = await DayLogRepository.getOrCreateByDate(dateKey);
  results[dateKey] = (dayLog.entries || [])
    .filter((e) => e.category === "habit")
    .map((e) => e.refId);
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

function habit(id, recurrence, date = "2026-01-01") {
  return {
    id,
    name: "habit-" + id,
    domain: "discipline",
    recurrence,
    isCritical: false,
    done: false,
    date,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    habitStrength: 0.5,
    lastEmaDate: null,
    strengthBeforeToday: 0,
  };
}

// Architectural RED guard — fails while recurrence derives its weekday from
// the device-local helper getDayOfWeekFromDateKey (parseDateKeyLocal + getDay).
test("recurrence must not derive weekday from the device-local date helper", () => {
  const source = readFileSync(REPO_SOURCE_PATH, "utf8");
  assert.equal(
    /getDayOfWeekFromDateKey/.test(source),
    false,
    "DayLogRepository must compute the weekday of a Civil Date deterministically, not via the device-local helper"
  );
});

// Section 10/11 — Friday-only habit (Persian index 6) on the September
// boundary, identical across all device timezones.
const FRIDAY_DATES = {
  "2026-09-10": [], // Thursday
  "2026-09-11": ["fri"], // Friday — active
  "2026-09-12": [], // Saturday
};

for (const tz of EXECUTION_TIMEZONES) {
  test(`Friday-only recurrence admits exactly the Friday Civil Date (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      habits: [habit("fri", { type: "weekly", days: [6] })],
      dates: Object.keys(FRIDAY_DATES),
    });

    for (const [dateKey, expected] of Object.entries(FRIDAY_DATES)) {
      assert.deepEqual(results[dateKey], expected, dateKey);
    }
  });

  // Section 13 — real recurrence model combinations on the same boundary.
  // Persian index: 0=Sat, 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri.
  test(`weekly [1,5] (Sun+Thu) and [0,2,5] (Sat+Tue+Thu) recurrences (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      habits: [
        habit("sunThu", { type: "weekly", days: [1, 5] }),
        habit("satTueThu", { type: "weekly", days: [0, 2, 5] }),
      ],
      dates: [
        "2026-09-10", // Thu → both active
        "2026-09-11", // Fri → both inactive
        "2026-09-12", // Sat → tueThuSat active
        "2026-09-13", // Sun → sunThu active
      ],
    });

    assert.deepEqual(results["2026-09-10"], ["sunThu", "satTueThu"]);
    assert.deepEqual(results["2026-09-11"], []);
    assert.deepEqual(results["2026-09-12"], ["satTueThu"]);
    assert.deepEqual(results["2026-09-13"], ["sunThu"]);
  });

  // Section 12 — month/year boundary Thursdays/Fridays/Saturdays.
  test(`year-boundary weekday admission (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      habits: [
        habit("thuOnly", { type: "weekly", days: [5] }),
        habit("friOnly", { type: "weekly", days: [6] }),
        habit("satOnly", { type: "weekly", days: [0] }),
      ],
      dates: ["2026-12-31", "2027-01-01", "2027-01-02"],
    });

    assert.deepEqual(results["2026-12-31"], ["thuOnly"]); // Thursday
    assert.deepEqual(results["2027-01-01"], ["friOnly"]); // Friday
    assert.deepEqual(results["2027-01-02"], ["satOnly"]); // Saturday
  });

  // Daily recurrence: active on every Civil Date except Friday.
  test(`daily recurrence excludes only Friday (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      habits: [habit("daily", { type: "daily" })],
      dates: ["2026-09-10", "2026-09-11", "2026-09-12"],
    });

    assert.deepEqual(results["2026-09-10"], ["daily"]);
    assert.deepEqual(results["2026-09-11"], [], "daily habits must stay off on Friday");
    assert.deepEqual(results["2026-09-12"], ["daily"]);
  });

  // Contract preservation — habits starting after the target date are inert;
  // start-date comparison is plain Civil Date string ordering.
  test(`habit start-date gating is preserved (device TZ ${tz})`, async () => {
    const results = runProbe(tz, {
      habits: [
        habit("lateFri", { type: "weekly", days: [6] }, "2026-10-01"),
        habit("earlyFri", { type: "weekly", days: [6] }, "2026-09-01"),
      ],
      dates: ["2026-09-11"],
    });

    assert.deepEqual(results["2026-09-11"], ["earlyFri"]);
  });
}
