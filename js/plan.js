// 组卷：知识点选择 + 配比 + 双层去重（题面签名 / 数族签名），输出 A4 题单。
'use strict';

const CFG_KEY = 'ks.cfg.v1', PROF_KEY = 'ks.profile.v1', LEDGER_KEY = 'ks.ledger.v2', HIST_KEY = 'ks.history.v2';
const NINI_PROFILE_KEY = 'ks.nini.profile.v1', NINI_ERRORS_KEY = 'ks.nini.errors.v1', NINI_HISTORY_KEY = 'ks.nini.history.v1';

const DEFAULT_CFG = {
  count: 48,
  childName: '妮妮',
  schoolName: '上海嘉定华五小学（徐行镇）',
  fluOnly: false,     // 只出口算（纯口算日：不出变式和读题）
  skipWord: false,    // 不出「读题解决问题」，份量还给口算/变式
  targets: ['cnm_p010', 'cnm_p011', 'cnm_p012', 'cnm_p013'],
  autoPrereq: true,
  reviewRatio: 0.25,
  level: 2,
  fluencyMix: 0.62,
  thinkMix: 0.25,
  wordMix: 0.13,
  // 运算项数与连加连减精细控制 (满足需求 6)
  terms: {
    allow2: true,      // 2个数常规加减 (a+b / a-b)
    allow3: true,      // 3个数连加连减/混合 (a+b+c / a-b-c / a+b-c)
    allow4: false,     // 4个数进阶挑战
  },
  chainForms: {
    add: true,         // 纯连加 (+++)
    sub: true,         // 纯连减 (---)
    mix: true,         // 加减混合 (+- / -+)
  },
  adaptiveErrors: true, // 启用针对妮妮错因的精准回炉出题 (满足需求 5)
  errorPaperMode: false, // 错题专练提分卷模式
  hardFamilies: ['miss', 'equiv', 'cmp-expr', 'w-ask', 'w-extra', 'w-2step', 'maxfill'],
  cooldownSig: 6,     // 完全相同题面多少天内不再出现
  cooldownFact: 1,    // 同一数族（3+5=8 家族）隔天即可换面孔再出现
  factCap: 3,         // 单张卷里同一数族最多出现几次（跨题型）
  strictDedup: false, // 打开 = 永久不重复（10 以内几天就用尽，见 README）
  // 字号大小（默认 14.5pt 黄金字号，48 题完美容纳在一页 A4 纸内）
  fontPt: 14.5,
  cols: 4,
  skipWord: true,     // 默认 48 题全在第 1 页（天天练口算卷）；如需第 2 页应用题可开启
  gap: 'normal',
  showAnswer: false,  // 默认不出答案，方便孩子打印自练
  showBar: true,
  showWordCard: true,
  showZiCard: false,  // 单页天天练默认不加附录第3页；需要剪卡时可在侧栏勾选开启
  showExample: true,  // 新题型第一次出现时配一道例题（worked example，之后自动撤）
  annotate: 'full',   // 6岁初学期默认全拼音助读，降低解码负荷
  readStep: 2,        // 读题阶梯第几步：1 家长读 2 出声读 3 默读画图 4 独立
  ladderAuto: true,   // 按正确率自动升降阶梯
};

function loadCfg() { return { ...DEFAULT_CFG, ...Store.get(CFG_KEY, {}) }; }
function saveCfg(c) { Store.set(CFG_KEY, c); }

/* ---------- 台账 ---------- */
const DAY_MS = 86400000;
// selftest 用 TEST_DAY 假装时间推进，验证冷却期；浏览器里永远是真实日期
const dayIdx = () => (typeof TEST_DAY === 'number' ? TEST_DAY : Math.floor(Date.now() / DAY_MS));

