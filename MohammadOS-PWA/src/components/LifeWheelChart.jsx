// src/components/LifeWheelChart.jsx
import { useEffect, useMemo, useState } from "react";
import {
  LIFE_WHEEL_DIMENSIONS,
  calculateLifeWheelScores,
  getLifeWheelManualScores,
  saveLifeWheelManualScores,
} from "../app/lifeWheelService";

// Mission Console palette — DO NOT revert to Tailwind defaults
const COLOR_CONSOLE_BG = "#131922";
const COLOR_CARD_BG = "#1A222D";
const COLOR_BORDER = "#232B36";
const COLOR_GRID = "#343D4B";
const COLOR_TEXT_MUTED = "#8A99AD";
const COLOR_TEXT_LIGHT = "#E2E8F0";
const COLOR_AMBER = "#F5A623";
const COLOR_SAGE = "#4FAE87";
const COLOR_SAGE_ALPHA = "rgba(79, 174, 135, 0.2)";

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
  periodKey = "",
  onSaveSuccess = null,
}) {
  const [manualScores, setManualScores] = useState({});
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!periodKey) return undefined;
    let isMounted = true;

    async function loadManualScores() {
      const scores = await getLifeWheelManualScores(periodKey);

      if (isMounted) {
        setManualScores(scores || {});
      }
    }

    loadManualScores();

    return () => {
      isMounted = false;
    };
  }, [periodKey]);

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
    if (!periodKey) return;
    setIsSaving(true);

    try {
      await saveLifeWheelManualScores(periodKey, manualScores);
      if (onSaveSuccess) {
        onSaveSuccess();
      }
    } catch (err) {
      console.error("Save manual scores error:", err);
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section 
      style={{ backgroundColor: COLOR_CARD_BG, borderColor: COLOR_BORDER }} 
      className="rounded-lg border p-6 shadow-lg"
    >
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 style={{ color: COLOR_TEXT_LIGHT }} className="text-lg font-bold font-mono">
            [ 🕸 ] LIFE WHEEL BALANCE
          </h2>
          <p style={{ color: COLOR_TEXT_MUTED }} className="mt-1 text-xs font-mono">
            امتیازدهی تعادل زندگی برای دوره جاری ({periodKey})
          </p>
        </div>

        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving || !periodKey}
          style={{ 
            backgroundColor: isSaving || !periodKey ? COLOR_BORDER : COLOR_SAGE,
            color: isSaving || !periodKey ? COLOR_TEXT_MUTED : COLOR_CONSOLE_BG
          }}
          className="inline-flex items-center justify-center gap-2 rounded px-4 py-1.5 text-xs font-bold font-mono transition tracking-wider hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving && (
            <span 
              style={{ borderTopColor: "transparent", borderColor: COLOR_CONSOLE_BG }} 
              className="h-3 w-3 animate-spin rounded-full border-2" 
            />
          )}
          {isSaving ? "SAVING..." : "SAVE"}
        </button>
      </div>

      {!hasAnyAutoData && (
        <div 
          style={{ borderColor: `${COLOR_AMBER}4D`, backgroundColor: `${COLOR_AMBER}1A`, color: COLOR_AMBER }} 
          className="mb-6 rounded border p-3 text-xs font-mono leading-relaxed"
        >
          هشدار: فاقد داده خودکار. لطفاً اهداف، عادات یا کارها را جهت محاسبه خودکار به ابعاد چرخ متصل نمایید.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr] items-center">
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
                  stroke={COLOR_GRID}
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
                RADIUS + 24
              );

              return (
                <g key={dimension.id}>
                  <line
                    x1={CENTER}
                    y1={CENTER}
                    x2={end.x}
                    y2={end.y}
                    stroke={COLOR_GRID}
                    strokeWidth="1"
                  />
                  <text
                    x={label.x}
                    y={label.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={COLOR_TEXT_LIGHT}
                    className="text-[10px] font-bold font-mono"
                  >
                    {dimension.label}
                  </text>
                </g>
              );
            })}

            <polygon
              points={shape}
              fill={COLOR_SAGE_ALPHA}
              stroke={COLOR_SAGE}
              strokeWidth="2.5"
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
                    r="4.5"
                    fill={COLOR_AMBER}
                  />
                  <title>
                    {item.label}: {item.hasData ? item.value.toFixed(1) : "No Data"}
                  </title>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="space-y-3">
          {chartData.map((item) => {
            const sliderId = `life-wheel-${item.id}`;
            const manualValue = manualScores[item.id] ?? "";

            return (
              <div
                key={item.id}
                style={{ backgroundColor: COLOR_BORDER, borderColor: COLOR_GRID }}
                className="rounded border p-3"
              >
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label
                    htmlFor={sliderId}
                    style={{ color: COLOR_TEXT_LIGHT }}
                    className="text-xs font-mono font-bold"
                  >
                    {item.label}
                  </label>

                  <span style={{ color: COLOR_AMBER }} className="text-xs font-mono font-bold">
                    {item.hasData ? item.value.toFixed(1) : "N/A"}
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
                  style={{ accentColor: COLOR_SAGE }}
                  className="w-full"
                />

                <div style={{ color: COLOR_TEXT_MUTED }} className="mt-2 flex justify-between text-[10px] font-mono">
                  <span>
                    Auto: {typeof item.auto === "number" ? item.auto.toFixed(1) : "N/A"}
                  </span>
                  <span>
                    Manual: {typeof item.manual === "number" ? item.manual.toFixed(1) : "N/A"}
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
