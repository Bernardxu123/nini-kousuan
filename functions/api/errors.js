// Cloudflare Pages Functions - 错题本 API
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const child = url.searchParams.get('child') || 'nini';
  const key = `kousuan_${child}_errors`;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(JSON.stringify({ ok: false, message: '未绑定 KOUSUAN_KV' }), { status: 200, headers });
  }

  try {
    const raw = await env.KOUSUAN_KV.get(key);
    const errors = raw ? JSON.parse(raw) : [];
    return new Response(JSON.stringify({ ok: true, errors }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
  }
}

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(JSON.stringify({ ok: false, message: '未绑定 KOUSUAN_KV' }), { status: 200, headers });
  }

  try {
    const body = await request.json();
    const child = body.child || 'nini';
    const key = `kousuan_${child}_errors`;
    const errors = body.errors || [];

    await env.KOUSUAN_KV.put(key, JSON.stringify(errors));
    return new Response(JSON.stringify({ ok: true, count: errors.length, message: '错题本已同步' }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
  }
}
