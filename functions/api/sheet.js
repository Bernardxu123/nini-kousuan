// Cloudflare Pages Functions - 当前活跃试卷 API
// 绑定 KV Namespace 名称: KOUSUAN_KV

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

// GET /api/sheet?child=nini -> 获取妮妮当前最新活跃试卷（供手机端直接拉取批改）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const child = url.searchParams.get('child') || 'nini';
  const key = `kousuan_${child}_sheet`;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(JSON.stringify({ ok: false, message: '未绑定 KOUSUAN_KV' }), { status: 200, headers });
  }

  try {
    const raw = await env.KOUSUAN_KV.get(key);
    if (!raw) {
      return new Response(JSON.stringify({ ok: true, hasSheet: false, sheet: null, message: '暂无活跃试卷' }), { status: 200, headers });
    }
    const sheet = JSON.parse(raw);
    return new Response(JSON.stringify({ ok: true, hasSheet: true, sheet, updatedAt: sheet.createdAt || null }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
  }
}

// POST /api/sheet -> 电脑端出题或打印时，将活跃试卷元数据与题目推送到云端
export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(JSON.stringify({ ok: false, message: '未绑定 KOUSUAN_KV' }), { status: 200, headers });
  }

  try {
    const body = await request.json();
    const child = body.child || 'nini';
    const key = `kousuan_${child}_sheet`;
    const sheet = {
      ...body.sheet,
      updatedAt: new Date().toISOString()
    };

    await env.KOUSUAN_KV.put(key, JSON.stringify(sheet));

    // 同时追加到最近试卷历史（保留最近 10 套）
    const historyKey = `kousuan_${child}_recent_sheets`;
    let recent = [];
    try {
      const histRaw = await env.KOUSUAN_KV.get(historyKey);
      if (histRaw) recent = JSON.parse(histRaw);
    } catch (_) {}
    recent.unshift({
      sheetId: sheet.sheetId || ('sheet_' + Date.now()),
      title: sheet.title || '口算天天练',
      count: sheet.count || (sheet.items ? sheet.items.length : 48),
      createdAt: sheet.createdAt || new Date().toISOString()
    });
    recent = recent.slice(0, 10);
    await env.KOUSUAN_KV.put(historyKey, JSON.stringify(recent));

    return new Response(JSON.stringify({ ok: true, message: '活跃试卷已同步至云端', sheetId: sheet.sheetId }), { status: 200, headers });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers });
  }
}
