
IMPORT_SCHEMAS.md — MohammadOS-PWA
This document outlines the JSON schemas required for importing data into MohammadOS.

1. Roadmap Import Schema
Used for importing career gates, criteria, and constraints.

{  "app": "MohammadOS-PWA",  "exportedAt": "ISO-8601 Timestamp",  "gates": [    {      "title": "Backend Foundations",      "description": "Mastering JS, Node, and basic DBs.",      "constraintNote": "Only available during weekends",      "deadline": "2024-12-31",      "deadlineNote": "Before new year",      "order": 1,      "dependsOn": ["Backend Prerequisites"], // References titles of other gates      "criteria": [        { "title": "Complete Node.js Course" },        { "title": "Build a REST API" }      ],      "evidenceLink": "https://github.com/..."    }  ]}
2. Weekly Schedule Import Schema
Used for importing AI-generated weekly schedules.
[
  {
    "dayOfWeek": "saturday",
    "schedule": [
      {
        "title": "Morning Exercise",
        "startTime": "08:00",
        "endTime": "09:00",
        "type": "habit",
        "domain": "fitness",
        "isCritical": true,
        "note": "Leg day"
      },
      {
        "title": "Flex Time",
        "startTime": "14:00",
        "endTime": "16:00",
        "type": "flexible", // Supported in Batch 60
        "domain": "work",
        "isCritical": false,
        "note": ""
      }
    ]
  }
]
Validation Rules
Valid Days: saturday, sunday, monday, tuesday, wednesday, thursday, friday.
Valid Types: course, fixed, habit, break, event, flexible.
Valid Domains: learning, fitness, discipline, work, rest, social.
Time Format: HH:MM (24-hour format).
Duration Limit: Total scheduled time per day must not exceed 19 hours (returns a warning).
Overlap Detection: Overlapping time blocks return a warning.

---

### ۶. فایل `src/db/database.js` (تکمیل Batch 58 و 61)
فایل دیتابیس شما ارسال نشده بود، اما برای اینکه پروژه خطای `Table importHistory not found` ندهد، این بلاک را به انتهای فایل `database.js` خود (پایین‌ترین خط `db.version(18)`) اضافه کن:

```javascript
/* =========================
 * v19 (Batch 58 & 61 Setup)
 * Added importHistory table to track JSON imports
 * ========================= */
db.version(19).stores({
  habits: "id, date, habitId, domain, lastEmaDate, strengthBeforeToday",
  courses: "id, name, instructor",
  courseSessions: "id, courseId, date, episodeNumber, status, [courseId+status]",
  fixedEvents: "id, dayOfWeek, title, startTime, endTime",
  schedules: "id, dayOfWeek",
  dayLogs: "date, fullDay, year, month, week, dayOfWeek, status, [year+month], [year+month+status]",
  activeTimer: "id, taskRefId, isRunning",
  gates: "id, title, order",
  drafts: "key",
  lifeWheelScores: "id, periodKey, startDate, endDate, year, month, week, [year+month]",
  // 🟢 جدول جدید برای لاگ‌های Import
  importHistory: "id, type, importedAt"
});

export default db;
