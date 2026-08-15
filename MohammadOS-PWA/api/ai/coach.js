/* eslint-disable no-undef */
// api/ai/coach.js  —  Secured Serverless Proxy

const ALLOWED_ORIGINS = [
  "https://mohammad-os-pwa.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

// ✅ Nazer 3 Fix: Rate Limiting (In-Memory)
const requestCounts = new Map();
const RATE_LIMIT = 10; // 10 requests per window
const RATE_WINDOW = 60000; // 1 minute

export default async function handler(req, res) {
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ✅ Nazer 3 Fix: Rate Limiting Logic
  const clientIp = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const clientData = requestCounts.get(clientIp) || { count: 0, resetTime: now + RATE_WINDOW };
  
  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + RATE_WINDOW;
  }
  
  clientData.count++;
  requestCounts.set(clientIp, clientData);
  
  if (clientData.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { messages, max_tokens = 600, temperature = 0.7 } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ error: 'Invalid messages payload' });
    }

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
        max_tokens: Math.min(max_tokens, 1000),
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