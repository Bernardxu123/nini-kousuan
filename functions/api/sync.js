// Cloudflare Pages Functions - 数据同步 API
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

// GET /api/sync?child=nini -> 读取妮妮的全部数据（档案、做题台账、错题本、打卡历史）
export async function onRequestGet(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  const child = url.searchParams.get('child') || 'nini';
  const key = `kousuan_${child}_data`;

  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(
      JSON.stringify({
        ok: false,
        isCloudflare: true,
        kvBound: false,
        message: 'Cloudflare Pages Functions 已正常运行，但尚未在后台绑定 KOUSUAN_KV 变量。请在 Pages 设置中绑定 KV Namespace。',
      }),
      { status: 200, headers }
    );
  }

  try {
    const raw = await env.KOUSUAN_KV.get(key);
    if (!raw) {
      return new Response(
        JSON.stringify({
          ok: true,
          kvBound: true,
          hasData: false,
          data: null,
          message: '云端暂无该档案的数据，可立即从本地上传初次数据。',
        }),
        { status: 200, headers }
      );
    }

    const data = JSON.parse(raw);
    return new Response(
      JSON.stringify({
        ok: true,
        kvBound: true,
        hasData: true,
        data,
        updatedAt: data.updatedAt || null,
        message: '云端数据读取成功',
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}

// POST /api/sync -> 保存妮妮的全部数据到 Cloudflare KV
export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  };

  if (!env || !env.KOUSUAN_KV) {
    return new Response(
      JSON.stringify({
        ok: false,
        kvBound: false,
        message: '未检测到 KOUSUAN_KV 绑定，请在 Cloudflare Pages 控制台 Functions 页面添加 KV Namespace 绑定，变量名为 KOUSUAN_KV。',
      }),
      { status: 200, headers }
    );
  }

  try {
    const body = await request.json();
    const child = body.child || 'nini';
    const key = `kousuan_${child}_data`;

    const payload = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    await env.KOUSUAN_KV.put(key, JSON.stringify(payload));

    return new Response(
      JSON.stringify({
        ok: true,
        kvBound: true,
        updatedAt: payload.updatedAt,
        message: '数据已安全同步到 Cloudflare KV 全球边缘数据库！',
      }),
      { status: 200, headers }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers }
    );
  }
}
