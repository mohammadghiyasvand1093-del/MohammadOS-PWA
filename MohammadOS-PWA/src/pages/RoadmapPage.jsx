// src/pages/RoadmapPage.jsx
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { db } from "../db/database";
import { GateRepository } from "../repositories/GateRepository";
import CoachReportModal from "../components/CoachReportModal";
import { runMonthlyReview } from "../ai/coachService";
import { ImportService } from "../app/ImportService";
// ✅ FIX 3.7: Added toPersianDate
import { toPersianNumber, toPersianDate } from "../utils/date";
import RoadmapStatsPanel from "../components/RoadmapStatsPanel";
import RoadmapGateCard from "../components/RoadmapGateCard";
import RoadmapImportWizard from "../components/RoadmapImportWizard";

export default function RoadmapPage() {
  const [gates, setGates] = useState([]);
  const [expandedGate, setExpandedGate] = useState(null);
  const [newGate, setNewGate] = useState({
    title: "", description: "", criteriaText: "", evidenceLink: "",
    constraintNote: "", deadline: "", deadlineNote: "", order: 0, dependsOn: "",
  });
  const [error, setError] = useState(null);
  const [importStatus, setImportStatus] = useState(null);

  const [pendingCriteriaKeys, setPendingCriteriaKeys] = useState(() => new Set());
  const pendingCriteriaRef = useRef(new Set());
  const [openDropdownId, setOpenDropdownId] = useState(null);

  const [isCoachLoading, setIsCoachLoading] = useState(false);
  const [coachError, setCoachError] = useState(null);
  const [coachReport, setCoachReport] = useState(null);
  const [isCoachModalOpen, setIsCoachModalOpen] = useState(false);

  const [showImportWizard, setShowImportWizard] = useState(false);
  const fileInputRef = useRef(null);

  const [editingGateId, setEditingGateId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);

  useEffect(() => {
    async function loadGates() {
      try {
        const data = await GateRepository.getAll();
        setGates(data);
      } catch (err) {
        console.error("Error loading gates:", err);
        setError("خطا در بارگذاری نقشه راه");
      }
    }
    loadGates();
  }, []);

  const reloadGates = useCallback(async () => {
    try {
      const data = await GateRepository.getAll();
      setGates(data);
    } catch (err) {
      console.error("Error reloading gates:", err);
    }
  }, []);

  const handleImportRoadmap = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportStatus("در حال پردازش فایل...");
    setError(null);
    try {
      const text = await file.text();
      const result = await ImportService.importRoadmapFromJSON(text, true);
      setImportStatus(`✅ ${result.importedGates} دروازه با موفقیت ایمپورت شد.`);
      await reloadGates();
    } catch (err) {
      console.error("Roadmap Import Error:", err);
      setError("خطا در ایمپورت نقشه راه: " + err.message);
      setImportStatus(null);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleAddGate = async () => {
    if (!newGate.title.trim()) return;
    const criteria = newGate.criteriaText.split("\n").filter((t) => t.trim()).map((text) => ({
      id: crypto.randomUUID(), text: text.trim(), done: false, assessmentResult: "pending",
    }));
    const gate = {
      id: crypto.randomUUID(), title: newGate.title.trim(), description: newGate.description.trim(),
      constraintNote: newGate.constraintNote.trim(), deadline: newGate.deadline || null,
      deadlineNote: newGate.deadlineNote.trim(), order: Number(newGate.order) || 0,
      dependsOn: newGate.dependsOn.split(",").map((s) => s.trim()).filter(Boolean),
      criteria, evidenceLink: newGate.evidenceLink.trim() || null, linkedRefIds: [], progress: 0,
    };
    try {
      setError(null);
      await GateRepository.saveGate(gate);
      await reloadGates();
      setNewGate({ title: "", description: "", criteriaText: "", evidenceLink: "", constraintNote: "", deadline: "", deadlineNote: "", order: 0, dependsOn: "" });
    } catch (err) {
      console.error("Error adding gate to DB:", err);
      setError("خطا در افزودن دروازه");
    }
  };

  const handleDeleteGate = useCallback(async (gateId, e) => {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این دروازه اطمینان دارید؟")) return;
    try {
      setError(null);
      await GateRepository.deleteGate(gateId);
      await reloadGates();
      setExpandedGate((prev) => (prev === gateId ? null : prev));
      setOpenDropdownId(null);
    } catch (err) {
      console.error("Error deleting gate:", err);
      setError("خطا در حذف دروازه");
    }
  }, [reloadGates]);

  const toggleCriteria = useCallback(async (gateId, criteriaId) => {
    const pendingKey = `${gateId}:${criteriaId}`;
    if (pendingCriteriaRef.current.has(pendingKey)) return;

    let previousGateSnapshot = null;
    let nextGateSnapshot = null;
    let didUpdate = false;

    pendingCriteriaRef.current.add(pendingKey);
    setPendingCriteriaKeys((prev) => { const next = new Set(prev); next.add(pendingKey); return next; });
    setError(null);

    setGates((prevGates) => {
      const gate = prevGates.find((g) => g.id === gateId);
      if (!gate) return prevGates;
      const criterionExists = gate.criteria.some((c) => c.id === criteriaId);
      if (!criterionExists) return prevGates;
      previousGateSnapshot = gate;
      nextGateSnapshot = {
        ...gate,
        criteria: gate.criteria.map((c) => (c.id === criteriaId ? { ...c, done: !c.done } : c)),
      };
      didUpdate = true;
      return prevGates.map((g) => (g.id === gateId ? nextGateSnapshot : g));
    });

    if (!didUpdate || !nextGateSnapshot || !previousGateSnapshot) {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => { const next = new Set(prev); next.delete(pendingKey); return next; });
      return;
    }

    try {
      await GateRepository.saveGate(nextGateSnapshot);
    } catch (err) {
      console.error("Error updating criteria in DB:", err);
      setError("خطا در به‌روزرسانی معیار");
      setGates((prevGates) => prevGates.map((g) => (g.id === gateId ? previousGateSnapshot : g)));
    } finally {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => { const next = new Set(prev); next.delete(pendingKey); return next; });
    }
  }, []);

  const setAssessment = useCallback(async (gateId, criteriaId, result) => {
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
        criteria: gate.criteria.map((c) => (c.id === criteriaId ? { ...c, assessmentResult: result } : c)),
      };
      return prevGates.map((g) => (g.id === gateId ? nextGateSnapshot : g));
    });

    if (!nextGateSnapshot || !previousGateSnapshot) return;

    pendingCriteriaRef.current.add(pendingKey);
    setPendingCriteriaKeys((prev) => { const next = new Set(prev); next.add(pendingKey); return next; });

    try {
      await GateRepository.saveGate(nextGateSnapshot);
      setOpenDropdownId(null);
    } catch (err) {
      console.error("Error updating assessment in DB:", err);
      setGates((prevGates) => prevGates.map((g) => (g.id === gateId ? previousGateSnapshot : g)));
    } finally {
      pendingCriteriaRef.current.delete(pendingKey);
      setPendingCriteriaKeys((prev) => { const next = new Set(prev); next.delete(pendingKey); return next; });
    }
  }, []);

  const handleMonthlyReview = async () => {
    setIsCoachModalOpen(true);
    setIsCoachLoading(true);
    setCoachError(null);
    setCoachReport(null);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const monthStr = `${year}-${String(month).padStart(2, "0")}`;
      let monthLogs = [];
      try {
        monthLogs = await db.dayLogs.where({ year, month }).toArray();
      } catch (err) {
        console.warn("Schema lacks year/month index, falling back to filter:", err);
        const allLogs = await db.dayLogs.toArray();
        monthLogs = allLogs.filter((log) => log.date && log.date.startsWith(monthStr));
      }
      
      const roadmapStatus = {
        totalGates: gates.length,
        completedGates: gates.filter((g) => g.criteria.length > 0 && g.criteria.every((c) => c.done)).length,
        gates: gates.map((g) => ({
          title: g.title,
          progress: g.criteria.length > 0 ? (g.criteria.filter((c) => c.done).length / g.criteria.length) * 100 : 0,
          deadline: g.deadline || null,
          constraintNote: g.constraintNote || "",
        })),
      };
      const result = await runMonthlyReview(monthLogs, roadmapStatus);
      setCoachReport(result);
    } catch (err) {
      setCoachError(err.message || "خطا در بازبینی ماهانه.");
    } finally {
      setIsCoachLoading(false);
    }
  };

  const handleExportRoadmapJSON = () => {
    if (gates.length === 0) { setError("هیچ Gateی برای خروجی گرفتن وجود ندارد."); return; }
    setError(null);
    const exportData = {
      app: "MohammadOS-PWA", exportedAt: new Date().toISOString(),
      gates: gates.map((g) => ({
        title: g.title, description: g.description || "", constraintNote: g.constraintNote || "",
        deadline: g.deadline || null, deadlineNote: g.deadlineNote || "", order: g.order || 0,
        dependsOn: (g.dependsOn || []).map((depId) => { const depGate = gates.find((gg) => gg.id === depId); return depGate ? depGate.title : depId; }),
        criteria: (g.criteria || []).map((c) => ({ title: c.text })), evidenceLink: g.evidenceLink || null,
      })),
    };
    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mohammados-roadmap-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleExportRoadmapMarkdown = () => {
    if (gates.length === 0) { setError("هیچ Gateی برای خروجی گرفتن وجود ندارد."); return; }
    setError(null);
    let md = `# 🗺️ نقشه راه مسیر شغلی MohammadOS\n\n**تاریخ تولید:** ${new Date().toLocaleDateString("fa-IR")}\n\n---\n\n`;
    gates.forEach((g) => {
      const doneCount = g.criteria?.filter((c) => c.done).length || 0;
      const totalCount = g.criteria?.length || 0;
      const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;
      md += `## ${g.order ? `#${g.order} ` : ""}${g.title}\n\n`;
      if (g.description) md += `> ${g.description}\n\n`;
      md += `**پیشرفت:** ${progress}% (${doneCount}/${totalCount} معیار)\n\n`;
      // ✅ FIX 3.8: Convert export markdown deadline to Persian
      if (g.deadline) md += `**⏰ ددلاین:** ${toPersianDate(g.deadline)} ${g.deadlineNote ? `— ${g.deadlineNote}` : ""}\n\n`;
      if (g.constraintNote) md += `**⚠️ محدودیت:** ${g.constraintNote}\n\n`;
      if (g.evidenceLink) md += `**🔗 مدرک:** [لینک](${g.evidenceLink})\n\n`;
      if (g.dependsOn?.length > 0) {
        const depTitles = g.dependsOn.map((depId) => { const depGate = gates.find((gg) => gg.id === depId); return depGate ? depGate.title : depId; });
        md += `**وابسته به:** ${depTitles.join(", ")}\n\n`;
      }
      if (totalCount > 0) {
        md += `### معیارهای پذیرش:\n\n`;
        g.criteria.forEach((c) => {
          const check = c.done ? "[x]" : "[ ]";
          const assess = c.assessmentResult === "pass" ? "✅" : c.assessmentResult === "fail" ? "❌" : "⏳";
          md += `- ${check} ${c.text} ${assess}\n`;
        });
        md += `\n`;
      }
      md += `---\n\n`;
    });
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `mohammados-roadmap-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const handleStartEdit = (gate) => {
    setEditingGateId(gate.id);
    setEditFormData({ ...gate, dependsOnText: (gate.dependsOn || []).join(", "), newCriteriaText: "" });
  };

  const handleCancelEdit = () => {
    setEditingGateId(null);
    setEditFormData(null);
  };

  const handleUpdateGate = async () => {
    if (!editFormData?.title.trim()) { setError("عنوان دروازه نمی‌تواند خالی باشد"); return; }
    const updatedGate = {
      ...editFormData, title: editFormData.title.trim(), description: editFormData.description.trim(),
      constraintNote: editFormData.constraintNote.trim(), deadline: editFormData.deadline || null,
      deadlineNote: editFormData.deadlineNote.trim(), order: Number(editFormData.order) || 0,
      dependsOn: editFormData.dependsOnText ? editFormData.dependsOnText.split(",").map((s) => s.trim()).filter(Boolean) : [],
      evidenceLink: editFormData.evidenceLink?.trim() || null,
    };
    delete updatedGate.dependsOnText;
    delete updatedGate.newCriteriaText;
    try {
      setError(null);
      await GateRepository.saveGate(updatedGate);
      await reloadGates();
      setEditingGateId(null);
      setEditFormData(null);
    } catch (err) {
      console.error("Error updating gate:", err);
      setError("خطا در به‌روزرسانی دروازه");
    }
  };

  const handleEditCriteriaChange = (criteriaId, newText) => {
    setEditFormData((prev) => ({ ...prev, criteria: prev.criteria.map((c) => (c.id === criteriaId ? { ...c, text: newText } : c)) }));
  };

  const handleDeleteCriteria = (criteriaId) => {
    setEditFormData((prev) => ({ ...prev, criteria: prev.criteria.filter((c) => c.id !== criteriaId) }));
  };

  const handleAddCriteriaToEdit = () => {
    if (!editFormData?.newCriteriaText.trim()) return;
    const newCriteria = editFormData.newCriteriaText.split("\n").filter((t) => t.trim()).map((text) => ({
      id: crypto.randomUUID(), text: text.trim(), done: false, assessmentResult: "pending",
    }));
    setEditFormData((prev) => ({ ...prev, criteria: [...(prev.criteria || []), ...newCriteria], newCriteriaText: "" }));
  };

  const roadmapStats = useMemo(() => {
    let completedGates = 0, inProgressGates = 0, lockedGates = 0, overdueGates = 0, totalCriteria = 0, doneCriteria = 0;
    const todayStr = new Date().toISOString().split("T")[0];
    gates.forEach((g) => {
      const total = g.criteria?.length || 0;
      const done = g.criteria?.filter((c) => c.done).length || 0;
      totalCriteria += total; doneCriteria += done;
      const isComplete = total > 0 && done === total;
      if (isComplete) completedGates++;
      else if (done > 0) inProgressGates++;
      const isLocked = g.dependsOn?.length > 0 && !g.dependsOn.every((depId) => {
        const dep = gates.find((gg) => gg.id === depId);
        return dep && dep.criteria.length > 0 && dep.criteria.every((c) => c.done);
      });
      if (isLocked) lockedGates++;
      const isOverdue = g.deadline && g.deadline < todayStr && !isComplete;
      if (isOverdue) overdueGates++;
    });
    const completionRate = totalCriteria > 0 ? Math.round((doneCriteria / totalCriteria) * 100) : 0;
    return { totalGates: gates.length, completedGates, inProgressGates, lockedGates, overdueGates, totalCriteria, doneCriteria, completionRate };
  }, [gates]);

  return (
    <div className="max-w-3xl mx-auto p-1 md:p-4 text-os-text">
      <div className="flex justify-between items-center mb-8 bg-os-card/40 p-4 rounded-xl border border-os-border/50">
        <div>
          <h2 className="text-lg font-bold text-white">نقشه راه مسیر شغلی</h2>
          <p className="text-[10px] font-mono text-os-accent mt-1 tracking-widest uppercase">Backend → DevOps → DevSecOps</p>
        </div>
        <div className="text-left">
          <span className="text-2xl font-bold text-os-accent font-mono" dir="ltr">
            {toPersianNumber(roadmapStats.completedGates)} / {toPersianNumber(gates.length)}
          </span>
          <p className="text-[9px] font-mono text-os-text/40 tracking-wider">GATES COMPLETED</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">{error}</div>
      )}
      {importStatus && (
        <div className="mb-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-300">{importStatus}</div>
      )}

      <RoadmapStatsPanel stats={roadmapStats} />

      <div className="space-y-4 mb-8">
        {gates.length === 0 && (
          <div className="bg-os-card border border-dashed border-os-border/60 p-8 text-center rounded-lg">
            <p className="text-os-text/50 font-mono text-xs">NO GATES DEFINED YET. DEFINE YOUR FIRST MILESTONE BELOW OR IMPORT FROM AI ADVISOR.</p>
          </div>
        )}

        {gates.map((gate) => (
          <RoadmapGateCard
            key={gate.id}
            gate={gate}
            allGates={gates}
            isExpanded={expandedGate === gate.id}
            isEditing={editingGateId === gate.id && editFormData}
            editFormData={editFormData}
            pendingCriteriaKeys={pendingCriteriaKeys}
            openDropdownId={openDropdownId}
            onToggleExpand={(id) => { setExpandedGate((prev) => (prev === id ? null : id)); setOpenDropdownId(null); }}
            onStartEdit={handleStartEdit}
            onCancelEdit={handleCancelEdit}
            onUpdateGate={handleUpdateGate}
            onEditFormDataChange={setEditFormData}
            onEditCriteriaChange={handleEditCriteriaChange}
            onDeleteCriteria={handleDeleteCriteria}
            onAddCriteriaToEdit={handleAddCriteriaToEdit}
            onDeleteGate={handleDeleteGate}
            onToggleCriteria={toggleCriteria}
            onSetAssessment={setAssessment}
            onSetOpenDropdownId={setOpenDropdownId}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 mb-8">
        <input type="file" accept=".json" ref={fileInputRef} onChange={handleImportRoadmap} className="hidden" />
        <button 
          onClick={() => fileInputRef.current?.click()} 
          className="py-3 rounded-lg font-mono text-xs border border-amber-500/60 text-amber-400 bg-amber-500/5 hover:bg-amber-500/10 transition flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          📥 Import JSON
        </button>
        <button onClick={handleExportRoadmapJSON} className="py-3 rounded-lg font-mono text-xs border border-sky-500/60 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition flex items-center justify-center gap-2 active:scale-[0.99]">📤 Export JSON</button>
        <button onClick={handleExportRoadmapMarkdown} className="py-3 rounded-lg font-mono text-xs border border-emerald-500/60 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition flex items-center justify-center gap-2 active:scale-[0.99]">📝 Export MD</button>
      </div>

      <RoadmapImportWizard
        isOpen={showImportWizard}
        onToggle={() => setShowImportWizard((prev) => !prev)}
        existingGatesCount={gates.length}
        onImportSuccess={reloadGates}
      />

      <div className="bg-os-card border border-os-border p-6 rounded-xl mb-8">
        <h3 className="text-[10px] font-mono text-os-accent mb-4 uppercase tracking-wider">[ + ] DEPLOY NEW CAREER GATE</h3>
        <div className="space-y-3">
          <input type="text" placeholder="عنوان دروازه (مثلاً: Backend Foundations)" value={newGate.title} onChange={(e) => setNewGate({ ...newGate, title: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition" />
          <textarea placeholder="توضیحات دروازه (اختیاری)" value={newGate.description} onChange={(e) => setNewGate({ ...newGate, description: e.target.value })} className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition" />
          <textarea placeholder="محدودیت / فرصت زمانی (اختیاری) — مثلاً: پنجره دسترسی به استاد تا فلان تاریخ" value={newGate.constraintNote} onChange={(e) => setNewGate({ ...newGate, constraintNote: e.target.value })} className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">ددلاین (ISO)</label>
              <input type="date" value={newGate.deadline} onChange={(e) => setNewGate({ ...newGate, deadline: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono" />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">یادداشت ددلاین</label>
              <input type="text" placeholder="تقریبی — اواخر شهریور" value={newGate.deadlineNote} onChange={(e) => setNewGate({ ...newGate, deadlineNote: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">ترتیب (عدد)</label>
              <input type="number" value={newGate.order} onChange={(e) => setNewGate({ ...newGate, order: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono" />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">وابسته به (IDها با کاما)</label>
              <input type="text" placeholder="gate-001, gate-002" value={newGate.dependsOn} onChange={(e) => setNewGate({ ...newGate, dependsOn: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono" />
            </div>
          </div>
          <textarea placeholder="معیارهای پذیرش (هر خط یک مورد)" value={newGate.criteriaText} onChange={(e) => setNewGate({ ...newGate, criteriaText: e.target.value })} className="w-full h-24 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition" />
          <input type="text" placeholder="لینک مدرک / Evidence URL (اختیاری)" value={newGate.evidenceLink} onChange={(e) => setNewGate({ ...newGate, evidenceLink: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono" />
          <button onClick={handleAddGate} className="w-full bg-os-accent/10 border border-os-accent text-os-accent py-2.5 rounded-lg font-mono text-xs md:text-sm hover:bg-os-accent/20 transition-all active:scale-[0.99]">[ COMMIT_GATE ]</button>
        </div>
      </div>

      <button onClick={handleMonthlyReview} className="w-full p-4 rounded-xl font-mono text-xs md:text-sm border border-os-accent/60 text-os-accent bg-os-accent/5 hover:bg-os-accent/10 transition-all flex items-center justify-center gap-3 active:scale-[0.99]">
        <span>🧠</span> RUN MONTHLY AI STRATEGY REVIEW
      </button>

      <CoachReportModal isOpen={isCoachModalOpen} onClose={() => setIsCoachModalOpen(false)} isLoading={isCoachLoading} error={coachError} reportData={coachReport} />
    </div>
  );
}