function loadLedger() {
  const raw = Store.get(LEDGER_KEY, {});
  return {
    sig: raw.sig || {},        // 题面签名 -> 出过的天序号
    fact: raw.fact || {},      // 数族签名 -> 天序号
    text: raw.text || {},      // 应用题句式+名词 -> 天序号
    days: raw.days || {},      // 天序号 -> 当日题数
    fams: raw.fams || {},      // 题型 -> 累计出过的天数（例题淡出用）
  };
}
function saveLedger(L) {
  const cut = dayIdx() - 400;
  const prune = o => { const n = {}; for (const k in o) if (o[k] >= cut) n[k] = o[k]; return n; };
  Store.set(LEDGER_KEY, { sig: prune(L.sig), fact: prune(L.fact), text: prune(L.text), days: prune(L.days), fams: L.fams });
}

function banned(map, key, days, strict) {
  if (!key) return false;
  const t = map[key];
  if (t == null) return false;
  return strict || dayIdx() - t < days;
}

/* 数族签名：把题目里出现的所有数字排序去重，3+5=8 / 8-3=5 / □+5=8 归为一族。
   冷却只设 1 天：10 以内的数族空间只有 70 来组，更长的窗口会让第 2 天起
   整族被禁，严格通道悄悄退化成只剩数族空间大的题型（等式/比大小）。 */
const NUM_RE = /\d+/g;
function factKey(it) {
  const nums = ((it.prompt || '') + ' ' + (it.answer || '') + ' ' + (it.prompt2 || ''))
    .match(NUM_RE);
  if (!nums) return '';
  const cls = ['add', 'sub', 'miss', 'equiv', 'bond'].includes(it.fam) ? 'fact' :
    it.fam === 'chain' ? 'chain' :
      ['cmp-expr', 'maxfill'].includes(it.fam) ? 'rel' :
        it.fam === 'sort' ? 'sort' : it.fam.startsWith('w-') ? 'wp' : 'other';
  return cls + ':' + [...new Set(nums)].sort((a, b) => a - b).join(',');
}
/* 应用题句式签名：去掉数字后的模板 + 主题名词，避免「苹果又拿来3个」天天见 */
function textKey(it) {
  if (!it.tier || it.tier < 1) return '';
  const skeleton = (it.prompt || '').replace(NUM_RE, '#').replace(/[，。？]/g, '');
  const noun = (skeleton.match(/[一-龥]{2,3}(?=有|飞|吃|拿|送)/) || [''])[0];
  return it.fam + '|' + noun + '|' + skeleton.length;
}

/* ---------- 知识点分配（图谱驱动） ---------- */
function nodePool(cfg, prof) {
  const targets = cfg.targets.filter(id => G.byId.get(id));
  if (!targets.length) return [];
  const pool = targets.map(id => ({ id, role: 'main', weight: 3 }));
  if (!cfg.autoPrereq || cfg.reviewRatio <= 0) return pool;

  const seen = new Set(targets);
  const cand = [];
  for (const t of targets) {
    for (const p of G.prereqs(t)) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const spec = specOf(p.id);
      let w = (p.strength === 'hard' ? 1.1 : 0.6) / (p.depth || 1);
      if (!spec.lim && !targets.some(x => x === p.id)) w *= 0.8;
      const m = prof[p.id];
      if (m && m.seen >= 2) w *= 0.5 + 2.5 * (1 - Math.min(1, m.acc)); // 错得多 → 多复习
      cand.push({ id: p.id, role: 'review', weight: w });
    }
  }
  cand.sort((a, b) => b.weight - a.weight);
  const need = Math.max(1, Math.round(cfg.count * cfg.reviewRatio / 3));
  return pool.concat(cand.slice(0, need));
}

function pickNode(pool) {
  let total = 0;
  for (const p of pool) total += Math.max(0.05, p.weight);
  let r = R.f() * total;
  for (const p of pool) { r -= Math.max(0.05, p.weight); if (r <= 0) return p; }
  return pool[pool.length - 1];
}

/* ---------- 卷面结构 ----------
   GB 40070-2021（强制性国标）：一二年级文字 ≥16pt（3号）、行距 ≥5mm、行高 ≥8mm。
   按这个下限算：纯算式 4 列 × 12–16 行 ≈ 48 题能放进一页 A4；
   但带文字的应用题每题要占一整行 ≈25–30mm，一页最多 4–6 题，其余必须排到第 2 页。
   所以：第 1 页 = 口算 + 变式（交叉排列）；第 2 页 = 读题区。 */
