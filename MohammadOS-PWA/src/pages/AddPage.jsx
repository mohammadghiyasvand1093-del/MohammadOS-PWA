// src/pages/AddPage.jsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { CourseRepository } from "../repositories/CourseRepository";
import { HabitRepository } from "../repositories/HabitRepository";
import { saveHabit } from "../app/saveHabit";
import { db } from "../db/database";
import debounce from "lodash.debounce";

const initialCourseState = {
  name: "",
  instructor: "",
  totalEpisodes: "",
  currentEpisode: "0",
  link: "",
  isCritical: false,
};

// ✅ Batch 57: Default domain changed to discipline
const initialHabitState = {
  name: "",
  domain: "discipline",
  recurrenceType: "daily",
  isCritical: false,
};

// ✅ Batch 57: DOMAINS updated with emojis + colors
const DOMAINS = [
  { key: "learning", label: "📚 یادگیری", color: "#4D8EF5" },
  { key: "fitness", label: "💪 ورزش", color: "#00C878" },
  { key: "discipline", label: "🎯 انضباط", color: "#F5C542" },
  { key: "work", label: "💼 کار", color: "#A855F7" },
  { key: "rest", label: "😴 استراحت", color: "#22D3EE" },
  { key: "social", label: "🤝 اجتماعی", color: "#F97316" },
];

const WEEKLY_DAYS = [
  { value: 0, label: "شنبه" },
  { value: 1, label: "یکشنبه" },
  { value: 2, label: "دوشنبه" },
  { value: 3, label: "سه‌شنبه" },
  { value: 4, label: "چهارشنبه" },
  { value: 5, label: "پنجشنبه" },
  { value: 6, label: "جمعه" },
];

// ✅ Batch 76: Habit Templates
const HABIT_TEMPLATES = [
  { name: "ورزش صبحگاهی", domain: "fitness", isCritical: true, icon: "🏃" },
  { name: "مطالعه ۳۰ دقیقه‌ای", domain: "learning", isCritical: false, icon: "📖" },
  { name: "نوشیدن ۲ لیتر آب", domain: "discipline", isCritical: false, icon: "💧" },
  { name: "خواب ۸ ساعت", domain: "rest", isCritical: true, icon: "🛌" },
  { name: "مدیتیشن", domain: "rest", isCritical: false, icon: "🧘" },
  { name: "مرور برنامه", domain: "discipline", isCritical: true, icon: "📋" },
];

const days = [
  { key: "sunday", label: "یکشنبه" },
  { key: "monday", label: "دوشنبه" },
  { key: "tuesday", label: "سه‌شنبه" },
  { key: "wednesday", label: "چهارشنبه" },
  { key: "thursday", label: "پنجشنبه" },
  { key: "friday", label: "جمعه" },
  { key: "saturday", label: "شنبه" },
];

