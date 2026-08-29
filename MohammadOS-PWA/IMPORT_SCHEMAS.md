
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

3. Weekly template schedule
Use this mode for activities that repeat every week:

```json
{
  "scheduleMode": "weekly_template",
  "days": [
    {
      "dayOfWeek": "saturday",
      "schedule": [
        {
          "title": "مطالعه",
          "startTime": "09:00",
          "endTime": "10:00",
          "type": "habit",
          "domain": "learning",
          "isCritical": false,
          "note": ""
        }
      ]
    }
  ]
}
```

4. Dated plan schedule
Use this mode for an exam period, project sprint, trip, or any range where each date is planned independently.
Every date between `startDate` and `endDate` must appear exactly once, including dates with an empty `schedule`.

```json
{
  "scheduleMode": "dated_plan",
  "title": "برنامه شهریور",
  "timeZone": "Asia/Tehran",
  "startDate": "2026-09-01",
  "endDate": "2026-09-30",
  "days": [
    {
      "date": "2026-09-01",
      "schedule": []
    }
  ]
}
```

Rules:

- Dates use Gregorian `YYYY-MM-DD`.
- `weekly_template` repeats by weekday.
- `dated_plan` replaces the weekly template inside its range.
- Manually-created events are stored as `one_off_event` and remain visible on top of both modes.

The AI coach proxy is optional. To show it as configured in the UI, set the public build flag
`VITE_AI_PROXY_ENABLED=true`. The browser sends the authenticated Supabase access token to `/api/ai/coach`; the server validates it before contacting an AI provider. Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and the private `AVALAI_API_KEY` in Vercel. You may also configure `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, and comma-separated `OPENROUTER_FALLBACK_MODELS`; the server tries AvalAI first and OpenRouter second. Never put an AI key in a `VITE_` variable or commit it to the repository.

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