const PAGE1_TEXT_CAP = 5;

function sections(cfg) {
  const fluOnly = !!cfg.fluOnly, noWord = fluOnly || !!cfg.skipWord;
  let f, t, w = 0;
  if (fluOnly) { f = cfg.count; t = 0; }
  else if (noWord) {
    // 去掉读题区后，份量按原比例还给口算/变式
    const s = (cfg.fluencyMix + cfg.thinkMix) || 1;
    f = Math.round(cfg.count * cfg.fluencyMix / s); t = cfg.count - f;
  } else {
    f = Math.round(cfg.count * cfg.fluencyMix);
    t = Math.round(cfg.count * cfg.thinkMix);
    w = Math.max(0, cfg.count - f - t);
  }
  const out = [];
  if (f > 0) out.push({ key: 'fluency', page: 1, title: '一、口算（直接写得数）', want: f, fams: ['add', 'sub', 'chain', 'bond'] });
  if (t > 0) out.push({ key: 'think', page: 1, title: '二、变式（★ 要动脑筋）', want: t, fams: ['miss', 'equiv', 'cmp-expr', 'maxfill', 'sort', 'between'] });
  if (w > 0 && !noWord && cfg.wordMix > 0) out.push({ key: 'word', page: 2, title: '三、读题解决问题', want: w, fams: ['w-join', 'w-take', 'w-diff', 'w-extra', 'w-2step', 'w-ask', 'w-same', 'w-tell'] });
  return out;
}

function makeOne(famId, sp, cfg, L, used, relax) {
  const fam = FAM_BY_ID[famId];
  if (!fam) return null;
  const errs = [];
  for (let tries = 0; tries < 18; tries++) {
    let it = null;
    try { it = fam.make(sp, cfg.level, cfg); } catch (e) { errs.push(famId + ': ' + e.message); break; }
    if (!it) continue;
    it.topicId = sp.id; it.fam = fam.id; it.famLabel = fam.label;
    it.tier = fam.tier; it.think = fam.think;
    it.sig = fam.id + ':' + it.sig;
    const fk = factKey(it), tk = textKey(it);
    it.factKey = fk; it.textKey = tk;
    // 卷内规则：同族同数绝不撞；跨族同数族最多复用 factCap 次
    if (used.sig.has(it.sig)) continue;
    if (used.famFact[famId] && used.famFact[famId].has(fk)) continue;
    if ((used.factCount[fk] || 0) >= (cfg.factCap || 3)) continue;
    // 跨天规则：题面签名、数族签名各自冷却（relax = 回炉题，允许破冷却）
    if (!relax) {
      if (banned(L.sig, it.sig, cfg.cooldownSig, cfg.strictDedup)) continue;
      if (banned(L.fact, fk, cfg.cooldownFact, cfg.strictDedup)) continue;
      if (tk && banned(L.text, tk, Math.min(cfg.cooldownSig, 5), false)) continue;
    }
    used.sig.add(it.sig);
    (used.famFact[famId] || (used.famFact[famId] = new Set())).add(fk);
    used.factCount[fk] = (used.factCount[fk] || 0) + 1;
    used.byFam[famId] = (used.byFam[famId] || 0) + 1;
    it.refresher = !!relax;
    return it;
  }
  if (errs.length) (makeOne.errors || (makeOne.errors = [])).push(...errs);
  return null;
}

