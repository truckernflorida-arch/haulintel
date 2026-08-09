/**
 * Cloudflare Pages Function: POST /api/research
 * Secret: XAI_API_KEY (set via `wrangler pages secret put` or dashboard)
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

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(request) },
  });
}

function parseJsonLoose(text) {
  let t = String(text || '').trim();
  if (t.startsWith('```')) t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
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

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.round(x)));
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
  const defaults = {
    pay: 'Pay & home time',
    equipment: 'Equipment & maintenance',
    dispatch: 'Dispatch & management',
    safety: 'Safety / FMCSA notes',
    sentiment: 'Recent driver sentiment',
  };
  const sections = {};
  for (const key of Object.keys(defaults)) {
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

export async function onRequestOptions(context) {
  return new Response(null, { status: 204, headers: corsHeaders(context.request) });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.XAI_API_KEY) {
    return json({ error: 'XAI_API_KEY not configured on Pages' }, 503, request);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400, request);
  }

  const company = String(body.company || body.query || '').trim();
  if (!company || company.length > 120) {
    return json({ error: 'Provide company name (max 120 chars)' }, 400, request);
  }

  const userPrompt = `Research this trucking company for a CDL driver considering applying or signing on: "${company}".

Cover pay accuracy vs hype, home time reality, equipment, dispatch/management, safety/FMCSA-style signals (only if known), and recent driver sentiment. Be fair. If this is a lease-purchase program, call out trap patterns. Output JSON only.`;

  try {
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: RESEARCH_SYSTEM },
          { role: 'user', content: userPrompt },
        ],
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
      return json({ error: `xAI API ${res.status}: ${detail}` }, 502, request);
    }
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Empty model response' }, 502, request);
    const parsed = parseJsonLoose(content);
    if (!parsed) {
      return json({ error: 'Model returned unparseable briefing', rawPreview: content.slice(0, 500) }, 502, request);
    }
    return json({ source: 'live', briefing: normalizeBriefing(parsed, company) }, 200, request);
  } catch (err) {
    return json({ error: 'Server error', detail: String(err && err.message ? err.message : err) }, 500, request);
  }
}
