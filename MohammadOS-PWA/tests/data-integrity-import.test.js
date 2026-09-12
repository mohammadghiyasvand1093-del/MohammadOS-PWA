// D1.10-G — data integrity / import validation contract tests.
//
// The backup-import pipeline stores validated records RAW (ImportService:
// validate → transaction → clear() + bulkPut), so every temporal field the
// validator accepts lands verbatim in IndexedDB — including indexed
// Civil Date fields. These tests pin the import contract: any persisted
// temporal field must be a canonical, calendar-valid YYYY-MM-DD Civil Date
// (or absent/explicitly-null where the app itself writes null), and derived
// hierarchy numbers on dayLogs must agree with the Civil Date they claim.
//
// Part A runs the REAL validateImportPayload in-process (pure module).
// Part B runs the REAL importRoadmapFromJSON in a child process with
// IndexedDB stubbed, because that path bypasses validateImportPayload and
// previously accepted arbitrary deadline values.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const p = (rel) => pathToFileURL(path.resolve(PROJECT_ROOT, rel)).href;

const VALID_DATE = "2026-09-12";

const IMPOSSIBLE_DATES = [
  "2026-02-29", // non-leap
  "2027-02-29", // non-leap
  "2026-13-01",
  "2026-00-01",
  "2026-09-00",
  "2026-09-31",
];

const WRONG_FORMATS = [
  "abc",
  "2026/09/12",
  "2026-9-12", // would be accepted by lenient Date parsing — must fail
  "09-12-2026",
  "2026-09-12T00:00:00Z", // ISO timestamp where Civil Date is required
  "2026-09-12T20:30:00Z",
  "",
];

function baseSession(date) {
  return {
    id: "session-1",
    courseId: "course-1",
    status: "completed",
    date,
    createdAt: "2026-09-12T10:00:00.000Z",
  };
}

function sessionTable(date) {
  return { courseSessions: [baseSession(date)] };
}

function expectAccept(tables) {
  const validated = validateImportPayload(tables);
  assert.ok(validated, "valid payload must pass through");
}

function expectReject(tables, expectedField) {
  assert.throws(
    () => validateImportPayload(tables),
    (error) => {
      const message = String(error.message);
      if (expectedField && !message.includes(`field=${expectedField}`)) {
        return false;
      }
      return message.startsWith("Import validation failed:");
    },
    `expected rejection${expectedField ? ` mentioning field=${expectedField}` : ""}`
  );
}

// ── Part A: validateImportPayload (real module, in-process) ──────────────

test("a fully canonical payload passes import validation", () => {
  expectAccept({
    dayLogs: [{ date: VALID_DATE, entries: [], status: "active", year: 2026, month: 9 }],
    habits: [{ id: "h1", name: "مطالعه", recurrence: { type: "daily" }, date: VALID_DATE, lastEmaDate: null }],
    courses: [{ id: "c1", name: "دوره" }],
    gates: [{ id: "g1", title: "دروازه", deadline: VALID_DATE }],
    schedules: [{
      id: "s1",
      dayOfWeek: "saturday",
      schedule: [],
      scheduleMode: "weekly_template",
      dateKey: null,
      startDate: VALID_DATE,
      endDate: "2026-09-15",
    }],
    courseSessions: [baseSession(VALID_DATE)],
    fixedEvents: [{ id: "f1", dayOfWeek: "saturday", title: "ثابت", startTime: "09:00", endTime: "10:00" }],
    activeTimer: [{ id: "t1", taskRefId: "ref-1", dayLogDate: VALID_DATE }],
    drafts: [{ key: "draft-1" }],
    lifeWheelScores: [{
      id: "2026-W37",
      periodKey: "2026-W37",
      scores: { career: 5 },
      startDate: "2026-09-05",
      endDate: "2026-09-11",
      year: 2026,
      month: 9,
      week: 37,
    }],
  });
});

// Phase 3 — courseSessions.date is a CIVIL_DATE (CourseRepository writes
// getPolicyTodayKey(); the field is indexed). The import must reject
// impossible calendar dates and non-canonical formats, not merely check
// that the value is a non-empty string.
test("courseSessions date: impossible calendar dates are rejected", () => {
  for (const date of IMPOSSIBLE_DATES) {
    expectReject(sessionTable(date), "date");
  }
});