function buildSheet(cfg, L) {
  const prof = Store.get(PROF_KEY, {});
  const pool = nodePool(cfg, prof);
  const secs = sections(cfg);
  const used = { sig: new Set(), famFact: {}, factCount: {}, byFam: {} };
  const picked = [];

  // 妮妮精准出题机制：优先提取未消灭的错题数族进行定向强化回炉
  if (cfg.adaptiveErrors !== false && !cfg.errorPaperMode) {
    try {
      const activeErrors = getNiniErrors().filter(e => !e.resolved);
      if (activeErrors.length > 0) {
        const targetErrs = R.shuffle(activeErrors).slice(0, Math.min(4, Math.floor(cfg.count * 0.15)));
        for (const err of targetErrs) {
          const sp = { ...specOf(err.topicId || cfg.targets[0]), id: err.topicId || cfg.targets[0] };
          const candidateFams = ['miss', 'chain', 'sub', 'add', 'equiv'].filter(f => familiesFor(sp, cfg).includes(f));
          if (candidateFams.length) {
            const famId = R.pick(candidateFams);
            const it = makeOne(famId, sp, cfg, L, used, true);
            if (it) {
              it.sec = (it.fam === 'miss' || it.fam === 'equiv') ? 'think' : 'fluency';
              it.secTitle = it.sec === 'think' ? '二、变式（★ 要动脑筋）' : '一、口算（直接写得数）';
              it.reinforce = true;
              it.reinforceCause = err.cause || '易错强化';
              picked.push(it);
            }
          }
        }
      }
    } catch (e) {}
  }

  for (const sec of secs) {
    const cap = Math.max(2, Math.ceil(sec.want * (sec.key === 'fluency' ? 0.40 : 0.60)));
    const have = () => picked.filter(i => i.sec === sec.key).length;
    const attempt = relax => {
      let stall = 0;
      while (have() < sec.want && stall < 90) {
        const node = pickNode(pool);
        if (!node) break;
        const sp = { ...specOf(node.id), id: node.id };
        const allowed = sec.fams.filter(f =>
          familiesFor(sp, cfg).includes(f) && (used.byFam[f] || 0) < cap);
        if (!allowed.length) { stall++; continue; }
        const hard = allowed.filter(f => cfg.hardFamilies.includes(f));
        // hard 题份量加倍但不绝对优先：绝对优先会让排序/区间这类非 hard 族永远轮不到
        const order = R.shuffle(cfg.level >= 2 ? allowed.concat(hard) : allowed);
        let it = null;
        for (const f of order) { it = makeOne(f, sp, cfg, L, used, relax); if (it) break; }
        if (!it) { stall++; continue; }
        stall = 0;
        it.sec = sec.key; it.secTitle = sec.title; it.review = node.role === 'review';
        picked.push(it);
      }
    };
    attempt(false);
    attempt(true); // 数空间用完时宁可回炉旧题，也不交一张缺题的卷子
  }

  const lay = layout(picked);
  const items = lay.all;
  const famToday = new Set();
  items.forEach((it, i) => {
    it.no = i + 1;
    it.example = cfg.showExample ? exampleFor(it.fam, L) : false;
    L.sig[it.sig] = dayIdx();
    if (it.factKey) L.fact[it.factKey] = dayIdx();
    if (it.textKey) L.text[it.textKey] = dayIdx();
    famToday.add(it.fam);
  });
  famToday.forEach(f => { L.fams[f] = (L.fams[f] || 0) + 1; });
  L.days[dayIdx()] = (L.days[dayIdx()] || 0) + items.length;
  return { items, flu: lay.flu, think: lay.think, word: lay.word, secs, pool };
}

/* 排版：口算区内部交叉排列（同一题型不连续超过 2 次，相邻题不共享数族）——
   交叉练习在同一天就提升 25%、一个月后提升 76%（Rohrer, Dedrick & Stershic 2015；
   Taylor & Rohrer 2010）。变式区按格宽装配行，读题区隔开同类句式。
   all 顺序 = 卷面显示顺序，题号按它编，保证 1..N 连续。 */
function layout(items) {
  const bySec = {};
  items.forEach(i => (bySec[i.sec] || (bySec[i.sec] = [])).push(i));
  const flu = interleaveMixed(bySec.fluency || []);
  const think = packThink(bySec.think || []);
  const word = spread(bySec.word || []);
  return { flu, think, word, all: flu.concat(think, word) };
}

/* 变式区行装配：整行题（排序/区间/最大能填）独占一行，宽题（比大小）占两格，
   其余占一格；贪心凑满 4 列，避免网格空洞和长题溢出。 */
