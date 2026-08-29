// src/ai/coachService.js

/**
 * M1.1 — Local Insights + AvalAI Proxy Fallback
 * DESIGN: Pure service — NO imports from aggregationService or repositories.
 * All data arrives via parameters from caller.
 */

// ✅ FIX 3.9: Added toPersianDate
import { toPersianDate, getLocalDateKey } from "../utils/date";
import { isSupabaseConfigured, supabase } from "../auth/supabaseClient";

/* ──────────── Rule-based insights ──────────── */

const DOMAINS = [
  { key: "learning",   label: "یادگیری",      icon: "📚" },
  { key: "fitness",    label: "تناسب‌اندام",  icon: "💪" },
  { key: "discipline", label: "انضباط",       icon: "🎯" },
  { key: "work",       label: "کار",          icon: "💼" },
  { key: "rest",       label: "استراحت",      icon: "😴" },
  { key: "social",     label: "اجتماعی",      icon: "🤝" },
];

// 🟢 Batch 59 Fix: Added roadmapStatus parameter for local UI insights
function buildRuleBasedInsights(vitals = {}, weeklyStats = {}, domainTrend = [], todayLog = null, roadmapStatus = null) {
  const insights = [];

  // 🟢 Batch 59: Check Roadmap Constraints Locally
  if (roadmapStatus && Array.isArray(roadmapStatus.gates)) {
    const todayStr = getLocalDateKey(new Date());
    const overdueGates = roadmapStatus.gates.filter(g => g.deadline && g.deadline < todayStr && g.progress < 100);
    if (overdueGates.length > 0) {
      insights.push({
        severity: "alert",
        title: "ددلاین نقشه راه گذشته",
        message: `${overdueGates.length} دروازه نقشه راه از ددلاین عبور کرده است.`,
        icon: "⏰",
        action: "باید زمان‌بندی رو بازنگری کنی و وابستگی‌ها رو چک کنی."
      });
    }

    const constrainedGates = roadmapStatus.gates.filter(g => g.constraintNote && g.progress < 100);
    if (constrainedGates.length > 0) {
      insights.push({
        severity: "warning",
        title: "محدودیت‌های فعال در نقشه راه",
        message: `${constrainedGates.length} دروازه دارای محدودیت زمانی/مکانی فعال است.`,
        icon: "⚠️",
        action: "محدودیت‌های نقشه راه را در برنامه‌ریزی هفتگی لحاظ کن."
      });
    }
  }

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

  const taskList = todayLog?.entries || todayLog?.habits || [];

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

  if (vitals.streak > 0 && todayLog && !todayLog.fullDay && todayLog.status !== "frozen") {
    insights.push({
      severity: "warning",
      title: "استریک در خطر",
      message: `استریک ${vitals.streak} روزه اگر امروز Full Day نشود، قطع می‌شود.`,
      icon: "⚡",
      action: "حداقل یک ماموریت بحرانی را انجام بده تا Full Day شود.",
    });
  }

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

// 🟢 Batch 59 Fix: getInsights now accepts roadmapStatus
export function getInsights(vitals, weeklyStats, domainTrend, todayLog, roadmapStatus) {
  return buildRuleBasedInsights(vitals, weeklyStats, domainTrend, todayLog, roadmapStatus);
}

/* ──────────── AvalAI core caller ──────────── */

async function callAvalAI(messages, maxTokens = 600) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    if (!isSupabaseConfigured || !supabase) throw new Error("برای استفاده از مربی آنلاین، ورود به حساب لازم است.");
    const { data: { session } = {} } = await supabase.auth.getSession();
    if (!session?.access_token) throw new Error("نشست حساب معتبر نیست؛ دوباره وارد شوید.");

    const res = await fetch('/api/ai/coach', {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      }),
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("Empty response from AI coach");
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

function buildMonthlyPrompt(monthLogs = [], roadmapStatus) {
  const logs = monthLogs || [];
  const fullDays = logs.filter(d => d.fullDay).length;
  const avgMood = logs.length
    ? (logs.reduce((s, d) => s + (d.mood || 0), 0) / logs.length).toFixed(1)
    : "-";

  let roadmap = "نامشخص";
  if (roadmapStatus && typeof roadmapStatus === "object" && !Array.isArray(roadmapStatus)) {
    const gates = roadmapStatus.gates || [];
    const completed = roadmapStatus.completedGates ?? 0;
    const total = roadmapStatus.totalGates ?? gates.length;
    const gateLines = gates.map(g => {
      let line = `- ${g.title}: ${Math.round(g.progress ?? 0)}%`;
      // ✅ FIX 3.10: Convert AI prompt deadline to Persian
      if (g.deadline) line += ` (ددلاین: ${toPersianDate(g.deadline)})`;
      if (g.constraintNote) line += ` [محدودیت: ${g.constraintNote}]`;
      return line;
    }).join("\n");
    roadmap = `تکمیل‌شده: ${completed}/${total} دروازه\n${gateLines || "بدون دروازه"}`;
  }

  return [
    { role: "system", content: SYSTEM_COACH },
    { role: "user", content: `بررسی ماهانه کوتاه (۴–۶ خط) بده:

آمار ماه:
- روزهای Full: ${fullDays} از ${logs.length}
- میانگین Mood: ${avgMood}

Roadmap و محدودیت‌ها:
 ${roadmap}

ارزیابی کلی، یک الگوی قابل مشاهده، و یک اولویت برای ماه آینده. لطفاً محدودیت‌های زمانی (Deadline/Constraint) را در پیشنهاد خود لحاظ کن.` },
  ];
}

/* ──────────── Public API ──────────── */

export async function runEveningReview(dayLog) {
  try {
    const messages = buildEveningPrompt(dayLog);
    return await callAvalAI(messages, 400);
  } catch (err) {
    console.error("[AI EveningReview]", err);
    return `⚠️ خطای اتصال به سرور هوش مصنوعی: ${err.message}.\n💡 تحلیل محلی: امروز را مرور کن و برای فردا برنامه‌ریزی کن.`;
  }
}

export async function runWeeklyAnalysis(dayLogs) {
  try {
    const messages = buildWeeklyPrompt(dayLogs);
    return await callAvalAI(messages, 500);
  } catch (err) {
    console.error("[AI Weekly]", err);
    return `⚠️ خطای اتصال: ${err.message}.\n💡 گزارش محلی: هفتهٔ خود را مرور کن.`;
  }
}

export async function runMonthlyReview(monthLogs, roadmapStatus) {
  try {
    const messages = buildMonthlyPrompt(monthLogs, roadmapStatus);
    return await callAvalAI(messages, 600);
  } catch (err) {
    console.error("[AI Monthly]", err);
    return `⚠️ خطای اتصال: ${err.message}.\n💡 بررسی محلی: ماه را مرور کن.`;
  }
}

export function isAvalAIConfigured() {
  return import.meta.env.VITE_AI_PROXY_ENABLED === "true";
}
