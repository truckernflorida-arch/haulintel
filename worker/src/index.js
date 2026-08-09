/**
 * HaulIntel API proxy — Cloudflare Worker
 * Holds XAI_API_KEY as a secret; browser never sees it.
 *
 * Routes:
 *   GET  /health
 *   POST /api/research  { company: string }
 *   POST /api/chat      { message: string, history?: [{role,content}], company?: string }
 */

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4.5';

const RESEARCH_SYSTEM = `You are HaulIntel, a blunt, trustworthy advisor for working CDL truck drivers (company drivers and owner-operators). They research trucking companies before applying or signing on.

Voice: knowledgeable older driver who also has current data instincts — direct, no recruiter spin, plain English, short paragraphs.

When given a company name, produce a structured briefing. Be honest about uncertainty. Prefer "unknown / verify" over inventing specific CPM numbers, DOT scores, or MC numbers. If you are not sure about a real carrier, say so and still give practical due-diligence guidance.

You MUST respond with ONLY valid JSON (no markdown fences) matching this shape:
{
  "displayName": "string",
  "dba": "string",
  "mc": "string or Unknown",
  "dot": "string or Unknown",
  "hq": "string or Unknown",
  "type": "e.g. Dry van · OTR company driver",
  "score": 0-100 integer overall fit for a typical company driver,
  "scoreLabel": "short label e.g. Strong / Average / Caution / Avoid",
  "scoreClass": "good" | "avg" | "warn" | "bad",
  "vibe": "2-4 sentences overall vibe",
  "recommendation": "1-3 sentences what the driver should do",
  "sections": {
    "pay": { "title": "Pay & home time", "rating": "good|avg|warn|bad", "ratingLabel": "short", "body": "2-4 short paragraphs, use \\n\\n between paragraphs" },
    "equipment": { "title": "Equipment & maintenance", "rating": "...", "ratingLabel": "...", "body": "..." },
    "dispatch": { "title": "Dispatch & management", "rating": "...", "ratingLabel": "...", "body": "..." },
    "safety": { "title": "Safety / FMCSA notes", "rating": "...", "ratingLabel": "...", "body": "..." },
    "sentiment": { "title": "Recent driver sentiment", "rating": "...", "ratingLabel": "...", "body": "..." }
  },
  "tips": ["3 practical checklist items before signing"],
  "disclaimer": "one sentence: not legal/employment advice; verify FMCSA/contract"
}

scoreClass guide: good=70+, avg=50-69, warn=35-49 or lease-risk, bad=<35.
Never invent fake MC/DOT IDs — use "Unknown" if not confident.`;

const CHAT_SYSTEM = `You are HaulIntel chat for CDL drivers. Tone: veteran driver, direct, helpful, no corporate fluff. Answer follow-ups about carriers, pay, home time, lease-purchase traps, recruiters, FMCSA, equipment, dispatch.

Keep answers mobile-friendly: short paragraphs, bullets when useful. Flag uncertainty. Not legal or employment advice. If asked about a specific company, give practical due diligence even when data is thin.`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    if (request.method === 'OPTIONS') {
      return corsPreflight(origin, env);
    }

    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json({ ok: true, service: 'haulintel-api', model: MODEL }, 200, origin, env);
      }

      if (request.method === 'POST' && url.pathname === '/api/research') {
        return await handleResearch(request, env, origin);
      }

      if (request.method === 'POST' && url.pathname === '/api/chat') {
        return await handleChat(request, env, origin);
      }

      return json({ error: 'Not found' }, 404, origin, env);
    } catch (err) {
      console.error(err);
      return json(
        { error: 'Server error', detail: String(err && err.message ? err.message : err) },
        500,
        origin,
        env
      );
    }
  },
};

async function handleResearch(request, env, origin) {
  if (!env.XAI_API_KEY) {
    return json({ error: 'XAI_API_KEY not configured on Worker' }, 503, origin, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin, env);
  }

  const company = String(body.company || body.query || '').trim();
  if (!company || company.length > 120) {
    return json({ error: 'Provide company name (max 120 chars)' }, 400, origin, env);
  }

  const userPrompt = `Research this trucking company for a CDL driver considering applying or signing on: "${company}".

Cover pay accuracy vs hype, home time reality, equipment, dispatch/management, safety/FMCSA-style signals (only if known), and recent driver sentiment. Be fair. If this is a lease-purchase program, call out trap patterns. Output JSON only.`;

  const raw = await callGrok(env.XAI_API_KEY, [
    { role: 'system', content: RESEARCH_SYSTEM },
    { role: 'user', content: userPrompt },
  ]);

  const briefing = parseJsonLoose(raw);
  if (!briefing || typeof briefing !== 'object') {
    return json(
      {
        error: 'Model returned unparseable briefing',
        rawPreview: raw.slice(0, 500),
      },
      502,
      origin,
      env
    );
  }

  // Normalize a few fields so the frontend always has what it needs
  const normalized = normalizeBriefing(briefing, company);
  return json({ source: 'live', briefing: normalized }, 200, origin, env);
}

