export async function onRequestGet() {
  return new Response(JSON.stringify({ ok: true, service: 'haulintel-pages', model: 'grok-4.5' }), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