test("courseSessions date: non-canonical formats and ISO timestamps are rejected", () => {
  for (const date of WRONG_FORMATS) {
    expectReject(sessionTable(date), "date");
  }
});

test("courseSessions date: wrong types are rejected", () => {
  expectReject(sessionTable(null), "date");
  expectReject(sessionTable(undefined), "date");
  expectReject(sessionTable(123456789), "date");
  expectReject(sessionTable({}), "date");
  expectReject(sessionTable(["2026-09-12"]), "date");
});

test("dayLogs date: impossible and non-canonical dates are rejected", () => {
  for (const date of [...IMPOSSIBLE_DATES, ...WRONG_FORMATS]) {
    expectReject({ dayLogs: [{ date, entries: [] }] }, "date");
  }
});

// Phase 6 QUERY integrity — dayLogs.year/month feed where({year, month})
// (getMonthLogs, monthly review, vitals). An imported record whose
// hierarchy disagrees with its Civil Date stays wrong forever
// (lazyMigrate only fills MISSING hierarchy), silently dropping the day
// from month queries. The import must reject the mismatch explicitly.
test("dayLogs hierarchy year/month must agree with the Civil Date", () => {
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], year: 2019, month: 3 }] }, "year");
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], year: 2026, month: 10 }] }, "month");
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], year: "2026", month: 9 }] }, "year");
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], month: 0 }] }, "month");
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], month: 13 }] }, "month");
  // Missing (absent or null) hierarchy is legal: lazyMigrateDayLog treats
  // null exactly like missing and backfills it from the Civil Date on the
  // next access — NaN-era backups stay importable and self-heal.
  expectAccept({ dayLogs: [{ date: VALID_DATE, entries: [] }] });
  expectAccept({ dayLogs: [{ date: VALID_DATE, entries: [], year: null, month: null }] });
});

test("schedules dateKey/startDate/endDate must be Civil Dates when present", () => {
  for (const field of ["dateKey", "startDate", "endDate"]) {
    for (const bad of [...IMPOSSIBLE_DATES.slice(0, 3), ...WRONG_FORMATS.slice(0, 5)]) {
      expectReject({
        schedules: [{
          id: "s1",
          dayOfWeek: "saturday",
          schedule: [],
          [field]: bad,
        }],
      }, field);
    }
  }
  expectAccept({
    schedules: [{ id: "s1", dayOfWeek: "saturday", schedule: [], dateKey: null }],
  });
});

test("habits date and lastEmaDate must be Civil Dates when present", () => {
  for (const field of ["date", "lastEmaDate"]) {
    expectReject({
      habits: [{ id: "h1", name: "مطالعه", recurrence: { type: "daily" }, [field]: "2026-13-01" }],
    }, field);
    expectReject({
      habits: [{ id: "h1", name: "مطالعه", recurrence: { type: "daily" }, [field]: "2026-09-12T00:00:00Z" }],
    }, field);
  }
});

test("gates deadline must be a Civil Date or null", () => {
  expectReject({ gates: [{ id: "g1", title: "دروازه", deadline: "2026-13-01" }] }, "deadline");
  expectReject({ gates: [{ id: "g1", title: "دروازه", deadline: "2026-09-12T00:00:00Z" }] }, "deadline");
  expectAccept({ gates: [{ id: "g1", title: "دروازه", deadline: null }] });
});

test("activeTimer dayLogDate must be a Civil Date", () => {
  expectReject({ activeTimer: [{ id: "t1", taskRefId: "r", dayLogDate: "2026-13-01" }] }, "dayLogDate");
  expectReject({ activeTimer: [{ id: "t1", taskRefId: "r", dayLogDate: "2026-9-12" }] }, "dayLogDate");
});

test("lifeWheelScores startDate/endDate must be Civil Dates when present", () => {
  for (const field of ["startDate", "endDate"]) {
    expectReject({
      lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, [field]: "2026-13-01" }],
    }, field);
    expectReject({
      lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, [field]: "2026-09-05T00:00:00Z" }],
    }, field);
  }
});

test("lifeWheelScores year/month must be finite sane numbers, never null", () => {
  expectReject({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, year: null }],
  }, "year");
  expectReject({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, month: null }],
  }, "month");
  expectReject({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, month: 13 }],
  }, "month");
  // week: null is legal — the v13 migration writes exactly that value.
  expectAccept({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, week: null }],
  });
});