async function handleChat(request, env, origin) {
  if (!env.XAI_API_KEY) {
    return json({ error: 'XAI_API_KEY not configured on Worker' }, 503, origin, env);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, origin, env);
  }

  const message = String(body.message || '').trim();
  if (!message || message.length > 2000) {
    return json({ error: 'Provide message (max 2000 chars)' }, 400, origin, env);
  }

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const company = body.company ? String(body.company).slice(0, 120) : '';

  const messages = [
    {
      role: 'system',
      content:
        CHAT_SYSTEM +
        (company ? `\n\nDriver was recently looking at company: ${company}.` : ''),
    },
  ];

  for (const h of history) {
    if (!h || !h.role || !h.content) continue;
    const role = h.role === 'assistant' || h.role === 'bot' ? 'assistant' : 'user';
    messages.push({ role, content: String(h.content).slice(0, 2000) });
  }
  messages.push({ role: 'user', content: message });

  const answer = await callGrok(env.XAI_API_KEY, messages);
  return json({ source: 'live', answer: answer.trim() }, 200, origin, env);
}

async function callGrok(apiKey, messages) {
  const res = await fetch(XAI_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature: 0.4,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 400);
    try {
      const j = JSON.parse(text);
      detail = j.error?.message || j.message || detail;
    } catch {
      /* keep */
    }
    throw new Error(`xAI API ${res.status}: ${detail}`);
  }

  const data = JSON.parse(text);
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty model response');
  return content;
}

function parseJsonLoose(text) {
  let t = String(text || '').trim();
  // Strip markdown fences if model ignores instructions
  if (t.startsWith('```')) {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  }
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf('{');
    const end = t.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(t.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function normalizeBriefing(b, fallbackName) {
  const score = clampInt(b.score, 0, 100, 50);
  let scoreClass = b.scoreClass;
  if (!['good', 'avg', 'warn', 'bad'].includes(scoreClass)) {
    if (score >= 70) scoreClass = 'good';
    else if (score >= 50) scoreClass = 'avg';
    else if (score >= 35) scoreClass = 'warn';
    else scoreClass = 'bad';
  }

  const sectionKeys = ['pay', 'equipment', 'dispatch', 'safety', 'sentiment'];
  const defaults = {
    pay: 'Pay & home time',
    equipment: 'Equipment & maintenance',
    dispatch: 'Dispatch & management',
    safety: 'Safety / FMCSA notes',
    sentiment: 'Recent driver sentiment',
  };

  const sections = {};
  for (const key of sectionKeys) {
    const s = (b.sections && b.sections[key]) || {};
    sections[key] = {
      title: s.title || defaults[key],
      rating: ['good', 'avg', 'warn', 'bad'].includes(s.rating) ? s.rating : 'avg',
      ratingLabel: s.ratingLabel || 'See notes',
      body: String(s.body || 'No detailed notes returned. Verify with the carrier and FMCSA SAFER.').slice(0, 4000),
    };
  }

  const tips = Array.isArray(b.tips)
    ? b.tips.map((t) => String(t).slice(0, 300)).filter(Boolean).slice(0, 6)
    : [
        'Pull live FMCSA SAFER/SMS for this carrier before orientation.',
        'Get pay and home-time rules for your exact account in writing.',
        'Talk to a current driver at the terminal, not only the recruiter.',
      ];

  return {
    displayName: String(b.displayName || fallbackName).slice(0, 120),
    dba: String(b.dba || '').slice(0, 120),
    mc: String(b.mc || 'Unknown').slice(0, 40),
    dot: String(b.dot || 'Unknown').slice(0, 40),
    hq: String(b.hq || 'Unknown').slice(0, 80),
    type: String(b.type || 'Trucking carrier').slice(0, 120),
    score,
    scoreLabel: String(b.scoreLabel || 'Assessment').slice(0, 40),
    scoreClass,
    vibe: String(b.vibe || '').slice(0, 2000),
    recommendation: String(b.recommendation || '').slice(0, 1500),
    sections,
    tips,
    disclaimer: String(
      b.disclaimer ||
        'Not legal or employment advice. Verify contracts and official FMCSA data yourself.'
    ).slice(0, 400),
    live: true,
  };
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
}

function allowedOrigin(origin, env) {
  if (!origin) return '*';
  const list = (env.ALLOWED_ORIGINS || 'https://truckernflorida-arch.github.io,http://localhost:8080,http://127.0.0.1:8080')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  // Allow exact match, or any github.io / localhost for easier setup
  if (list.includes(origin)) return origin;
  if (list.includes('*')) return '*';
  try {
    const u = new URL(origin);
    if (u.hostname.endsWith('.github.io')) return origin;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return origin;
  } catch {
    /* ignore */
  }
  // Default: echo origin only if it looks like github pages for this project
  if (origin.includes('github.io')) return origin;
  return list[0] || '*';
}

function corsHeaders(origin, env) {
  const allow = allowedOrigin(origin, env);
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function corsPreflight(origin, env) {
  return new Response(null, { status: 204, headers: corsHeaders(origin, env) });
}

function json(data, status, origin, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(origin, env),
    },
  });
}
