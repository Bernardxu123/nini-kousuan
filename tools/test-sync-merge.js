// /api/sync 服务端合并逻辑测试：node tools/test-sync-merge.js
// 做法：读取 functions/api/sync.js 源码，剥掉行首 export 后用 new Function 求值，
// 拿 onRequestGet / onRequestPost / mergeSyncPayload，再用 Map 伪造 KV 绑定直接调用。
// Node 26 自带 Request/Response/URL，无需 wrangler 或浏览器。失败时退出码 1。
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_PATH = path.join(__dirname, '..', 'functions', 'api', 'sync.js');
const SOURCE = fs.readFileSync(SRC_PATH, 'utf8');
const code = SOURCE.replace(/^export\s+/gm, '');
const api = new Function(code + '\nreturn { onRequestOptions, onRequestGet, onRequestPost, mergeSyncPayload };')();

/* ---------------- 测试小工具 ---------------- */

let passed = 0;
const failures = [];

async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log('PASS ' + name);
  } catch (err) {
    failures.push(name);
    console.log('FAIL ' + name);
    String(err && err.message || err).split('\n').forEach(line => console.log('       ' + line));
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || '断言失败');
}
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg || '值不相等') + '\n期望: ' + e + '\n实际: ' + a);
}
function okStr(v, msg) {
  if (typeof v !== 'string' || !v.length) throw new Error((msg || '应为非空字符串') + '\n实际: ' + JSON.stringify(v));
}
function near(actual, expected, msg) {
  if (!(Math.abs(actual - expected) < 1e-9)) throw new Error((msg || '数值不相等') + '\n期望: ' + expected + '\n实际: ' + actual);
}

const KEY = 'kousuan_nini_data';
const SYNC_URL = 'https://nini-kousuan.pages.dev/api/sync';
const GET_URL = SYNC_URL + '?child=nini';

// 用 Map 伪造 KV 绑定（async get / put）
function makeKV(seedData) {
  const map = new Map();
  if (seedData !== undefined) map.set(KEY, JSON.stringify(seedData));
  return {
    map,
    async get(key) { return map.has(key) ? map.get(key) : null; },
    async put(key, value) { map.set(key, String(value)); },
  };
}

function stored(kv) {
  return kv.map.has(KEY) ? JSON.parse(kv.map.get(KEY)) : null;
}

function ctxGet(kv, url) {
  return { env: kv ? { KOUSUAN_KV: kv } : {}, request: new Request(url || GET_URL, { method: 'GET' }) };
}

function ctxPost(kv, body, url) {
  const init = { method: 'POST', headers: { 'Content-Type': 'application/json' } };
  init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return { env: kv ? { KOUSUAN_KV: kv } : {}, request: new Request(url || SYNC_URL, init) };
}

async function readJson(res) {
  return JSON.parse(await res.text());
}

/* ---------------- 线上真实数据结构 fixture ---------------- */