test("lifeWheelScores hierarchy must agree with startDate when both present", () => {
  expectReject({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, startDate: "2026-09-05", year: 1999, month: 9 }],
  }, "year");
  expectReject({
    lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, startDate: "2026-09-05", year: 2026, month: 10 }],
  }, "month");
});

test("numeric hierarchy rejects NaN, Infinity, and non-integer garbage", () => {
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], mood: Infinity }] }, "mood");
  expectReject({ dayLogs: [{ date: VALID_DATE, entries: [], mood: NaN }] }, "mood");
  expectReject({ lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, year: 2026.5 }] }, "year");
  expectReject({ lifeWheelScores: [{ id: "w1", periodKey: "2026-W37", scores: {}, year: Infinity }] }, "year");
});

test("existing table-level record cap stays enforced", () => {
  const records = Array.from({ length: 10001 }, () => ({ id: "c1", name: "دوره" }));
  expectReject({ courses: records });
});

// ── Part B: importRoadmapFromJSON deadline (real module, child process) ──

const ROADMAP_HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
    globalThis.__G_TABLES = {};
    const tables = globalThis.__G_TABLES;
    const bucket = (name) => (tables[name] || (tables[name] = []));
    const makeTable = (name) => ({
      clear: async () => { tables[name] = []; },
      bulkPut: async (rows) => { bucket(name).push(...rows); },
      add: async (row) => { bucket(name).push(row); },
      toArray: async () => bucket(name).slice(),
      get: async (key) => bucket(name).find((r) => r.id === key),
      where: () => ({ equals: () => ({ toArray: async () => [], first: async () => undefined }) }),
    });
    const runTransaction = async (...args) => {
      const callback = args[args.length - 1];
      return await callback();
    };
    export const db = {
      gates: makeTable("gates"),
      importHistory: makeTable("importHistory"),
      transaction: runTransaction,
    };
    export const ACTIVE_ACCOUNT_STORAGE_KEY = "mohammados_active_account";
    export async function migrateLegacyDataToUser() { return false; }
  \`,
  "src/sync/SyncOutbox.js":
    "export async function enqueueMutation() {} export async function enqueueMutations() {}",
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

const ROADMAP_PROBE_SOURCE = `
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(new URL("./hooks.mjs", import.meta.url));

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { importRoadmapFromJSON } = await import(${JSON.stringify(p("src/app/ImportService.js"))});