function packThink(arr) {
  const spanOf = i => (i.full ? 4 : i.wide ? 2 : 1);
  const pool = arr.slice();
  const out = [];
  while (pool.length) {
    let w = 0;
    while (w < 4 && pool.length) {
      const need = 4 - w;
      // 先取恰好填满的，再取窄题，最后才放宽题——避免行尾空洞
      let idx = pool.findIndex(i => spanOf(i) === need);
      if (idx === -1 && need > 1) idx = pool.findIndex(i => spanOf(i) === 1);
      if (idx === -1) idx = pool.findIndex(i => spanOf(i) <= need);
      if (idx === -1) break;
      const it = pool.splice(idx, 1)[0];
      out.push(it); w += spanOf(it);
    }
  }
  return out;
}

/* 交叉排列：同一题型不连续出现超过 2 次，且相邻题不共享同一个数族 */
function interleaveMixed(arr) {
  const buckets = {};
  arr.forEach(i => (buckets[i.fam] || (buckets[i.fam] = [])).push(i));
  const out = [];
  let guard = 0;
  while (Object.values(buckets).some(b => b.length) && guard++ < 2000) {
    const keys = Object.keys(buckets).filter(k => buckets[k].length);
    // 优先选跟上一题不同族、且数族不重叠的
    keys.sort((a, b) => {
      const sa = (a === (out[out.length - 1] || {}).fam) ? -1 : 0;
      const sb = (b === (out[out.length - 1] || {}).fam) ? -1 : 0;
      const ca = buckets[a].length, cb = buckets[b].length;
      const la = out.slice(-3).some(x => x.factKey === buckets[a][0].factKey) ? -1 : 0;
      const lb = out.slice(-3).some(x => x.factKey === buckets[b][0].factKey) ? -1 : 0;
      return (sb + lb) - (sa + la) || cb - ca;
    });
    out.push(buckets[keys[0]].shift());
  }
  return out;
}
function spread(arr) {
  const buckets = {};
  arr.forEach(i => (buckets[i.fam] || (buckets[i.fam] = [])).push(i));
  const keys = Object.keys(buckets).sort((a, b) => buckets[b].length - buckets[a].length);
  const out = [];
  let guard = 0;
  while (keys.some(k => buckets[k].length) && guard++ < 900) {
    for (const k of keys) if (buckets[k].length) out.push(buckets[k].shift());
  }
  return out;
}

/* ---------- 掌握度：家长批改后写，按天存（进阶判断要看「连续 3 个不同天」） ---------- */
function recordResult(topicId, ok, cause) {
  const prof = Store.get(PROF_KEY, {});
  const m = prof[topicId] || { seen: 0, right: 0, days: {} , causes: {} };
  m.seen++; if (ok) m.right++;
  m.acc = m.right / m.seen;
  m.last = Date.now();
  const dk = todayKey();
  m.days[dk] = m.days[dk] || { seen: 0, right: 0 };
  m.days[dk].seen++; if (ok) m.days[dk].right++;
  if (!ok && cause) m.causes[cause] = (m.causes[cause] || 0) + 1;
  prof[topicId] = m;
  Store.set(PROF_KEY, prof);
  return prof;
}

/* 进阶门槛：≥3 个不同日期、每天 ≥8 题、每天正确率 ≥90%，且变式题（缺项/平衡）也算 */
function isMastered(m) {
  if (!m || !m.days) return false;
  const ds = Object.values(m.days).filter(d => d.seen >= 8);
  if (ds.length < 3) return false;
  return ds.every(d => d.right / d.seen >= 0.9);
}

/* 例题淡出：某题型累计出现次数 < 3 天时配一道例题，之后自动撤（worked-example fading） */
function exampleFor(famId, L) {
  const seen = (L.fams && L.fams[famId]) || 0;
  return seen < 3;
}

