/**
 * Cloudflare Pages Function: POST /api/chat
 * Secret: XAI_API_KEY
 */

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4.5';

const CHAT_SYSTEM = `You are HaulIntel chat for CDL drivers. Tone: veteran driver, direct, helpful, no corporate fluff. Answer follow-ups about carriers, pay, home time, lease-purchase traps, recruiters, FMCSA, equipment, dispatch.

Keep answers mobile-friendly: short paragraphs, bullets when useful. Flag uncertainty. Not legal or employment advice. If asked about a specific company, give practical due diligence even when data is thin.`;

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

  const message = String(body.message || '').trim();
  if (!message || message.length > 2000) {
    return json({ error: 'Provide message (max 2000 chars)' }, 400, request);
  }

  const history = Array.isArray(body.history) ? body.history.slice(-8) : [];
  const company = body.company ? String(body.company).slice(0, 120) : '';

  const messages = [
    {
      role: 'system',
      content: CHAT_SYSTEM + (company ? `\n\nDriver was recently looking at company: ${company}.` : ''),
    },
  ];
  for (const h of history) {
    if (!h || !h.role || !h.content) continue;
    const role = h.role === 'assistant' || h.role === 'bot' ? 'assistant' : 'user';
    messages.push({ role, content: String(h.content).slice(0, 2000) });
  }
  messages.push({ role: 'user', content: message });

  try {
    const res = await fetch(XAI_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
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
      return json({ error: `xAI API ${res.status}: ${detail}` }, 502, request);
    }
    const data = JSON.parse(text);
    const content = data.choices?.[0]?.message?.content;
    if (!content) return json({ error: 'Empty model response' }, 502, request);
    return json({ source: 'live', answer: content.trim() }, 200, request);
  } catch (err) {
    return json({ error: 'Server error', detail: String(err && err.message ? err.message : err) }, 500, request);
  }
}
