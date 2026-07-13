import { useState, useEffect } from "react";
import { db } from "../db/database";
import CoachReportModal from "../components/CoachReportModal";
import { runMonthlyReview } from "../ai/coachService";

export default function RoadmapPage() {
  const [gates, setGates] = useState([]);
  const [expandedGate, setExpandedGate] = useState(null);
  const [newGate, setNewGate] = useState({ title: "", criteriaText: "" });

  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [coachReport, setCoachReport] = useState(null);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

  useEffect(() => {
    async function loadGates() {
      try {
        const data = await db.gates.toArray();
        setGates(data || []);
      } catch (err) {
        console.error("Error loading gates:", err);
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
      }));

    const gate = {
      id: crypto.randomUUID(),
      title: newGate.title.trim(),
      criteria,
      linkedRefIds: [],
    };

    try {
      await db.gates.put(gate);
      setGates([...gates, gate]);
      setNewGate({ title: "", criteriaText: "" });
    } catch (err) {
      console.error("Error adding gate to DB:", err);
    }
  }

  async function handleDeleteGate(gateId, e) {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این دروازه اطمینان دارید؟")) return;

    try {
      await db.gates.delete(gateId);
      setGates(gates.filter((g) => g.id !== gateId));
      if (expandedGate === gateId) setExpandedGate(null);
    } catch (err) {
      console.error("Error deleting gate:", err);
    }
  }

  async function toggleCriteria(gateId, criteriaId) {
    const updatedGates = gates.map((g) => {
      if (g.id === gateId) {
        return {
          ...g,
          criteria: g.criteria.map((c) => (c.id === criteriaId ? { ...c, done: !c.done } : c)),
        };
      }
      return g;
    });

    setGates(updatedGates);
    const gateToUpdate = updatedGates.find((g) => g.id === gateId);
    try {
      await db.gates.put(gateToUpdate);
    } catch (err) {
      console.error("Error updating criteria in DB:", err);
    }
  }

  // اصلاح باگ ۱: ارسال داده‌های واقعی به AI Coach
  async function handleMonthlyReview() {
    setIsCoachModalOpen(true);
    setIsCoachLoading(true);
    setCoachError(null);
    setCoachReport(null);

    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      
      // خواندن لاگ‌های ماه جاری
      const monthLogs = await db.dayLogs.where({ year, month }).toArray();

      // ساخت خلاصه وضعیت نقشه راه
      const roadmapStatus = {
        totalGates: gates.length,
        completedGates: gates.filter(g => g.criteria.length > 0 && g.criteria.every(c => c.done)).length,
        gates: gates.map(g => ({
          title: g.title,
          progress: g.criteria.length > 0 ? (g.criteria.filter(c => c.done).length / g.criteria.length) * 100 : 0
        }))
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
      {/* هدر Roadmap */}
      <div className="flex justify-between items-center mb-8 bg-os-card/40 p-4 rounded-xl border border-os-border/50">
        <div>
          <h2 className="text-lg font-bold text-white">نقشه راه مسیر شغلی</h2>
          <p className="text-[10px] font-mono text-os-accent mt-1 tracking-widest uppercase">
            Backend → DevOps → DevSecOps
          </p>
        </div>
        <div className="text-left">
          <span className="text-2xl font-bold text-os-accent font-mono">
            {completedGatesCount} / {gates.length}
          </span>
          <p className="text-[9px] font-mono text-os-text/40 tracking-wider">GATES COMPLETED</p>
        </div>
      </div>

      {/* لیست Gates */}
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

          return (
            <div
              key={gate.id}
              className="bg-os-card border border-os-border rounded-xl overflow-hidden transition-all duration-300"
            >
              <div
                onClick={() => setExpandedGate(isExpanded ? null : gate.id)}
                className="w-full p-4 flex justify-between items-center text-right hover:bg-os-border/20 transition cursor-pointer select-none"
              >
                <div className="flex-1 min-w-0 pl-4">
                  <h3 className="font-bold text-sm md:text-base text-white truncate">{gate.title}</h3>
                  <span className="text-[10px] font-mono text-os-text/40">
                    {doneCount}/{gate.criteria.length} CRITERIA REACHED
                  </span>
                </div>

                <div className="flex items-center gap-3 w-1/2 md:w-2/5 shrink-0 justify-end">
                  <div className="flex-1 h-2 bg-os-bg/70 border border-os-border/60 rounded-full overflow-hidden hidden sm:block">
                    <div
                      className="h-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  <span
                    className={`font-mono text-xs ${
                      progress === 100 ? "text-emerald-400 font-bold" : "text-os-text/60"
                    }`}
                  >
                    {Math.round(progress)}%
                  </span>

                  <button
                    onClick={(e) => handleDeleteGate(gate.id, e)}
                    className="p-1 text-os-text/30 hover:text-red-400 rounded transition"
                    title="حذف دروازه"
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
                  <ul className="space-y-2 pt-3">
                    {gate.criteria.map((c) => (
                      <li
                        key={c.id}
                        className="flex items-center gap-3 p-2 hover:bg-os-border/10 rounded-lg transition"
                      >
                        <button
                          onClick={() => toggleCriteria(gate.id, c.id)}
                          className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${
                            c.done
                              ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold"
                              : "border-os-border text-transparent hover:border-os-accent"
                          }`}
                        >
                          {c.done && "✓"}
                        </button>

                        <span
                          className={`text-xs md:text-sm ${
                            c.done ? "line-through text-os-text/40" : "text-os-text"
                          }`}
                        >
                          {c.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* فرم افزودن Gate */}
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
            placeholder="معیارهای پذیرش (هر خط یک مورد)"
            value={newGate.criteriaText}
            onChange={(e) => setNewGate({ ...newGate, criteriaText: e.target.value })}
            className="w-full h-24 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <button
            onClick={handleAddGate}
            className="w-full bg-os-accent/10 border border-os-accent text-os-accent py-2.5 rounded-lg font-mono text-xs md:text-sm hover:bg-os-accent/20 transition-all active:scale-[0.99]"
          >
            [ COMMIT_GATE ]
          </button>
        </div>
      </div>

      {/* دکمه بازبینی ماهانه AI */}
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