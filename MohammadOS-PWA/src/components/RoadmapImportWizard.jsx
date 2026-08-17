// src/components/RoadmapImportWizard.jsx
import { useState, useRef } from "react";
import { GateRepository } from "../repositories/GateRepository";
import { toPersianNumber } from "../utils/date";
import { ROADMAP_PROMPT, ROADMAP_GUIDE_TEXT } from "../ai/roadmapPrompt";

function normalizeImportedGate(rawGate, orderFallback, titleToIdMap, orderToIdMap) {
  if (!rawGate || typeof rawGate !== "object") return null;

  const title = (rawGate.title || "").toString().trim();
  if (!title) return null;

  const rawCriteria = Array.isArray(rawGate.criteria) ? rawGate.criteria : [];
  const criteria = rawCriteria
    .map((c) => {
      if (!c || typeof c !== "object") return null;
      const text = (c.title || c.text || "").toString().trim();
      if (!text) return null;
      return {
        id: crypto.randomUUID(),
        text,
        done: false,
        assessmentResult: "pending",
        estimatedHours: c.estimatedHours ? Number(c.estimatedHours) : null,
      };
    })
    .filter(Boolean);

  const rawDeps = Array.isArray(rawGate.dependsOn) ? rawGate.dependsOn : [];
  const dependsOn = rawDeps
    .map((dep) => {
      if (!dep) return null;
      const depStr = dep.toString().trim();
      if (!depStr) return null;

      if (titleToIdMap.has(depStr)) return titleToIdMap.get(depStr);

      const gateMatch = depStr.match(/^gate-(\d+)$/i);
      if (gateMatch) {
        const orderNum = parseInt(gateMatch[1], 10);
        if (orderToIdMap.has(orderNum)) return orderToIdMap.get(orderNum);
      }

      return depStr;
    })
    .filter(Boolean);

  let deadline = null;
  if (rawGate.deadline && typeof rawGate.deadline === "string") {
    const d = rawGate.deadline.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) deadline = d;
  }

  return {
    id: crypto.randomUUID(),
    title,
    description: (rawGate.description || "").toString().trim(),
    constraintNote: (rawGate.constraintNote || "").toString().trim(),
    deadline,
    deadlineNote: (rawGate.deadlineNote || "").toString().trim(),
    order: Number(rawGate.order) || orderFallback,
    dependsOn,
    criteria,
    evidenceLink: rawGate.evidenceLink ? rawGate.evidenceLink.toString().trim() : null,
    linkedRefIds: [],
    progress: 0,
  };
}

