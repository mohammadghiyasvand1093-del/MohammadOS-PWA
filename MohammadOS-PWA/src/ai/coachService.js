// src/ai/coachService.js
const BASE_URL = import.meta.env.VITE_AVALAI_BASE_URL || "https://api.avalai.ir/v1";
const API_KEY = import.meta.env.VITE_AVALAI_API_KEY;
const MODEL = import.meta.env.VITE_AVALAI_MODEL || "gpt-4o-mini";

/**
 * Batch 59 — Local Insights + AvalAI Fallback
 * Compatible endpoint: OpenAI-style /v1/chat/completions
 * Fallback to rule-based on any failure (network, quota, key missing)
 *
 * DESIGN: Pure service — NO imports from aggregationService or repositories.
 * All data arrives via parameters from caller.
 */

/* ──────────── Rule-based insights (aligned to StatusPage schema) ──────────── */

const DOMAINS = [
  { key: "learning",   label: "یادگیری",      icon: "📚" },
  { key: "fitness",    label: "تناسب‌اندام",  icon: "💪" },
  { key: "discipline", label: "انضباط",       icon: "🎯" },
  { key: "work",       label: "کار",          icon: "💼" },
  { key: "rest",       label: "استراحت",      icon: "😴" },
  { key: "social",     label: "اجتماعی",      icon: "🤝" },
];

/**
 * @param {object} vitals      — from getVitals()
 * @param {object} weeklyStats — from getWeeklyStats()
 * @param {array}  domainTrend — from getDomainTrend(6)
 * @param {object} todayLog    — from DayLogRepository.getByDate(todayKey)
 */
function buildRuleBasedInsights(vitals = {}, weeklyStats = {}, domainTrend = [], todayLog = null) {
  const insights = [];

  if (vitals.streak === 0 && vitals.monthRate < 50) {
    insights.push({
      severity: "warning",
      title: "استریک صفر",
      message: "استریک صفر و عملکرد ماهانه زیر ۵۰٪ — امروز نقطهٔ شروع دوباره است.",
      icon: "⚠️",
      action: "امروز را با یک عادت کوچک شروع کن.",
    });
  }
  if (vitals.avgMood && vitals.avgMood < 3) {
    insights.push({
      severity: "warning",
      title: "مود پایین",
      message: "میانگین مود پایین — به استراحت و خودمراقبتی فکر کن.",
      icon: "💤",
      action: "۱۵ دقیقه استراحت فعال (قدم زدن، آب خوردن) را امتحان کن.",
    });
  }
  if (weeklyStats?.moodTrend) {
    const trend = weeklyStats.moodTrend;
    if (trend.length >= 3) {
      const last3 = trend.slice(-3);
      const declining = last3.every((v, i) => i === 0 || v <= last3[i - 1]);
      if (declining && last3[0] > last3[2]) {
        insights.push({
          severity: "alert",
          title: "روند نزولی مود",
          message: "روند نزولی مود در ۳ روز اخیر — علت را بررسی کن.",
          icon: "📉",
          action: "یادداشت امشب: چه چیزی باعث کاهش انرژی شد؟",
        });
      }
    }
  }
  if (vitals.graceUsed >= vitals.graceTotal) {
    insights.push({
      severity: "alert",
      title: "Grace Days تمام",
      message: "Grace Dayهای ماه تمام شده — دیگر freeze مجاز نیست.",
      icon: "🚫",
      action: "فردا باید Full Day باشد، حتی با کمترین عادت‌ها.",
    });
  }

  if (vitals.consistency > 0 && vitals.consistency < 30) {
    insights.push({
      severity: "warning",
      title: "ثبات پایین",
      message: "میزان ثبات زیر ۳۰٪ — فاصله بین روزهای موفق زیاد شده.",
      icon: "📊",
      action: "به‌جای هدف بزرگ، فقط روی حفظ یک عادت کوچک فردا تمرکز کن.",
    });
  }

  if (vitals.consistency > 80) {
    insights.push({
      severity: "success",
      title: "ثبات عالی",
      message: "میزان ثبات بالای ۸۰٪ — عالی! ثبات کلید موفقیت است.",
      icon: "🔥",
      action: "به همین شکل ادامه بده. یک عادت جدید اضافه کن.",
    });
  }

  // ✅ Defensive: Support both 'entries' (TodayPage schema) and 'habits' (legacy schema)
  const taskList = todayLog?.entries || todayLog?.habits || [];

  // Insight 1 — Critical Mission Miss
  if (taskList.some((e) => e.isCritical && !e.done)) {
    const undone = taskList.filter((e) => e.isCritical && !e.done);
    insights.push({
      severity: "alert",
      title: "ماموریت بحرانی انجام نشده",
      message: `${undone.length} ماموریت بحرانی هنوز انجام نشده.`,
      icon: "🔴",
      action: "اولویت را به ماموریت‌های بحرانی بده. بدون آن‌ها Full Day محقق نمی‌شود.",
    });
  }

  // Insight 2 — Streak At Risk
  if (vitals.streak > 0 && todayLog && !todayLog.fullDay && todayLog.status !== "frozen") {
    insights.push({
      severity: "warning",
      title: "استریک در خطر",
      message: `استریک ${vitals.streak} روزه اگر امروز Full Day نشود، قطع می‌شود.`,
      icon: "⚡",
      action: "حداقل یک ماموریت بحرانی را انجام بده تا Full Day شود.",
    });
  }

  // Insight 3 — Grace Burn Alert (2+ in 7 days)
  if (weeklyStats?.weeklyDayLogs) {
    const recentFrozen = weeklyStats.weeklyDayLogs.filter((l) => l.status === "frozen").length;
    if (recentFrozen >= 2) {
      insights.push({
        severity: "alert",
        title: "مصرف Grace بالا",
        message: "۲ روز Grace در ۷ روز اخیر — الگوی استراحت اجباری دیده می‌شود.",
        icon: "🧊",
        action: "۳ روز آینده را سبک‌تر برنامه‌ریزی کن. استراحت‌های کوتاه‌مدت را در برنامه بگذار.",
      });
    }
  }

  // Insight 4 — Domain Weakness (2 weeks < 50%)
  if (domainTrend.length >= 2) {
    const lastTwo = domainTrend.slice(-2);
    DOMAINS.forEach((d) => {
      const w1 = lastTwo[0]?.domains?.[d.key] || 0;
      const w2 = lastTwo[1]?.domains?.[d.key] || 0;
      const avg = (w1 + w2) / 2;
      if (avg > 0 && avg < 50) {
        insights.push({
          severity: "warning",
          title: `دامنه ${d.label} ضعیف است`,
          message: `عملکرد ${d.label} در ۲ هفته اخیر ${Math.round(avg)}٪ است.`,
          icon: d.icon,
          action: `هفته آینده حداقل یک عادت ${d.label} را اولویت اول قرار بده.`,
        });
      }
    });
  }

  // Insight 5 — Burnout Pattern (low mood + low full-day)
  if (weeklyStats?.weeklyDayLogs) {
    const activeLogs = weeklyStats.weeklyDayLogs.filter((l) => l.status !== "frozen");
    const lowMoodDays = activeLogs.filter((l) => l.mood != null && l.mood <= 2).length;
    const missedFullDays = activeLogs.filter((l) => !l.fullDay).length;
    if (lowMoodDays >= 2 && missedFullDays >= 3) {
      insights.push({
        severity: "alert",
        title: "الگوی فرسودگی",
        message: "مود پایین + Full Day کم = نشانهٔ burnout.",
        icon: "🚨",
        action: "۳ روز آینده را سبک‌تر برنامه‌ریزی کن. با مشاور صحبت کن.",
      });
    }
  }

  if (insights.length === 0) {
    insights.push({
      severity: "info",
      title: "همه چی رو به راه",
      message: "همه چی رو به راه است. به همین شکل ادامه بده.",
      icon: "✨",
      action: null,
    });
  }
  return insights;
}

