// Cloudflare Pages Functions - 做题记录与成绩 API
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
  const key = `kousuan_${child}_records`;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(JSON.stringify({ ok: false, message: '未绑定 KOUSUAN_KV' }), { status: 200, headers });
  }

  try {
    const raw = await env.KOUSUAN_KV.get(key);
    const records = raw ? JSON.parse(raw) : [];
    return new Response(JSON.stringify({ ok: true, records }), { status: 200, headers });
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
    const key = `kousuan_${child}_records`;

    const raw = await env.KOUSUAN_KV.get(key);
    const list = raw ? JSON.parse(raw) : [];
    list.unshift({
      ...body.record,
      recordedAt: new Date().toISOString(),
    });

    // 保持最近 200 条做题记录
    const trimmed = list.slice(0, 200);
    await env.KOUSUAN_KV.put(key, JSON.stringify(trimmed));

    return new Response(JSON.stringify({ ok: true, count: trimmed.length, message: '成绩记录已存入云端' }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
  }
}
