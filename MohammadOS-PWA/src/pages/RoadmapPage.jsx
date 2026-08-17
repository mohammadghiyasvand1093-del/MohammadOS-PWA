// src/pages/RoadmapPage.jsx
import { useState, useEffect, useRef } from "react";
import { db } from "../db/database";
import { GateRepository } from "../repositories/GateRepository";
import CoachReportModal from "../components/CoachReportModal";
import { runMonthlyReview } from "../ai/coachService";
import { toPersianNumber } from "../utils/date";
import { ROADMAP_PROMPT, ROADMAP_GUIDE_TEXT } from "../ai/roadmapPrompt";

export default function RoadmapPage() {
  // === Existing State (preserved) ===
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

  // === Import Wizard State (Batch 55) ===
  const [showImportWizard, setShowImportWizard] = useState(false);
  const [importMode, setImportMode] = useState("merge");
  const [aiGuideStep, setAiGuideStep] = useState(1);
  const [roadmapJsonInput, setRoadmapJsonInput] = useState("");
  const [roadmapPreview, setRoadmapPreview] = useState(null);
  const [roadmapImportStatus, setRoadmapImportStatus] = useState("");
  const [roadmapCopied, setRoadmapCopied] = useState(false);
  const [roadmapImportLoading, setRoadmapImportLoading] = useState(false);
  const copyTimeoutRef = useRef(null);

  // === Inline Edit State (Batch 56) ===
  const [editingGateId, setEditingGateId] = useState(null);
  const [editFormData, setEditFormData] = useState(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

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

  async function reloadGates() {
    try {
      const data = await GateRepository.getAll();
      setGates(data);
    } catch (err) {
      console.error("Error reloading gates:", err);
    }
  }

  // === Existing: handleAddGate ===
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
      await GateRepository.saveGate(gate);
      await reloadGates();
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

  // === Existing: handleDeleteGate ===
  async function handleDeleteGate(gateId, e) {
    e.stopPropagation();
    if (!window.confirm("آیا از حذف این دروازه اطمینان دارید؟")) return;

    try {
      setError(null);
      await GateRepository.deleteGate(gateId);
      await reloadGates();
      if (expandedGate === gateId) {
        setExpandedGate(null);
        setOpenDropdownId(null);
      }
    } catch (err) {
      console.error("Error deleting gate:", err);
      setError("خطا در حذف دروازه");
    }
  }

  // === Existing: toggleCriteria ===
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
      await GateRepository.saveGate(nextGateSnapshot);
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

  // === Existing: setAssessment ===
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
      await GateRepository.saveGate(nextGateSnapshot);
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

  // === Existing: handleMonthlyReview ===
  async function handleMonthlyReview() {
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

  // === NEW: Roadmap Export Handlers (Batch 57) ===
  const handleExportRoadmapJSON = () => {
    if (gates.length === 0) {
      setError("هیچ Gateی برای خروجی گرفتن وجود ندارد.");
      return;
    }
    setError(null);

    const exportData = {
      app: "MohammadOS-PWA",
      exportedAt: new Date().toISOString(),
      gates: gates.map((g) => ({
        title: g.title,
        description: g.description || "",
        constraintNote: g.constraintNote || "",
        deadline: g.deadline || null,
        deadlineNote: g.deadlineNote || "",
        order: g.order || 0,
        dependsOn: (g.dependsOn || []).map((depId) => {
          const depGate = gates.find((gg) => gg.id === depId);
          return depGate ? depGate.title : depId;
        }),
        criteria: (g.criteria || []).map((c) => ({
          title: c.text,
        })),
        evidenceLink: g.evidenceLink || null,
      })),
    };

    const jsonStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mohammados-roadmap-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportRoadmapMarkdown = () => {
    if (gates.length === 0) {
      setError("هیچ Gateی برای خروجی گرفتن وجود ندارد.");
      return;
    }
    setError(null);

    let md = `# 🗺️ نقشه راه مسیر شغلی MohammadOS\n\n`;
    md += `**تاریخ تولید:** ${new Date().toLocaleDateString("fa-IR")}\n\n`;
    md += `---\n\n`;

    gates.forEach((g) => {
      const doneCount = g.criteria?.filter((c) => c.done).length || 0;
      const totalCount = g.criteria?.length || 0;
      const progress = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

      md += `## ${g.order ? `#${g.order} ` : ""}${g.title}\n\n`;

      if (g.description) md += `> ${g.description}\n\n`;

      md += `**پیشرفت:** ${progress}% (${doneCount}/${totalCount} معیار)\n\n`;

      if (g.deadline) md += `**⏰ ددلاین:** ${g.deadline} ${g.deadlineNote ? `— ${g.deadlineNote}` : ""}\n\n`;
      if (g.constraintNote) md += `**⚠️ محدودیت:** ${g.constraintNote}\n\n`;
      if (g.evidenceLink) md += `**🔗 مدرک:** [لینک](${g.evidenceLink})\n\n`;

      if (g.dependsOn?.length > 0) {
        const depTitles = g.dependsOn.map((depId) => {
          const depGate = gates.find((gg) => gg.id === depId);
          return depGate ? depGate.title : depId;
        });
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
    a.href = url;
    a.download = `mohammados-roadmap-${new Date().toISOString().split("T")[0]}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // === Import Wizard Handlers (Batch 55) ===
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
      evidenceLink: rawGate.evidenceLink
        ? rawGate.evidenceLink.toString().trim()
        : null,
      linkedRefIds: [],
      progress: 0,
    };
  }

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
      setRoadmapImportStatus(
        "❌ ساختار نامعتبر — باید { gates: [...] } یا آرایه [...] باشد"
      );
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
      setRoadmapImportStatus(
        `⚠️ ${toPersianNumber(
          gatesWithoutCriteria.length
        )} Gate بدون معیار است — ادامه می‌دهیم ولی بهتر است بررسی کنید`
      );
    } else {
      setRoadmapImportStatus(
        `✅ ${toPersianNumber(normalized.length)} Gate آماده وارد کردن است`
      );
    }

    setRoadmapPreview(normalized);
    setAiGuideStep(3);
  };

  const handleImportRoadmap = async () => {
    if (!roadmapPreview || roadmapPreview.length === 0) return;

    if (
      importMode === "replace" &&
      gates.length > 0 &&
      !window.confirm(
        `⚠️ حالت جایگزینی: تمام ${toPersianNumber(
          gates.length
        )} Gate فعلی حذف خواهند شد و ${toPersianNumber(
          roadmapPreview.length
        )} Gate جدید جایگزین می‌شوند. ادامه می‌دهی؟`
      )
    ) {
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

      await reloadGates();

      setRoadmapImportStatus(
        `✅ ${toPersianNumber(savedCount)} Gate با موفقیت ${
          importMode === "replace" ? "جایگزین" : "اضافه"
        } شد`
      );

      setTimeout(() => {
        setRoadmapPreview(null);
        setRoadmapJsonInput("");
        setRoadmapImportStatus("");
        setAiGuideStep(1);
        setShowImportWizard(false);
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

  // === Inline Edit Handlers (Batch 56) ===
  const handleStartEdit = (gate) => {
    setEditingGateId(gate.id);
    setEditFormData({
      ...gate,
      dependsOnText: (gate.dependsOn || []).join(", "),
      newCriteriaText: "",
    });
  };

  const handleCancelEdit = () => {
    setEditingGateId(null);
    setEditFormData(null);
  };

  const handleUpdateGate = async () => {
    if (!editFormData?.title.trim()) {
      setError("عنوان دروازه نمی‌تواند خالی باشد");
      return;
    }

    const updatedGate = {
      ...editFormData,
      title: editFormData.title.trim(),
      description: editFormData.description.trim(),
      constraintNote: editFormData.constraintNote.trim(),
      deadline: editFormData.deadline || null,
      deadlineNote: editFormData.deadlineNote.trim(),
      order: Number(editFormData.order) || 0,
      dependsOn: editFormData.dependsOnText
        ? editFormData.dependsOnText.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
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
    setEditFormData((prev) => ({
      ...prev,
      criteria: prev.criteria.map((c) =>
        c.id === criteriaId ? { ...c, text: newText } : c
      ),
    }));
  };

  const handleDeleteCriteria = (criteriaId) => {
    setEditFormData((prev) => ({
      ...prev,
      criteria: prev.criteria.filter((c) => c.id !== criteriaId),
    }));
  };

  const handleAddCriteriaToEdit = () => {
    if (!editFormData?.newCriteriaText.trim()) return;
    const newCriteria = editFormData.newCriteriaText
      .split("\n")
      .filter((t) => t.trim())
      .map((text) => ({
        id: crypto.randomUUID(),
        text: text.trim(),
        done: false,
        assessmentResult: "pending",
      }));

    setEditFormData((prev) => ({
      ...prev,
      criteria: [...(prev.criteria || []), ...newCriteria],
      newCriteriaText: "",
    }));
  };

  const completedGatesCount = gates.filter(
    (g) => g.criteria.length > 0 && g.criteria.every((c) => c.done)
  ).length;

  return (
    <div className="max-w-3xl mx-auto p-1 md:p-4 text-os-text">
      {/* Header */}
      <div className="flex justify-between items-center mb-8 bg-os-card/40 p-4 rounded-xl border border-os-border/50">
        <div>
          <h2 className="text-lg font-bold text-white">نقشه راه مسیر شغلی</h2>
          <p className="text-[10px] font-mono text-os-accent mt-1 tracking-widest uppercase">
            Backend → DevOps → DevSecOps
          </p>
        </div>
        <div className="text-left">
          <span
            className="text-2xl font-bold text-os-accent font-mono"
            dir="ltr"
          >
            {toPersianNumber(completedGatesCount)} / {toPersianNumber(gates.length)}
          </span>
          <p className="text-[9px] font-mono text-os-text/40 tracking-wider">
            GATES COMPLETED
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Gates List */}
      <div className="space-y-4 mb-8">
        {gates.length === 0 && (
          <div className="bg-os-card border border-dashed border-os-border/60 p-8 text-center rounded-lg">
            <p className="text-os-text/50 font-mono text-xs">
              NO GATES DEFINED YET. DEFINE YOUR FIRST MILESTONE BELOW OR IMPORT
              FROM AI ADVISOR.
            </p>
          </div>
        )}

        {gates.map((gate) => {
          const doneCount = gate.criteria.filter((c) => c.done).length;
          const progress =
            gate.criteria.length > 0
              ? (doneCount / gate.criteria.length) * 100
              : 0;
          const isExpanded = expandedGate === gate.id;
          const isEditing = editingGateId === gate.id && editFormData;

          const evidenceUrl = gate.evidenceLink
            ? /^https?:\/\//i.test(gate.evidenceLink)
              ? gate.evidenceLink
              : `https://${gate.evidenceLink}`
            : null;

          const assessmentSummary = gate.criteria.reduce(
            (acc, c) => {
              const key = c.assessmentResult || "pending";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            { pending: 0, pass: 0, fail: 0 }
          );

          const {
            pending: pendingCount,
            pass: passCount,
            fail: failCount,
          } = assessmentSummary;

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
          const isLocked =
            gate.dependsOn?.length > 0 &&
            !gate.dependsOn.every(
              (depId) =>
                gates.find(
                  (g) => g.id === depId && g.criteria.every((c) => c.done)
                )
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
                  if (!isEditing) {
                    setExpandedGate(isExpanded ? null : gate.id);
                    if (isExpanded) setOpenDropdownId(null);
                  }
                }}
                className={`w-full p-4 flex justify-between items-center text-right hover:bg-os-border/20 transition select-none ${
                  isEditing ? "cursor-default" : "cursor-pointer"
                }`}
              >
                <div className="flex-1 min-w-0 pl-4">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-bold text-sm md:text-base text-white truncate">
                      {gate.title}
                    </h3>
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

                  {gate.description && !isExpanded && (
                    <p className="text-[10px] text-os-text/50 mb-1 line-clamp-1">
                      {gate.description}
                    </p>
                  )}

                  {hasDeadline && !isExpanded && (
                    <p className="text-[10px] font-mono text-amber-400/70 mb-1">
                      ⏰ ددلاین: {gate.deadline}{" "}
                      {gate.deadlineNote && `— ${gate.deadlineNote}`}
                    </p>
                  )}

                  {!isExpanded && (
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] font-mono text-os-text/40">
                        {toPersianNumber(doneCount)}/
                        {toPersianNumber(gate.criteria.length)} CRITERIA
                      </span>
                      <span className="text-[10px] font-mono flex items-center gap-2">
                        {passCount > 0 && (
                          <span className="text-emerald-400">
                            ✅ {toPersianNumber(passCount)}
                          </span>
                        )}
                        {failCount > 0 && (
                          <span className="text-red-400">
                            ❌ {toPersianNumber(failCount)}
                          </span>
                        )}
                        {pendingCount > 0 && (
                          <span className="text-slate-400">
                            ⏳ {toPersianNumber(pendingCount)}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>

                {!isEditing && (
                  <div className="flex items-center gap-3 w-1/2 md:w-2/5 shrink-0 justify-end">
                    <div className="flex-1 h-2 bg-os-bg/70 border border-os-border/60 rounded-full overflow-hidden hidden sm:block">
                      <div
                        className={`h-full ${progressBarColor} transition-all duration-500`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>

                    <span
                      className={`font-mono text-xs ${
                        progress === 100
                          ? "text-emerald-400 font-bold"
                          : "text-os-text/60"
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
                )}
              </div>

              {isExpanded && (
                <div className="p-4 pt-0 border-t border-os-border/30 bg-os-bg/30">
                  {isEditing ? (
                    // === INLINE EDIT MODE ===
                    <div className="pt-4 space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="text-[10px] font-mono text-os-accent uppercase tracking-wider">
                          ✏️ Edit Gate
                        </h4>
                        <div className="flex gap-2">
                          <button
                            onClick={handleCancelEdit}
                            className="text-[10px] font-mono px-3 py-1.5 rounded border border-os-border text-os-text/60 hover:bg-os-border/20 transition"
                          >
                            لغو
                          </button>
                          <button
                            onClick={handleUpdateGate}
                            className="text-[10px] font-mono px-3 py-1.5 rounded border border-emerald-500 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition"
                          >
                            ذخیره تغییرات
                          </button>
                        </div>
                      </div>

                      <input
                        type="text"
                        value={editFormData.title}
                        onChange={(e) => setEditFormData({ ...editFormData, title: e.target.value })}
                        className="w-full bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent"
                        placeholder="عنوان"
                      />
                      <textarea
                        value={editFormData.description}
                        onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                        className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent resize-none"
                        placeholder="توضیحات"
                      />
                      <textarea
                        value={editFormData.constraintNote}
                        onChange={(e) => setEditFormData({ ...editFormData, constraintNote: e.target.value })}
                        className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent resize-none"
                        placeholder="محدودیت / فرصت زمانی"
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="date"
                          value={editFormData.deadline || ""}
                          onChange={(e) => setEditFormData({ ...editFormData, deadline: e.target.value })}
                          className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono"
                        />
                        <input
                          type="text"
                          value={editFormData.deadlineNote}
                          onChange={(e) => setEditFormData({ ...editFormData, deadlineNote: e.target.value })}
                          className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent"
                          placeholder="یادداشت ددلاین"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          value={editFormData.order}
                          onChange={(e) => setEditFormData({ ...editFormData, order: e.target.value })}
                          className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono"
                          placeholder="ترتیب"
                        />
                        <input
                          type="text"
                          value={editFormData.dependsOnText}
                          onChange={(e) => setEditFormData({ ...editFormData, dependsOnText: e.target.value })}
                          className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono"
                          placeholder="وابسته به (با کاما)"
                        />
                      </div>

                      <input
                        type="text"
                        value={editFormData.evidenceLink || ""}
                        onChange={(e) => setEditFormData({ ...editFormData, evidenceLink: e.target.value })}
                        className="w-full bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono"
                        placeholder="لینک مدرک"
                      />

                      {/* Criteria Editor in Edit Mode */}
                      <div className="mt-4 pt-3 border-t border-os-border/50">
                        <h5 className="text-[10px] font-mono text-os-text/60 mb-2 uppercase">
                          Criteria Editor
                        </h5>
                        <div className="space-y-2">
                          {editFormData.criteria.map((c) => (
                            <div key={c.id} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={c.text}
                                onChange={(e) => handleEditCriteriaChange(c.id, e.target.value)}
                                className="flex-1 bg-os-bg border border-os-border rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-os-accent"
                              />
                              <button
                                onClick={() => handleDeleteCriteria(c.id)}
                                className="p-2 text-red-400 hover:text-red-300 text-xs border border-red-500/30 rounded-lg hover:bg-red-500/10"
                                title="حذف معیار"
                              >
                                🗑️
                              </button>
                            </div>
                          ))}
                        </div>
                        <textarea
                          value={editFormData.newCriteriaText}
                          onChange={(e) => setEditFormData({ ...editFormData, newCriteriaText: e.target.value })}
                          className="w-full h-16 mt-2 bg-os-bg border border-dashed border-os-border rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-os-accent resize-none"
                          placeholder="معیار جدید (هر خط یک مورد)"
                        />
                        <button
                          onClick={handleAddCriteriaToEdit}
                          className="mt-2 text-[10px] font-mono px-3 py-1.5 rounded border border-os-accent/50 text-os-accent bg-os-accent/10 hover:bg-os-accent/20"
                        >
                          + افزودن معیار جدید
                        </button>
                      </div>
                    </div>
                  ) : (
                    // === VIEW MODE (Existing) ===
                    <>
                      <div className="flex justify-end pt-3 pb-2">
                        <button
                          onClick={() => handleStartEdit(gate)}
                          className="text-[10px] font-mono px-3 py-1.5 rounded border border-sky-500/50 text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 transition"
                        >
                          ✏️ ویرایش دروازه
                        </button>
                      </div>

                      {gate.constraintNote && (
                        <div className="pt-1 pb-2">
                          <div className="text-[10px] font-mono text-amber-400/80 mb-1">
                            ⚠️ محدودیت / فرصت زمانی:
                          </div>
                          <p className="text-xs text-os-text/70 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 leading-relaxed">
                            {gate.constraintNote}
                          </p>
                        </div>
                      )}

                      {gate.dependsOn?.length > 0 && (
                        <div className="pt-2 pb-1">
                          <div className="text-[10px] font-mono text-os-text/40 mb-1">
                            🔗 وابسته به:
                          </div>
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
                                  {depDone ? "✅" : "🔒"}{" "}
                                  {depGate?.title || depId}
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
                          const isPending =
                            pendingCriteriaKeys.has(`${gate.id}:${c.id}`) ||
                            pendingCriteriaKeys.has(`${gate.id}:${c.id}:assess`);
                          const assessment = c.assessmentResult || "pending";

                          const assessmentBadge = {
                            pending: {
                              label: "⏳",
                              color: "text-slate-400 border-slate-600 bg-slate-500/10",
                            },
                            pass: {
                              label: "✅",
                              color:
                                "text-emerald-400 border-emerald-500 bg-emerald-500/10",
                            },
                            fail: {
                              label: "❌",
                              color: "text-red-400 border-red-500 bg-red-500/10",
                            },
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
                                  c.done
                                    ? "line-through text-os-text/40"
                                    : "text-os-text"
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
                                  onClick={() =>
                                    setOpenDropdownId(
                                      openDropdownId === c.id ? null : c.id
                                    )
                                  }
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
                                          onClick={() =>
                                            setAssessment(gate.id, c.id, r)
                                          }
                                          className={`text-[10px] font-mono px-2 py-1 rounded text-right transition ${
                                            assessment === r
                                              ? "bg-os-accent/20 text-os-accent"
                                              : "hover:bg-os-border/30 text-os-text/70"
                                          }`}
                                        >
                                          {r === "pending"
                                            ? "⏳"
                                            : r === "pass"
                                            ? "✅"
                                            : "❌"}{" "}
                                          {r}
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
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* === NEW: Export Roadmap UI (Batch 57) === */}
      <div className="grid grid-cols-2 gap-3 mb-8">
        <button
          onClick={handleExportRoadmapJSON}
          className="py-3 rounded-lg font-mono text-xs border border-sky-500/60 text-sky-400 bg-sky-500/5 hover:bg-sky-500/10 transition flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          📥 Export JSON
        </button>
        <button
          onClick={handleExportRoadmapMarkdown}
          className="py-3 rounded-lg font-mono text-xs border border-emerald-500/60 text-emerald-400 bg-emerald-500/5 hover:bg-emerald-500/10 transition flex items-center justify-center gap-2 active:scale-[0.99]"
        >
          📝 Export Markdown
        </button>
      </div>

      {/* === Import Roadmap Wizard (Collapsible) === */}
      <div className="bg-os-card border border-os-border p-4 rounded-xl mb-8">
        <button
          onClick={() => setShowImportWizard(!showImportWizard)}
          className="w-full flex items-center justify-between text-right hover:bg-os-border/10 -m-4 p-4 rounded-xl transition"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">📥</span>
            <div>
              <h3 className="text-sm font-bold text-os-accent">
                Import Roadmap از مشاور AI
              </h3>
              <p className="text-[10px] font-mono text-os-text/40 mt-0.5">
                ساخت نقشه راه با ChatGPT/Claude و وارد کردن JSON
              </p>
            </div>
          </div>
          <span
            className={`text-os-text/40 font-bold transition-transform duration-200 ${
              showImportWizard ? "rotate-180" : ""
            }`}
          >
            ⌄
          </span>
        </button>

        {showImportWizard && (
          <div className="mt-6 space-y-4">
            {/* Step Indicator */}
            <div className="flex gap-2">
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    aiGuideStep >= s ? "bg-os-accent" : "bg-os-border"
                  }`}
                />
              ))}
            </div>

            {/* Step 1: Guide + Copy Prompt */}
            {aiGuideStep === 1 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">🤖</span>
                  <h4 className="text-sm font-bold text-os-accent">
                    راهنمای ساخت نقشه راه با AI
                  </h4>
                </div>
                <div className="text-xs text-os-text/70 leading-relaxed whitespace-pre-line bg-os-bg/50 p-4 rounded-lg border border-os-border/50">
                  {ROADMAP_GUIDE_TEXT}
                </div>
                <div className="bg-os-bg/50 p-4 rounded-lg border border-os-border/50 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-os-text">
                      📋 پرامپت مشاور مسیر شغلی
                    </span>
                    <button
                      onClick={handleCopyRoadmapPrompt}
                      className={`text-[10px] font-mono px-3 py-1.5 rounded border transition ${
                        roadmapCopied
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                          : "bg-os-accent/10 text-os-accent border-os-accent/30 hover:bg-os-accent/20"
                      }`}
                    >
                      {roadmapCopied ? "✅ کپی شد!" : "📋 کپی پرامپت"}
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto text-[10px] font-mono text-os-text/50 bg-os-bg p-3 rounded border border-os-border/30 whitespace-pre-wrap">
                    {ROADMAP_PROMPT}
                  </div>
                </div>
                <button
                  onClick={() => setAiGuideStep(2)}
                  className="w-full py-3 bg-os-accent text-os-bg font-mono text-xs rounded-lg hover:opacity-90 transition active:scale-[0.99]"
                >
                  مرحله بعد: Paste JSON →
                </button>
              </div>
            )}

            {/* Step 2: Paste JSON */}
            {aiGuideStep === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">📥</span>
                  <h4 className="text-sm font-bold text-os-accent">
                    Paste JSON نقشه راه
                  </h4>
                </div>
                <textarea
                  value={roadmapJsonInput}
                  onChange={(e) => setRoadmapJsonInput(e.target.value)}
                  placeholder={`{\n  "gates": [\n    {\n      "title": "...",\n      "criteria": [{ "title": "..." }]\n    }\n  ]\n}`}
                  className="w-full h-64 bg-os-bg border border-os-border rounded-lg p-3 text-[11px] font-mono focus:outline-none focus:border-os-accent resize-none text-os-text"
                  dir="ltr"
                />
                {roadmapImportStatus && (
                  <div
                    className={`text-xs p-2 rounded font-mono ${
                      roadmapImportStatus.startsWith("✅")
                        ? "bg-emerald-500/10 text-emerald-400"
                        : roadmapImportStatus.startsWith("⚠️")
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {roadmapImportStatus}
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setAiGuideStep(1)}
                    className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:bg-os-border/20 transition"
                  >
                    ← قبلی
                  </button>
                  <button
                    onClick={handleParseRoadmapJson}
                    disabled={!roadmapJsonInput.trim()}
                    className="flex-1 py-2 bg-os-accent text-os-bg font-mono text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
                  >
                    بررسی و Preview →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Preview + Confirm */}
            {aiGuideStep === 3 && roadmapPreview && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-lg">👁️</span>
                  <h4 className="text-sm font-bold text-os-accent">
                    پیش‌نمایش نقشه راه ({toPersianNumber(roadmapPreview.length)}{" "}
                    Gate)
                  </h4>
                </div>

                {/* Import Mode Selector */}
                <div className="bg-os-bg/50 p-3 rounded-lg border border-os-border/50">
                  <div className="text-[10px] font-mono text-os-text/60 mb-2 uppercase">
                    Import Mode:
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setImportMode("merge")}
                      className={`flex-1 py-2 text-xs font-mono rounded border transition ${
                        importMode === "merge"
                          ? "bg-emerald-500/10 border-emerald-500 text-emerald-400"
                          : "border-os-border text-os-text/60 hover:bg-os-border/20"
                      }`}
                    >
                      ➕ اضافه (Merge)
                    </button>
                    <button
                      onClick={() => setImportMode("replace")}
                      className={`flex-1 py-2 text-xs font-mono rounded border transition ${
                        importMode === "replace"
                          ? "bg-red-500/10 border-red-500 text-red-400"
                          : "border-os-border text-os-text/60 hover:bg-os-border/20"
                      }`}
                    >
                      🔄 جایگزین (Replace)
                    </button>
                  </div>
                  {importMode === "replace" && gates.length > 0 && (
                    <p className="text-[10px] text-red-400 mt-2 font-mono">
                      ⚠️ {toPersianNumber(gates.length)} Gate فعلی حذف خواهند شد!
                    </p>
                  )}
                </div>

                {/* Preview List */}
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {roadmapPreview.map((gate, idx) => (
                    <div
                      key={idx}
                      className="bg-os-bg/50 rounded-lg border border-os-border/50 p-3"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-mono text-os-text/40">
                            #{toPersianNumber(gate.order)}
                          </span>
                          <span className="text-xs font-bold text-os-text">
                            {gate.title}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-os-accent">
                          {toPersianNumber(gate.criteria.length)} معیار
                        </span>
                      </div>
                      {gate.description && (
                        <p className="text-[10px] text-os-text/50 mb-2">
                          {gate.description}
                        </p>
                      )}
                      {gate.criteria.length > 0 ? (
                        <ul className="space-y-1 pr-4">
                          {gate.criteria.slice(0, 3).map((c, ci) => (
                            <li
                              key={ci}
                              className="text-[10px] text-os-text/70 flex items-center gap-2"
                            >
                              <span className="text-os-text/30">○</span>
                              <span>{c.text}</span>
                            </li>
                          ))}
                          {gate.criteria.length > 3 && (
                            <li className="text-[10px] text-os-text/40 pr-4">
                              +{toPersianNumber(gate.criteria.length - 3)} مورد
                              دیگر...
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p className="text-[10px] text-amber-400/70 font-mono">
                          ⚠️ بدون معیار
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {roadmapImportStatus && (
                  <div
                    className={`text-xs p-2 rounded font-mono ${
                      roadmapImportStatus.startsWith("✅")
                        ? "bg-emerald-500/10 text-emerald-400"
                        : roadmapImportStatus.startsWith("⚠️")
                        ? "bg-amber-500/10 text-amber-400"
                        : "bg-red-500/10 text-red-400"
                    }`}
                  >
                    {roadmapImportStatus}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleCancelImport}
                    disabled={roadmapImportLoading}
                    className="flex-1 py-2 border border-os-border text-os-text/60 font-mono text-xs rounded hover:bg-os-border/20 transition disabled:opacity-50"
                  >
                    ← ویرایش JSON
                  </button>
                  <button
                    onClick={handleImportRoadmap}
                    disabled={roadmapImportLoading}
                    className="flex-1 py-2 bg-emerald-500 text-white font-mono text-xs rounded disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition"
                  >
                    {roadmapImportLoading
                      ? "..."
                      : importMode === "replace"
                      ? "🔄 جایگزین کن"
                      : "✅ اضافه کن"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Manual Gate Form (preserved) */}
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
            onChange={(e) =>
              setNewGate({ ...newGate, description: e.target.value })
            }
            className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <textarea
            placeholder="محدودیت / فرصت زمانی (اختیاری) — مثلاً: پنجره دسترسی به استاد تا فلان تاریخ"
            value={newGate.constraintNote}
            onChange={(e) =>
              setNewGate({ ...newGate, constraintNote: e.target.value })
            }
            className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">
                ددلاین (ISO)
              </label>
              <input
                type="date"
                value={newGate.deadline}
                onChange={(e) =>
                  setNewGate({ ...newGate, deadline: e.target.value })
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">
                یادداشت ددلاین
              </label>
              <input
                type="text"
                placeholder="تقریبی — اواخر شهریور"
                value={newGate.deadlineNote}
                onChange={(e) =>
                  setNewGate({ ...newGate, deadlineNote: e.target.value })
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">
                ترتیب (عدد)
              </label>
              <input
                type="number"
                value={newGate.order}
                onChange={(e) =>
                  setNewGate({ ...newGate, order: e.target.value })
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
            <div>
              <label className="text-[9px] font-mono text-os-text/40 block mb-1">
                وابسته به (IDها با کاما)
              </label>
              <input
                type="text"
                placeholder="gate-001, gate-002"
                value={newGate.dependsOn}
                onChange={(e) =>
                  setNewGate({ ...newGate, dependsOn: e.target.value })
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent transition font-mono"
              />
            </div>
          </div>
          <textarea
            placeholder="معیارهای پذیرش (هر خط یک مورد)"
            value={newGate.criteriaText}
            onChange={(e) =>
              setNewGate({ ...newGate, criteriaText: e.target.value })
            }
            className="w-full h-24 bg-os-bg border border-os-border rounded-lg p-2.5 text-xs md:text-sm text-white focus:outline-none focus:border-os-accent resize-none transition"
          />
          <input
            type="text"
            placeholder="لینک مدرک / Evidence URL (اختیاری)"
            value={newGate.evidenceLink}
            onChange={(e) =>
              setNewGate({ ...newGate, evidenceLink: e.target.value })
            }
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

      {/* Monthly Review (preserved) */}
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