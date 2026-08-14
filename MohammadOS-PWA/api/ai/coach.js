/* eslint-disable no-undef */
// api/ai/coach.js  —  M1.1 Serverless Proxy
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { messages, max_tokens = 600, temperature = 0.7 } = req.body;
    
    const API_KEY = process.env.AVALAI_API_KEY;
    const BASE_URL = process.env.AVALAI_BASE_URL || "https://api.avalai.ir/v1";
    const MODEL = process.env.AVALAI_MODEL || "gpt-4o-mini";

    if (!API_KEY) {
      return res.status(503).json({ error: 'AI service not configured on server' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const upstream = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
        max_tokens,
        temperature,
        stream: false,
      }),
    });

    clearTimeout(timeout);

    if (!upstream.ok) {
      const errText = await upstream.text().catch(() => 'Upstream error');
      return res.status(upstream.status).json({ error: errText });
    }

    const data = await upstream.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('[AI Coach Proxy]', error);
    return res.status(500).json({ error: error.message || 'Internal proxy error' });
  }
}