/**
 * getInsights — rule-based local insights.
 * Caller MUST pass all 4 arguments for full insights.
 */
export function getInsights(vitals, weeklyStats, domainTrend, todayLog) {
  return buildRuleBasedInsights(vitals, weeklyStats, domainTrend, todayLog);
}

/* ──────────── AvalAI core caller ──────────── */

async function callAvalAI(messages, maxTokens = 600) {
  if (!API_KEY) {
    throw new Error("AVALAI_API_KEY missing");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
        stream: false,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from AvalAI");
    return content;
  } catch (e) {
    clearTimeout(timeout);
    throw e;
  }
}

/* ──────────── Prompt builders ──────────── */

const SYSTEM_COACH = `تو یک مربی بهره‌وری فارسی‌زبان هستی که به کاربر کمک می‌کنی عادت‌ها و عملکرد روزانه‌اش را بهبود دهد.
قوانین:
- فقط فارسی بنویس
- تحلیل کوتاه، عملی و صادقانه باشد (۳ تا ۶ خط)
- بدون مقدمهٔ غیرضروری
- یک پیشنهاد مشخص و قابل اجرا برای گام بعدی بده`;

function buildEveningPrompt(dayLog) {
  // ✅ Defensive: Support both 'entries' and 'habits'
  const habitList = dayLog?.entries || dayLog?.habits || [];
  const habits = habitList.map(h => `- ${h.title}: ${h.done ? "✅" : "❌"}${h.isCritical ? " (مهم)" : ""}`).join("\n") || "بدون عادت";
  const mood = dayLog?.mood || "نامشخص";
  const fullDay = dayLog?.fullDay ? "بله" : "خیر";
  const note = dayLog?.note || "";

  return [
    { role: "system", content: SYSTEM_COACH },
    { role: "user", content: `تحلیل کوتاه امشب را بنویس:

وضعیت امروز:
- Full Day: ${fullDay}
- Mood: ${mood}
- یادداشت: ${note || "ندارد"}

عادت‌ها:
 ${habits}

لطفاً تحلیل کن: چه خوب بود، چه بد بود، و یک پیشنهاد عملی برای فردا.` },
  ];
}

