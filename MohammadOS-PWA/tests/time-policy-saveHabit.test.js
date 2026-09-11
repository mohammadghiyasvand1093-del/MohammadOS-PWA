// D1.10-A — saveHabit() persisted date producer tests (Account TZ: Asia/Tehran).
//
// The real saveHabit module is exercised in child processes. Its persistence
// dependencies (HabitRepository, actionExecutor) are stubbed via a module load
// hook backed by globalThis.__D19; date.js / timePolicy.js / habitValidator
// load unmodified. "Now" is injected with a fake Date class.

import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const PROJECT_ROOT = process.cwd();
const SAVE_HABIT_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/app/saveHabit.js")
).href;

const EXECUTION_TIMEZONES = ["UTC", "Asia/Tehran", "America/New_York"];

const TMP = mkdtempSync(path.join(tmpdir(), "d10a-habit-"));

const HOOKS_SOURCE = `
const STUBS = {
  "src/repositories/HabitRepository.js": \`
const captured = () => (globalThis.__D19.saved ||= []);
export const HabitRepository = {
  async save(habit) { captured().push(habit); return habit; },
};
\`,
  "src/utils/actionExecutor.js": \`
export async function executeAction({ execute }) {
  return await execute();
}
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
globalThis.__D19 = {};

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

const { saveHabit } = await import(${JSON.stringify(SAVE_HABIT_URL)});

const savedHabit = await saveHabit({
  name: "مطالعه",
  domain: "learning",
  recurrence: { type: "daily" },
  isCritical: true,
});

process.stdout.write(JSON.stringify({ savedHabit, persisted: globalThis.__D19.saved }));
`;

writeFileSync(path.join(TMP, "hooks.mjs"), HOOKS_SOURCE);
writeFileSync(path.join(TMP, "probe.mjs"), PROBE_SOURCE);

function runSaveHabitProbe(timeZone, now) {
  const scenarioFile = path.join(TMP, "scenario.json");
  writeFileSync(scenarioFile, JSON.stringify({ now }));
  const stdout = execFileSync(
    process.execPath,
    [path.join(TMP, "probe.mjs"), scenarioFile],
    { env: { ...process.env, TZ: timeZone }, encoding: "utf8" }
  );
  return JSON.parse(stdout);
}

// A + B + C + D + E — Tehran midnight boundary in every device timezone.
const MIDNIGHT_MATRIX = [
  { now: "2026-09-10T20:29:59Z", expectedDate: "2026-09-10" },
  { now: "2026-09-10T20:30:00Z", expectedDate: "2026-09-11" },
  { now: "2026-09-10T20:30:01Z", expectedDate: "2026-09-11" },
];

for (const { now, expectedDate } of MIDNIGHT_MATRIX) {
  for (const tz of EXECUTION_TIMEZONES) {
    test(`saveHabit persists the Account Civil Date ${expectedDate} at ${now} (device TZ ${tz})`, async () => {
      const out = runSaveHabitProbe(tz, now);

      assert.equal(out.persisted.length, 1, "exactly one habit must be persisted");
      assert.equal(out.persisted[0].date, expectedDate);
      assert.equal(out.savedHabit.date, expectedDate);
    });
  }
}

// F — persistence guarantee: the date field is policy-based and every other
// field keeps its documented value; nothing extra is mutated.
for (const tz of EXECUTION_TIMEZONES) {
  test(`persisted habit record has the exact expected shape (device TZ ${tz})`, async () => {
    const out = runSaveHabitProbe(tz, "2026-09-10T20:30:00Z");
    const record = out.persisted[0];

    assert.equal(record.date, "2026-09-11");
    assert.equal(record.name, "مطالعه");
    assert.equal(record.domain, "learning");
    assert.deepEqual(record.recurrence, { type: "daily" });
    assert.equal(record.isCritical, true);
    assert.equal(record.done, false);
    assert.equal(record.habitStrength, 0.5);
    assert.equal(record.lastEmaDate, null);
    assert.equal(record.strengthBeforeToday, 0);
    assert.match(record.id, /^[0-9a-f-]{36}$/);
    assert.equal(record.createdAt, record.updatedAt);
    assert.equal(new Date(record.createdAt).toISOString(), "2026-09-10T20:30:00.000Z");
    assert.deepEqual(Object.keys(record).sort(), [
      "createdAt", "date", "domain", "done", "habitStrength", "id",
      "isCritical", "lastEmaDate", "name", "recurrence", "strengthBeforeToday", "updatedAt",
    ]);
  });
}

// E — regression: results identical across device timezones (includes the
// device TZ == Asia/Tehran case, which must stay unchanged).
test("saveHabit output is identical across device timezones", async () => {
  const runs = EXECUTION_TIMEZONES.map((tz) => {
    const out = runSaveHabitProbe(tz, "2026-09-10T20:30:00Z");
    const { id, createdAt, ...rest } = out.persisted[0];
    return JSON.stringify({ ...rest, hasId: /^[0-9a-f-]{36}$/.test(id), createdAt });
  });
  assert.ok(runs.every((r) => r === runs[0]), "persisted record must not depend on the device timezone");
});
