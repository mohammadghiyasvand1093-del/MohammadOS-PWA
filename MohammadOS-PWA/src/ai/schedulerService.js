const API_KEY = import.meta.env.VITE_AVALAI_API_KEY;

export async function generateDailySchedule({ courses, fixedEvents }) {
  const systemPrompt = `
    You are the scheduling agent for MohammadOS.
    Your task is to create a realistic daily schedule based on the user's courses and fixed events.
    You MUST return ONLY a valid JSON object. No markdown, no explanations.
    The JSON object must have a key named "schedule" which contains an array of time blocks.
    Each block must have: title, startTime (HH:mm), endTime (HH:mm), type (course/fixed/habit/break), and isCritical (boolean).
    Set isCritical to true for fixed events like in-person classes, exams, or mandatory work shifts. Set to false for breaks and optional habits.
  `;

  const userPrompt = `
    Fixed Events for today: ${JSON.stringify(fixedEvents)}
    Courses to study today: ${JSON.stringify(courses)}
    
    Please schedule 1 or 2 episodes of each course in the free slots. Add short breaks between study sessions. 
    Return ONLY the JSON object.
  `;

  try {
    // ارسال درخواست از طریق پروکسی Vite به AvalAI
    const response = await fetch("/avalai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // مدل سریع و ارزان
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.5,
        response_format: { type: "json_object" }, // اجبار به خروجی JSON
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("AvalAI API Error Details:", errorData);
      throw new Error(errorData?.error?.message || `API request failed with status ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    
    const parsed = JSON.parse(content);
    return parsed.schedule || parsed;
    
  } catch (error) {
    console.error("AI Scheduler Error:", error.message);
    throw error;
  }
}