function buildWeeklyPrompt(dayLogs) {
  const summary = dayLogs.map((d, i) => {
    // ✅ Defensive: Support both 'entries' and 'habits'
    const list = d.entries || d.habits || [];
    const done = list.filter(h => h.done).length || 0;
    const total = list.length || 0;
    return `روز ${i + 1}: Full=${d.fullDay ? "بله" : "خیر"}, Mood=${d.mood || "-"}, Habits=${done}/${total}`;
  }).join("\n");

  return [
    { role: "system", content: SYSTEM_COACH },
    { role: "user", content: `گزارش هفتگی کوتاه (۳–۵ خط) بده:

 ${summary}

روند کلی، نکتهٔ مثبت، یک نکتهٔ بهبود، و یک هدف برای هفتهٔ آینده.` },
  ];
}

/**
 * buildMonthlyPrompt — DEFENSIVE: accepts both Array and Object shapes.
 *
 * Callers:
 *   - CoachSection.jsx passes: [] (array of {title, status})
 *   - RoadmapPage.jsx passes: { totalGates, completedGates, gates: [{title, progress}] }
 */
function buildMonthlyPrompt(monthLogs = [], roadmapStatus) {
  const logs = monthLogs || [];
  const fullDays = logs.filter(d => d.fullDay).length;
  const avgMood = logs.length
    ? (logs.reduce((s, d) => s + (d.mood || 0), 0) / logs.length).toFixed(1)
    : "-";

  /* ── defensive roadmap rendering ── */
  let roadmap = "نامشخص";
  if (Array.isArray(roadmapStatus) && roadmapStatus.length > 0) {
    roadmap = roadmapStatus.map(r => `- ${r.title}: ${r.status}`).join("\n");
  } else if (roadmapStatus && typeof roadmapStatus === "object" && !Array.isArray(roadmapStatus)) {
    const gates = roadmapStatus.gates || [];
    const completed = roadmapStatus.completedGates ?? 0;
    const total = roadmapStatus.totalGates ?? gates.length;
    const gateLines = gates.map(g => `- ${g.title}: ${Math.round(g.progress ?? 0)}%`).join("\n");
    roadmap = `تکمیل‌شده: ${completed}/${total} دروازه\n${gateLines || "بدون دروازه"}`;
  }

  return [
    { role: "system", content: SYSTEM_COACH },
    { role: "user", content: `بررسی ماهانه کوتاه (۴–۶ خط) بده:

آمار ماه:
- روزهای Full: ${fullDays} از ${logs.length}
- میانگین Mood: ${avgMood}

Roadmap:
 ${roadmap}

ارزیابی کلی، یک الگوی قابل مشاهده، و یک اولویت برای ماه آینده.` },
  ];
}

/* ──────────── Public API ──────────── */

export async function runEveningReview(dayLog) {
  if (!API_KEY) {
    return "🔌 AvalAI فعال نیست (API Key یافت نشد). تحلیل محلی: امروز را مرور کن و برای فردا برنامه‌ریزی کن.";
  }
  try {
    const messages = buildEveningPrompt(dayLog);
    return await callAvalAI(messages, 400);
  } catch (err) {
    console.error("[AvalAI EveningReview]", err);
    return `⚠️ خطای اتصال به AvalAI: ${err.message}.\n💡 تحلیل محلی: امروز را مرور کن و برای فردا برنامه‌ریزی کن.`;
  }
}

export async function runWeeklyAnalysis(dayLogs) {
  if (!API_KEY) {
    return "🔌 AvalAI فعال نیست. گزارش محلی: هفتهٔ خود را مرور کن و نقاط قوت و ضعف را شناسایی کن.";
  }
  try {
    const messages = buildWeeklyPrompt(dayLogs);
    return await callAvalAI(messages, 500);
  } catch (err) {
    console.error("[AvalAI Weekly]", err);
    return `⚠️ خطای اتصال: ${err.message}.\n💡 گزارش محلی: هفتهٔ خود را مرور کن.`;
  }
}

export async function runMonthlyReview(monthLogs, roadmapStatus) {
  if (!API_KEY) {
    return "🔌 AvalAI فعال نیست. بررسی محلی: ماه را مرور کن و اولویت‌های آینده را مشخص کن.";
  }
  try {
    const messages = buildMonthlyPrompt(monthLogs, roadmapStatus);
    return await callAvalAI(messages, 600);
  } catch (err) {
    console.error("[AvalAI Monthly]", err);
    return `⚠️ خطای اتصال: ${err.message}.\n💡 بررسی محلی: ماه را مرور کن.`;
  }
}

export function isAvalAIConfigured() {
  return Boolean(API_KEY);
}