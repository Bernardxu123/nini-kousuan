// 冒烟测试：node tools/selftest.js [天数]
// 检查：题量是否满、题面/数族去重、答案正确性、题型多样性、跨天冷却是否生效。
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

const DAYS = Number(process.argv[2] || 20);
const store = {};
const ctx = {
  console,
  localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
  Date, JSON, Math, Object, Set, Map, Array, String, Number,
  TEST_DAY: 0,
};
ctx.window = ctx; ctx.global = ctx;
vm.createContext(ctx);
for (const f of ['graph.data.js', 'core.js', 'items.js', 'plan.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'), ctx, { filename: f });
}
const A = vm.runInContext('({G,R,buildSheet,loadLedger,saveLedger,loadCfg,DEFAULT_CFG,specOf,familiesFor,FAM_BY_ID,hashStr,recordResult,nextStep,nodePool,factKey,setTestDay:v=>{ctx.TEST_DAY=v},api:1})', ctx);
const setDay = v => { ctx.TEST_DAY = v; };
A.G.init();

function check(it) {
  const p = it.prompt || '', a = String(it.answer);
  const ev = s => {
    const n = (s.match(/\d+/g) || []).map(Number), o = s.match(/[－＋]/g) || [];
    let v = n[0];
    for (let i = 0; i < o.length; i++) v = o[i] === '＋' ? v + n[i + 1] : v - n[i + 1];
    return v;
  };
  if (['add', 'sub', 'chain'].includes(it.fam)) {
    const lhs = p.replace('＝', '').replace('＝□', '');
    if (String(ev(lhs)) !== a) return `calc: ${p} => ${a} but ${ev(lhs)}`;
    const nums = (p.match(/\d+/g) || []).map(Number);
    if (nums.some(n => n < 0) || Number(a) < 0) return 'negative';
  }
  if (it.fam === 'miss' || it.fam === 'equiv') {
    const filled = (it.prompt2 || p).replace('□', a);
    const [L, Rr] = filled.split('＝');
    if (/\d/.test(L) && /\d/.test(Rr) && ev(L) !== ev(Rr)) return `balance: ${p} □=${a}`;
  }
  if (it.fam === 'bond' && it.bond) {
    const b = it.bond;
    if (b.a + b.b !== b.n) return `bond ${b.a}+${b.b}!=${b.n}`;
    const got = Number(a);
    if (b.ask === 'b' && got !== b.b) return 'bond ans b';
    if (b.ask === 'n' && got !== b.n) return 'bond ans n';
  }
  if (it.fam === 'cmp-expr') {
    const L = ev(p.split('○')[0]), Rr = ev(p.split('○')[1]);
    const want = L > Rr ? '＞' : L < Rr ? '＜' : '＝';
    if (want !== a) return `cmp want ${want} got ${a}`;
    // 退化题：两边算式完全相同
    if (p.split('○')[0].trim() === p.split('○')[1].trim()) return 'cmp degenerate same sides';
  }
  if (it.fam === 'equiv') {
    // 「4＋5＝□＋5」这类另一边照抄的题没有思维量
    const nums = (p.match(/\d+/g) || []).map(Number);
    const sides = p.split('＝');
    const ln = (sides[0].match(/\d+/g) || []).map(Number).sort((x, y) => x - y).join(',');
    const rn = (sides[1].match(/\d+/g) || []).map(Number).sort((x, y) => x - y).join(',');
    if (ln === rn) return 'equiv same operands both sides: ' + p;
    if (nums.filter(n => n === Number(a)).length > 1) return 'equiv answer visible: ' + p;
  }
  if (it.fam === 'maxfill') {
    const m = (it.prompt2 || p).match(/(\d+)\s*＜\s*(\d+)/);
    const s = Number(m[1]), lim = Number(m[2]);
    if (!(Number(a) + s < lim)) return `maxfill fail: ${a}+${s} not <${lim}`;
    if (Number(a) + 1 + s < lim) return `maxfill not maximal: ${a}+1+${s} < ${lim}`;
  }
  if (it.fam === 'between') {
    const lo = Number(p.match(/比 (\d+)/)[1]), hi = Number(p.match(/比 (\d+) 小/)[1]);
    const want = []; for (let n = lo + 1; n < hi; n++) want.push(n);
    if (a !== want.join('、')) return `between want ${want} got ${a}`;
  }
  if (it.fam === 'sort') {
    const list = (p.match(/把 ([\d、]+) 按/) || [])[1].split('、').map(Number);
    const asc = /从小到大/.test(p);
    const want = list.slice().sort((x, y) => asc ? x - y : y - x).join('、');
    if (a !== want) return `sort want "${want}" got "${a}"`;
  }
  if (it.fam === 'w-diff' || it.fam === 'w-extra' || it.fam === 'w-join' || it.fam === 'w-take' || it.fam === 'w-2step') {
    const nums = (p.match(/\d+/g) || []).map(Number);
    if (nums.some(n => n > 100) || Number(a) < 0) return 'wp range ' + p;
  }
  return '';
}

