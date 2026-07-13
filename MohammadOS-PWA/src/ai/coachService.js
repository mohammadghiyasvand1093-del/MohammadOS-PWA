const COACH_SYSTEM_PROMPT = `
You are the "Discipline Coach" for MohammadOS. 
Role: Data-driven accountability partner.
Tone: Direct, concise, no-nonsense, respectful but firm.
Language: Persian (Farsi).

Rules:
1. Never accept excuses without digging deeper.
2. Use actual data (planned vs actual times).
3. Identify patterns over time.
4. If on track, give brief encouragement and move on.
5. Always end with one specific, hard question.
6. No psychological or clinical labels.

Modes:
- Evening Review: Input dayLog. Output JSON with summary, critical_check, delays, challenge_question.
- Weekly Analysis: Input 7 dayLogs. Output JSON with completion_rate, worst_pattern, root_cause_question, one_adjustment.
- Monthly Roadmap: Input monthLogs + roadmapStatus. Output JSON with roadmap_status, behind_or_ahead, weakness_this_month, next_month_plan (add, remove, reasoning), hard_question.

Constraint: Return ONLY valid JSON.
`.trim();

const API_BASE_URL = import.meta.env.VITE_AVALAI_BASE_URL || 'https://api.avalai.ir/v1';
const API_KEY = import.meta.env.VITE_AVALAI_API_KEY;
const MODEL = import.meta.env.VITE_AVALAI_MODEL || 'gpt-4o-mini';

const ensureApiKey = () => {
    if (!API_KEY) {
        console.error('API Key is missing in .env file!');
    }
};

const requestCoach = async (userPayload) => {
    ensureApiKey();
    try {
        const response = await fetch(`${API_BASE_URL}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${API_KEY}`,
            },
            body: JSON.stringify({
                model: MODEL,
                temperature: 0.2,
                messages: [
                    { role: 'system', content: COACH_SYSTEM_PROMPT },
                    { role: 'user', content: JSON.stringify(userPayload) }
                ],
                response_format: { type: 'json_object' },
            }),
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const data = await response.json();
        const content = data?.choices?.[0]?.message?.content;
        return JSON.parse(content);
    } catch (error) {
        console.error('Coach Service Error:', error);
        throw error;
    }
};

export const runEveningReview = async (dayLog) => {
    return await requestCoach({
        mode: 'evening_review',
        data: dayLog
    });
};

export const runWeeklyAnalysis = async (dayLogs) => {
    return await requestCoach({
        mode: 'weekly_pattern_analysis',
        data: dayLogs
    });
};

export const runMonthlyReview = async (monthLogs, roadmapStatus) => {
    return await requestCoach({
        mode: 'monthly_roadmap_review',
        data: { monthLogs, roadmapStatus }
    });
};
