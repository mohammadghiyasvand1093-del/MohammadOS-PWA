import { useState, useEffect, useCallback, useMemo } from "react";
import { ScheduleRepository } from "../repositories/ScheduleRepository";
import { db } from "../db/database";
import _ from "lodash";

const initialCourseState = {
  name: "",
  instructor: "",
  totalEpisodes: "",
  currentEpisode: "0",
  link: "",
  isCritical: false,
};

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

  const markAsTyping = useCallback(() => {
    setDraftStatus((prev) => (prev === "TYPING..." ? prev : "TYPING..."));
  }, []);

  useEffect(() => {
    async function loadInitialData() {
      setDraftStatus("LOADING DRAFT...");
      try {
        const draft = await db.drafts.get(`addPage_${selectedDay}`);
        if (draft) {
          setBlocks(draft.blocks || []);
          setCourse(draft.course || initialCourseState);
          setDraftStatus("DRAFT LOADED");
          return;
        }

        const dayData = await ScheduleRepository.getDaySchedule(selectedDay);
        setBlocks(dayData ? dayData.schedule : []);
        setCourse(initialCourseState);
        setDraftStatus("LOADED FROM DB");
      } catch (error) {
        console.error("Failed to load initial data:", error);
        setDraftStatus("LOAD ERROR");
      }
    }

    loadInitialData();
  }, [selectedDay]);

  const handleAutosave = useMemo(
    () =>
      _.debounce(async (currentBlocks, currentCourse) => {
        try {
          await db.drafts.put({
            key: `addPage_${selectedDay}`,
            blocks: currentBlocks,
            course: currentCourse,
            timestamp: new Date().toISOString(),
          });
          console.log(`Autosaved draft for ${selectedDay}`);
          setDraftStatus("DRAFT SAVED");
        } catch (error) {
          console.error("Autosave failed:", error);
          setDraftStatus("SAVE ERROR");
        }
      }, 2000),
    [selectedDay]
  );

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
      alert(
        `برنامه روز ${
          days.find((day) => day.key === selectedDay)?.label || selectedDay
        } با موفقیت در هسته ذخیره شد.`
      );
    } catch (error) {
      console.error("Failed to save day schedule:", error);
      setDraftStatus("SAVE ERROR");
      alert("خطا در ذخیره برنامه روز.");
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
      alert("خطا: نام دوره الزامی است.");
      return;
    }

    try {
      await db.courses.put({
        id: crypto.randomUUID(),
        name: course.name.trim(),
        instructor: course.instructor.trim(),
        totalEpisodes: Number(course.totalEpisodes) || 0,
        currentEpisode: Number(course.currentEpisode) || 0,
        link: course.link.trim(),
        isCritical: course.isCritical,
        createdAt: new Date().toISOString(),
      });

      alert(`دوره "${course.name}" با موفقیت ثبت شد.`);
      await db.drafts.delete(`addPage_${selectedDay}`);
      setCourse(initialCourseState);
      setDraftStatus("COURSE SAVED");
    } catch (error) {
      console.error("Failed to save course:", error);
      setDraftStatus("SAVE ERROR");
      alert("خطا در ثبت دوره.");
    }
  }, [course, selectedDay]);

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
            MISSION DAY:
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
                    CRITICAL MISSION?
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

      <section className="bg-os-card border border-os-border rounded-xl p-6">
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
              CRITICAL COURSE?
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
    </div>
  );
}
