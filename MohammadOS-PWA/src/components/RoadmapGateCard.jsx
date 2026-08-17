// src/components/RoadmapGateCard.jsx
import { toPersianNumber } from "../utils/date";

export default function RoadmapGateCard({
  gate,
  allGates,
  isExpanded,
  isEditing,
  editFormData,
  pendingCriteriaKeys,
  openDropdownId,
  onToggleExpand,
  onStartEdit,
  onCancelEdit,
  onUpdateGate,
  onEditFormDataChange,
  onEditCriteriaChange,
  onDeleteCriteria,
  onAddCriteriaToEdit,
  onDeleteGate,
  onToggleCriteria,
  onSetAssessment,
  onSetOpenDropdownId,
}) {
  const doneCount = gate.criteria.filter((c) => c.done).length;
  const progress = gate.criteria.length > 0 ? (doneCount / gate.criteria.length) * 100 : 0;

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
  
  // Fixed Vacuous Truth Bug
  const isLocked =
    gate.dependsOn?.length > 0 &&
    !gate.dependsOn.every((depId) => {
      const dep = allGates.find((g) => g.id === depId);
      return dep && dep.criteria.length > 0 && dep.criteria.every((c) => c.done);
    });

  return (
    <div className={`bg-os-card border rounded-xl overflow-hidden transition-all duration-300 ${isLocked ? "border-red-500/30" : "border-os-border"}`}>
      <div
        onClick={() => { if (!isEditing) onToggleExpand(gate.id); }}
        className={`w-full p-4 flex justify-between items-center text-right hover:bg-os-border/20 transition select-none ${isEditing ? "cursor-default" : "cursor-pointer"}`}
      >
        <div className="flex-1 min-w-0 pl-4">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-bold text-sm md:text-base text-white truncate">{gate.title}</h3>
            {hasConstraint && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400">⚠️ محدودیت</span>}
            {isLocked && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-red-500/10 border border-red-500/30 text-red-400">🔒 قفل</span>}
            {gate.order > 0 && <span className="text-[10px] font-mono text-os-text/30">#{toPersianNumber(gate.order)}</span>}
          </div>
          {gate.description && !isExpanded && <p className="text-[10px] text-os-text/50 mb-1 line-clamp-1">{gate.description}</p>}
          {hasDeadline && !isExpanded && <p className="text-[10px] font-mono text-amber-400/70 mb-1">⏰ ددلاین: {gate.deadline} {gate.deadlineNote && `— ${gate.deadlineNote}`}</p>}
          {!isExpanded && (
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="text-[10px] font-mono text-os-text/40">{toPersianNumber(doneCount)}/{toPersianNumber(gate.criteria.length)} CRITERIA</span>
              <span className="text-[10px] font-mono flex items-center gap-2">
                {passCount > 0 && <span className="text-emerald-400">✅ {toPersianNumber(passCount)}</span>}
                {failCount > 0 && <span className="text-red-400">❌ {toPersianNumber(failCount)}</span>}
                {pendingCount > 0 && <span className="text-slate-400">⏳ {toPersianNumber(pendingCount)}</span>}
              </span>
            </div>
          )}
        </div>

        {!isEditing && (
          <div className="flex items-center gap-3 w-1/2 md:w-2/5 shrink-0 justify-end">
            <div className="flex-1 h-2 bg-os-bg/70 border border-os-border/60 rounded-full overflow-hidden hidden sm:block">
              <div className={`h-full ${progressBarColor} transition-all duration-500`} style={{ width: `${progress}%` }} />
            </div>
            <span className={`font-mono text-xs ${progress === 100 ? "text-emerald-400 font-bold" : "text-os-text/60"}`}>{toPersianNumber(Math.round(progress))}%</span>
            <button onClick={(e) => onDeleteGate(gate.id, e)} className="p-1 text-os-text/30 hover:text-red-400 rounded transition" title="حذف دروازه">🗑️</button>
            <span className={`text-os-text/40 font-bold transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`}>⌄</span>
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="p-4 pt-0 border-t border-os-border/30 bg-os-bg/30">
          {isEditing ? (
            <div className="pt-4 space-y-3">
              <div className="flex justify-between items-center mb-2">
                <h4 className="text-[10px] font-mono text-os-accent uppercase tracking-wider">✏️ Edit Gate</h4>
                <div className="flex gap-2">
                  <button onClick={onCancelEdit} className="text-[10px] font-mono px-3 py-1.5 rounded border border-os-border text-os-text/60 hover:bg-os-border/20 transition">لغو</button>
                  <button onClick={onUpdateGate} className="text-[10px] font-mono px-3 py-1.5 rounded border border-emerald-500 text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition">ذخیره تغییرات</button>
                </div>
              </div>
              <input type="text" value={editFormData.title} onChange={(e) => onEditFormDataChange({ ...editFormData, title: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent" placeholder="عنوان" />
              <textarea value={editFormData.description} onChange={(e) => onEditFormDataChange({ ...editFormData, description: e.target.value })} className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent resize-none" placeholder="توضیحات" />
              <textarea value={editFormData.constraintNote} onChange={(e) => onEditFormDataChange({ ...editFormData, constraintNote: e.target.value })} className="w-full h-16 bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent resize-none" placeholder="محدودیت / فرصت زمانی" />
              <div className="grid grid-cols-2 gap-3">
                <input type="date" value={editFormData.deadline || ""} onChange={(e) => onEditFormDataChange({ ...editFormData, deadline: e.target.value })} className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono" />
                <input type="text" value={editFormData.deadlineNote} onChange={(e) => onEditFormDataChange({ ...editFormData, deadlineNote: e.target.value })} className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent" placeholder="یادداشت ددلاین" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <input type="number" value={editFormData.order} onChange={(e) => onEditFormDataChange({ ...editFormData, order: e.target.value })} className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono" placeholder="ترتیب" />
                <input type="text" value={editFormData.dependsOnText} onChange={(e) => onEditFormDataChange({ ...editFormData, dependsOnText: e.target.value })} className="bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono" placeholder="وابسته به (با کاما)" />
              </div>
              <input type="text" value={editFormData.evidenceLink || ""} onChange={(e) => onEditFormDataChange({ ...editFormData, evidenceLink: e.target.value })} className="w-full bg-os-bg border border-os-border rounded-lg p-2 text-xs text-white focus:outline-none focus:border-os-accent font-mono" placeholder="لینک مدرک" />
              
              <div className="mt-4 pt-3 border-t border-os-border/50">
                <h5 className="text-[10px] font-mono text-os-text/60 mb-2 uppercase">Criteria Editor</h5>
                <div className="space-y-2">
                  {editFormData.criteria.map((c) => (
                    <div key={c.id} className="flex items-center gap-2">
                      <input type="text" value={c.text} onChange={(e) => onEditCriteriaChange(c.id, e.target.value)} className="flex-1 bg-os-bg border border-os-border rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-os-accent" />
                      <button onClick={() => onDeleteCriteria(c.id)} className="p-2 text-red-400 hover:text-red-300 text-xs border border-red-500/30 rounded-lg hover:bg-red-500/10">🗑️</button>
                    </div>
                  ))}
                </div>
                <textarea value={editFormData.newCriteriaText} onChange={(e) => onEditFormDataChange({ ...editFormData, newCriteriaText: e.target.value })} className="w-full h-16 mt-2 bg-os-bg border border-dashed border-os-border rounded-lg p-2 text-[11px] text-white focus:outline-none focus:border-os-accent resize-none" placeholder="معیار جدید (هر خط یک مورد)" />
                <button onClick={onAddCriteriaToEdit} className="mt-2 text-[10px] font-mono px-3 py-1.5 rounded border border-os-accent/50 text-os-accent bg-os-accent/10 hover:bg-os-accent/20">+ افزودن معیار جدید</button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex justify-end pt-3 pb-2">
                <button onClick={() => onStartEdit(gate)} className="text-[10px] font-mono px-3 py-1.5 rounded border border-sky-500/50 text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 transition">✏️ ویرایش دروازه</button>
              </div>

              {gate.constraintNote && (
                <div className="pt-1 pb-2">
                  <div className="text-[10px] font-mono text-amber-400/80 mb-1">⚠️ محدودیت / فرصت زمانی:</div>
                  <p className="text-xs text-os-text/70 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3 leading-relaxed">{gate.constraintNote}</p>
                </div>
              )}

              {gate.dependsOn?.length > 0 && (
                <div className="pt-2 pb-1">
                  <div className="text-[10px] font-mono text-os-text/40 mb-1">🔗 وابسته به:</div>
                  <div className="flex gap-2 flex-wrap">
                    {gate.dependsOn.map((depId) => {
                      const depGate = allGates.find((g) => g.id === depId);
                      const depDone = depGate && depGate.criteria.length > 0 && depGate.criteria.every((c) => c.done);
                      return (
                        <span key={depId} className={`text-[10px] font-mono px-2 py-1 rounded border ${depDone ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"}`}>
                          {depDone ? "✅" : "🔒"} {depGate?.title || depId}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {evidenceUrl && (
                <div className="pt-3 pb-1">
                  <a href={evidenceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[10px] font-mono text-sky-400 hover:text-sky-300 border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 rounded-lg transition" onClick={(e) => e.stopPropagation()}>🔗 Evidence Link</a>
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
                    <li key={c.id} className="flex items-center gap-3 p-2 hover:bg-os-border/10 rounded-lg transition">
                      <button onClick={() => onToggleCriteria(gate.id, c.id)} disabled={isPending} className={`w-5 h-5 rounded border flex items-center justify-center transition-colors shrink-0 ${c.done ? "bg-emerald-500/20 border-emerald-500 text-emerald-400 font-bold" : "border-os-border text-transparent hover:border-os-accent"} disabled:opacity-50 disabled:cursor-not-allowed`}>{c.done && "✓"}</button>
                      <span className={`text-xs md:text-sm flex-1 ${c.done ? "line-through text-os-text/40" : "text-os-text"}`}>{c.text}</span>
                      {c.estimatedHours && <span className="text-[9px] font-mono text-os-text/30">{toPersianNumber(c.estimatedHours)}h</span>}
                      <div className="relative">
                        <button onClick={() => onSetOpenDropdownId(openDropdownId === c.id ? null : c.id)} disabled={isPending} className={`text-[10px] font-mono px-2 py-1 rounded border ${assessmentBadge.color} hover:opacity-80 transition disabled:opacity-50 disabled:cursor-not-allowed`} title={`Assessment: ${assessment}`}>{assessmentBadge.label} {assessment}</button>
                        {openDropdownId === c.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => onSetOpenDropdownId(null)} />
                            <div className="absolute right-0 top-full mt-1 flex flex-col gap-1 bg-os-card border border-os-border rounded-lg p-1.5 shadow-xl z-20 min-w-[80px]">
                              {["pending", "pass", "fail"].map((r) => (
                                <button key={r} onClick={() => onSetAssessment(gate.id, c.id, r)} className={`text-[10px] font-mono px-2 py-1 rounded text-right transition ${assessment === r ? "bg-os-accent/20 text-os-accent" : "hover:bg-os-border/30 text-os-text/70"}`}>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}