let fails = 0, dupSheet = 0, shortSheets = [], famSeen = {}, secTotals = {}, topicSeen = {};
let factReuseWithin = 0, sigReuseWithin = 0;
const cfg = { ...A.DEFAULT_CFG };
const L = A.loadLedger();

for (let d = 0; d < DAYS; d++) {
  setDay(1000 + d);
  A.R.seed(A.hashStr('sheet-' + d));
  const sh = A.buildSheet(cfg, L);
  if (sh.items.length !== cfg.count) shortSheets.push(`d${d}:${sh.items.length}`);
  const seenSig = new Set(), seenFact = new Set();
  sh.items.forEach(it => {
    if (seenSig.has(it.sig)) dupSheet++;
    seenSig.add(it.sig);
    if (seenFact.has(it.factKey)) factReuseWithin++;
    seenFact.add(it.factKey);
    famSeen[it.fam] = (famSeen[it.fam] || 0) + 1;
    secTotals[it.sec] = (secTotals[it.sec] || 0) + 1;
    topicSeen[it.topicId] = (topicSeen[it.topicId] || 0) + 1;
    const e = check(it);
    if (e) { fails++; if (fails <= 15) console.log(`  ERR d${d} [${it.fam}] ${it.prompt} => ${it.answer} :: ${e}`); }
    if (!it.answer && it.answer !== '0') console.log('  EMPTY', it.fam, it.prompt);
  });
  if (d === 0) {
    const sec = {}; sh.items.forEach(i => sec[i.sec] = (sec[i.sec] || 0) + 1);
    console.log('day0 sections:', JSON.stringify(sec));
    console.log('day0 families :', JSON.stringify(Object.fromEntries(Object.entries(famSeen))));
    console.log('day0 sample   :', sh.items.slice(0, 6).map(i => `${i.fam}:${i.prompt}=>${i.answer}`).join(' | '));
  }
}

// 跨天重复：把台账里同 sig 出现多次视为冷却失效（buildSheet 覆盖写，所以直接看 sig 总数 vs 唯一数）
const totalWrites = Object.keys(L.sig).length;
console.log('\n=== RESULT (' + DAYS + ' days, count=' + cfg.count + ') ===');
console.log('answer errors     :', fails);
console.log('within-sheet dup  : sig', dupSheet, '| fact', factReuseWithin);
console.log('short sheets      :', shortSheets.length ? shortSheets.join(' ') : 'none');
console.log('sections          :', JSON.stringify(secTotals));
console.log('families used     :', Object.keys(famSeen).length, JSON.stringify(famSeen));
console.log('topics touched    :', Object.keys(topicSeen).length, Object.keys(topicSeen).map(t => t + ':' + topicSeen[t]).join(' '));
console.log('unique sigs in ledger:', totalWrites, '/', DAYS * cfg.count);

// 严格永久去重模式能撑几天
const L2 = A.loadLedger();
const cfgStrict = { ...A.DEFAULT_CFG, strictDedup: true, cooldownSig: 9999, cooldownFact: 9999 };
let dayStrict = 0, shortDayStrict = null;
for (let d = 0; d < 60; d++) {
  setDay(2000 + d); A.R.seed(A.hashStr('strict' + d));
  const sh = A.buildSheet(cfgStrict, L2);
  if (sh.items.length < cfgStrict.count && !shortDayStrict) shortDayStrict = { day: d, got: sh.items.length };
  dayStrict = d;
}
console.log('strict dedup      : 第一次不满卷在第', shortDayStrict ? shortDayStrict.day + ' 天（' + shortDayStrict.got + '/' + cfgStrict.count + '）' : '60 天内未出现');

// 进阶建议
setDay(3000);
const prof = {};
for (const t of cfg.targets) { for (let i = 0; i < 14; i++) ctx.eval ? 0 : 0; }
const rec = vm.runInContext('recordResult', ctx);
cfg.targets.forEach(t => { for (let i = 0; i < 15; i++) rec(t, true); });
const ns = vm.runInContext('nextStep', ctx)(cfg);
console.log('nextStep          :', ns ? `已达标 ${ns.done.join(',')} → 建议 ${ns.next.map(n => n.name).join(',')}` : 'none');