/* ---------- 读题词卡：只解释「这句话什么意思」，不做「关键词→算法」映射 ----------
   文献反对 keyword→operation 教学（「一共就加、还剩就减」）：它教出「无意义解题」
   和「拿最后一个数乱算」（Verschaffel et al. 2000/2020；2024 EPR 任务特征综述）。
   要教的是场景结构：变多还是变少、部分与整体，再用方块图表征。 */
const WORD_CARD = [
  ['一共', '说的是合起来有多少'],
  ['还剩', '说的是不在堆里的那些还有多少'],
  ['又／再', '故事里第二次发生的事'],
  ['原来', '故事最开始的时候有多少'],
  ['现在', '事情都发生完以后有多少'],
  ['比…多几', '两个比，多出来的那一段'],
  ['比…少几', '两个比，差掉的那一段'],
  ['同样多', '两边一样，不多也不少'],
  ['其中', '只说这一类，别的不算'],
  ['送出去／飞走了', '这部分跑掉了，不在这堆里'],
];

/* 读题四步阶梯（搭脚手架再逐日撤：Rosenshine 2012 原则 8） */
const READ_LADDER = [
  ['1', '家长读题，孩子手指着字听'],
  ['2', '孩子出声读，家长陪'],
  ['3', '孩子默读，自己画方块图'],
  ['4', '独立完成'],
];
/* 错题按原因记，不记分数 headline（Hattie & Timperley 2007；Butler & Nisan 1986） */
const ERR_CAUSES = ['看错符号', '抄错数', '这组数还不熟', '没读完题', '不懂这个词', '听大人读就会做'];

/* 图谱给的进阶建议：主节点达到「3 个不同天、每天≥8题、每天≥90%」才往前推一格 */
function nextStep(cfg) {
  const prof = Store.get(PROF_KEY, {});
  const done = cfg.targets.filter(id => isMastered(prof[id]));
  if (!done.length) return null;
  const nxt = [];
  for (const d of done) {
    for (const s of G.successors(d, 1)) {
      if (!cfg.targets.includes(s.id) && !nxt.some(x => x.id === s.id)) {
        nxt.push({ id: s.id, name: G.name(s.id), place: G.place(s.id) });
      }
    }
  }
  return nxt.length ? { done: done.map(id => G.name(id)), next: nxt } : null;
}

/* 卡住时的回溯建议：把错题沿先修边往回找根因 */
function backtrack(topicId) {
  const chain = G.prereqs(topicId, 3);
  return [{ id: topicId, name: G.name(topicId) }]
    .concat(chain.map(c => ({ id: c.id, name: G.name(c.id), strength: c.strength })));
}

/* ---------- 妮妮专属档案与错题本管理系统 (满足需求 5) ---------- */
function getNiniProfile() {
  const def = {
    name: '妮妮',
    age: 6,
    school: '上海嘉定华五小学（徐行镇）',
    grade: '一年级',
    term: '上册',
    avatar: '👧',
    streak: 0,
    lastDate: '',
    totalSheets: 0,
    totalQuestions: 0,
    totalCorrect: 0,
    stars: 0,
    createdAt: '2026-11-03',
  };
  return { ...def, ...Store.get(NINI_PROFILE_KEY, {}) };
}

function saveNiniProfile(p) {
  Store.set(NINI_PROFILE_KEY, p);
  if (typeof Cloud !== 'undefined' && Cloud.status === 'connected') {
    Cloud.syncToCloud();
  }
}

function getNiniErrors() {
  return Store.get(NINI_ERRORS_KEY, []);
}

function saveNiniErrors(errs) {
  Store.set(NINI_ERRORS_KEY, errs);
  if (typeof Cloud !== 'undefined' && Cloud.status === 'connected') {
    Cloud.syncToCloud();
  }
}