function pcPayload() {
  return {
    version: '1.2.0',
    child: 'nini',
    exportedAt: '2026-11-05T10:06:00.000Z',
    updatedAt: '2026-11-05T10:06:00.000Z',
    profile: {
      name: '妮妮',
      age: 6,
      school: '上海嘉定华五小学（徐行镇）',
      grade: '一年级',
      term: '上册',
      avatar: '👧',
      streak: 1,
      lastDate: '20261105',
      totalSheets: 1,
      totalQuestions: 48,
      totalCorrect: 48,
      stars: 3,
      createdAt: '2026-11-03',
    },
    cfg: { count: 48, targets: ['cnm_p010', 'cnm_p011'], fluencyMix: 0.7, showAnswer: false },
    ledger: {
      sig: { 'add:1,2,3': 20598, 'sub:7,5,2': 20599 },
      fact: { 'fact:1,2,3': 20598 },
      text: {},
      days: { '20598': 48 },
      fams: { add: 1 },
    },
    errors: [
      {
        id: 'err_pc_1',
        date: '2026-11-04',
        createdTime: '2026-11-04T08:00:00.000Z',
        prompt: '3 ＋ 4 ＝',
        answer: '7',
        topicId: 'cnm_p010',
        fam: 'add',
        factKey: '3+4',
        sig: 'add:3,4,7',
        cause: '粗心看错',
        failCount: 1,
        resolved: false,
        lastFailedAt: '2026-11-04T08:00:00.000Z',
      },
      {
        id: 'err_pc_2',
        date: '2026-11-03',
        createdTime: '2026-11-03T08:00:00.000Z',
        prompt: '8 － 3 ＝',
        answer: '5',
        topicId: 'cnm_p011',
        fam: 'sub',
        factKey: '8-3',
        sig: 'sub:8,3,5',
        cause: '退位不熟',
        failCount: 1,
        resolved: true,
        resolvedAt: '2026-11-04T09:00:00.000Z',
        lastFailedAt: '2026-11-03T08:00:00.000Z',
      },
    ],
    history: [
      {
        id: 'rec_1793873217537',
        date: '2026-11-05',
        timeStr: '18:06',
        total: 48,
        correct: 48,
        wrong: 0,
        accuracy: 1,
        durationMinutes: 7,
        stars: 3,
        targets: ['cnm_p010', 'cnm_p011'],
      },
    ],
    mastery: {
      cnm_p010: {
        seen: 30,
        right: 29,
        acc: 29 / 30,
        last: 1793873217537,
        days: { '20261105': { seen: 30, right: 29 } },
        causes: { '计算失误': 1 },
      },
      cnm_p011: {
        seen: 18,
        right: 18,
        acc: 1,
        last: 1793873217537,
        days: { '20261105': { seen: 18, right: 18 } },
        causes: {},
      },
    },
    sheet: {
      sheetId: 'sheet_pc',
      title: '电脑端 · 11月5日 天天练',
      createdAt: '2026-11-05T10:00:00.000Z',
      updatedAt: '2026-11-05T10:00:00.000Z',
      items: [{ no: 1, prompt: '1 ＋ 1 ＝', answer: '2' }],
    },
  };
}

// 手机端稀疏提交（从没 pull 过：cfg/ledger 为空，只有本机这一份 48 题记录）
function mobileSparsePayload(overrides) {
  const payload = {
    version: '1.2.0',
    child: 'nini',
    exportedAt: '2026-11-06T02:00:00.000Z',
    profile: { totalSheets: 1, totalQuestions: 48, totalCorrect: 48, totalStars: 3, stars: 3, lastDate: '20261106', streak: 2 },
    cfg: {},
    ledger: {},
    errors: [],
    history: [
      {
        id: 'rec_1793900000000',
        date: '2026-11-06',
        timeStr: '09:30',
        total: 48,
        correct: 48,
        wrong: 0,
        accuracy: 1,
        durationMinutes: 6,
        stars: 3,
        sheetTitle: '手机端 · 11月6日 天天练',
        targets: ['cnm_p010'],
      },
    ],
    mastery: {
      cnm_p010: {
        seen: 12,
        right: 12,
        acc: 1,
        last: 1793900000000,
        days: { '20261106': { seen: 12, right: 12 } },
        causes: {},
      },
    },
    sheet: null,
  };
  return Object.assign(payload, overrides || {});
}

/* ---------------- 用例 ---------------- */