let threw = null;
try {
  await importRoadmapFromJSON(scenario.json, false);
} catch (error) {
  threw = String(error.message);
}
const tables = globalThis.__G_TABLES || {};
process.stdout.write(JSON.stringify({
  threw,
  storedDeadlines: (tables.gates || []).map((g) => g.deadline),
}));
`;

const TMP = mkdtempSync(path.join(tmpdir(), "g-import-"));
writeFileSync(path.join(TMP, "hooks.mjs"), ROADMAP_HOOKS_SOURCE);
writeFileSync(path.join(TMP, "roadmap-probe.mjs"), ROADMAP_PROBE_SOURCE);

function runRoadmapProbe(deadline) {
  const scenarioFile = path.join(TMP, "roadmap-scenario.json");
  writeFileSync(scenarioFile, JSON.stringify({
    json: JSON.stringify({
      gates: [{ title: "دروازه یک", deadline }],
    }),
  }));
  return JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "roadmap-probe.mjs"), scenarioFile], {
      encoding: "utf8",
    })
  );
}

// The roadmap import path bypasses validateImportPayload entirely and used
// `deadline: gateData.deadline || null` — accepting garbage ("abc"), wrong
// formats, ISO timestamps, and even numbers (123 < "2026-…" coerces in the
// overdue comparison and marks healthy gates overdue).
test("roadmap import: garbage deadline is rejected", () => {
  for (const deadline of ["abc", "2026-13-01", "2026/09/12", "2026-9-12", "2026-09-12T00:00:00Z"]) {
    const out = runRoadmapProbe(deadline);
    assert.ok(out.threw, `deadline ${JSON.stringify(deadline)} must be rejected`);
    assert.deepEqual(out.storedDeadlines, [], "nothing must be persisted on rejection");
  }
});

test("roadmap import: numeric deadline is rejected", () => {
  const out = runRoadmapProbe(123);
  assert.ok(out.threw, "numeric deadline must be rejected (123 < '2026-…' coerces and flips overdue logic)");
  assert.deepEqual(out.storedDeadlines, []);
});

test("roadmap import: valid Civil Date, null, and absent deadlines are accepted", () => {
  const valid = runRoadmapProbe("2026-10-20");
  assert.equal(valid.threw, null);
  assert.deepEqual(valid.storedDeadlines, ["2026-10-20"]);

  const none = runRoadmapProbe(undefined);
  assert.equal(none.threw, null);
  assert.deepEqual(none.storedDeadlines, [null], "absent deadline stays null (existing || null behavior)");

  const explicitNull = runRoadmapProbe(null);
  assert.equal(explicitNull.threw, null);
  assert.deepEqual(explicitNull.storedDeadlines, [null]);
});

// ── Part C: real-pipeline behavior (§5 self-heal + validation boundary) ──
//
// Part A pinned the validator contract in isolation. These probes run the
// REAL ImportService.importData and the REAL DayLogRepository.getOrCreateByDate
// against an in-memory db stub, proving the contract at the persistence
// boundary: (1) a null-hierarchy dayLog imports, stays raw until accessed,
// and is healed by lazyMigrateDayLog exactly to its Civil Date's hierarchy;
// (2) validation sits INSIDE importData, so an invalid payload rejects
// before anything is cleared or written.

const PIPELINE_HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
    globalThis.__G_DB = {};
    const tables = globalThis.__G_DB;
    const bucket = (name) => (tables[name] || (tables[name] = []));
    const matches = (row, query) =>
      typeof query === "object" && query !== null && !Array.isArray(query)
        ? Object.entries(query).every(([k, v]) => row[k] === v)
        : true;
    const makeTable = (name) => ({
      clear: async () => { tables[name] = []; },
      bulkPut: async (rows) => { bucket(name).splice(0, bucket(name).length, ...rows); },
      put: async (row) => {
        const arr = bucket(name);
        const key = row.date ?? row.id;
        const idx = arr.findIndex((r) => (r.date ?? r.id) === key);
        if (idx >= 0) arr[idx] = row; else arr.push(row);
        return key;
      },
      add: async (row) => { bucket(name).push(row); return row.id; },
      get: async (key) => bucket(name).find((r) => (r.date ?? r.id) === key),
      delete: async (key) => {
        const arr = bucket(name);
        const idx = arr.findIndex((r) => (r.date ?? r.id) === key);
        if (idx >= 0) arr.splice(idx, 1);
      },
      toArray: async () => bucket(name).slice(),
      where: (arg) => ({
        equals: (v) => ({
          first: async () => bucket(name).find((r) => r[arg] === v),
          toArray: async () => bucket(name).filter((r) => r[arg] === v),
          delete: async () => {},
        }),
        toArray: async () => bucket(name).filter((r) => matches(r, arg)),
      }),
    });
    export const db = {
      dayLogs: makeTable("dayLogs"),
      habits: makeTable("habits"),
      schedules: makeTable("schedules"),
      syncOutbox: makeTable("syncOutbox"),
      importHistory: makeTable("importHistory"),
      gates: makeTable("gates"),
      transaction: async (...args) => await args[args.length - 1](),
    };
    export const ACTIVE_ACCOUNT_STORAGE_KEY = "mohammados_active_account";
    export async function migrateLegacyDataToUser() { return false; }
  \`,
  "src/sync/SyncOutbox.js":
    "export async function enqueueMutation() {} export async function enqueueMutations() {}",
  "src/repositories/ScheduleRepository.js":
    "export const ScheduleRepository = { async getScheduleForDate() { return null; } };",
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

const PIPELINE_PROBE_SOURCE = `
import { register } from "node:module";
import { readFileSync } from "node:fs";

register(new URL("./pipeline-hooks.mjs", import.meta.url));

const scenario = JSON.parse(readFileSync(process.argv[2], "utf8"));
const { ImportService } = await import(${JSON.stringify(p("src/app/ImportService.js"))});
const { DayLogRepository } = await import(${JSON.stringify(p("src/repositories/DayLogRepository.js"))});

const result = {};

let seedThrew = null;
try {
  if (scenario.seedPayload) await ImportService.importData(scenario.seedPayload);
} catch (error) {
  seedThrew = String(error.message.split("\\n")[0]);
}
result.seedThrew = seedThrew;

