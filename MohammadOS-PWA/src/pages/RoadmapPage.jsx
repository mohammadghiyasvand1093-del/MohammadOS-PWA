// src/pages/RoadmapPage.jsx
import { useState, useEffect, useRef } from "react";
import { db } from "../db/database";
import CoachReportModal from "../components/CoachReportModal";
import { runMonthlyReview } from "../ai/coachService";
import { toPersianNumber } from "../utils/date";

export default function RoadmapPage() {
  const [gates, setGates] = useState([]);
  const [expandedGate, setExpandedGate] = useState(null);
  const [newGate, setNewGate] = useState({
    title: "",
    description: "",
    criteriaText: "",
    evidenceLink: "",
    constraintNote: "",
    deadline: "",
    deadlineNote: "",
    order: 0,
    dependsOn: "",
  });
  const [error, setError] = useState(null);

  const [pendingCriteriaKeys, setPendingCriteriaKeys] = useState(() => new Set());
  const pendingCriteriaRef = useRef(new Set());
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [coachReport, setCoachReport] = useState(null);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

  useEffect(() => {
    async function loadGates() {
      try {
        const data = await db.gates.toArray();
        setGates((data || []).sort((a, b) => (a.order || 0) - (b.order || 0)));
      } catch (err) {
        console.error("Error loading gates:", err);
        setError("خطا در بارگذاری نقشه راه");
      }
    }
    loadGates();
  }, []);

  async function handleAddGate() {
    if (!newGate.title.trim()) return;

    const criteria = newGate.criteriaText
      .split("\n")
      .filter((t) => t.trim())
      .map((text) => ({
        id: crypto.randomUUID(),
        text: text.trim(),
        done: false,
        assessmentResult: "pending",
      }));

    const gate = {
      id: crypto.randomUUID(),
      title: newGate.title.trim(),
      description: newGate.description.trim(),
      constraintNote: newGate.constraintNote.trim(),
      deadline: newGate.deadline || null,
      deadlineNote: newGate.deadlineNote.trim(),
      order: Number(newGate.order) || 0,
      dependsOn: newGate.dependsOn
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      criteria,
      evidenceLink: newGate.evidenceLink.trim() || null,
      linkedRefIds: [],
      progress: 0,
    };

    try {
      setError(null);
      await db.gates.put(gate);
      const data = await db.gates.toArray();
      setGates((data || []).sort((a, b) => (a.order || 0) - (b.order || 0)));
      setNewGate({
        title: "",
        description: "",
        criteriaText: "",
        evidenceLink: "",
        constraintNote: "",
        deadline: "",
        deadlineNote: "",
        order: 0,
        dependsOn: "",
      });
    } catch (err) {
      console.error("Error adding gate to DB:", err);
      setError("خطا در افزودن دروازه");
    }
  }

  async function handleDeleteGate(gateId, e) {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این دروازه اطمینان دارید؟")) return;

    try {
      setError(null);
      await db.gates.delete(gateId);
      const data = await db.gates.toArray();
      setGates((data || []).sort((a, b) => (a.order || 0) - (b.order || 0)));
      if (expandedGate === gateId) {
        setExpandedGate(null);
        setOpenDropdownId(null);
      }
    } catch (err) {
      console.error("Error deleting gate:", err);
      setError("خطا در حذف دروازه");
    }
  }

  async function toggleCriteria(gateId, criteriaId) {
    const pendingKey = `${gateId}:${criteriaId}`;
    if (pendingCriteriaRef.current.has(pendingKey)) return;

    let previousGateSnapshot = null;
    let nextGateSnapshot = null;
    let didUpdate = false;

    pendingCriteriaRef.current.add(pendingKey);
    setPendingCriteriaKeys((prev) => {
      const next = new Set(prev);
      next.add(pendingKey);
      return next;
    });

    setError(null);

    setGates((prevGates) => {
      const gate = prevGates.find((g) => g.id === gateId);
      if (!gate) return prevGates;

      const criterionExists = gate.criteria.some((c) => c.id === criteriaId);
      if (!criterionExists) return prevGates;

      previousGateSnapshot = gate;
      nextGateSnapshot = {
        ...gate,
        criteria: gate.criteria.map((c) =>
          c.id === criteriaId ? { ...c, done: !c.done } : c
        ),
      };
      didUpdate = true;

      return prevGates.map((g) => (g.id === gateId ? nextGateSnapshot : g));
    });

    if (!didUpdate || !nextGateSnapshot || !previousGateSnapshot) {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
      return;
    }

    try {
      await db.gates.put(nextGateSnapshot);
    } catch (err) {
      console.error("Error updating criteria in DB:", err);
      setError("خطا در به‌روزرسانی معیار");

      setGates((prevGates) =>
        prevGates.map((g) => (g.id === gateId ? previousGateSnapshot : g))
      );
    } finally {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  }

  async function setAssessment(gateId, criteriaId, result) {
    const pendingKey = `${gateId}:${criteriaId}:assess`;
    if (pendingCriteriaRef.current.has(pendingKey)) return;

    const validResults = ["pending", "pass", "fail"];
    if (!validResults.includes(result)) return;

    let previousGateSnapshot = null;
    let nextGateSnapshot = null;

    setGates((prevGates) => {
      const gate = prevGates.find((g) => g.id === gateId);
      if (!gate) return prevGates;

      const criterionExists = gate.criteria.some((c) => c.id === criteriaId);
      if (!criterionExists) return prevGates;

      previousGateSnapshot = gate;
      nextGateSnapshot = {
        ...gate,
        criteria: gate.criteria.map((c) =>
          c.id === criteriaId ? { ...c, assessmentResult: result } : c
        ),
      };

      return prevGates.map((g) => (g.id === gateId ? nextGateSnapshot : g));
    });

    if (!nextGateSnapshot || !previousGateSnapshot) return;

    pendingCriteriaRef.current.add(pendingKey);
    setPendingCriteriaKeys((prev) => {
      const next = new Set(prev);
      next.add(pendingKey);
      return next;
    });

    try {
      await db.gates.put(nextGateSnapshot);
      setOpenDropdownId(null);
    } catch (err) {
      console.error("Error updating assessment in DB:", err);
      setGates((prevGates) =>
        prevGates.map((g) => (g.id === gateId ? previousGateSnapshot : g))
      );
    } finally {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => {
        const next = new Set(prev);
        next.delete(pendingKey);
        return next;
      });
    }
  }

  async function handleMonthlyReview() {
    setIsCoachModalOpen(true);
    setIsCoachLoading(true);
    setCoachError(null);
    setCoachReport(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, '0')}`;

      let monthLogs = [];
      try {
        monthLogs = await db.dayLogs.where({ year, month }).toArray();
      } catch (err) {
        console.warn("Schema lacks year/month index, falling back to filter:", err);
        const allLogs = await db.dayLogs.toArray();
        monthLogs = allLogs.filter(log => log.date && log.date.startsWith(monthStr));
      }

      const roadmapStatus = {
        totalGates: gates.length,
        completedGates: gates.filter(
          (g) => g.criteria.length > 0 && g.criteria.every((c) => c.done)
        ).length,
        gates: gates.map((g) => ({
          title: g.title,
          progress:
            g.criteria.length > 0
              ? (g.criteria.filter((c) => c.done).length / g.criteria.length) * 100
              : 0,
        })),
      };

      const result = await runMonthlyReview(monthLogs, roadmapStatus);
      setCoachReport(result);
    } catch (err) {
      setCoachError(err.message || "خطا در بازبینی ماهانه.");
    } finally {
      setIsCoachLoading(false);
    }
  }

  const completedGatesCount = gates.filter(
    (g) => g.criteria.length > 0 && g.criteria.every((c) => c.done)
  ).length;

  return (
    <div className="max-w-3xl mx-auto p-1 md:p-4 text-os-text">
      <div className="flex justify-between items-center mb-8 bg-os-card/40 p-4 rounded-xl border border-os-border/50">
        <div>
          <h2 className="text-lg font-bold text-white">نقشه راه مسیر شغلی</h2>
          <p className="text-[10px] font-mono text-os-accent mt-1 tracking-widest uppercase">
            Backend → DevOps → DevSecOps
          </p>
        </div>
        <div className="text-left">
          <span className="text-2xl font-bold text-os-accent font-mono" dir="ltr">
            {toPersianNumber(completedGatesCount)} / {toPersianNumber(gates.length)}
          </span>
          <p className="text-[9px] font-mono text-os-text/40 tracking-wider">GATES COMPLETED</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-8">
        {gates.length === 0 && (
          <div className="bg-os-card border border-dashed border-os-border/60 p-8 text-center rounded-lg">
            <p className="text-os-text/50 font-mono text-xs">
              NO GATES DEFINED YET. DEFINE YOUR FIRST MILESTONE BELOW.
            </p>
          </div>
        )}

        {gates.map((gate) => {
          const doneCount = gate.criteria.filter((c) => c.done).length;
          const progress = gate.criteria.length > 0 ? (doneCount / gate.criteria.length) * 100 : 0;
          const isExpanded = expandedGate === gate.id;

          const evidenceUrl = gate.evidenceLink
            ? (/^https?:\/\//i.test(gate.evidenceLink) ? gate.evidenceLink : `https://${gate.evidenceLink}`)
            : null;

          const assessmentSummary = gate.criteria.reduce(
            (acc, c) => {
              const key = c.assessmentResult || "pending";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            { pending: 0, pass: 0, fail: 0 }
          );

          const { pending: pendingCount, pass: passCount, fail: failCount } = assessmentSummary;

          const progressBarColor = (() => {
            const total = gate.criteria.length;
            if (total === 0) return "bg-slate-500";
            if (failCount > 0) return "bg-red-500";
            if (passCount === total) return "bg-emerald-500";
            if (passCount > 0) return "bg-amber-500";
            return "bg-slate-500";
          })();

          const hasConstraint = Boolean(gate.constraintNote?.trim());
          const hasDeadline = Boolean(gate.deadline);
          const isLocked = gate.dependsOn?.length > 0 && !gate.dependsOn.every((depId) =>
            gates.find((g) => g.id === depId && g.criteria.every((c) => c.done))
          );

          return (
            <div
              key={gate.id}
              className={`bg-os-card border rounded-xl overflow-hidden transition-all duration-300 ${
                isLocked ? "border-red-500/30" : "border-os-border"
              }`}
            >
              <div
                onClick={() => {
                  setExpandedGate(isExpanded ? null : gate.id);
                  if (isExpanded) setOpenDropdownId(null);
                }}
                className="w-full p-4 flex justify-between items-center text-right hover:bg-os-border/20 transition cursor-pointer select-none"
              >
                <div className="flex-1 min-w-0 pl-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-sm md:text-base text-white truncate">{gate.title}</h3>
                    {hasConstraint && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">
                        ⚠️ محدودیت
                      </span>
                    )}
                    {isLocked && (
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">
                        🔒 قفل
                      </span>
                    )}
                    {gate.order > 0 && (
                      <span className="text-[10px] font-mono text-os-text/30">
                        #{toPersianNumber(gate.order)}
                      </span>
                    )}
                  </div>

                  {gate.description && (
                    <p className="text-[10px] text-os-text/50 mb-1 line-clamp-1">{gate.description}</p>
                  )}

                  {hasDeadline && (
                    <p className="text-[10px] font-mono text-amber-400/70 mb-1">
                      ⏰ ددلاین: {gate.deadline} {gate.deadlineNote && `— ${gate.deadlineNote}`}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-[10px] font-mono text-os-text/40">
                      {toPersianNumber(doneCount)}/{toPersianNumber(gate.criteria.length)} CRITERIA
                    </span>
                    <span className="text-[10px] font-mono flex items-center gap-2">
                      {passCount > 0 && (
                        <span className="text-emerald-400">✅ {toPersianNumber(passCount)}</span>
                      )}
                      {failCount > 0 && (
                        <span className="text-red-400">❌ {toPersianNumber(failCount)}</span>
                      )}
                      {pendingCount > 0 && (
                        <span className="text-slate-400">⏳ {toPersianNumber(pendingCount)}</span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-1/2 md:w-2/5 shrink-0 justify-end">
                  <div className="flex-1 h-2 bg-os-bg/70 border border-os-border/60 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className={`h-full ${progressBarColor} transition-all duration-500`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <span
                    className={`font-mono text-xs ${
                      progress === 100 ? "text-emerald-400 font-bold" : "text-os-text/60"
                    }`}
                  >
                    {toPersianNumber(Math.round(progress))}%
                  </span>

                  <button
                    onClick={(e) => handleDeleteGate(gate.id, e)}
                    className="p-1 text-os-text/30 hover:text-red-400 rounded transition"
                    title="حذف دروازه"
                    aria-label={`حذف دروازه ${gate.title}`}
                  >
                    🗑️
                  </button>

                  <span
                    className={`text-os-text/40 font-bold transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                  >
                    ⌄
                  </span>
                </div>
              </div>

              {isExpanded && (
                <div className="p-4 pt-0 border-t border-os-border/30 bg-os-bg/30">
                  {gate.constraintNote && (
                    <div className="pt-3 pb-2">
                      <div className="text-[10px] font-mono text-amber-400/80 mb-1">⚠️ محدودیت / فرصت زمانی:</div>
                      <p className="text-xs text-os-text/70 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 leading-relaxed">
                        {gate.constraintNote}
                      </p>
                    </div>
                  )}

                  {gate.dependsOn?.length > 0 && (
                    <div className="pt-2 pb-1">
                      <div className="text-[10px] font-mono text-os-text/40 mb-1">🔗 وابسته به:</div>
                      <div className="flex gap-2 flex-wrap">
                        {gate.dependsOn.map((depId) => {
                          const depGate = gates.find((g) => g.id === depId);
                          const depDone = depGate?.criteria.every((c) => c.done);
                          return (
                            <span
                              key={depId}
                              className={`text-[10px] font-mono px-2 py-1 rounded border ${
                                depDone
                                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                  : "bg-red-500/10 border-red-500/30 text-red-400"
                              }`}
                            >
                              {depDone ? "✅" : "🔒"} {depGate?.title || depId}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {evidenceUrl && (
                    <div className="pt-3 pb-1">
                      <a
                        href={evidenceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-[10px] font-mono text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 rounded-lg transition"
                        onClick={(e) => e.stopPropagation()}
                      >
                        🔗 Evidence Link
                      </a>
                    </div>
                  )}

                  <ul className="space-y-2 pt-3">
                    {gate.criteria.map((c) => {
                      const isPending = pendingCriteriaKeys.has(`${gate.id}:${c.id}`) || pendingCriteriaKeys.has(`${gate.id}:${c.id}:assess`);
                      const assessment = c.assessmentResult || "pending";

                      const assessmentBadge = {
                        pending: { label: "⏳", color: "text-slate-400 border-slate-600 bg-slate-500/10" },
                        pass: { label: "✅", color: "text-emerald-400 border-emerald-500 bg-emerald-500/10" },
                        fail: { label: "❌", color: "text-red-400 border-red-500 bg-red-500/10" },
                      }[assessment];

                      return (
                        <li
                          key={c.id}
                          className="flex items-center gap-3 p-2 hover:bg-os-border/10 rounded-lg transition"
                        >
                          <button
                            onClick={() => toggleCriteria(gate.id, c.id)}
                            disabled={isPending}
                            className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                              c.done
                                ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold"
                                : "border-os-border text-transparent hover:border-os-accent"
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                            {c.done && "✓"}
                          </button>

                          <span
                            className={`text-xs md:text-sm flex-1 ${
                              c.done ? "line-through text-os-text/40" : "text-os-text"
                            }`}
                          >
                            {c.text}
                          </span>

                          {c.estimatedHours && (
                            <span className="text-[9px] font-mono text-os-text/30">
                              {toPersianNumber(c.estimatedHours)}h
                            </span>
                          )}

                          <div className="relative">
                            <button
                              onClick={() => setOpenDropdownId(openDropdownId === c.id ? null : c.id)}
                              disabled={isPending}
                              className={`text-[10px] font-mono px-2 py-1 rounded border ${assessmentBadge.color} hover:opacity-80 transition disabled:opacity-50 disabled:cursor-not-allowed`}
                              title={`Assessment: ${assessment}`}
                            >
                              {assessmentBadge.label} {assessment}
                            </button>

                            {openDropdownId === c.id && (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  onClick={() => setOpenDropdownId(null)}
                                />
                                <div className="absolute right-0 top-full mt-1 flex flex-col gap-1 bg-os-card border border-os-border rounded-lg p-1.5 shadow-xl z-20 min-w-[80px]">
                                  {["pending", "pass", "fail"].map((r) => (
                                    <button
                                      key={r}
                                      onClick={() => setAssessment(gate.id, c.id, r)}
                                      className={`text-[10px] font-mono px-2 py-1 rounded text-right transition ${
                                        assessment === r
                                          ? "bg-os-accent/20 text-os-accent"
                                          : "hover:bg-os-border/30 text-os-text/70"
                                      }`}
                                    >
                                      {r === "pending" ? "⏳" : r === "pass" ? "✅" : "❌"} {r}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="bg-os-card border border-os-border p-6 rounded-xl mb-8">
        <h3 className="text-[10px] font-mono text-os-accent mb-4 uppercase tracking-wider">
          [ + ] DEPLOY NEW CAREER GATE
        </h3>
        <div className="space-y-3">
          <input
            type="text"
            placeholder="عنوان دروازه (مثلاً: Backend Foundations)"
            value={newGate.title}
            onChange={(e) => setNewGate({ ...newGate, title: e.target.value })}
            className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition"
          />
          <textarea
            placeholder="توضیحات دروازه (اختیاری)"
            value={newGate.description}
            onChange={(e) => setNewGate({ ...newGate, description: e.target.value })}
            className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <textarea
            placeholder="محدودیت / فرصت زمانی (اختیاری) — مثلاً: پنجره دسترسی به استاد تا فلان تاریخ"
            value={newGate.constraintNote}
            onChange={(e) => setNewGate({ ...newGate, constraintNote: e.target.value })}
            className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">ددلاین (ISO)</label>
              <input
                type="date"
                value={newGate.deadline}
                onChange={(e) => setNewGate({ ...newGate, deadline: e.target.value })}
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">یادداشت ددلاین</label>
              <input
                type="text"
                placeholder="تقریبی — اواخر شهریور"
                value={newGate.deadlineNote}
                onChange={(e) => setNewGate({ ...newGate, deadlineNote: e.target.value })}
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">ترتیب (عدد)</label>
              <input
                type="number"
                value={newGate.order}
                onChange={(e) => setNewGate({ ...newGate, order: e.target.value })}
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">وابسته به (IDها با کاما)</label>
              <input
                type="text"
                placeholder="gate-001, gate-002"
                value={newGate.dependsOn}
                onChange={(e) => setNewGate({ ...newGate, dependsOn: e.target.value })}
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
          </div>
          <textarea
            placeholder="معیارهای پذیرش (هر خط یک مورد)"
            value={newGate.criteriaText}
            onChange={(e) => setNewGate({ ...newGate, criteriaText: e.target.value })}
            className="w-full h-24 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <input
            type="text"
            placeholder="لینک مدرک / Evidence URL (اختیاری)"
            value={newGate.evidenceLink}
            onChange={(e) => setNewGate({ ...newGate, evidenceLink: e.target.value })}
            className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
          />
          <button
            onClick={handleAddGate}
            className="w-full bg-os-accent/10 border border-os-accent text-os-accent py-2.5 rounded-lg font-mono text-xs md:text-sm hover:bg-os-accent/20 transition-all active:scale-[0.99]"
          >
            [ COMMIT_GATE ]
          </button>
        </div>
      </div>

      <button
        onClick={handleMonthlyReview}
        className="w-full p-4 rounded-xl font-mono text-xs md:text-sm border border-os-accent/60 text-os-accent bg-os-accent/5 hover:bg-os-accent/10 transition-all flex items-center justify-center gap-3 active:scale-[0.99]"
      >
        <span>🧠</span>
        RUN MONTHLY AI STRATEGY REVIEW
      </button>

      <CoachReportModal
        isOpen={isCoachModalOpen}
        onClose={() => setIsCoachModalOpen(false)}
        isLoading={isCoachLoading}
        error={coachError}
        reportData={coachReport}
      />
    </div>
  );
}