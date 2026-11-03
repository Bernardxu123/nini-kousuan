// 基础工具 + 知识图谱查询。图谱数据来自 cn-math-taxonomy（CC BY-NC 4.0，个人学习用途）。
'use strict';

/* ---------- 随机数：可复现，一天一个种子 ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const R = {
  rnd: null,
  seed(n) { R.rnd = mulberry32(n); },
  f() { return R.rnd(); },
  int(lo, hi) { return lo + Math.floor(R.rnd() * (hi - lo + 1)); },
  pick(arr) { return arr[Math.floor(R.rnd() * arr.length)]; },
  chance(p) { return R.rnd() < p; },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R.rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  },
};

/* ---------- 图谱 ---------- */
const G = {
  topics: [], byId: new Map(), parents: new Map(), children: new Map(),

  init() {
    G.topics = KG.topics;
    G.byId = new Map(KG.topics.map(t => [t.id, t]));
    G.parents = new Map(); G.children = new Map();
    for (const d of KG.deps) {
      if (!G.parents.has(d.from)) G.parents.set(d.from, []);
      G.parents.get(d.from).push({ id: d.to, strength: d.s });
      if (!G.children.has(d.to)) G.children.set(d.to, []);
      G.children.get(d.to).push({ id: d.from, strength: d.s });
    }
  },

  name(id) { const t = G.byId.get(id); return t ? t.name : id; },

  // 某节点的先修闭包（往回溯）
  prereqs(id, maxDepth = 9, seen = new Set()) {
    const out = [];
    const walk = (cur, depth) => {
      if (depth > maxDepth) return;
      for (const e of (G.parents.get(cur) || [])) {
        if (seen.has(e.id)) continue;
        seen.add(e.id); out.push({ ...e, depth }); walk(e.id, depth + 1);
      }
    };
    walk(id, 1);
    return out;
  },

  // 后代（往前学什么）
  successors(id, maxDepth = 3) {
    const out = [], seen = new Set([id]);
    const walk = (cur, depth) => {
      if (depth > maxDepth) return;
      for (const e of (G.children.get(cur) || [])) {
        if (seen.has(e.id)) continue;
        seen.add(e.id); out.push({ ...e, depth }); walk(e.id, depth + 1);
      }
    };
    walk(id, 1);
    return out;
  },

  // 获取规范化单元编号与教学阶段，严格对应课本教学进度（先一年级上，再一年级下）
  parseUnit(t) {
    if (!t) return 999;
    // 特殊回填与修正在人教/沪教跨版本时保持认知进阶
    if (t.id === 'cnm_p253') return 4; // 用加减法解决问题 -> 10以内加减法单元
    if (t.id === 'cnm_p251' || t.id === 'cnm_p252') return 6; // 20以内进位加法单元
    if (t.id === 'cnm_p256') return 1; // 20以内退位减法应用
    if (t.id === 'cnm_p257' || t.id === 'cnm_p258') return 2; // 100以内的数
    if (t.id === 'cnm_p259') return 4; // 100以内口算加减
    if (t.id === 'cnm_p217') return 4; // 差量问题在一年级下
    if (t.id === 'cnm_p032' || t.id === 'cnm_p034') return 5; // 减法放在加法后

    const str = (t.huj && t.huj.unit) || t.chapter || '';
    const m = str.match(/第(\d+)单元/);
    if (m) return parseInt(m[1], 10);
    const cn = {'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10};
    const m2 = str.match(/第([一二三四五六七八九十]+)单元/);
    if (m2) return cn[m2[1]] || 999;
    return 999;
  },

  sortKey(id) {
    const t = G.byId.get(id);
    if (!t) return 9999999;
    const g = Number(t.grade || 1);
    const term = t.term === '下' ? 2 : 1;
    const u = G.parseUnit(t);
    // 优先级：年级 (100000) -> 学期 (10000) -> 单元 (100) -> 节点内部顺序
    return g * 100000 + term * 10000 + u * 100;
  },

  // 按课本真实进度严格排序（一年级上 -> 一年级下 -> 二年级上 -> 二年级下）
  order(a, b) {
    const ka = G.sortKey(a), kb = G.sortKey(b);
    if (ka !== kb) return ka - kb;
    return String(a).localeCompare(String(b), 'en', { numeric: true });
  },

  // 获得友好的阶段学期名
  termName(t) {
    if (!t) return '';
    return `${t.grade}年级${t.term}册`;
  },

  bankOf(id) { return KG.bank.filter(q => q.t === id); },

  // 教学落点：沪教版单元名，没有就回落到人教版章名
  place(id) {
    const t = G.byId.get(id); if (!t) return '';
    if (t.huj) return `${t.grade}年级${t.term} ${t.huj.unit}${t.huj.chapter ? ' / ' + t.huj.chapter : ''}`;
    return t.chapter || '';
  },
};

const Store = {
  get(k, def) { try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const CFG_KEY = 'ks.cfg.v1', PROF_KEY = 'ks.profile.v1', LEDGER_KEY = 'ks.ledger.v2', HIST_KEY = 'ks.history.v2';
const NINI_PROFILE_KEY = 'ks.nini.profile.v1', NINI_ERRORS_KEY = 'ks.nini.errors.v1', NINI_HISTORY_KEY = 'ks.nini.history.v1';
const CURRENT_SHEET_KEY = 'ks.current.sheet.v1';

const todayKey = (d = new Date()) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