export default function AddPage() {
  const [selectedDay, setSelectedDay] = useState("sunday");
  const [blocks, setBlocks] = useState([]);
  const [draftStatus, setDraftStatus] = useState("");

  const [course, setCourse] = useState(initialCourseState);

  const [courses, setCourses] = useState([]);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const [habits, setHabits] = useState([]);
  const [habitForm, setHabitForm] = useState(initialHabitState);
  const [selectedWeeklyDays, setSelectedWeeklyDays] = useState([]);
  const [editingHabitId, setEditingHabitId] = useState(null);
  const [editHabitForm, setEditHabitForm] = useState({});
  const [editWeeklyDays, setEditWeeklyDays] = useState([]);

  const markAsTyping = useCallback(() => {
    setDraftStatus((prev) => (prev === "TYPING..." ? prev : "TYPING..."));
  }, []);

  const handleAutosave = useMemo(
    () =>
      debounce(async (currentBlocks, currentCourse) => {
        try {
          await db.drafts.put({
            key: `addPage_${selectedDay}`,
            blocks: currentBlocks,
            course: currentCourse,
            timestamp: new Date().toISOString(),
          });
          setDraftStatus("DRAFT SAVED");
        } catch (error) {
          console.error("Autosave failed:", error);
          setDraftStatus("SAVE ERROR");
        }
      }, 2000),
    [selectedDay]
  );

  useEffect(() => {
    let mounted = true;
    
    async function loadInitialData() {
      setDraftStatus("LOADING DRAFT...");
      try {
        const draft = await db.drafts.get(`addPage_${selectedDay}`);
        if (!mounted) return;
        
        if (draft) {
          setBlocks(draft.blocks || []);
          setCourse(draft.course || initialCourseState);
          setDraftStatus("DRAFT LOADED");
          return;
        }

        const dayData = await ScheduleRepository.getDaySchedule(selectedDay);
        if (!mounted) return;
        
        setBlocks(dayData ? dayData.schedule : []);
        setCourse(initialCourseState);
        setDraftStatus("LOADED FROM DB");
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setDraftStatus("LOAD ERROR");
      }
    }

    loadInitialData();

    return () => {
      mounted = false;
      handleAutosave.cancel(); 
    };
  }, [selectedDay, handleAutosave]);

  useEffect(() => {
    loadCourses();
  }, []);

  async function loadCourses() {
    try {
      const data = await CourseRepository.getAll({ sortBy: "name", criticalFirst: true });
      setCourses(data);
    } catch (error) {
      console.error("Failed to load courses:", error);
    }
  }

  useEffect(() => {
    loadHabits();
  }, []);

  async function loadHabits() {
    try {
      const data = await HabitRepository.getAll();
      setHabits(data);
    } catch (error) {
      console.error("Failed to load habits:", error);
    }
  }

  useEffect(() => {
    if (draftStatus === "LOADING DRAFT..." || draftStatus === "LOAD ERROR") {
      return undefined;
    }

    handleAutosave(blocks, course);

    return () => {
      handleAutosave.cancel();
    };
  }, [blocks, course, handleAutosave, draftStatus]);

  const handleBlockChange = useCallback(
    (index, field, value) => {
      markAsTyping();
      setBlocks((prevBlocks) =>
        prevBlocks.map((block, blockIndex) =>
          blockIndex === index ? { ...block, [field]: value } : block
        )
      );
    },
    [markAsTyping]
  );

  const handleBlockToggleCritical = useCallback(
    (index) => {
      markAsTyping();
      setBlocks((prevBlocks) =>
        prevBlocks.map((block, blockIndex) =>
          blockIndex === index
            ? { ...block, isCritical: !block.isCritical }
            : block
        )
      );
    },
    [markAsTyping]
  );

  const addBlock = useCallback(() => {
    markAsTyping();
    const newBlock = {
      title: "",
      startTime: "08:00",
      endTime: "09:00",
      type: "course",
      isCritical: false,
    };
    setBlocks((prevBlocks) => [...prevBlocks, newBlock]);
  }, [markAsTyping]);

  const removeBlock = useCallback(
    (index) => {
      markAsTyping();
      setBlocks((prevBlocks) =>
        prevBlocks.filter((_, blockIndex) => blockIndex !== index)
      );
    },
    [markAsTyping]
  );

  const saveBlocks = useCallback(async () => {
    try {
      await ScheduleRepository.saveDaySchedule(selectedDay, blocks);
      await db.drafts.delete(`addPage_${selectedDay}`);
      setDraftStatus("COMMITTED");
    } catch (error) {
      console.error("Failed to save day schedule:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  }, [selectedDay, blocks]);

  const handleCourseChange = useCallback(
    (field, value) => {
      markAsTyping();
      setCourse((prevCourse) => ({ ...prevCourse, [field]: value }));
    },
    [markAsTyping]
  );

  const handleCourseToggleCritical = useCallback(() => {
    markAsTyping();
    setCourse((prevCourse) => ({
      ...prevCourse,
      isCritical: !prevCourse.isCritical,
    }));
  }, [markAsTyping]);

  const saveCourse = useCallback(async () => {
    if (!course.name.trim()) {
      setDraftStatus("ERROR: نام دوره الزامی است.");
      return;
    }

    try {
      await CourseRepository.create({
        name: course.name.trim(),
        instructor: course.instructor.trim(),
        totalEpisodes: Number(course.totalEpisodes) || 0,
        currentEpisode: Number(course.currentEpisode) || 0,
        link: course.link.trim(),
        isCritical: course.isCritical,
      });

      await db.drafts.delete(`addPage_${selectedDay}`);
      setCourse(initialCourseState);
      setDraftStatus("COURSE REGISTERED");
      loadCourses();
    } catch (error) {
      console.error("Failed to save course:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  }, [course, selectedDay]);

  const handleAddEpisode = async (courseItem) => {
    try {
      await CourseRepository.completeEpisode(courseItem.id, courseItem.currentEpisode + 1);
      loadCourses();
    } catch (error) {
      console.error("Failed to add episode:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  };

  const handleEditClick = (courseItem) => {
    setEditingCourseId(courseItem.id);
    setEditForm({ ...courseItem });
  };

  const handleCancelEdit = () => {
    setEditingCourseId(null);
    setEditForm({});
  };

  const handleSaveEdit = async () => {
    try {
      await CourseRepository.update(editingCourseId, {
        name: editForm.name,
        instructor: editForm.instructor,
        totalEpisodes: Number(editForm.totalEpisodes) || 0,
        currentEpisode: Number(editForm.currentEpisode) || 0,
        link: editForm.link,
        isCritical: editForm.isCritical,
      });
      setEditingCourseId(null);
      loadCourses();
    } catch (error) {
      console.error("Failed to update course:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  };

  const handleDeleteCourse = async (id) => {
    if (!window.confirm("آیا مطمئنید؟")) return;
    try {
      await CourseRepository.delete(id);
      loadCourses();
    } catch (error) {
      console.error("Failed to delete course:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  };

  const handleEditChange = (field, value) => {
    setEditForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleEditToggleCritical = () => {
    setEditForm((prev) => ({ ...prev, isCritical: !prev.isCritical }));
  };

  // ✅ Batch 76: Apply Template to Habit Form
  const applyHabitTemplate = useCallback((template) => {
    setHabitForm((prev) => ({
      ...prev,
      name: template.name,
      domain: template.domain,
      isCritical: template.isCritical,
    }));
    setSelectedWeeklyDays([]);
    setDraftStatus("TEMPLATE LOADED");
  }, []);

  const handleRegisterHabit = useCallback(async () => {
    if (!habitForm.name.trim()) {
      setDraftStatus("ERROR: نام عادت الزامی است.");
      return;
    }

    if (habits.length >= 7) {
      setDraftStatus("ERROR: سیستم از ۷ عادت همزمان بیشتر را توصیه نمی‌کند. یک عادت قدیمی را غیرفعال کن، سپس عادت جدید اضافه کن.");
      return;
    }

    if (
      habitForm.recurrenceType === "weekly" &&
      selectedWeeklyDays.length === 0
    ) {
      setDraftStatus("ERROR: برای عادت هفتگی حداقل یک روز انتخاب کنید.");
      return;
    }

    try {
      await saveHabit({
        name: habitForm.name.trim(),
        domain: habitForm.domain,
        isCritical: habitForm.isCritical,
        recurrence: {
          type: habitForm.recurrenceType,
          ...(habitForm.recurrenceType === "weekly"
            ? { days: selectedWeeklyDays }
            : {}),
        },
      });
      setHabitForm(initialHabitState);
      setSelectedWeeklyDays([]);
      setDraftStatus("HABIT REGISTERED");
      loadHabits();
    } catch (error) {
      console.error("Failed to save habit:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  }, [habitForm, habits.length, selectedWeeklyDays]);

  const handleEditHabitClick = (habit) => {
    setEditingHabitId(habit.id);
    setEditHabitForm({
      name: habit.name || "",
      domain: habit.domain || "discipline",
      recurrenceType: habit.recurrence?.type || "daily",
      isCritical: habit.isCritical || false,
    });
    setEditWeeklyDays(
      Array.isArray(habit.recurrence?.days) ? habit.recurrence.days : []
    );
  };

  const handleSaveHabitEdit = async () => {
    try {
      const existing = await HabitRepository.getById(editingHabitId);

      if (!existing) {
        setDraftStatus("ERROR: عادت یافت نشد.");
        setEditingHabitId(null);
        return;
      }

      if (
        editHabitForm.recurrenceType === "weekly" &&
        editWeeklyDays.length === 0
      ) {
        setDraftStatus("ERROR: برای عادت هفتگی حداقل یک روز انتخاب کنید.");
        return;
      }

      await HabitRepository.save({
        ...existing,
        id: editingHabitId,
        name: editHabitForm.name.trim(),
        domain: editHabitForm.domain,
        isCritical: editHabitForm.isCritical,
        recurrence: editHabitForm.recurrenceType === "weekly"
          ? { type: "weekly", days: editWeeklyDays }
          : { type: "daily" },
      });
      setEditingHabitId(null);
      loadHabits();
    } catch (error) {
      console.error("Failed to update habit:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  };

  const handleDeleteHabit = async (id) => {
    if (!window.confirm("آیا مطمئنید؟")) return;
    try {
      await HabitRepository.delete(id);
      loadHabits();
    } catch (error) {
      console.error("Failed to delete habit:", error);
      setDraftStatus("ERROR: " + error.message);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 animate-in fade-in duration-500 text-os-text">
      <h2 className="text-2xl font-bold text-os-text mb-8">
        مدیریت و ویرایش داده‌ها
      </h2>

      <section className="bg-os-card border border-os-border rounded-xl p-6 mb-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-sm font-mono text-os-accent flex items-center gap-2">
            [ 📅 ] DAY BLOCK MANAGER
          </h3>
          <span className="text-[10px] font-mono text-os-text/60 px-2 py-1 bg-os-bg/50 border border-os-border/50 rounded-md">
            {draftStatus}
          </span>
        </div>

        <div className="mb-6">
          <label className="text-[10px] font-mono text-os-text/60 block mb-2 uppercase">
            روز مأموریت:
          </label>
          <select
            value={selectedDay}
            onChange={(e) => setSelectedDay(e.target.value)}
            className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text focus:border-os-accent outline-none transition"
          >
            {days.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 mb-6">
          {blocks.length === 0 && (
            <p className="text-os-text/30 text-xs text-center py-8 font-mono">
              NO BLOCKS FOUND FOR THIS DAY
            </p>
          )}

          {blocks.map((block, index) => (
            <div
              key={index}
              className="flex flex-col gap-3 p-4 border border-os-border/50 rounded-lg bg-os-bg/50"
            >
              <input
                type="text"
                placeholder="MISSION TITLE (e.g. Code Review)..."
                value={block.title}
                onChange={(e) =>
                  handleBlockChange(index, "title", e.target.value)
                }
                className="w-full bg-transparent border-b border-os-border text-sm text-os-text focus:border-os-accent outline-none pb-1 placeholder:text-os-text/40"
              />

              <div className="flex items-center justify-between mt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={block.isCritical}
                    onChange={() => handleBlockToggleCritical(index)}
                    className="w-4 h-4 text-os-accent focus:ring-os-accent border-os-border rounded"
                  />
                  <span className="text-sm font-mono text-os-text/70">
                    ماموریت بحرانی؟
                  </span>
                </label>

                <button
                  onClick={() => removeBlock(index)}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono px-2 py-1 rounded bg-os-bg/30 border border-red-400/40"
                >
                  [ DELETE BLOCK ]
                </button>
              </div>

              <div
                dir="ltr"
                className="grid grid-cols-3 gap-3 items-center text-left"
              >
                <div className="flex flex-col">
                  <label className="text-[9px] font-mono text-os-text/40 mb-1">
                    START
                  </label>
                  <input
                    type="time"
                    value={block.startTime}
                    onChange={(e) =>
                      handleBlockChange(index, "startTime", e.target.value)
                    }
                    className="bg-os-card border border-os-border rounded p-2 text-xs text-os-text font-mono outline-none focus:border-os-accent w-full"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[9px] font-mono text-os-text/40 mb-1">
                    END
                  </label>
                  <input
                    type="time"
                    value={block.endTime}
                    onChange={(e) =>
                      handleBlockChange(index, "endTime", e.target.value)
                    }
                    className="bg-os-card border border-os-border rounded p-2 text-xs text-os-text font-mono outline-none focus:border-os-accent w-full"
                  />
                </div>

                <div className="flex flex-col">
                  <label className="text-[9px] font-mono text-os-text/40 mb-1">
                    TYPE
                  </label>
                  <select
                    value={block.type}
                    onChange={(e) =>
                      handleBlockChange(index, "type", e.target.value)
                    }
                    className="bg-os-card border border-os-border rounded p-2 text-xs text-os-text outline-none focus:border-os-accent h-[38px] w-full"
                  >
                    <option value="course">Course</option>
                    <option value="habit">Habit</option>
                    <option value="fixed">Fixed</option>
                    <option value="break">Break</option>
                  </select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-3 pt-4 border-t border-os-border/50">
          <button
            onClick={addBlock}
            className="flex-1 bg-os-bg/50 border border-os-border text-os-text py-3 rounded-lg font-mono text-xs hover:bg-os-border/30 transition"
          >
            [ + ] ADD BLOCK
          </button>
          <button
            onClick={saveBlocks}
            className="flex-1 bg-os-accent/10 border border-os-accent text-os-accent py-3 rounded-lg font-mono text-xs hover:bg-os-accent hover:text-os-bg transition"
          >
            [ COMMIT CHANGES ]
          </button>
        </div>
      </section>

      <section className="bg-os-card border border-os-border rounded-xl p-6 mb-8">
        <h3 className="text-sm font-mono text-os-accent mb-6 flex items-center gap-2">
          [ 🎯 ] HABIT REGISTRY
        </h3>

        {/* ✅ Batch 76: Habit Templates UI */}
        <div className="mb-6 p-4 bg-os-bg/30 rounded-lg border border-os-border/50">
          <label className="text-[10px] font-mono text-os-text/60 block mb-3 uppercase">
            Habit Templates
          </label>
          <div className="flex flex-wrap gap-2">
            {HABIT_TEMPLATES.map((tpl) => (
              <button
                key={tpl.name}
                onClick={() => applyHabitTemplate(tpl)}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-os-card border border-os-border rounded-lg hover:border-os-accent hover:text-os-accent transition"
              >
                <span>{tpl.icon}</span>
                <span>{tpl.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
              HABIT NAME
            </label>
            <input
              type="text"
              placeholder="e.g. Morning Exercise"
              value={habitForm.name}
              onChange={(e) => setHabitForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent placeholder:text-os-text/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
                DOMAIN
              </label>
              <select
                value={habitForm.domain}
                onChange={(e) => setHabitForm((p) => ({ ...p, domain: e.target.value }))}
                className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent"
              >
                {DOMAINS.map((d) => (
                  <option key={d.key} value={d.key} style={{ color: d.color }}>{d.label}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
                RECURRENCE
              </label>
              <select
                value={habitForm.recurrenceType}
                onChange={(e) => {
                  const recurrenceType = e.target.value;
                  setHabitForm((p) => ({ ...p, recurrenceType }));
                  if (recurrenceType !== "weekly") setSelectedWeeklyDays([]);
                }}
                className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
              </select>
            </div>
          </div>

          {habitForm.recurrenceType === "weekly" && (
            <div>
              <span className="text-[10px] font-mono text-os-text/60 block mb-2">روزهای اجرای عادت هفتگی</span>
              <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                {WEEKLY_DAYS.map((day) => {
                  const selected = selectedWeeklyDays.includes(day.value);
                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => setSelectedWeeklyDays((current) => selected ? current.filter((item) => item !== day.value) : [...current, day.value].sort((a, b) => a - b))}
                      className={`touch-target py-2 rounded border text-[10px] font-mono ${selected ? "border-os-accent text-os-accent bg-os-accent/10" : "border-os-border text-os-text/50"}`}
                      aria-pressed={selected}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={habitForm.isCritical}
              onChange={(e) => setHabitForm((p) => ({ ...p, isCritical: e.target.checked }))}
              className="w-4 h-4 text-os-accent focus:ring-os-accent border-os-border rounded"
            />
            <span className="text-sm font-mono text-os-text/70">
              CRITICAL HABIT? (affects Full Day scoring)
            </span>
          </label>
        </div>

        <button
          onClick={handleRegisterHabit}
          className="w-full mt-6 bg-os-accent text-os-bg font-bold py-3 rounded-lg font-mono text-sm hover:opacity-90 transition"
        >
          [ REGISTER NEW HABIT ]
        </button>
      </section>

      <section className="bg-os-card border border-os-border rounded-xl p-6 mb-8">
        <h3 className="text-sm font-mono text-os-accent mb-6 flex items-center gap-2">
          [ 📋 ] HABIT LIST
        </h3>

        <div className="space-y-3">
          {habits.length === 0 && (
            <p className="text-os-text/30 text-xs text-center py-8 font-mono">
              NO HABITS REGISTERED YET
            </p>
          )}

          {habits.map((h) => (
            <div key={h.id} className="bg-os-bg/50 border border-os-border/50 rounded-lg p-4">
              {editingHabitId === h.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editHabitForm.name || ""}
                    onChange={(e) => setEditHabitForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={editHabitForm.domain}
                      onChange={(e) => setEditHabitForm((p) => ({ ...p, domain: e.target.value }))}
                      className="bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent"
                    >
                      {DOMAINS.map((d) => (
                        <option key={d.key} value={d.key} style={{ color: d.color }}>{d.label}</option>
                      ))}
                    </select>
                    <select
                      value={editHabitForm.recurrenceType}
                      onChange={(e) => {
                        const recurrenceType = e.target.value;
                        setEditHabitForm((p) => ({ ...p, recurrenceType }));
                        if (recurrenceType !== "weekly") setEditWeeklyDays([]);
                      }}
                      className="bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent"
                    >
                      <option value="daily">Daily</option>
                      <option value="weekly">Weekly</option>
                    </select>
                  </div>
                  {editHabitForm.recurrenceType === "weekly" && (
                    <div>
                      <span className="text-[10px] font-mono text-os-text/60 block mb-2">روزهای اجرای عادت هفتگی</span>
                      <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
                        {WEEKLY_DAYS.map((day) => {
                          const selected = editWeeklyDays.includes(day.value);
                          return (
                            <button
                              key={day.value}
                              type="button"
                              onClick={() => setEditWeeklyDays((current) => selected ? current.filter((item) => item !== day.value) : [...current, day.value].sort((a, b) => a - b))}
                              className={`touch-target py-2 rounded border text-[10px] font-mono ${selected ? "border-os-accent text-os-accent bg-os-accent/10" : "border-os-border text-os-text/50"}`}
                              aria-pressed={selected}
                            >
                              {day.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editHabitForm.isCritical || false}
                      onChange={(e) => setEditHabitForm((p) => ({ ...p, isCritical: e.target.checked }))}
                      className="w-4 h-4 text-os-accent focus:ring-os-accent border-os-border rounded"
                    />
                    <span className="text-xs font-mono text-os-text/70">CRITICAL</span>
                  </label>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveHabitEdit}
                      className="flex-1 bg-os-accent/10 border border-os-accent text-os-accent py-2 rounded-lg font-mono text-xs hover:bg-os-accent hover:text-os-bg transition"
                    >
                      SAVE
                    </button>
                    <button
                      onClick={() => setEditingHabitId(null)}
                      className="flex-1 border border-os-border text-os-text/60 py-2 rounded-lg font-mono text-xs hover:bg-os-border/30 transition"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-base font-bold text-os-text">{h.name}</span>
                    {h.isCritical && (
                      <span className="bg-red-500/20 text-red-400 text-[10px] font-mono px-2 py-0.5 rounded border border-red-500/40">
                        CRITICAL
                      </span>
                    )}
                    <span className="text-[10px] font-mono text-os-text/50 bg-os-bg/50 px-2 py-0.5 rounded border border-os-border/30">
                      {DOMAINS.find((d) => d.key === h.domain)?.label || h.domain}
                    </span>
                    <span className="text-[10px] font-mono text-os-text/40 uppercase">
                      {h.recurrence?.type}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditHabitClick(h)}
                      className="border border-os-border text-os-text/70 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-os-border/30 transition"
                    >
                      EDIT
                    </button>
                    <button
                      onClick={() => handleDeleteHabit(h.id)}
                      className="border border-red-500/30 text-red-400 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-red-500/10 transition"
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-os-card border border-os-border rounded-xl p-6 mb-8">
        <h3 className="text-sm font-mono text-os-accent mb-6 flex items-center gap-2">
          [ 🎓 ] COURSE REGISTRY
        </h3>

        <div className="space-y-4">
          <div>
            <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
              COURSE NAME
            </label>
            <input
              type="text"
              placeholder="e.g. Linux Bootcamp"
              value={course.name}
              onChange={(e) => handleCourseChange("name", e.target.value)}
              className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent placeholder:text-os-text/40"
            />
          </div>

          <div>
            <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
              INSTRUCTOR
            </label>
            <input
              type="text"
              placeholder="e.g. Jason Dion"
              value={course.instructor}
              onChange={(e) =>
                handleCourseChange("instructor", e.target.value)
              }
              className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent placeholder:text-os-text/40"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
                TOTAL EPISODES
              </label>
              <input
                type="number"
                placeholder="50"
                value={course.totalEpisodes}
                onChange={(e) =>
                  handleCourseChange("totalEpisodes", e.target.value)
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent font-mono"
              />
            </div>

            <div>
              <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
                CURRENT EPISODE
              </label>
              <input
                type="number"
                placeholder="0"
                value={course.currentEpisode}
                onChange={(e) =>
                  handleCourseChange("currentEpisode", e.target.value)
                }
                className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent font-mono"
              />
            </div>
          </div>

          <div>
            <label className="text-[10px] font-mono text-os-text/60 block mb-1 uppercase">
              COURSE URL / LINK
            </label>
            <input
              type="text"
              placeholder="https://udemy.com/course/..."
              value={course.link}
              onChange={(e) => handleCourseChange("link", e.target.value)}
              className="w-full bg-os-bg border border-os-border rounded-lg p-3 text-sm text-os-text outline-none focus:border-os-accent font-mono placeholder:text-os-text/40"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer mt-2">
            <input
              type="checkbox"
              checked={course.isCritical}
              onChange={handleCourseToggleCritical}
              className="w-4 h-4 text-os-accent focus:ring-os-accent border-os-border rounded"
            />
            <span className="text-sm font-mono text-os-text/70">
              دوره بحرانی؟
            </span>
          </label>
        </div>

        <button
          onClick={saveCourse}
          className="w-full mt-6 bg-os-accent text-os-bg font-bold py-3 rounded-lg font-mono text-sm hover:opacity-90 transition"
        >
          [ REGISTER NEW COURSE ]
        </button>
      </section>

      <section className="bg-os-card border border-os-border rounded-xl p-6 mt-8">
        <h3 className="text-sm font-mono text-os-accent mb-6 flex items-center gap-2">
          [ 📊 ] COURSE PROGRESS
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {courses.length === 0 && (
            <p className="text-os-text/30 text-xs text-center py-8 font-mono col-span-2">
              NO COURSES REGISTERED YET
            </p>
          )}

          {courses.map((c) => (
            <div key={c.id} className="bg-os-bg/50 border border-os-border/50 rounded-lg p-4">
              {editingCourseId === c.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={editForm.name || ""}
                    onChange={(e) => handleEditChange("name", e.target.value)}
                    placeholder="Course Name"
                    className="w-full bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent"
                  />
                  <input
                    type="text"
                    value={editForm.instructor || ""}
                    onChange={(e) => handleEditChange("instructor", e.target.value)}
                    placeholder="Instructor"
                    className="w-full bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={editForm.totalEpisodes || 0}
                      onChange={(e) => handleEditChange("totalEpisodes", e.target.value)}
                      placeholder="Total"
                      className="bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent font-mono"
                    />
                    <input
                      type="number"
                      value={editForm.currentEpisode || 0}
                      onChange={(e) => handleEditChange("currentEpisode", e.target.value)}
                      placeholder="Current"
                      className="bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent font-mono"
                    />
                  </div>
                  <input
                    type="text"
                    value={editForm.link || ""}
                    onChange={(e) => handleEditChange("link", e.target.value)}
                    placeholder="Link"
                    className="w-full bg-os-card border border-os-border rounded p-2 text-sm text-os-text outline-none focus:border-os-accent font-mono"
                  />
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editForm.isCritical || false}
                      onChange={handleEditToggleCritical}
                      className="w-4 h-4 text-os-accent focus:ring-os-accent border-os-border rounded"
                    />
                    <span className="text-xs font-mono text-os-text/70">CRITICAL</span>
                  </label>
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={handleSaveEdit}
                      className="flex-1 bg-os-accent/10 border border-os-accent text-os-accent py-2 rounded-lg font-mono text-xs hover:bg-os-accent hover:text-os-bg transition"
                    >
                      SAVE CHANGES
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 border border-os-border text-os-text/60 py-2 rounded-lg font-mono text-xs hover:bg-os-border/30 transition"
                    >
                      CANCEL
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-base font-bold text-os-text">{c.name}</h4>
                    {c.isCritical && (
                      <span className="bg-red-500/20 text-red-400 text-[10px] font-mono px-2 py-0.5 rounded border border-red-500/40">
                        CRITICAL
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-os-text/60 mb-3">Instructor: {c.instructor || "N/A"}</p>

                  <div className="w-full h-2 bg-os-bg rounded-full overflow-hidden mb-1">
                    <div
                      className="bg-os-accent h-full rounded-full transition-all duration-500"
                      style={{ width: `${c.progress}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] font-mono text-os-text/60 mb-4">
                    <span>{c.progress}%</span>
                    <span>EP: {c.currentEpisode} / {c.totalEpisodes}</span>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <button
                      onClick={() => handleAddEpisode(c)}
                      className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-emerald-500/20 transition"
                    >
                      +1 EP
                    </button>
                    <button
                      onClick={() => handleEditClick(c)}
                      className="border border-os-border text-os-text/70 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-os-border/30 transition"
                    >
                      EDIT
                    </button>
                    <button
                      onClick={() => handleDeleteCourse(c.id)}
                      className="border border-red-500/30 text-red-400 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-red-500/10 transition"
                    >
                      DELETE
                    </button>
                    {c.link && (
                      <button
                        onClick={() => window.open(c.link, '_blank', 'noopener,noreferrer')}
                        className="border border-sky-500/30 text-sky-400 px-3 py-1.5 rounded text-[10px] font-mono hover:bg-sky-500/10 transition"
                      >
                        🔗 LINK
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