(async function main() {
  console.log('=== /api/sync 合并逻辑测试 ===');

  await test('GET：无数据时契约不变（ok/kvBound/hasData/data/message）', async () => {
    const kv = makeKV();
    const res = await api.onRequestGet(ctxGet(kv));
    const j = await readJson(res);
    eq(res.status, 200, 'GET 状态应为 200');
    eq(j.ok, true);
    eq(j.kvBound, true);
    eq(j.hasData, false);
    eq(j.data, null);
    okStr(j.message);
  });

  await test('GET：有数据时返回完整 data 与 updatedAt', async () => {
    const payload = pcPayload();
    const kv = makeKV(payload);
    const j = await readJson(await api.onRequestGet(ctxGet(kv)));
    eq(j.ok, true);
    eq(j.kvBound, true);
    eq(j.hasData, true);
    eq(j.data, payload, 'data 应原样返回');
    eq(j.updatedAt, payload.updatedAt);
    eq(j.message, '云端数据读取成功');
  });

  await test('KV 未绑定：GET/POST 响应保持现状', async () => {
    const g = await api.onRequestGet(ctxGet(null));
    const gj = await readJson(g);
    eq(g.status, 200);
    eq(gj.ok, false);
    eq(gj.isCloudflare, true);
    eq(gj.kvBound, false);
    ok(gj.message.indexOf('KOUSUAN_KV') >= 0, 'GET kv_unbound 提示应包含 KOUSUAN_KV');

    const p = await api.onRequestPost(ctxPost(null, pcPayload()));
    const pj = await readJson(p);
    eq(p.status, 200);
    eq(pj.ok, false);
    eq(pj.kvBound, false);
    ok(pj.message.indexOf('KOUSUAN_KV') >= 0, 'POST kv_unbound 提示应包含 KOUSUAN_KV');
  });

  await test('OPTIONS：204 + CORS 头不变', async () => {
    const res = await api.onRequestOptions();
    eq(res.status, 204);
    eq(res.headers.get('Access-Control-Allow-Origin'), '*');
    eq(res.headers.get('Access-Control-Allow-Methods'), 'GET, POST, OPTIONS');
  });

  await test('PC 先写 cfg/ledger，手机空 cfg/ledger 提交不丢配置与台账', async () => {
    const kv = makeKV();
    await api.onRequestPost(ctxPost(kv, pcPayload()));
    const before = stored(kv);
    const res = await readJson(await api.onRequestPost(ctxPost(kv, mobileSparsePayload())));
    eq(res.ok, true, '手机提交应成功');
    const after = stored(kv);
    eq(after.cfg, before.cfg, '手机空 cfg 不应覆盖云端配置');
    eq(after.ledger, before.ledger, '手机空 ledger 不应覆盖云端台账');
    eq(after.sheet && after.sheet.sheetId, 'sheet_pc', '手机 sheet:null 不应清空云端试卷');
    eq(after.history.length, 2, '历史应并集为 2 条');
    eq(after.mastery.cnm_p010.seen, 30, '未 pull 的手机端不应把云端掌握度从 30 降到 12');
    ok(after.mastery.cnm_p011, '云端 pc 端知识点应保留');
  });

  await test('手机 pull 后提交 48 题：历史并集去重、档案累加、掌握度增加', async () => {
    const kv = makeKV(pcPayload());
    const pulled = await readJson(await api.onRequestGet(ctxGet(kv)));
    ok(pulled.data, 'pull 应拿到云端数据');

    // 模拟手机端：拉到云端历史后本地再新增一条，并把掌握度在云端值上累加
    const inc = mobileSparsePayload();
    inc.history = inc.history.concat(pulled.data.history);
    inc.profile = {
      totalSheets: 2,
      totalQuestions: 96,
      totalCorrect: 96,
      stars: 6,
      totalStars: 6,
      lastDate: '20261106',
      streak: 2,
    };
    inc.mastery = {
      cnm_p010: {
        seen: 42,
        right: 41,
        acc: 41 / 42,
        last: 1793900000000,
        days: { '20261105': { seen: 30, right: 29 }, '20261106': { seen: 12, right: 12 } },
        causes: { '计算失误': 1 },
      },
      cnm_p013: {
        seen: 6,
        right: 6,
        acc: 1,
        last: 1793900000000,
        days: { '20261106': { seen: 6, right: 6 } },
        causes: {},
      },
    };

    await api.onRequestPost(ctxPost(kv, inc));
    const after = stored(kv);

    eq(after.history.length, 2, '历史并集去重后应为 2 条（不是 3 条）');
    eq(after.history[0].id, 'rec_1793900000000', '历史应按时间倒序，最新一条在前');
    eq(after.history[1].id, 'rec_1793873217537');
    eq(after.profile.totalSheets, 2);
    eq(after.profile.totalQuestions, 96);
    eq(after.profile.totalCorrect, 96);
    eq(after.profile.stars, 6);
    eq(after.profile.totalStars, 6, 'stars 与 totalStars 应同值');
    eq(after.profile.lastDate, '20261106', 'lastDate 应取较晚一侧');
    eq(after.mastery.cnm_p010.seen, 42, '掌握度应累加到 42');
    eq(after.mastery.cnm_p010.right, 41);
    near(after.mastery.cnm_p010.acc, 41 / 42, 'acc 应按 seen/right 重算');
    eq(after.mastery.cnm_p011.seen, 18, '云端 pc 端另一知识点应保留');
    eq(after.mastery.cnm_p013.seen, 6, '手机新增知识点应合入');

    // 再提交一次同一份数据：幂等，不重复累加
    await api.onRequestPost(ctxPost(kv, inc));
    const again = stored(kv);
    eq(again.history.length, 2, '重复提交不应产生重复历史');
    eq(again.profile.totalQuestions, 96, '重复提交不应翻倍累计');
    eq(again.mastery.cnm_p010.seen, 42, '重复提交不应翻倍掌握度');
  });

  await test('错题合并：resolved 保留、计数取大、cause 取非空、新错题并入', async () => {
    const kv = makeKV(pcPayload());
    await api.onRequestPost(ctxPost(kv, pcPayload()));
    const inc = mobileSparsePayload();
    inc.errors = [
      {
        id: 'err_pc_1',
        prompt: '3 ＋ 4 ＝',
        answer: '7',
        failCount: 3,
        count: 3,
        resolved: false,
        lastFailedAt: '2026-11-06T02:00:00.000Z',
        cause: '',
      },
      {
        id: 'err_pc_2',
        prompt: '8 － 3 ＝',
        answer: '5',
        failCount: 1,
        count: 1,
        resolved: false,
        lastFailedAt: '2026-11-06T02:00:00.000Z',
      },
      {
        id: 'err_mobile_1',
        prompt: '6 ＋ 3 ＝',
        answer: '9',
        failCount: 1,
        count: 1,
        resolved: false,
        cause: '计算失误',
        lastFailedAt: '2026-11-06T02:00:00.000Z',
      },
    ];
    await api.onRequestPost(ctxPost(kv, inc));
    const after = stored(kv);
    const byId = {};
    after.errors.forEach(e => { byId[e.id] = e; });

    eq(after.errors.length, 3, '错题应并集为 3 条');
    eq(byId['err_pc_1'].failCount, 3, 'failCount 应取大');
    eq(byId['err_pc_1'].cause, '粗心看错', '手机 cause 为空时应保留云端非空 cause');
    eq(byId['err_pc_1'].lastFailedAt, '2026-11-06T02:00:00.000Z', 'lastFailedAt 应取较新');
    eq(byId['err_pc_2'].resolved, true, '云端已攻克（resolved=true）必须保留');
    ok(byId['err_mobile_1'], '手机新增错题应合并进云端');
  });

  await test('sheet 合并：新者胜 / 相等保留旧卷 / 缺省保留旧卷', async () => {
    const base = pcPayload();
    const newer = api.mergeSyncPayload(base, { child: 'nini', sheet: { sheetId: 'sheet_new', createdAt: '2026-11-06T10:00:00.000Z' } });
    eq(newer.sheet.sheetId, 'sheet_new', '更新时间的试卷应胜出');

    const older = api.mergeSyncPayload(base, { child: 'nini', sheet: { sheetId: 'sheet_old', createdAt: '2026-11-01T10:00:00.000Z' } });
    eq(older.sheet.sheetId, 'sheet_pc', '旧试卷不应覆盖云端新卷');

    const same = api.mergeSyncPayload(base, { child: 'nini', sheet: { sheetId: 'sheet_same', createdAt: '2026-11-05T10:00:00.000Z' } });
    eq(same.sheet.sheetId, 'sheet_pc', '时间相等应保留云端旧卷');

    const missing = api.mergeSyncPayload(base, { child: 'nini' });
    eq(missing.sheet.sheetId, 'sheet_pc', '未传 sheet 应保留云端试卷');

    const onlyIncoming = api.mergeSyncPayload({}, { child: 'nini', sheet: { sheetId: 'sheet_only', createdAt: '2026-11-06T10:00:00.000Z' } });
    eq(onlyIncoming.sheet.sheetId, 'sheet_only', '只有一方时应使用该方试卷');
  });

  await test('非法请求体：返回 400 JSON 且不改写云端', async () => {
    const kv = makeKV(pcPayload());
    const before = stored(kv);
    const res = await api.onRequestPost(ctxPost(kv, '这不是 JSON {{{'));
    const j = await readJson(res);
    eq(res.status, 400, '非法 body 应返回 400');
    eq(j.ok, false);
    okStr(j.message);
    eq(stored(kv), before, '非法请求不应改动云端数据');
  });

  await test('空 incoming（{}）不清空云端任何集合', async () => {
    const payload = pcPayload();
    const kv = makeKV(payload);
    await api.onRequestPost(ctxPost(kv, {}));
    const after = stored(kv);
    eq(after.history, payload.history, '历史不应被清空');
    eq(after.errors, payload.errors, '错题不应被清空');
    eq(after.mastery, payload.mastery, '掌握度不应被清空');
    eq(after.cfg, payload.cfg, '配置不应被清空');
    eq(after.ledger, payload.ledger, '台账不应被清空');
    eq(after.sheet, payload.sheet, '试卷不应被清空');
    eq(after.profile.totalSheets, payload.profile.totalSheets);
    eq(after.profile.totalQuestions, payload.profile.totalQuestions);
    eq(after.profile.totalCorrect, payload.profile.totalCorrect);
    eq(after.profile.stars, payload.profile.stars);
    eq(after.profile.lastDate, payload.profile.lastDate);
  });

  await test('POST 响应只回传小快照（不含 ledger/sheet）', async () => {
    const kv = makeKV(pcPayload());
    const j = await readJson(await api.onRequestPost(ctxPost(kv, mobileSparsePayload())));
    eq(j.ok, true);
    eq(j.kvBound, true);
    okStr(j.updatedAt);
    okStr(j.message);
    eq(Object.keys(j.data).sort(), ['errors', 'history', 'mastery', 'profile']);
    eq('ledger' in j.data, false, '响应不应回传 ledger');
    eq('sheet' in j.data, false, '响应不应回传 sheet');
  });

  await test('history 上限 150：保留最近 150 条', async () => {
    const many = [];
    for (let i = 1; i <= 200; i++) {
      many.push({
        id: 'rec_' + (1793000000000 + i),
        date: '2026-10-01',
        timeStr: '08:00',
        total: 48,
        correct: 48,
        accuracy: 1,
        stars: 3,
      });
    }
    const merged = api.mergeSyncPayload({ history: many }, { child: 'nini', history: [] });
    eq(merged.history.length, 150, '历史最多 150 条');
    eq(merged.history[0].id, 'rec_1793000000200', '最新一条应在最前');
    eq(merged.history[149].id, 'rec_1793000000051', '应保留最近 150 条');
  });

  await test('errors 上限 300：保留最近 300 条', async () => {
    const many = [];
    for (let i = 1; i <= 350; i++) {
      many.push({
        id: 'err_' + i,
        prompt: i + ' ＋ 1 ＝',
        answer: String(i + 1),
        failCount: 1,
        resolved: false,
        lastFailedAt: new Date(1793000000000 + i * 1000).toISOString(),
      });
    }
    const merged = api.mergeSyncPayload({ errors: many }, { child: 'nini', errors: [] });
    eq(merged.errors.length, 300, '错题最多 300 条');
    eq(merged.errors[0].id, 'err_350', '最新错题应在最前');
  });

  await test('history 无 id 时按 日期|时间|题量|对题|正确率 去重', async () => {
    const a = { date: '2026-11-05', timeStr: '18:06', total: 48, correct: 48, accuracy: 1 };
    const b = { date: '2026-11-05', timeStr: '18:06', total: 48, correct: 48, accuracy: 1, sheetTitle: '重传的' };
    const m1 = api.mergeSyncPayload({ history: [a] }, { history: [b] });
    eq(m1.history.length, 1, '同一记录重复上传应只保留 1 条');
    eq(m1.history[0].sheetTitle, '重传的', '同键以后到的为准');

    const c = { date: '2026-11-05', timeStr: '18:06', total: 48, correct: 47, accuracy: 47 / 48 };
    const m2 = api.mergeSyncPayload({ history: [a] }, { history: [c] });
    eq(m2.history.length, 2, '对题数不同应视为两条记录');
  });

  await test('历史时间排序兼容旧手机端 ISO date 与电脑端 date+timeStr', async () => {
    const oldPhone = { date: '2026-11-04T09:00:00.000Z', total: 48, correct: 48, accuracy: 1, stars: 3 };
    const pcRec = { id: 'rec_1793873217537', date: '2026-11-05', timeStr: '18:06', total: 48, correct: 48, accuracy: 1, stars: 3 };
    const merged = api.mergeSyncPayload({ history: [oldPhone] }, { history: [pcRec] });
    eq(merged.history.length, 2);
    eq(merged.history[0].id, 'rec_1793873217537', '电脑端新记录应排在旧 ISO 记录之前');
  });

  await test('档案合并：累计值取大、stars/totalStars 同值、较晚一侧的姓名优先且空值不覆盖', async () => {
    const m1 = api.mergeSyncPayload(
      { profile: { lastDate: '20261105', streak: 1, name: '妮妮', school: '华五小学', totalSheets: 1, totalQuestions: 48, totalCorrect: 48, stars: 3 } },
      { profile: { lastDate: '20261105', streak: 3, totalSheets: 2, totalQuestions: 96, totalCorrect: 96, stars: 6 } }
    );
    eq(m1.profile.streak, 3, '同日打卡 streak 取大');
    eq(m1.profile.name, '妮妮', '同一侧缺失的姓名应由另一边补全');
    eq(m1.profile.school, '华五小学');
    eq(m1.profile.totalSheets, 2);
    eq(m1.profile.totalQuestions, 96);
    eq(m1.profile.totalCorrect, 96);
    eq(m1.profile.stars, 6);
    eq(m1.profile.totalStars, 6, 'stars 与 totalStars 输出一致');

    const m2 = api.mergeSyncPayload(
      { profile: { lastDate: '20261105', streak: 1, name: '妮妮', school: '华五小学' } },
      { profile: { lastDate: '20261107', streak: 2 } }
    );
    eq(m2.profile.lastDate, '20261107', 'lastDate 取较晚一侧');
    eq(m2.profile.streak, 2, '不同日时用较晚一侧的 streak');
    eq(m2.profile.name, '妮妮', '姓名等资料取较晚一侧，缺失则回退旧侧');
  });

  await test('档案累计值以合并后历史推导值兜底（不会被重置成 0）', async () => {
    const m = api.mergeSyncPayload(
      { profile: { totalSheets: 0, totalQuestions: 0, totalCorrect: 0, stars: 0 } },
      { history: [{ id: 'rec_1793900000000', date: '2026-11-06', timeStr: '09:30', total: 48, correct: 40, accuracy: 40 / 48, stars: 2 }] }
    );
    eq(m.profile.totalSheets, 1, '总卷数应由历史兜底为 1');
    eq(m.profile.totalQuestions, 48);
    eq(m.profile.totalCorrect, 40);
    eq(m.profile.stars, 2);
  });

  await test('掌握度合并：seen/right 取大且 right<=seen，days 按日合并，causes 取大', async () => {
    const m1 = api.mergeSyncPayload(
      { mastery: { t1: { seen: 5, right: 2, acc: 0.4, days: { '20261105': { seen: 5, right: 2 } }, causes: { '计算失误': 2 } } } },
      { mastery: { t1: { seen: 10, right: 20, days: { '20261105': { seen: 6, right: 6 }, '20261106': { seen: 4, right: 4 } }, causes: { '计算失误': 1, '看错符号': 3 } } } }
    );
    eq(m1.mastery.t1.seen, 10);
    eq(m1.mastery.t1.right, 10, 'right 不得超过 seen');
    near(m1.mastery.t1.acc, 1);
    eq(m1.mastery.t1.days['20261105'], { seen: 6, right: 6 }, '同一天取大');
    eq(m1.mastery.t1.days['20261106'], { seen: 4, right: 4 });
    eq(m1.mastery.t1.causes['计算失误'], 2, 'causes 取大避免重复累加');
    eq(m1.mastery.t1.causes['看错符号'], 3);
  });

  await test('cfg：手机有自有键时用手机配置，空对象时保留云端', async () => {
    const m1 = api.mergeSyncPayload({ cfg: { count: 48, targets: ['a'] } }, { cfg: { count: 20 } });
    eq(m1.cfg.count, 20, '有自有键时用 incoming');
    const m2 = api.mergeSyncPayload({ cfg: { count: 48, targets: ['a'] } }, { cfg: {} });
    eq(m2.cfg.count, 48, '空对象时保留云端配置');
    const m3 = api.mergeSyncPayload({ cfg: { count: 48 } }, {});
    eq(m3.cfg.count, 48, '缺字段时保留云端配置');
  });

  await test('ledger：部分台账按 key 取大补全', async () => {
    const m = api.mergeSyncPayload(
      { ledger: { sig: { a: 5 }, days: { '20598': 10 }, fams: { add: 1 } } },
      { ledger: { sig: { a: 3, b: 7 }, days: { '20598': 4, '20599': 8 }, fams: { sub: 2 } } }
    );
    eq(m.ledger.sig, { a: 5, b: 7 }, '同 key 取大、新 key 补入');
    eq(m.ledger.days, { '20598': 10, '20599': 8 });
    eq(m.ledger.fams, { add: 1, sub: 2 });
    eq(m.ledger.fact, {}, '缺失的 map 应初始化为空对象');
  });

  await test('顶层字段：version/child/exportedAt 透传，updatedAt 为当前 ISO 时间', async () => {
    const m1 = api.mergeSyncPayload(
      { version: '1.1.0', exportedAt: '2026-11-01T00:00:00.000Z' },
      { child: 'nini', exportedAt: '2026-11-06T00:00:00.000Z' }
    );
    eq(m1.version, '1.1.0', 'incoming 无 version 时保留 prev');
    eq(m1.child, 'nini');
    eq(m1.exportedAt, '2026-11-06T00:00:00.000Z', 'exportedAt 透传');
    ok(!isNaN(Date.parse(m1.updatedAt)), 'updatedAt 应为合法 ISO 时间');

    const m2 = api.mergeSyncPayload({}, {});
    eq(m2.child, 'nini', 'child 缺省回退 nini');
    eq(m2.version, '1.2.0', 'version 缺省回退 1.2.0');
  });

  await test('端到端：手机提交后云端仍保留 cfg/ledger/sheet，历史与档案已累加', async () => {
    const kv = makeKV(pcPayload());
    await api.onRequestPost(ctxPost(kv, pcPayload()));
    await api.onRequestPost(ctxPost(kv, mobileSparsePayload()));
    const got = await readJson(await api.onRequestGet(ctxGet(kv)));
    eq(got.ok, true);
    eq(got.hasData, true);
    eq(got.data.cfg, pcPayload().cfg, 'GET 回来的配置应完好');
    eq(got.data.ledger, pcPayload().ledger, 'GET 回来的台账应完好');
    eq(got.data.sheet.sheetId, 'sheet_pc');
    eq(got.data.history.length, 2);
    eq(got.data.profile.totalQuestions, 96);
    eq(got.data.profile.totalSheets, 2);
  });

  /* ---------------- 汇总 ---------------- */
  console.log('');
  if (failures.length) {
    console.log('=== 汇总: ' + passed + ' 通过 / ' + failures.length + ' 失败 ===');
    failures.forEach(name => console.log('  失败: ' + name));
    process.exit(1);
  }
  console.log('=== 汇总: ' + passed + ' 通过 / 0 失败 ✅ ===');
})().catch(err => {
  console.error('测试脚本异常退出:', err && err.stack || err);
  process.exit(1);
});