export default function RoadmapImportWizard({ isOpen, onToggle, existingGatesCount, onImportSuccess }) {
  const [aiGuideStep, setAiGuideStep] = useState(1);
  const [roadmapJsonInput, setRoadmapJsonInput] = useState("");
  const [roadmapPreview, setRoadmapPreview] = useState(null);
  const [roadmapImportStatus, setRoadmapImportStatus] = useState("");
  const [roadmapCopied, setRoadmapCopied] = useState(false);
  const [roadmapImportLoading, setRoadmapImportLoading] = useState(false);
  const [importMode, setImportMode] = useState("merge");
  const copyTimeoutRef = useRef(null);

  const handleCopyRoadmapPrompt = async () => {
    try {
      await navigator.clipboard.writeText(ROADMAP_PROMPT);
      setRoadmapCopied(true);
      setRoadmapImportStatus("✅ پرامپت با موفقیت کپی شد!");
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => {
        setRoadmapCopied(false);
        setRoadmapImportStatus("");
      }, 2500);
    } catch {
      setRoadmapImportStatus("❌ کپی ناموفق - دستی کپی کنید");
    }
  };

  const handleParseRoadmapJson = () => {
    setRoadmapImportStatus("");
    setRoadmapPreview(null);

    if (!roadmapJsonInput.trim()) {
      setRoadmapImportStatus("❌ ابتدا JSON را پیست کنید");
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(roadmapJsonInput);
    } catch (e) {
      setRoadmapImportStatus("❌ JSON نامعتبر: " + e.message);
      return;
    }

    let gatesArray;
    if (Array.isArray(parsed)) {
      gatesArray = parsed;
    } else if (parsed && Array.isArray(parsed.gates)) {
      gatesArray = parsed.gates;
    } else if (parsed && typeof parsed === "object" && parsed.title) {
      gatesArray = [parsed];
    } else {
      setRoadmapImportStatus("❌ ساختار نامعتبر — باید { gates: [...] } یا آرایه [...] باشد");
      return;
    }

    if (gatesArray.length === 0) {
      setRoadmapImportStatus("❌ هیچ Gateی در JSON یافت نشد");
      return;
    }

    const titleToIdMap = new Map();
    const orderToIdMap = new Map();
    gatesArray.forEach((g) => {
      const title = (g?.title || "").toString().trim();
      const order = Number(g?.order) || null;
      const newId = crypto.randomUUID();
      if (title) titleToIdMap.set(title, newId);
      if (order) orderToIdMap.set(order, newId);
    });

    const normalized = gatesArray
      .map((g, idx) => normalizeImportedGate(g, idx + 1, titleToIdMap, orderToIdMap))
      .filter(Boolean);

    if (normalized.length === 0) {
      setRoadmapImportStatus("❌ هیچ Gate معتبری پس از اعتبارسنجی یافت نشد");
      return;
    }

    const gatesWithoutCriteria = normalized.filter((g) => g.criteria.length === 0);
    if (gatesWithoutCriteria.length > 0) {
      setRoadmapImportStatus(`⚠️ ${toPersianNumber(gatesWithoutCriteria.length)} Gate بدون معیار است — ادامه می‌دهیم ولی بهتر است بررسی کنید`);
    } else {
      setRoadmapImportStatus(`✅ ${toPersianNumber(normalized.length)} Gate آماده وارد کردن است`);
    }

    setRoadmapPreview(normalized);
    setAiGuideStep(3);
  };

  const handleImportRoadmap = async () => {
    if (!roadmapPreview || roadmapPreview.length === 0) return;

    if (importMode === "replace" && existingGatesCount > 0 && !window.confirm(`⚠️ حالت جایگزینی: تمام ${toPersianNumber(existingGatesCount)} Gate فعلی حذف خواهند شد و ${toPersianNumber(roadmapPreview.length)} Gate جدید جایگزین می‌شوند. ادامه می‌دهی؟`)) {
      return;
    }

    setRoadmapImportLoading(true);
    setRoadmapImportStatus("در حال وارد کردن...");

    try {
      let savedCount;
      if (importMode === "replace") {
        savedCount = await GateRepository.replaceAll(roadmapPreview);
      } else {
        savedCount = await GateRepository.bulkSave(roadmapPreview);
      }

      setRoadmapImportStatus(`✅ ${toPersianNumber(savedCount)} Gate با موفقیت ${importMode === "replace" ? "جایگزین" : "اضافه"} شد`);

      setTimeout(() => {
        setRoadmapPreview(null);
        setRoadmapJsonInput("");
        setRoadmapImportStatus("");
        setAiGuideStep(1);
        onToggle(); // Close wizard
        onImportSuccess(); // Reload gates in parent
      }, 1800);
    } catch (err) {
      console.error("Roadmap import error:", err);
      setRoadmapImportStatus("❌ خطا در وارد کردن: " + (err.message || "نامشخص"));
    } finally {
      setRoadmapImportLoading(false);
    }
  };

  const handleCancelImport = () => {
    setRoadmapPreview(null);
    setRoadmapJsonInput("");
    setRoadmapImportStatus("");
    setAiGuideStep(1);
  };

  return (
    <div className="bg-os-card border border-os-border p-4 rounded-xl mb-8">
      <button onClick={onToggle} className="w-full flex items-center justify-between text-right hover:bg-os-border/10 -m-4 p-4 rounded-xl transition">
        <div className="flex items-center gap-3">
          <span className="text-lg">📥</span>
          <div>
            <h3 className="text-sm font-bold text-os-accent">Import Roadmap از مشاور AI</h3>
            <p className="text-[10px] font-mono text-os-text/40 mt-0.5">ساخت نقشه راه با ChatGPT/Claude و وارد کردن JSON</p>
          </div>
        </div>
        <span className={`text-os-text/40 font-bold transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}>⌄</span>
      </button>

      {isOpen && (
        <div className="mt-6 space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3].map((s) => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${aiGuideStep >= s ? "bg-os-accent" : "bg-os-border"}`} />
            ))}
          </div>

          {aiGuideStep === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">🤖</span>
                <h4 className="text-sm font-bold text-os-accent">راهنمای ساخت نقشه راه با AI</h4>
              </div>
              <div className="text-xs text-os-text/70 leading-relaxed whitespace-pre-line bg-os-bg/50 p-4 rounded-lg border border-os-border/50">
                {ROADMAP_GUIDE_TEXT}
              </div>
              <div className="bg-os-bg/50 p-4 rounded-lg border border-os-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-os-text">📋 پرامپت مشاور مسیر شغلی</span>
                  <button onClick={handleCopyRoadmapPrompt} className={`text-[10px] font-mono px-3 py-1.5 rounded border transition ${roadmapCopied ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "bg-os-accent/10 text-os-accent border-os-accent/30 hover:bg-os-accent/20"}`}>
                    {roadmapCopied ? "✅ کپی شد!" : "📋 کپی پرامپت"}
                  </button>
                </div>
                <div className="max-h-48 overflow-y-auto text-[10px] font-mono text-os-text/50 bg-os-bg p-3 rounded border border-os-border/30 whitespace-pre-wrap">
                  {ROADMAP_PROMPT}
                </div>
              </div>
              <button onClick={() => setAiGuideStep(2)} className="w-full py-3 bg-os-accent text-os-bg font-mono text-xs rounded-lg hover:opacity-90 transition active:scale-[0.99]">
                مرحله بعد: Paste JSON →
              </button>
            </div>
          )}

          {aiGuideStep === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">📥</span>
                <h4 className="text-sm font-bold text-os-accent">Paste JSON نقشه راه</h4>
              </div>
              <textarea
                value={roadmapJsonInput}
                onChange={(e) => setRoadmapJsonInput(e.target.value)}
                placeholder={`{\n  "gates": [\n    {\n      "title": "...",\n      "criteria": [{ "title": "..." }]\n    }\n  ]\n}`}
                className="w-full h-64 bg-os-bg border border-os-border rounded-lg p-3 text-[11px] font-mono focus:outline-none focus:border-os-accent resize-none text-os-text"
                dir="ltr"
              />
              {roadmapImportStatus && (
                <div className={`text-xs p-2 rounded font-mono ${roadmapImportStatus.startsWith("✅") ? "bg-emerald-500/10 text-emerald-400" : roadmapImportStatus.startsWith("⚠️") ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                  {roadmapImportStatus}
                </div>
              )}
              <div className="flex gap-2">
                <button onClick={() => setAiGuideStep(1)} className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:bg-os-border/20 transition">
                  ← قبلی
                </button>
                <button onClick={handleParseRoadmapJson} disabled={!roadmapJsonInput.trim()} className="flex-1 py-2 bg-os-accent text-os-bg font-mono text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition">
                  بررسی و Preview →
                </button>
              </div>
            </div>
          )}

          {aiGuideStep === 3 && roadmapPreview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">👁️</span>
                <h4 className="text-sm font-bold text-os-accent">پیش‌نمایش نقشه راه ({toPersianNumber(roadmapPreview.length)} Gate)</h4>
              </div>

              <div className="bg-os-bg/50 p-3 rounded-lg border border-os-border/50">
                <div className="text-[10px] font-mono text-os-text/60 mb-2 uppercase">Import Mode:</div>
                <div className="flex gap-2">
                  <button onClick={() => setImportMode("merge")} className={`flex-1 py-2 text-xs font-mono rounded border transition ${importMode === "merge" ? "bg-emerald-500/10 border-emerald-500 text-emerald-400" : "border-os-border text-os-text/60 hover:bg-os-border/20"}`}>
                    ➕ اضافه (Merge)
                  </button>
                  <button onClick={() => setImportMode("replace")} className={`flex-1 py-2 text-xs font-mono rounded border transition ${importMode === "replace" ? "bg-red-500/10 border-red-500 text-red-400" : "border-os-border text-os-text/60 hover:bg-os-border/20"}`}>
                    🔄 جایگزین (Replace)
                  </button>
                </div>
                {importMode === "replace" && existingGatesCount > 0 && (
                  <p className="text-[10px] text-red-400 mt-2 font-mono">
                    ⚠️ {toPersianNumber(existingGatesCount)} Gate فعلی حذف خواهند شد!
                  </p>
                )}
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {roadmapPreview.map((gate, idx) => (
                  <div key={idx} className="bg-os-bg/50 rounded-lg border border-os-border/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-os-text/40">#{toPersianNumber(gate.order)}</span>
                        <span className="text-xs font-bold text-os-text">{gate.title}</span>
                      </div>
                      <span className="text-[10px] font-mono text-os-accent">{toPersianNumber(gate.criteria.length)} معیار</span>
                    </div>
                    {gate.description && <p className="text-[10px] text-os-text/50 mb-2">{gate.description}</p>}
                    {gate.criteria.length > 0 ? (
                      <ul className="space-y-1 pr-4">
                        {gate.criteria.slice(0, 3).map((c, ci) => (
                          <li key={ci} className="text-[10px] text-os-text/70 flex items-center gap-2">
                            <span className="text-os-text/30">○</span>
                            <span>{c.text}</span>
                          </li>
                        ))}
                        {gate.criteria.length > 3 && <li className="text-[10px] text-os-text/40 pr-4">+{toPersianNumber(gate.criteria.length - 3)} مورد دیگر...</li>}
                      </ul>
                    ) : (
                      <p className="text-[10px] text-amber-400/70 font-mono">⚠️ بدون معیار</p>
                    )}
                  </div>
                ))}
              </div>

              {roadmapImportStatus && (
                <div className={`text-xs p-2 rounded font-mono ${roadmapImportStatus.startsWith("✅") ? "bg-emerald-500/10 text-emerald-400" : roadmapImportStatus.startsWith("⚠️") ? "bg-amber-500/10 text-amber-400" : "bg-red-500/10 text-red-400"}`}>
                  {roadmapImportStatus}
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={handleCancelImport} disabled={roadmapImportLoading} className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:bg-os-border/20 transition disabled:opacity-50">
                  ← ویرایش JSON
                </button>
                <button onClick={handleImportRoadmap} disabled={roadmapImportLoading} className="flex-1 py-2 bg-emerald-500 text-white font-mono text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition">
                  {roadmapImportLoading ? "..." : importMode === "replace" ? "🔄 جایگزین کن" : "✅ اضافه کن"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}