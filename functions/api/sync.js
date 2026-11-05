// Cloudflare Pages Functions - 数据同步 API
// 绑定 KV Namespace 名称: KOUSUAN_KV
//
// 写入策略：POST 不再「整体覆盖」，而是「读旧值 -> 合并 -> 写回」。
// 电脑端 (index.html) 与手机端 (grade.html) 各自只带自己那份数据，
// 服务端负责取并集/取较大值，避免任一端用稀疏状态把另一端的配置、台账、历史、错题覆盖掉。

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

// POST /api/sync -> 合并本机数据与云端已有数据后写回 Cloudflare KV
// 响应只回传小快照（profile/history/errors/mastery），避免把大 ledger/sheet 塞回手机
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

  // 1. 解析请求体：非法 JSON 明确返回 400，不写入云端
  let body;
  try {
    body = await request.json();
  } catch (err) {
    return new Response(
      JSON.stringify({
        ok: false,
        kvBound: true,
        error: '请求体解析失败',
        message: '请求体不是合法的 JSON，本次数据未写入云端。',
      }),
      { status: 400, headers }
    );
  }

  try {
    const incoming = (body && typeof body === 'object' && !Array.isArray(body)) ? body : {};
    const child = incoming.child || 'nini';
    const key = `kousuan_${child}_data`;

    // 2. 读旧值（旧值损坏时按空基线合并，避免整库写入失败）
    let prev = {};
    try {
      const raw = await env.KOUSUAN_KV.get(key);
      if (raw) prev = JSON.parse(raw);
    } catch (_) {
      prev = {};
    }

    // 3. 服务端合并：历史并集、错题合并、档案取大、配置/台账/试卷防覆盖
    const merged = mergeSyncPayload(prev, incoming);

    // 4. 写回
    await env.KOUSUAN_KV.put(key, JSON.stringify(merged));

    return new Response(
      JSON.stringify({
        ok: true,
        kvBound: true,
        updatedAt: merged.updatedAt,
        data: {
          profile: merged.profile,
          history: merged.history,
          errors: merged.errors,
          mastery: merged.mastery,
        },
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

/* ================= 合并纯函数（不依赖 import，便于 Node 直接求值测试） ================= */

const HISTORY_LIMIT = 150;
const ERROR_LIMIT = 300;

function isObj(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function num(v) {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

function str(v) {
  return v == null ? '' : String(v);
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

// 解析时间字符串为毫秒；失败返回 0
function timeOf(v) {
  if (v == null || v === '') return 0;
  const t = Date.parse(v);
  return isFinite(t) ? t : 0;
}

/* ---------- 练习历史：并集去重 + 时间倒序 + 上限 150 ---------- */

// 去重键：优先 id；老数据没有 id 时用「日期|时间|题量|对题数|正确率」
function historyKey(h) {
  if (!isObj(h)) return '';
  if (h.id) return 'id:' + str(h.id);
  return 'k:' + [str(h.date), str(h.timeStr), num(h.total), num(h.correct), h.accuracy == null ? '' : str(h.accuracy)].join('|');
}

// 排序时间：id 形如 rec_<ms> 直接取毫秒；否则按 date + timeStr(+08:00) 解析
function historyTime(h) {
  if (!isObj(h)) return 0;
  const m = /^rec_(\d+)$/.exec(str(h.id));
  if (m) return Number(m[1]);
  const d = str(h.date);
  if (!d) return 0;
  // 旧版手机端写入的是完整 ISO 时间字符串，先尝试直接解析
  if (d.indexOf('T') > 0) {
    const t = timeOf(d);
    if (t) return t;
  }
  return timeOf(d + 'T' + (str(h.timeStr) || '00:00') + '+08:00');
}

function mergeHistory(prevH, nextH) {
  const map = new Map();
  const put = list => {
    asArray(list).forEach(h => {
      if (!isObj(h)) return;
      const k = historyKey(h);
      if (!k) return;
      map.set(k, h); // 同键以后到的为准
    });
  };
  put(prevH);
  put(nextH);
  const list = Array.from(map.values());
  list.sort((a, b) => historyTime(b) - historyTime(a));
  return list.slice(0, HISTORY_LIMIT);
}

/* ---------- 错题本：并集 + 同键计数合并 + 上限 300 ---------- */

function errorKey(e) {
  if (!isObj(e)) return '';
  const k = str(e.id) || str(e.sig) || str(e.factKey) || str(e.prompt);
  return k ? 'e:' + k : '';
}

function errorTime(e) {
  if (!isObj(e)) return 0;
  return Math.max(
    timeOf(e.lastFailedAt),
    timeOf(e.lastWrongDate),
    timeOf(e.createdTime),
    timeOf(str(e.date) + 'T00:00:00+08:00')
  );
}

// 两个时间字符串取较新/较旧（空值不参与比较）
function laterTime(a, b) {
  const ta = timeOf(a), tb = timeOf(b);
  if (!ta) return b;
  if (!tb) return a;
  return tb > ta ? b : a;
}
function earlierTime(a, b) {
  const ta = timeOf(a), tb = timeOf(b);
  if (!ta) return b;
  if (!tb) return a;
  return tb < ta ? b : a;
}

function mergeErrorItem(a, b) {
  const out = Object.assign({}, a, b); // 其余字段以后到的为准
  out.failCount = Math.max(num(a.failCount), num(b.failCount));
  out.count = Math.max(num(a.count), num(b.count));
  out.cause = str(b.cause) || str(a.cause) || '';
  out.resolved = !!(a.resolved || b.resolved); // 任一端已攻克即视为攻克
  out.lastFailedAt = laterTime(a.lastFailedAt, b.lastFailedAt);
  out.lastWrongDate = laterTime(a.lastWrongDate, b.lastWrongDate);
  out.firstWrongDate = earlierTime(a.firstWrongDate, b.firstWrongDate);
  out.createdTime = earlierTime(a.createdTime, b.createdTime);
  out.date = str(a.date) || str(b.date); // 保留首次出错日期
  out.id = str(a.id) || str(b.id);
  return out;
}

function mergeErrors(prevE, nextE) {
  const map = new Map();
  const put = list => {
    asArray(list).forEach(e => {
      if (!isObj(e)) return;
      const k = errorKey(e);
      if (!k) return;
      const old = map.get(k);
      map.set(k, old ? mergeErrorItem(old, e) : e);
    });
  };
  put(prevE);
  put(nextE);
  const list = Array.from(map.values());
  list.sort((a, b) => errorTime(b) - errorTime(a));
  return list.slice(0, ERROR_LIMIT);
}

/* ---------- 知识点掌握度：seen/right 取大，days 按日合并，causes 取大 ---------- */

// 按天合并：同一天 seen/right 取大（幂等，重复上报不会翻倍）
function mergeDayMap(a, b) {
  const out = {};
  const put = obj => {
    if (!isObj(obj)) return;
    Object.keys(obj).forEach(k => {
      const cur = isObj(out[k]) ? out[k] : { seen: 0, right: 0 };
      const v = isObj(obj[k]) ? obj[k] : {};
      out[k] = {
        seen: Math.max(num(cur.seen), num(v.seen)),
        right: Math.max(num(cur.right), num(v.right)),
      };
    });
  };
  put(a);
  put(b);
  Object.keys(out).forEach(k => {
    if (out[k].right > out[k].seen) out[k].right = out[k].seen;
  });
  return out;
}

// causes 计数取大：同一份错因重复上报时不会累加翻倍
function mergeCountMap(a, b) {
  const out = {};
  if (isObj(a)) Object.keys(a).forEach(k => { out[k] = num(a[k]); });
  if (isObj(b)) Object.keys(b).forEach(k => { out[k] = Math.max(num(out[k]), num(b[k])); });
  return out;
}

function mergeMastery(prevM, nextM) {
  const a = isObj(prevM) ? prevM : {};
  const b = isObj(nextM) ? nextM : {};
  const out = {};
  const ids = new Set(Object.keys(a).concat(Object.keys(b)));
  ids.forEach(id => {
    const x = isObj(a[id]) ? a[id] : {};
    const y = isObj(b[id]) ? b[id] : {};
    const merged = Object.assign({}, x, y);
    const seen = Math.max(num(x.seen), num(y.seen));
    const right = Math.min(Math.max(num(x.right), num(y.right)), seen);
    merged.seen = seen;
    merged.right = right;
    merged.days = mergeDayMap(x.days, y.days);
    merged.causes = mergeCountMap(x.causes, y.causes);
    merged.last = Math.max(num(x.last), num(y.last));
    merged.acc = seen ? right / seen : 1;
    out[id] = merged;
  });
  return out;
}

/* ---------- 妮妮档案：累计值取大 + 历史推导兜底 + 较晚一侧的姓名/学校/连续天数 ---------- */

// 用合并后的历史记录推导累计值（作为下限兜底，防止某端档案计数被重置）
function totalsFromHistory(history) {
  let sheets = 0, questions = 0, correct = 0, stars = 0;
  asArray(history).forEach(h => {
    if (!isObj(h)) return;
    sheets += 1;
    questions += num(h.total);
    correct += num(h.correct);
    stars += num(h.stars);
  });
  return { sheets, questions, correct, stars };
}

function mergeProfile(prevP, nextP, history) {
  const a = isObj(prevP) ? prevP : {};
  const b = isObj(nextP) ? nextP : {};
  const aLast = str(a.lastDate);
  const bLast = str(b.lastDate);

  // 以 lastDate 较晚的一侧为主（同日以后到的一侧为主），另一侧只补全缺失字段
  const nextLater = bLast >= aLast;
  const main = nextLater ? b : a;
  const base = nextLater ? a : b;
  const out = {};
  Object.keys(base).forEach(k => { out[k] = base[k]; });
  Object.keys(main).forEach(k => {
    const v = main[k];
    if (v === undefined || v === null || v === '') return; // 不拿空值覆盖
    out[k] = v;
  });

  if (aLast || bLast) out.lastDate = nextLater ? bLast : aLast;
  const aStreak = num(a.streak), bStreak = num(b.streak);
  out.streak = aLast === bLast ? Math.max(aStreak, bStreak) : (bLast > aLast ? bStreak : aStreak);

  const hist = totalsFromHistory(history);
  out.totalSheets = Math.max(num(a.totalSheets), num(b.totalSheets), hist.sheets);
  out.totalQuestions = Math.max(num(a.totalQuestions), num(b.totalQuestions), hist.questions);
  out.totalCorrect = Math.max(num(a.totalCorrect), num(b.totalCorrect), hist.correct);
  const stars = Math.max(num(a.stars), num(a.totalStars), num(b.stars), num(b.totalStars), hist.stars);
  out.stars = stars;
  out.totalStars = stars; // 两套字段名保持同值：PC 用 stars，手机旧数据用 totalStars
  return out;
}

/* ---------- 配置 / 台账 / 试卷 ---------- */

// cfg：手机端没有配置（空对象）时保留云端配置，有自有键则用手机端
function mergeCfg(prevC, nextC) {
  if (isObj(nextC) && Object.keys(nextC).length > 0) return nextC;
  return isObj(prevC) ? prevC : {};
}

function ledgerIsEmpty(l) {
  if (!isObj(l)) return true;
  const maps = ['sig', 'fact', 'text', 'days'];
  const hasMap = maps.some(k => isObj(l[k]) && Object.keys(l[k]).length > 0);
  const hasFams = isObj(l.fams) && Object.keys(l.fams).length > 0;
  return !hasMap && !hasFams;
}

// 数值 map 按 key 取大合并（出题冷却台账：天的序号/累计次数都是单调量）
function mergeNumMap(a, b) {
  const out = {};
  const put = obj => {
    if (!isObj(obj)) return;
    Object.keys(obj).forEach(k => {
      const v = num(obj[k]);
      out[k] = out[k] === undefined ? v : Math.max(out[k], v);
    });
  };
  put(a);
  put(b);
  return out;
}

// ledger：手机端为空时保留云端台账；有内容时按 key 取大合并，绝不整体覆盖
function mergeLedger(prevL, nextL) {
  if (ledgerIsEmpty(nextL)) return isObj(prevL) ? prevL : {};
  const a = isObj(prevL) ? prevL : {};
  const b = nextL;
  return {
    sig: mergeNumMap(a.sig, b.sig),
    fact: mergeNumMap(a.fact, b.fact),
    text: mergeNumMap(a.text, b.text),
    days: mergeNumMap(a.days, b.days),
    fams: mergeNumMap(a.fams, b.fams),
  };
}

function sheetTime(s) {
  if (!isObj(s)) return 0;
  return timeOf(s.createdAt || s.updatedAt || '');
}

// sheet：按 createdAt（回退 updatedAt）较新者胜；相等或缺失保留云端旧卷
function mergeSheet(prevS, nextS) {
  const a = isObj(prevS) ? prevS : null;
  const b = isObj(nextS) ? nextS : null;
  if (!a) return b;
  if (!b) return a;
  return sheetTime(b) > sheetTime(a) ? b : a;
}

/*
 * 合并整份同步数据。prev 为云端旧值，incoming 为本次上传值。
 * 返回写回 KV 的新对象（updatedAt 用当前时间）。
 */
export function mergeSyncPayload(prev, incoming) {
  const p = isObj(prev) ? prev : {};
  const inc = isObj(incoming) ? incoming : {};

  const history = mergeHistory(p.history, inc.history);
  const errors = mergeErrors(p.errors, inc.errors);
  const mastery = mergeMastery(p.mastery, inc.mastery);
  const profile = mergeProfile(p.profile, inc.profile, history);

  return {
    version: inc.version || p.version || '1.2.0',
    child: inc.child || 'nini',
    exportedAt: inc.exportedAt !== undefined ? inc.exportedAt : p.exportedAt,
    updatedAt: new Date().toISOString(),
    profile,
    cfg: mergeCfg(p.cfg, inc.cfg),
    ledger: mergeLedger(p.ledger, inc.ledger),
    errors,
    history,
    mastery,
    sheet: mergeSheet(p.sheet, inc.sheet),
  };
}
