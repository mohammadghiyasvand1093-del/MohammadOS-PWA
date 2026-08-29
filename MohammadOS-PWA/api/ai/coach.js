/* eslint-disable no-undef */
// api/ai/coach.js  —  Secured Serverless Proxy

import { createClient } from "@supabase/supabase-js";

const ALLOWED_ORIGINS = [
  "https://mohammad-os-pwa.vercel.app",
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

// ✅ Nazer 3 Fix: Rate Limiting (In-Memory)
const requestCounts = new Map();
const RATE_LIMIT = 10; // 10 requests per window
const RATE_WINDOW = 60000; // 1 minute

function getBearerToken(req) {
  const header = req.headers.authorization || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

async function authenticateRequest(req) {
  const token = getBearerToken(req);
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!token || !supabaseUrl || !supabaseKey) return null;
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  return error ? null : data?.user || null;
}

export default async function handler(req, res) {
  const origin = req.headers.origin;
  
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.setHeader("Access-Control-Max-Age", "86400");
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticateRequest(req).catch(() => null);
  if (!user) return res.status(401).json({ error: "Authentication required" });

  const forwardedFor = String(req.headers["x-forwarded-for"] || "");
  const clientIp = forwardedFor.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const clientKey = user.id + ":" + clientIp;
  const now = Date.now();
  const clientData = requestCounts.get(clientKey) || { count: 0, resetTime: now + RATE_WINDOW };
  
  if (now > clientData.resetTime) {
    clientData.count = 0;
    clientData.resetTime = now + RATE_WINDOW;
  }
  
  clientData.count++;
  requestCounts.set(clientKey, clientData);
  
  if (clientData.count > RATE_LIMIT) {
    res.setHeader('Retry-After', Math.ceil((clientData.resetTime - now) / 1000));
    return res.status(429).json({ error: 'Too many requests. Please try again later.' });
  }

  try {
    const { messages, max_tokens = 600, temperature = 0.7 } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 20) {
      return res.status(400).json({ error: 'Invalid messages payload' });
    }

    const providers = [
      {
        name: "AvalAI",
        key: process.env.AVALAI_API_KEY,
        baseUrl: process.env.AVALAI_BASE_URL || "https://api.avalai.ir/v1",
        model: process.env.AVALAI_MODEL || "gpt-4o-mini",
      },
      {
        name: "OpenRouter",
        key: process.env.OPENROUTER_API_KEY,
        baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
        model: process.env.OPENROUTER_MODEL,
        fallbacks: String(process.env.OPENROUTER_FALLBACK_MODELS || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .slice(0, 3),
      },
    ].filter((provider) => provider.key && provider.model);

    if (providers.length === 0) {
      return res.status(503).json({ error: 'AI service not configured on server' });
    }

    const errors = [];
    for (const provider of providers) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const upstream = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${provider.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: provider.model,
            ...(provider.fallbacks?.length ? { models: provider.fallbacks } : {}),
            messages,
            max_tokens: Math.min(Number(max_tokens) || 600, 1000),
            temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0.7,
            stream: false,
          }),
        });

        if (upstream.ok) {
          const data = await upstream.json();
          return res.status(200).json(data);
        }

        const errText = await upstream.text().catch(() => 'Upstream error');
        errors.push(`${provider.name}: HTTP ${upstream.status} ${errText.slice(0, 300)}`);
      } catch (error) {
        errors.push(`${provider.name}: ${error.name === "AbortError" ? "timeout" : error.message}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    console.error('[AI Coach Providers]', errors.join(" | "));
    return res.status(502).json({ error: 'All configured AI providers failed' });
  } catch (error) {
    console.error('[AI Coach Proxy]', error);
    return res.status(500).json({ error: error.message || 'Internal proxy error' });
  }
}
