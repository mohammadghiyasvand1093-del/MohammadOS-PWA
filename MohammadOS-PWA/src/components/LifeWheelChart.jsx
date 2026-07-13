import { useEffect, useMemo, useState } from "react";
import {
  LIFE_WHEEL_DIMENSIONS,
  calculateLifeWheelScores,
  getLifeWheelManualScores,
  saveLifeWheelManualScores,
} from "../app/lifeWheelService";

const RADIUS = 110;
const CENTER = 140;
const SVG_SIZE = 280;

function polarToCartesian(index, total, value = RADIUS) {
  const angle = (Math.PI * 2 * index) / total - Math.PI / 2;

  return {
    x: CENTER + Math.cos(angle) * value,
    y: CENTER + Math.sin(angle) * value,
  };
}

function buildPolygonPoints(items) {
  return items
    .map((item, index) => {
      const point = polarToCartesian(
        index,
        items.length,
        (item.value / 10) * RADIUS
      );

      return `${point.x},${point.y}`;
    })
    .join(" ");
}

export default function LifeWheelChart({
  habits = [],
  courses = [],
  dayLogs = [],
}) {
  const [manualScores, setManualScores] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadManualScores() {
      const scores = await getLifeWheelManualScores();

      if (isMounted) {
        setManualScores(scores || {});
      }
    }

    loadManualScores();

    return () => {
      isMounted = false;
    };
  }, []);

  const scores = useMemo(
    () =>
      calculateLifeWheelScores({
        habits,
        courses,
        dayLogs,
        manualScores,
      }),
    [habits, courses, dayLogs, manualScores]
  );

  const chartData = useMemo(
    () =>
      LIFE_WHEEL_DIMENSIONS.map((dimension) => {
        const score = scores[dimension.id] || {};
        const hasData =
          typeof score.auto === "number" || typeof score.manual === "number";

        return {
          ...dimension,
          value: hasData ? score.final : 0,
          auto: score.auto,
          manual: score.manual,
          hasData,
        };
      }),
    [scores]
  );

  const shape = useMemo(() => buildPolygonPoints(chartData), [chartData]);

  const hasAnyAutoData = useMemo(
    () => chartData.some((item) => typeof item.auto === "number"),
    [chartData]
  );

  function handleManualScoreChange(dimensionId, value) {
    setManualScores((currentScores) => ({
      ...currentScores,
      [dimensionId]: Number(value),
    }));
  }

  async function handleSave() {
    setIsSaving(true);

    try {
      await saveLifeWheelManualScores(manualScores);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-lg">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Life Wheel</h2>
          <p className="mt-1 text-sm text-slate-400">
            نمای کلی تعادل زندگی بر اساس داده‌های خودکار و امتیازهای دستی.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950 border-t-transparent" />
          )}
          {isSaving ? "SAVING..." : "SAVE"}
        </button>
      </div>

      {!hasAnyAutoData && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          هنوز داده خودکار کافی وجود ندارد. برای دقیق‌تر شدن چرخ زندگی، عادت‌ها
          یا دوره‌ها را به ابعاد Life Wheel وصل کن.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="flex justify-center">
          <svg
            width={SVG_SIZE}
            height={SVG_SIZE}
            viewBox={`0 0 ${SVG_SIZE} ${SVG_SIZE}`}
            role="img"
            aria-label="Life wheel radar chart"
            className="max-w-full"
          >
            {[2, 4, 6, 8, 10].map((level) => {
              const points = LIFE_WHEEL_DIMENSIONS.map((_, index) => {
                const point = polarToCartesian(
                  index,
                  LIFE_WHEEL_DIMENSIONS.length,
                  (level / 10) * RADIUS
                );

                return `${point.x},${point.y}`;
              }).join(" ");

              return (
                <polygon
                  key={level}
                  points={points}
                  fill="none"
                  stroke="rgb(51 65 85)"
                  strokeWidth="1"
                />
              );
            })}

            {LIFE_WHEEL_DIMENSIONS.map((dimension, index) => {
              const end = polarToCartesian(
                index,
                LIFE_WHEEL_DIMENSIONS.length
              );
              const label = polarToCartesian(
                index,
                LIFE_WHEEL_DIMENSIONS.length,
                RADIUS + 22
              );

              return (
                <g key={dimension.id}>
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={end.x}
                    y2={end.y}
                    stroke="rgb(51 65 85)"
                    strokeWidth="1"
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-300 text-[10px]"
                  >
                    {dimension.label}
                  </text>
                </g>
              );
            })}

            <polygon
              points={shape}
              fill="rgb(34 211 238 / 0.22)"
              stroke="rgb(34 211 238)"
              strokeWidth="2"
            />

            {chartData.map((item, index) => {
              const point = polarToCartesian(
                index,
                chartData.length,
                (item.value / 10) * RADIUS
              );

              return (
                <g key={item.id}>
                  <circle
                    cx={point.x}
                    cy={point.y}
                    r="4"
                    fill="rgb(34 211 238)"
                  />
                  <title>
                    {item.label}: {item.hasData ? item.value.toFixed(1) : "No Data"}
                  </title>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-4">
          {chartData.map((item) => {
            const sliderId = `life-wheel-${item.id}`;
            const manualValue = manualScores[item.id] ?? "";

            return (
              <div
                key={item.id}
                className="rounded-xl border border-slate-800 bg-slate-900/60 p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor={sliderId}
                    className="text-sm font-medium text-slate-100"
                  >
                    {item.label}
                  </label>

                  <span className="text-sm text-slate-400">
                    {item.hasData ? item.value.toFixed(1) : "No Data"}
                  </span>
                </div>

                <input
                  id={sliderId}
                  type="range"
                  min="0"
                  max="10"
                  step="1"
                  value={manualValue}
                  aria-label={`${item.label} manual score`}
                  onChange={(event) =>
                    handleManualScoreChange(item.id, event.target.value)
                  }
                  className="w-full accent-cyan-400"
                />

                <div className="mt-2 flex justify-between text-xs text-slate-500">
                  <span>
                    Auto: {typeof item.auto === "number" ? item.auto.toFixed(1) : "No Data"}
                  </span>
                  <span>
                    Manual: {typeof item.manual === "number" ? item.manual.toFixed(1) : "No Data"}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
