// D1.10-E1 — remaining device-TZ CIVIL_DATE producer tests.
//
// Behavioral probes run the REAL modules in child processes (IndexedDB /
// Supabase / ScheduleRepository / browser-download dependencies are stubbed
// via a module load hook); utils/date.js and config/timePolicy.js load
// unmodified. "Now" is injected with a fake Date class. Expected values are
// explicit constants — the Tehran civil-day boundary (20:30:00Z) and the
// policy weekday names are never recomputed with a Date.
//
// Source-contract tests (StatusPage/PlannerPage/RoadmapPage/exportData)
// assert architecture: the device-TZ producer pattern must be absent and the
// canonical policy primitive must be used on the same call path.

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

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "e1-producers-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/db/database.js": \`
const rows = (name) => (globalThis.__E1 && globalThis.__E1[name]) || [];
function makeTable(name) {
  return {
    async toArray() { return rows(name).slice(); },
    async get(key) { return rows(name).find((r) => r.id === key); },
    async put(rec) { rows(name).push(rec); return rec.id ?? rec.date; },
    async bulkPut(list) { rows(name).push(...list); return list.length; },
    async update(key, patch) {
      const r = rows(name).find((x) => x.id === key);
      if (r) Object.assign(r, patch);
      return !!r;
    },
    delete() {},
    where() {
      const chain = {
        equals: () => chain,
        filter: () => chain,
        first: async () => undefined,
        toArray: async () => [],
      };
      return chain;
    },
  };
}
export const db = {
  courses: makeTable("courses"),
  courseSessions: makeTable("courseSessions"),
  syncOutbox: makeTable("syncOutbox"),
  transaction(...args) { return args[args.length - 1](); },
};
\`,
  "src/repositories/ScheduleRepository.js": \`
export const ScheduleRepository = {
  async getDaySchedule(day) {
    return { dayOfWeek: day, schedule: [
      { id: "b1", title: "Probe Block", startTime: "09:00", endTime: "10:00", type: "fixed" },
    ] };
  },
  async getDatedPlanRecordsInRange() { return []; },
  async getScheduleForDate() { return null; },
};
\`,
  "src/sync/SyncOutbox.js": \`
export async function enqueueMutation(payload, _outbox) {
  (globalThis.__E1.outbox ||= []).push(payload);
}
export async function enqueueMutations(list, _outbox) {
  (globalThis.__E1.outbox ||= []).push(...list);
}
\`,
  "src/auth/supabaseClient.js": \`
export const supabase = {};
export const isSupabaseConfigured = () => false;
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
globalThis.__E1 = { courses: [], courseSessions: [], habits: [] };

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

// Minimal browser-download shims so export modules can run in Node;
// they capture filename + text content for assertions.
const downloads = [];
globalThis.Blob = class {
  constructor(parts) { this.text = parts.map((x) => String(x)).join(""); }
};
globalThis.URL = class extends URL {
  static createObjectURL(blob) { return "blob:probe"; }
  static revokeObjectURL() {}
};
globalThis.document = {
  createElement() {
    const el = {
      _href: "",
      set href(v) { this._href = v; },
      get href() { return this._href; },
      set download(name) { downloads.push({ name, blob: currentBlob }); },
      click() {},
    };
    return el;
  },
  body: { appendChild() {}, removeChild() {} },
};
let currentBlob = null;
const RealBlob = globalThis.Blob;
globalThis.Blob = class extends RealBlob {
  constructor(parts, opts) { super(parts, opts); currentBlob = this; }
};

let result;
if (scenario.target === "calls") {
  const utils = await import(${JSON.stringify(p("src/utils/date.js"))});
  result = {};
  for (const call of scenario.calls) {
    result[call.as || call.fn + ":" + JSON.stringify(call.args)] = await utils[call.fn](...call.args);
  }
} else if (scenario.target === "getTodayEn") {
  const { getTodayEn } = await import(${JSON.stringify(p("src/utils/date.js"))});
  result = getTodayEn();
} else if (scenario.target === "course") {
  const { CourseRepository } = await import(${JSON.stringify(p("src/repositories/CourseRepository.js"))});
  const courseId = await CourseRepository.create({
    name: "Probe Course",
    domain: "learning",
    totalEpisodes: 10,
    currentEpisode: 2,
  });
  await CourseRepository.completeEpisode(courseId, 3, "note");
  result = {
    sessionDates: globalThis.__E1.courseSessions.map((s) => s.date),
  };
} else if (scenario.target === "coach") {
  const { getInsights } = await import(${JSON.stringify(p("src/ai/coachService.js"))});
  const insights = getInsights({}, {}, [], null, {
    gates: [{ id: "g1", deadline: "2026-09-10", progress: 50 }],
  });
  result = { overdueAlert: insights.some((i) => i.severity === "alert") };
} else if (scenario.target === "ics") {
  const { exportScheduleToIcs } = await import(${JSON.stringify(p("src/app/exportSchedule.js"))});
  await exportScheduleToIcs({ mode: "weekly_template" });
  const ics = downloads[0]?.blob?.text ?? "";
  result = {
    filename: downloads[0]?.name ?? null,
    dtstarts: [...ics.matchAll(/DTSTART;TZID=Asia\\/Tehran:(\\d{8})T/g)].map((m) => m[1]),
  };
}

process.stdout.write(JSON.stringify(result));
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

// Tehran civil-day boundary: 20:30:00Z === 00:00 (+03:30) next day.
// Expected Account CIVIL_DATE per instant (explicit constants):
const BOUNDARY = [
  { now: "2026-09-10T10:00:00Z", day: "2026-09-10", en: "thursday" }, // daytime sanity
  { now: "2026-09-10T20:29:59Z", day: "2026-09-10", en: "thursday" },
  { now: "2026-09-10T20:30:00Z", day: "2026-09-11", en: "friday" },
  { now: "2026-09-10T20:30:01Z", day: "2026-09-11", en: "friday" },
];

// 1 — getTodayEn must be the Account-Timezone weekday of today.
for (const { now, en } of BOUNDARY) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`getTodayEn returns Account weekday ${en} at ${now} (device TZ ${tz})`, () => {
      assert.equal(runProbe(tz, { target: "getTodayEn", now }), en);
    });
  }
}

// 2 — CourseRepository persisted CIVIL_DATEs (initial + completed sessions)
// must follow the Account date. [CODE] create() stamps dateStr onto the
// initial session records and completeEpisode() onto the completed session.
for (const { now, day } of BOUNDARY) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`persisted session dates are ${day} at ${now} (device TZ ${tz})`, () => {
      const out = runProbe(tz, { target: "course", now });
      assert.equal(out.sessionDates.length, 3, "2 initial + 1 completed session");
      for (const d of out.sessionDates) assert.equal(d, day, "session.date");
    });
  }
}

// 3 — coach overdue rule compares the gate deadline (CIVIL_DATE) against the
// Account today: at 20:30:00Z policy today (2026-09-11) > deadline 2026-09-10
// → alert. Device-UTC legacy behavior computes today as 2026-09-10 → no alert.
for (const { now, overdue } of [
  { now: "2026-09-10T10:00:00Z", overdue: false },
  { now: "2026-09-10T20:29:59Z", overdue: false },
  { now: "2026-09-10T20:30:00Z", overdue: true },
  { now: "2026-09-10T20:30:01Z", overdue: true },
]) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`coach overdue=${overdue} at ${now} (device TZ ${tz})`, () => {
      assert.equal(runProbe(tz, { target: "coach", now }).overdueAlert, overdue);
    });
  }
}

// 4 — weekly ICS export must emit exactly the Account week: 7 consecutive
// dates starting on the policy Saturday containing the policy today.
// 2026-09-11 (Fri) belongs to week 2026-09-05..09-11; at 20:30:00Z the
// Account date rolls to Sat 2026-09-12 → week 09-12..09-18. Device-UTC
// legacy anchor still sees Fri 09-11 at that instant → old window (RED).
for (const { now, first, last } of [
  { now: "2026-09-11T10:00:00Z", first: "20260905", last: "20260911" },
  { now: "2026-09-11T20:29:59Z", first: "20260905", last: "20260911" },
  { now: "2026-09-11T20:30:00Z", first: "20260912", last: "20260918" },
  { now: "2026-09-11T20:30:01Z", first: "20260912", last: "20260918" },
]) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`weekly ICS window ${first}..${last} at ${now} (device TZ ${tz})`, async () => {
      const out = runProbe(tz, { target: "ics", now });
      assert.equal(out.dtstarts.length, 7);
      assert.equal(out.dtstarts[0], first);
      assert.equal(out.dtstarts[6], last);
    });
  }
}

// 5 — addCivilDays contract audit (deep-audit §7): calendar-boundary
// correctness, identity/inverse properties, lexicographic monotonicity, and
// the documented canonical-input-only invalid behavior (throws).
test("addCivilDays crosses month, leap, and year boundaries correctly", () => {
  const out = runProbe("Asia/Tehran", { target: "calls", calls: [
    { fn: "addCivilDays", args: ["2026-01-31", 1], as: "jan31" },
    { fn: "addCivilDays", args: ["2026-02-28", 1], as: "feb28nonleap" },
    { fn: "addCivilDays", args: ["2028-02-28", 1], as: "feb28leap" },
    { fn: "addCivilDays", args: ["2028-02-29", 1], as: "feb29leap" },
    { fn: "addCivilDays", args: ["2026-03-01", -1], as: "mar01minus" },
    { fn: "addCivilDays", args: ["2026-12-31", 1], as: "yearend" },
    { fn: "addCivilDays", args: ["2027-01-01", -1], as: "yearstart" },
  ] });
  assert.equal(out.jan31, "2026-02-01");
  assert.equal(out.feb28nonleap, "2026-03-01");
  assert.equal(out.feb28leap, "2028-02-29");
  assert.equal(out.feb29leap, "2028-03-01");
  assert.equal(out.mar01minus, "2026-02-28");
  assert.equal(out.yearend, "2027-01-01");
  assert.equal(out.yearstart, "2026-12-31");
});

test("addCivilDays preserves identity, inverse, and lexicographic order", () => {
  const out = runProbe("America/New_York", { target: "calls", calls: [
    { fn: "addCivilDays", args: ["2026-09-11", 0], as: "identity" },
    { fn: "addCivilDays", args: ["2026-09-11", 365], as: "plusYear" },
    { fn: "addCivilDays", args: ["2026-09-11", -365], as: "minusYear" },
    { fn: "addCivilDays", args: ["2026-09-11", 1], as: "next" },
  ] });
  assert.equal(out.identity, "2026-09-11");
  assert.equal(out.plusYear, "2027-09-11");
  assert.equal(out.minusYear, "2025-09-11");
  // +1 moves exactly one civil day forward, including lexicographic order
  // (canonical YYYY-MM-DD sorts chronologically — export range relies on it).
  assert.equal(out.next, "2026-09-12");
  assert.ok(out.next > "2026-09-11");
});

test("addCivilDays rejects non-canonical input instead of guessing (canonical-only contract)", () => {
  const probe = `
    import { register } from "node:module";
    register(new URL("./hooks.mjs", import.meta.url));
    const { addCivilDays } = await import(${JSON.stringify(p("src/utils/date.js"))});
    const results = {};
    for (const [label, args] of Object.entries({
      unpadded: ["2026-9-11", 1],
      badCalendar: ["2026-02-30", 1],
      garbage: ["foo", 1],
      empty: ["", 1],
      nullInput: [null, 1],
      year0: ["0000-01-01", 1],
      year99: ["0099-01-01", 1],
    })) {
      try { results[label] = addCivilDays(...args); }
      catch (e) { results[label] = "THROWS:" + e.constructor.name; }
    }
    process.stdout.write(JSON.stringify(results));
  `;
  writeFileSync(path.join(TMP, "contract-probe.mjs"), probe);
  const results = JSON.parse(
    execFileSync(process.execPath, [path.join(TMP, "contract-probe.mjs")], {
      env: { ...process.env, TZ: "UTC" },
      encoding: "utf8",
    })
  );
  // Shape-invalid input → TypeError from parseCivilDateKey's format check.
  for (const label of ["unpadded", "garbage", "empty", "nullInput"]) {
    assert.match(results[label], /^THROWS:TypeError$/, label);
  }
  // Canonical-shaped but calendar-invalid → RangeError from the round-trip check.
  assert.match(results.badCalendar, /^THROWS:RangeError$/, "badCalendar");
  // Year 0–99 would be coerced to 1900–1999 by Date.UTC; the Time Policy
  // validator's round-trip check rejects them before any coercion can leak.
  assert.match(results.year0, /^THROWS:RangeError$/, "year 0000 must be rejected");
  assert.match(results.year99, /^THROWS:RangeError$/, "year 0099 must be rejected");
});

// 6 — explicit cross-TZ persistence invariant (deep-audit §12):
// same instant + same Account Timezone + different device TZ
// => identical persisted session.date values.
test("persisted session.date is byte-identical across device timezones", () => {
  const runs = EXECUTION_TIMEZONES.map((tz) =>
    JSON.stringify(runProbe(tz, { target: "course", now: "2026-09-10T20:30:00Z" }))
  );
  assert.ok(runs.every((r) => r === runs[0]), "persisted dates must not depend on the device timezone");
  assert.match(runs[0], /"sessionDates":\["2026-09-11","2026-09-11","2026-09-11"\]/);
});

// 7 — source contracts: the device-TZ producer pattern must be gone from the
// migrated sites, and the canonical policy primitive must sit on the same
// call path (architecture, not string replacement).
test("StatusPage today filter uses the policy primitive on the clockMs path", () => {
  const source = src("src/pages/StatusPage.jsx");
  assert.doesNotMatch(source, /getLocalDateKey\s*\(\s*new Date/, "device-TZ today producer must be absent");
  assert.match(source, /getPolicyTodayKey\s*\(\s*new Date\s*\(\s*clockMs\s*\)/, "policy projection of the clockMs instant is required");
  assert.match(source, /log\.date <= todayKey/, "today-filter call path must remain intact");
});

test("PlannerPage import fallback uses the policy primitive", () => {
  const source = src("src/pages/PlannerPage.jsx");
  assert.doesNotMatch(source, /getLocalDateKey\s*\(\s*new Date/);
  assert.match(source, /dayOfWeek:\s*data\.date\s*\|\|\s*getPolicyTodayKey\(\)/, "fallback identity must come from the policy");
});

test("RoadmapPage gate stats and export filenames use the policy primitive", () => {
  const source = src("src/pages/RoadmapPage.jsx");
  assert.doesNotMatch(source, /getLocalDateKey\s*\(\s*new Date/);
  assert.match(source, /getPolicyTodayKey\(\)/);
  assert.match(source, /g\.deadline < todayStr/, "overdue comparison path must remain intact");
});

test("exportData range anchor no longer reads the device clock", () => {
  const source = src("src/app/exportData.js");
  // The range producer itself must be device-clock-free; legitimate INSTANT
  // usage elsewhere in the module (backup-age, timestamps) is out of scope.
  const rangeProducer = source.match(/function getDateLimitStr[\s\S]*?\n\}/)?.[0];
  assert.ok(rangeProducer, "getDateLimitStr must exist");
  assert.doesNotMatch(rangeProducer, /new Date\(/, "range anchor must not construct a device Date");
  assert.match(rangeProducer, /getPolicyTodayKey\(\)/, "range anchor must project through the policy");
  assert.doesNotMatch(source, /\btodayKey\b|getLocalDateKey/, "legacy device-TZ helpers must be absent from the module");
});
