import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const LEGACY_MODULE_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/utils/date.js")
).href;
const POLICY_MODULE_URL = pathToFileURL(
  path.resolve(PROJECT_ROOT, "src/config/timePolicy.js")
).href;

const CIVIL_DATES = [
  "2026-09-11",
  "2026-09-12",
  "2026-12-31",
  "2027-01-01",
  "2027-01-02",
];

const EXECUTION_TIMEZONES = [
  "UTC",
  "Asia/Tehran",
  "America/New_York",
];

function runCompatibilityProbe(timeZone) {
  const probe = `
    import {
      getDayOfWeekFromDateKey,
      getPersianWeekKey,
      getPersianWeekRange,
    } from ${JSON.stringify(LEGACY_MODULE_URL)};
    import {
      getPolicyWeekKey,
      getPolicyWeekRange,
      parseCivilDateKey,
    } from ${JSON.stringify(POLICY_MODULE_URL)};

    const civilDates = ${JSON.stringify(CIVIL_DATES)};

    function policyWeekdayFromCivilDate(dateKey) {
      const { year, month, day } = parseCivilDateKey(dateKey);
      const utcDate = new Date(Date.UTC(year, month - 1, day));
      return (utcDate.getUTCDay() + 1) % 7;
    }

    const results = civilDates.map((dateKey) => {
      const { year, month, day } = parseCivilDateKey(dateKey);
      const localDate = new Date(year, month - 1, day);
      const legacyWeekKey = getPersianWeekKey(localDate);
      const legacyRange = getPersianWeekRange(legacyWeekKey);
      const policyWeekKey = getPolicyWeekKey(dateKey);
      const policyRange = getPolicyWeekRange(dateKey);

      const legacy = {
        weekKey: legacyWeekKey,
        range: {
          startDateKey: legacyRange.startDate,
          endDateKey: legacyRange.endDate,
        },
        weekday: getDayOfWeekFromDateKey(dateKey),
      };

      const policy = {
        weekKey: policyWeekKey,
        range: policyRange,
        weekday: policyWeekdayFromCivilDate(dateKey),
      };

      return {
        dateKey,
        legacy,
        policy,
        matches: {
          weekKey: legacy.weekKey === policy.weekKey,
          range:
            legacy.range.startDateKey === policy.range.startDateKey &&
            legacy.range.endDateKey === policy.range.endDateKey,
          weekday: legacy.weekday === policy.weekday,
        },
      };
    });

    process.stdout.write(JSON.stringify({ timeZone: ${JSON.stringify(
      timeZone
    )}, results }));
  `;

  const output = execFileSync(process.execPath, ["--input-type=module", "-e", probe], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, TZ: timeZone },
    encoding: "utf8",
  });

  return JSON.parse(output);
}

function reportComparison(timeZone, result) {
  for (const observation of result.results) {
    const differences = Object.entries(observation.matches)
      .filter(([, matches]) => !matches)
      .map(([area]) => area);

    const status = differences.length === 0 ? "MATCH" : "DIFFERENT";
    const suffix = differences.length
      ? ` differences=${differences.join(",")}`
      : "";

    console.log(
      `[time-compatibility] TZ=${timeZone} date=${observation.dateKey} ${status}${suffix}`
    );
  }
}

test("Legacy week APIs match the Time Policy across execution timezones", () => {
  for (const timeZone of EXECUTION_TIMEZONES) {
    const result = runCompatibilityProbe(timeZone);

    assert.equal(result.timeZone, timeZone);
    assert.deepEqual(
      result.results.map(({ dateKey }) => dateKey),
      CIVIL_DATES
    );

    for (const observation of result.results) {
      assert.match(observation.legacy.weekKey, /^\d{4}-W\d{2}$/);
      assert.match(observation.policy.weekKey, /^\d{4}-W\d{2}$/);
      assert.match(observation.legacy.range.startDateKey, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(observation.legacy.range.endDateKey, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(observation.policy.range.startDateKey, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(observation.policy.range.endDateKey, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(observation.legacy.weekday >= 0 && observation.legacy.weekday <= 6);
      assert.ok(observation.policy.weekday >= 0 && observation.policy.weekday <= 6);

      assert.equal(
        observation.matches.weekKey,
        true,
        `${timeZone} ${observation.dateKey}: Legacy week key differs from Time Policy`
      );
      assert.equal(
        observation.matches.range,
        true,
        `${timeZone} ${observation.dateKey}: Legacy week range differs from Time Policy`
      );
      assert.equal(
        observation.matches.weekday,
        true,
        `${timeZone} ${observation.dateKey}: Legacy weekday differs from Time Policy`
      );
    }

    reportComparison(timeZone, result);
  }
});

test("characterization includes the required Friday/Saturday and year-boundary cases", () => {
  const result = runCompatibilityProbe("UTC");
  const byDate = new Map(result.results.map((observation) => [observation.dateKey, observation]));

  assert.equal(byDate.get("2026-09-11").policy.weekday, 6);
  assert.equal(byDate.get("2026-09-12").policy.weekday, 0);
  assert.equal(byDate.get("2026-12-31").policy.weekKey, "2026-W52");
  assert.equal(byDate.get("2027-01-01").policy.weekKey, "2026-W52");
  assert.equal(byDate.get("2027-01-02").policy.weekKey, "2027-W01");
});