// 记录错题（自动合并同类题面并记录错因）
function recordNiniError(item, cause) {
  const errors = getNiniErrors();
  const existing = errors.find(e => e.sig === item.sig && !e.resolved);
  if (existing) {
    existing.failCount = (existing.failCount || 1) + 1;
    existing.lastFailedAt = new Date().toISOString();
    existing.cause = cause || existing.cause;
  } else {
    errors.unshift({
      id: 'err_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: new Date().toISOString().slice(0, 10),
      createdTime: new Date().toISOString(),
      prompt: item.prompt,
      answer: item.answer,
      topicId: item.topicId,
      fam: item.fam,
      factKey: item.factKey,
      sig: item.sig,
      cause: cause || '计算失误',
      failCount: 1,
      resolved: false,
    });
  }
  saveNiniErrors(errors);
}

// 错题消灭（答对后标记为已解决）
function resolveNiniError(errorId) {
  const errors = getNiniErrors();
  const item = errors.find(e => e.id === errorId);
  if (item) {
    item.resolved = true;
    item.resolvedAt = new Date().toISOString();
    saveNiniErrors(errors);
  }
}

function getNiniHistory() {
  return Store.get(NINI_HISTORY_KEY, []);
}

function saveNiniHistory(h) {
  Store.set(NINI_HISTORY_KEY, h);
  if (typeof Cloud !== 'undefined' && Cloud.status === 'connected') {
    Cloud.syncToCloud();
  }
}

// 提交今日练习成绩与批改反馈
function recordPracticeSession(summary) {
  const prof = getNiniProfile();
  const today = todayKey();
  const last = prof.lastDate;

  if (!last) {
    prof.streak = 1;
  } else {
    const lastDay = parseInt(last, 10);
    const currDay = parseInt(today, 10);
    if (currDay - lastDay === 1) {
      prof.streak = (prof.streak || 0) + 1;
    } else if (currDay === lastDay) {
      // 当天重复打卡保持天数
    } else {
      prof.streak = 1;
    }
  }
  prof.lastDate = today;
  prof.totalSheets = (prof.totalSheets || 0) + 1;
  prof.totalQuestions = (prof.totalQuestions || 0) + summary.total;
  prof.totalCorrect = (prof.totalCorrect || 0) + summary.correct;

  let earnedStars = 1;
  if (summary.accuracy >= 1.0) earnedStars = 3;
  else if (summary.accuracy >= 0.9) earnedStars = 2;
  prof.stars = (prof.stars || 0) + earnedStars;

  saveNiniProfile(prof);

  const history = getNiniHistory();
  history.unshift({
    id: 'rec_' + Date.now(),
    date: new Date().toISOString().slice(0, 10),
    timeStr: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    total: summary.total,
    correct: summary.correct,
    wrong: summary.wrong,
    accuracy: summary.accuracy,
    durationMinutes: summary.durationMinutes || 0,
    stars: earnedStars,
    targets: summary.targets || [],
  });
  saveNiniHistory(history.slice(0, 150));

  return { prof, earnedStars };
}

// 针对妮妮的错题本生成专属巩固卷
function buildErrorSheet(cfg, L) {
  const errors = getNiniErrors().filter(e => !e.resolved);
  if (!errors.length) return null;

  const used = { sig: new Set(), famFact: {}, factCount: {}, byFam: {} };
  const picked = [];

  for (const err of errors) {
    if (picked.length >= cfg.count) break;
    const sp = { ...specOf(err.topicId || 'cnm_p010'), id: err.topicId || 'cnm_p010' };
    const it = makeOne(err.fam || 'add', sp, cfg, L, used, true);
    if (it) {
      it.sec = (it.fam === 'miss' || it.fam === 'equiv') ? 'think' : 'fluency';
      it.secTitle = it.sec === 'think' ? '二、变式（★ 要动脑筋）' : '一、口算（直接写得数）';
      it.reinforce = true;
      it.reinforceCause = err.cause;
      picked.push(it);
    }
  }

  if (picked.length < cfg.count) {
    const regular = buildSheet(cfg, L);
    for (const item of regular.items) {
      if (picked.length >= cfg.count) break;
      picked.push(item);
    }
  }

  const lay = layout(picked.slice(0, cfg.count));
  const items = lay.all;
  items.forEach((it, i) => { it.no = i + 1; });
  return { items, flu: lay.flu, think: lay.think, word: lay.word, secs: sections(cfg), pool: [] };
}