let importThrew = null;
try {
  await ImportService.importData(scenario.payload);
} catch (error) {
  importThrew = String(error.message.split("\\n")[0]);
}
result.importThrew = importThrew;
result.immediatelyAfterImport = (globalThis.__G_DB.dayLogs || []).slice();

if (scenario.accessDate) {
  const log = await DayLogRepository.getOrCreateByDate(scenario.accessDate, "saturday");
  result.healedYear = log.year;
  result.healedMonth = log.month;
}

result.monthQuery = scenario.monthQuery
  ? await DayLogRepository.getMonthLogs(scenario.monthQuery.year, scenario.monthQuery.month)
  : null;

process.stdout.write(JSON.stringify(result));
`;

writeFileSync(path.join(TMP, "pipeline-hooks.mjs"), PIPELINE_HOOKS_SOURCE);
writeFileSync(path.join(TMP, "pipeline-probe.mjs"), PIPELINE_PROBE_SOURCE);

function runPipelineProbe(scenario) {
  const scenarioFile = path.join(TMP, "pipeline-scenario.json");
  writeFileSync(scenarioFile, JSON.stringify(scenario));
  return JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "pipeline-probe.mjs"), scenarioFile], {
      encoding: "utf8",
    })
  );
}

// §5 — the null-hierarchy import contract depends on lazyMigrateDayLog
// healing the record on access. This is the coupling G relies on; pin the
// full chain: import succeeds → record stored raw → access heals it to the
// Civil Date's own hierarchy.
test("null-hierarchy dayLog imports raw and self-heals on access to its Civil Date hierarchy", () => {
  const out = runPipelineProbe({
    payload: {
      dayLogs: [{ date: "2026-09-12", entries: [], status: "active", year: null, month: null }],
    },
    accessDate: "2026-09-12",
    monthQuery: { year: 2026, month: 9 },
  });

  assert.equal(out.importThrew, null, "null hierarchy must be importable (lazyMigrate repairs it)");
  const stored = out.immediatelyAfterImport[0];
  assert.equal(stored.year, null, "import stores the record verbatim (null hierarchy)");
  assert.equal(stored.month, null, "import stores the record verbatim (null hierarchy)");
  assert.equal(out.healedYear, 2026, "lazyMigrate must heal year from the Civil Date");
  assert.equal(out.healedMonth, 9, "lazyMigrate must heal month from the Civil Date");
});

test("a null-hierarchy dayLog is invisible to month queries until its first access heals it", () => {
  const out = runPipelineProbe({
    payload: {
      dayLogs: [{ date: "2026-09-12", entries: [], status: "active", year: null, month: null }],
    },
    monthQuery: { year: 2026, month: 9 },
  });

  assert.equal(out.importThrew, null);
  assert.deepEqual(out.monthQuery, [], "before any access the record is invisible to where({year, month}) — the documented self-heal coupling");
});

// M9 boundary — validation must sit INSIDE ImportService.importData so no
// caller can persist without it: an invalid payload must reject AND leave
// the previously imported store contents untouched (clear() runs only after
// validation passes, inside the write transaction).
test("importData rejects an invalid payload before clearing or writing any table", () => {
  const out = runPipelineProbe({
    seedPayload: {
      dayLogs: [{ date: "2026-09-12", entries: [], status: "active" }],
    },
    payload: {
      dayLogs: [{ date: "2026-09-13", entries: [], status: "active" }],
      courseSessions: [{ id: "s1", courseId: "c1", status: "completed", date: "2026-13-01", createdAt: "2026-09-12T10:00:00.000Z" }],
    },
  });

  assert.equal(out.seedThrew, null, "the seeding import must succeed");
  assert.ok(out.importThrew && out.importThrew.startsWith("Import validation failed:"), "invalid payload must be rejected by the validator inside importData");
  assert.equal(out.immediatelyAfterImport.length, 1, "the previously imported dayLog must survive untouched — no clear-on-failure");
  assert.equal(out.immediatelyAfterImport[0].date, "2026-09-12", "the surviving record is the seeded one, not the new payload");
});

// validateImportPayload must be loaded through the real module for Part A.
import { validateImportPayload } from "../src/domain/validation/importValidator.js";
