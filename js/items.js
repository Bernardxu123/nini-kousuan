// 出题引擎：知识图谱节点 → 参数化题型族。答案由构造算式时算出，不写死。
'use strict';

/* 每个图谱节点的数值口径。lim = 参与数和结果的上限。
   这张表只负责「怎么出数」，「出什么知识点」由图谱决定。 */
const SPEC = {
  cnm_p004: { lim: 5, bond: 1 }, cnm_p006: { lim: 5 }, cnm_p007: { lim: 5 },
  cnm_p009: { lim: 10, cmp: 1 }, cnm_p010: { lim: 10 }, cnm_p011: { lim: 10 },
  cnm_p012: { lim: 10, chain: 1 }, cnm_p013: { lim: 10, chain: 1 },
  cnm_p008: { lim: 10, bond: 1 }, cnm_p001: { lim: 5 }, cnm_p002: { lim: 5, cmp: 1 },
  cnm_p018: { lim: 20, noCarry: 1 }, cnm_p019: { lim: 20, carry: 1 }, cnm_p020: { lim: 20, carry: 1, nineFirst: 1 },
  cnm_p021: { lim: 20, carry: 1 }, cnm_p251: { lim: 20, carry: 1 },
  cnm_p025: { lim: 20, borrow: 1, minus9: 1 }, cnm_p026: { lim: 20, borrow: 1 }, cnm_p027: { lim: 20, borrow: 1 },
  cnm_p030: { lim: 100, tens: 1 }, cnm_p031: { lim: 100, addOnly: 1 }, cnm_p032: { lim: 100, subOnly: 1 },
  cnm_p033: { lim: 100, addOnly: 1 }, cnm_p034: { lim: 100, subOnly: 1 },
  cnm_p035: { lim: 100, word: 1 }, cnm_p217: { lim: 100, word: 1, diff: 1 },
  cnm_p218: { lim: 100, word: 1 }, cnm_p253: { lim: 20, word: 1 }, cnm_p256: { lim: 20, word: 1, extra: 1 },
  cnm_p252: { lim: 20, carry: 1, word: 1 }, cnm_p259: { lim: 100, chain: 1, word: 1 },
};
const DEFAULT_SPEC = { lim: 10 };

function specOf(id) { return SPEC[id] || DEFAULT_SPEC; }

/* ---------- 名词与量词（沿用题库里的高频词，便于形成「常规词汇」） ---------- */
const NOUNS = [
  ['铅笔', '支'], ['苹果', '个'], ['糖果', '颗'], ['气球', '个'], ['皮球', '个'],
  ['小红花', '朵'], ['鸭子', '只'], ['小鸟', '只'], ['蝴蝶', '只'], ['饼干', '块'],
  ['书', '本'], ['汽车', '辆'], ['珠子', '颗'], ['桃', '个'], ['草莓', '颗'], ['卡片', '张'],
];
const PEOPLE = ['同学', '小朋友', '男生', '女生'];

/* ---------- 题型族 ----------
   tier  = 阅读负荷 0 纯算式 / 1 短句 / 2 单句应用 / 3 两步或含干扰
   think = 0 直接口算 / 1 一步变形 / 2 需要推理
   每个族 make(sp, lvl) 返回一个 item 或 null（约束不满足时重试）      */

function pair(sp, opts = {}, lvl = 1) {
  const lim = sp.lim;
  for (let k = 0; k < 40; k++) {
    let a, b;
    if (sp.carry) { // 20 以内进位：一个加数是个位数，和超过 10
      a = sp.nineFirst ? 9 : R.int(sp.lim > 12 ? 5 : 2, 9);
      b = R.int(2, 9);
      if (a + b <= 10) continue;
      if (a + b > 20) continue;
    } else if (sp.noCarry) {
      const t = R.int(10, 19); a = t; b = R.int(1, 9 - (t % 10));
    } else {
      a = R.int(1, lim - 1); b = R.int(1, lim - 1);
      if (a + b > lim) continue;
    }
    if (lvl >= 2 && (a === 0 || b === 0)) continue;
    if (lvl >= 2 && (a === 1 && b === 1)) continue;
    if (opts.sorted && a < b) [a, b] = [b, a];
    return [a, b];
  }
  return null;
}
function triple(sp, lvl, forms = ['+++', '---', '+-', '-+']) {
  const lim = sp.lim;
  if (!forms || !forms.length) forms = ['+++', '---', '+-', '-+'];
  for (let k = 0; k < 60; k++) {
    const a = R.int(1, lim - 2), b = R.int(1, lim - 2), c = R.int(1, lim - 2);
    const form = R.pick(forms);
    let v = a, ok = true;
    if (form === '+++') { if (a + b + c > lim) ok = false; }
    else if (form === '---') { if (a - b < 0 || a - b - c < 0 || a < 2) ok = false; }
    else if (form === '+-') { v = a + b; if (v > lim || v - c < 0) ok = false; }
    else if (form === '-+') { v = a - b; if (v < 0 || v + c > lim) ok = false; }
    if (!ok) continue;
    if (lvl >= 2 && (a === 1 || b === 1 || c === 1) && form === '+++') continue;
    return { a, b, c, form };
  }
  return null;
}

function quad(sp, lvl, forms = ['++++', '----', '+-+', '++-']) {
  const lim = sp.lim;
  if (!forms || !forms.length) forms = ['++++', '----', '+-+', '++-'];
  for (let k = 0; k < 80; k++) {
    const a = R.int(1, lim - 3), b = R.int(1, lim - 3), c = R.int(1, lim - 3), d = R.int(1, lim - 3);
    const form = R.pick(forms);
    let ok = true, ans = a, expr = '';
    if (form === '++++') {
      ans = a + b + c + d;
      if (ans > lim) ok = false;
      expr = `${a} ＋ ${b} ＋ ${c} ＋ ${d}`;
    } else if (form === '----') {
      if (a - b < 0 || a - b - c < 0 || a - b - c - d < 0) ok = false;
      else { ans = a - b - c - d; expr = `${a} － ${b} － ${c} － ${d}`; }
    } else if (form === '+-+') {
      let t1 = a + b; if (t1 > lim) ok = false;
      let t2 = t1 - c; if (t2 < 0) ok = false;
      ans = t2 + d; if (ans > lim) ok = false;
      expr = `${a} ＋ ${b} － ${c} ＋ ${d}`;
    } else if (form === '++-') {
      let t1 = a + b + c; if (t1 > lim) ok = false;
      ans = t1 - d; if (ans < 0) ok = false;
      expr = `${a} ＋ ${b} ＋ ${c} － ${d}`;
    }
    if (!ok || !expr) continue;
    return {
      prompt: expr + ' ＝ ',
      answer: String(ans),
      sig: `chain4:${expr.replace(/\s+/g, '').replace(/[－＋]/g, m => m === '＋' ? '+' : '-')}`,
      work: `${expr} ＝ ${ans}`,
      wide: 1
    };
  }
  return null;
}

const FAMILIES = [
  { // 直接口算：加
    id: 'add', label: '加法口算', tier: 0, think: 0, w: 10,
    make(sp, lvl, cfg = {}) {
      if (cfg.terms && cfg.terms.allow2 === false) return null;
      const p = pair(sp, { sorted: true }, lvl); if (!p) return null;
      const [a, b] = p;
      return { prompt: `${a} ＋ ${b} ＝ `, answer: String(a + b), sig: `add:${a}+${b}`, work: `${a} ＋ ${b} ＝ ${a + b}` };
    },
  },
  { // 直接口算：减
    id: 'sub', label: '减法口算', tier: 0, think: 0, w: 10,
    make(sp, lvl, cfg = {}) {
      if (cfg.terms && cfg.terms.allow2 === false) return null;
      if (sp.addOnly) return null;
      for (let k = 0; k < 30; k++) {
        const t = pair(sp, {}, lvl); if (!t) return null;
        const sum = t[0] + t[1], b = R.int(1, sum - 1);
        if (sp.borrow && sum - b <= 10 && sum > 10) continue; // 退位减法要真退位
        if (sp.borrow && sum <= 10 && b > 0 && sum - b >= 0 && b >= sum % 10 && sum > 10) continue;
        if (lvl >= 2 && sum - b === t[0]) continue;
        return { prompt: `${sum} － ${b} ＝ `, answer: String(sum - b), sig: `sub:${sum}-${b}`, work: `${sum} － ${b} ＝ ${sum - b}` };
      }
      return null;
    },
  },
  { // 连加连减 / 加减混合（支持项数和形式精准控制）
    id: 'chain', label: '连加连减', tier: 0, think: 1, w: 7,
    make(sp, lvl, cfg = {}) {
      if (!sp.chain && sp.lim > 20) return null;
      const allow3 = cfg.terms ? cfg.terms.allow3 !== false : true;
      const allow4 = cfg.terms ? !!cfg.terms.allow4 : false;
      if (!allow3 && !allow4) return null;

      // 如果启用了4项运算，有几率出4项运算题
      if (allow4 && (!allow3 || R.chance(0.35))) {
        const q = quad(sp, lvl);
        if (q) return q;
      }
      if (!allow3) return null;

      let forms = ['+++', '---', '+-', '-+'];
      if (cfg.chainForms) {
        const active = [];
        if (cfg.chainForms.add) active.push('+++');
        if (cfg.chainForms.sub) active.push('---');
        if (cfg.chainForms.mix) active.push('+-', '-+');
        if (active.length) forms = active;
      }
      const t = triple(sp, lvl, forms); if (!t) return null;
      const { a, b, c, form } = t;
      let expr, ans;
      if (form === '+++') { expr = `${a} ＋ ${b} ＋ ${c}`; ans = a + b + c; }
      else if (form === '---') { expr = `${a} － ${b} － ${c}`; ans = a - b - c; }
      else if (form === '+-') { expr = `${a} ＋ ${b} － ${c}`; ans = a + b - c; }
      else { expr = `${a} － ${b} ＋ ${c}`; ans = a - b + c; }
      return {
        prompt: expr + ' ＝ ',
        answer: String(ans),
        sig: `chain:${expr.replace(/\s+/g, '').replace(/[－＋]/g, m => m === '＋' ? '+' : '-')}`,
        work: `${expr} ＝ ${ans}`
      };
    },
  },
  { // 比大小：两边都是算式
    id: 'cmp-expr', label: '算式比大小', tier: 0, think: 1, w: 6,
    make(sp, lvl) {
      if (lvl === 0) return null;
      for (let k = 0; k < 40; k++) {
        const p1 = pair(sp, {}, lvl), p2 = pair(sp, {}, lvl); if (!p1 || !p2) return null;
        const one = R.chance(0.5);
        const a = p1[0] + p1[1], b = p2[0] + p2[1];
        if (one && a !== b) continue;
        if (!one && a === b) continue;
        // 不许出「1＋9 ○ 1＋9」这种两边一模一样的退化题
        const same = x => [...x].sort((m, n) => m - n).join(',');
        if (same(p1) === same(p2)) continue;
        const s1 = `${p1[0]} ＋ ${p1[1]}`, s2 = `${p2[0]} ＋ ${p2[1]}`;
        const ans = a > b ? '＞' : a < b ? '＜' : '＝';
        return { prompt: `${s1}  ○  ${s2}`, answer: ans, sig: `cmp:${s1}|${s2}`, work: `${a} ${ans} ${b}`, wide: 1 };
      }
      return null;
    },
  },
  { // 数的分与合（不用方块，用括号留空）
    id: 'bond', label: '数的分合', tier: 0, think: 1, w: 6,
    make(sp, lvl, cfg) {
      if (!sp.bond || (cfg && cfg.skipBond)) return null;
      for (let k = 0; k < 20; k++) {
        const n = R.int(4, sp.lim);
        const a = R.int(2, n - 2);
        if (a < 1 || n - a < 1) continue;
        const style = R.pick(['split', 'merge']);
        if (style === 'split') {
          return {
            prompt: `${n} 可以分成 ${a} 和（　　）`,
            answer: String(n - a),
            prompt2: `${n} 可以分成 ${a} 和 □`,
            sig: `split:${n}>${a}`,
            work: `${n} ＝ ${a} ＋ ${n - a}`,
            bond: { n, a, b: n - a, ask: 'b' },
            wide: 1
          };
        }
        return {
          prompt: `${a} 和 ${n - a} 合成（　　）`,
          answer: String(n),
          prompt2: `${a} 和 ${n - a} 合成 □`,
          sig: `merge:${a},${n - a}`,
          work: `${a} ＋ ${n - a} ＝ ${n}`,
          bond: { n, a, b: n - a, ask: 'n' },
          wide: 1
        };
      }
      return null;
    },
  },
  { // 括号里填几（不用方块，用规范圆括号留足书写空）
    id: 'miss', label: '括号里填几', tier: 0, think: 2, w: 9,
    make(sp, lvl) {
      if (lvl === 0) return null;
      for (let k = 0; k < 40; k++) {
        const pos = R.int(0, 3); // ?+a=b, a+?=b, ?-a=b, a-?=b
        let x, y, z, prompt, sig;
        if (pos <= 1) {
          const p = pair(sp, {}, lvl); if (!p) return null;
          const a = p[0], b = p[1], s = a + b;
          const one = R.chance(0.5) ? a : b, other = s - one;
          if (one === 0 || other === 0) continue;
          if (lvl >= 2 && other === 1) continue;
          prompt = pos === 0 ? `（　　）＋ ${one} ＝ ${s}` : `${one} ＋（　　）＝ ${s}`;
          x = other; sig = `miss-add:${pos}:${one}:${s}`;
        } else {
          const t = pair(sp, {}, lvl); if (!t) return null;
          const sum = t[0] + t[1];
          if (pos === 2) {
            const b = R.int(1, sum - 2); if (b === 0) continue;
            prompt = `（　　）－ ${b} ＝ ${sum - b}`; x = sum; sig = `miss-min:${b}:${sum - b}`;
          } else {
            const r = R.int(1, sum - 2); if (r === 0) continue;
            prompt = `${sum} －（　　）＝ ${r}`; x = sum - r; sig = `miss-sub:${sum}:${r}`;
          }
        }
        if (x == null || x < 0 || x > 99) continue;
        const prompt2 = prompt.replace(/（\s*）/g, '□');
        return { prompt, answer: String(x), prompt2, sig, work: `${prompt.replace(/（\s*）/g, `(${x})`)} → 填 ${x}` };
      }
      return null;
    },
  },
  { // 等式平衡：a+b = ( )+c（不用方块，留足书写空）
    id: 'equiv', label: '等式两边平衡', tier: 0, think: 2, w: 6,
    make(sp, lvl) {
      if (lvl < 1) return null;
      for (let k = 0; k < 50; k++) {
        const p1 = pair(sp, {}, lvl); if (!p1) return null;
        const s = p1[0] + p1[1];
        const c = R.int(0, s - 1);
        const x = s - c;
        if (x < 0 || x > sp.lim) continue;
        if (lvl >= 2 && c === 0) continue;
        // 「4＋5＝( )＋5」这种另一边照抄的题没有思维量，挡掉
        if (c === p1[0] || c === p1[1]) continue;
        if (x === p1[0] || x === p1[1]) continue;
        const flip = R.chance(0.5);
        const prompt = flip ? `（　　）＋ ${c} ＝ ${p1[0]} ＋ ${p1[1]}` : `${p1[0]} ＋ ${p1[1]} ＝（　　）＋ ${c}`;
        const prompt2 = prompt.replace(/（\s*）/g, '□');
        return { prompt, answer: String(x), prompt2, sig: `equiv:${x}+${c}=${p1[0]}+${p1[1]}`, work: `${p1[0]} ＋ ${p1[1]} ＝ ${s}，${s} － ${c} ＝ ${x}`, wide: 1 };
      }
      return null;
    },
  },
  { // 最大能填几（含不等关系）
    id: 'maxfill', label: '最大能填几', tier: 1, think: 2, w: 4,
    make(sp, lvl) {
      if (lvl < 2) return null;
      const p = pair(sp, {}, lvl); if (!p) return null;
      const s = p[0] + p[1];
      const lim = sp.lim;
      const best = lim - s;
      if (best < 1 || best > 9) return null;
      const one = R.pick([p[0], p[1]]);
      const prompt = `（　　）＋ ${s} ＜ ${lim + 1}，最大填几？`;
      const prompt2 = `□＋${s}＜${lim + 1}，最大填几？`;
      return {
        prompt, answer: String(best), prompt2,
        sig: `maxfill:${s}:${lim}`, work: `${s} ＋ ${best} ＝ ${s + best} ＜ ${lim + 1}，再大就超过了`, wide: 1,
      };
    },
  },
  { // 排队题
    id: 'sort', label: '数排队', tier: 1, think: 1, w: 4,
    make(sp, lvl) {
      if (lvl === 0) return null;
      const lim = sp.lim, pool = new Set();
      while (pool.size < 4) pool.add(R.int(0, lim));
      const nums = [...pool];
      const asc = R.chance(0.5);
      const sorted = nums.slice().sort((a, b) => asc ? a - b : b - a);
      const sigKey = nums.slice().sort((a, b) => a - b).join(',') + ':' + (asc ? 'a' : 'd');
      return {
        prompt: `把 ${nums.join('、')} 按${asc ? '从小到大' : '从大到小'}排：＿＿＿＿`,
        answer: sorted.join('、'), sig: `sort:${sigKey}`,
        work: sorted.join(asc ? ' < ' : ' > '), wide: 1,
      };
    },
  },
  { // 区间数
    id: 'between', label: '介于几和几', tier: 1, think: 1, w: 3,
    make(sp, lvl) {
      if (sp.lim < 5) return null;
      const lo = R.int(0, sp.lim - 3);
      const hi = lo + R.int(2, 3);
      if (hi > sp.lim) return null;
      const ans = [];
      for (let n = lo + 1; n < hi; n++) ans.push(n);
      if (!ans.length) return null;
      return {
        prompt: `比 ${lo} 大、比 ${hi} 小的数是＿＿＿＿`, answer: ans.join('、'),
        sig: `between:${lo}:${hi}`, work: `${lo} < ${ans.join(' < ')} < ${hi}`, wide: 1,
      };
    },
  },
];


/* ---------- 应用题族（读题训练） ----------
   文案约束来自文献：一句只说一件事、每句 ≤12 字、问题放在最后、基础题只给 2 个已知数
   （《心理发展与教育》450 名学生实验：表述方式与附加信息显著改变儿童的问题表征；
    Leanza 2015 综述：语言因素是 6-8 岁解题失败的主因之一）。
   bar = 方块图（part-whole / 比较条形），是 schema 表征而不是装饰插图。
   facts = 已知数个数；exampleFamily 用于「新题型先给一道例题再撤」。 */
function wpFrame(sp, lvl) {
  return pair(sp, {}, lvl);
}

const WORDS = [
  {
    id: 'w-join', label: '一共（合并）', tier: 1, think: 0, w: 6,
    make(sp, lvl) {
      const p = wpFrame(sp, lvl); if (!p) return null;
      const [a, b] = p; const [n, u] = R.pick(NOUNS);
      const open = R.pick(['有', '树上有', '盒子里有', '盘子里有']);
      const prompt = `${open}${n} ${a} ${u}，又拿来 ${b} ${u}。一共有几${u}？`;
      return {
        prompt, answer: String(a + b), sig: `w-join:${a}+${b}`, work: `${a}＋${b}＝${a + b}`,
        bar: { parts: [a, b], ask: 'total' }, facts: 2,
      };
    },
  },
  {
    id: 'w-take', label: '还剩（去掉）', tier: 1, think: 0, w: 6,
    make(sp, lvl) {
      if (sp.addOnly) return null;
      const p = wpFrame(sp, lvl); if (!p) return null;
      const t = p[0] + p[1]; const b = R.int(1, t - 1);
      const [n, u] = R.pick(NOUNS);
      const verb = R.pick(['拿走', '吃掉', '飞走了', '用掉', '借出']);
      const prompt = `原来有 ${t} ${u}${n}，${verb} ${b} ${u}。还剩几${u}？`;
      return {
        prompt, answer: String(t - b), sig: `w-take:${t}-${b}`, work: `${t}－${b}＝${t - b}`,
        bar: { total: t, parts: [b], ask: 'rest' }, facts: 2,
      };
    },
  },
  {
    id: 'w-diff', label: '多几／少几（比较）', tier: 2, think: 1, w: 5,
    make(sp, lvl) {
      if (lvl === 0) return null;
      for (let k = 0; k < 30; k++) {
        const p = wpFrame(sp, lvl); if (!p) return null;
        const a = p[0] + p[1], b = R.int(1, Math.max(1, a - 1));
        if (a - b === 0) continue;
        const [n1, u] = R.pick(NOUNS); let n2 = n1;
        while (n2 === n1) n2 = R.pick(NOUNS)[0];
        const more = R.chance(0.5);
        const prompt = `${n1} ${a} ${u}，${n2} ${b} ${u}。${n1}比${n2}${more ? '多' : '少'}几${u}？`;
        return {
          prompt, answer: String(Math.abs(a - b)), sig: `w-diff:${a}-${b}:${more}`,
          work: `${a}－${b}＝${a - b}`,
          bar: { rows: [{ label: n1, n: a }, { label: n2, n: b }], ask: 'diff' }, facts: 2,
        };
      }
      return null;
    },
  },
  {
    id: 'w-same', label: '同样多（补差距）', tier: 2, think: 2, w: 4,
    make(sp, lvl) {
      if (lvl < 1) return null;
      const p = wpFrame(sp, lvl); if (!p) return null;
      const a = p[0] + p[1], b = R.int(1, Math.max(1, a - 1));
      if (a - b <= 0) return null;
      const [n1, u] = R.pick(NOUNS); let n2 = n1;
      while (n2 === n1) n2 = R.pick(NOUNS)[0];
      const give = R.chance(0.5);
      const prompt = give
        ? `${n1} ${a} ${u}，${n2} ${b} ${u}。${n1}给${n2}几${u}，两个人就一样多？`
        : `${n1} ${a} ${u}，${n2} ${b} ${u}。${n2}再添上几${u}，就和${n1}一样多？`;
      const ans = give ? Math.floor((a - b) / 2) : a - b;
      if (give && (a - b) % 2 !== 0) return null;
      return {
        prompt, answer: String(ans), sig: `w-same:${a},${b}:${give}`,
        work: give ? `${a}－${b}＝${a - b}，${a - b}÷2＝${ans}` : `${a}－${b}＝${ans}`,
        bar: { rows: [{ label: n1, n: a }, { label: n2, n: b }], ask: 'same' }, facts: 2, hard: 1,
      };
    },
  },
  {
    id: 'w-extra', label: '有多余条件', tier: 3, think: 2, w: 3,
    make(sp, lvl) {
      if (lvl < 1) return null;
      const p = wpFrame(sp, lvl); if (!p) return null;
      const [a, b] = p;
      const [n1, u1] = R.pick(NOUNS); let n2 = n1;
      while (n2 === n1) n2 = R.pick(NOUNS)[0];
      const junk = R.int(1, sp.lim);
      // 拆成三短句，每句只说一件事；干扰条件单独一句
      const prompt = `${n1}有 ${a} ${u1}。${n2}有 ${junk} ${u2Of(n2)}。${n1}又添上 ${b} ${u1}，现在${n1}有几${u1}？`;
      return {
        prompt, answer: String(a + b), sig: `w-extra:${a}+${b}|${junk}${n2}`,
        work: `${a}＋${b}＝${a + b}（${n2}那句用不上）`,
        bar: { parts: [a, b], ask: 'total', junk: { label: n2, n: junk } },
        facts: 3, hard: 1, example: 1,
      };
    },
  },
  {
    id: 'w-2step', label: '两步题', tier: 3, think: 2, w: 3,
    make(sp, lvl) {
      if (lvl < 1) return null;
      const t = triple(sp, lvl); if (!t) return null;
      const { a, b, c, form } = t;
      const [n, u] = R.pick(NOUNS);
      let prompt, ans, sig, work;
      if (form === '+-') {
        ans = a + b - c;
        prompt = `${n}有 ${a} ${u}，拿来 ${b} ${u}。又送出去 ${c} ${u}，现在几${u}？`;
        sig = `w-2:${a}+${b}-${c}`;
        work = `${a}＋${b}＝${a + b}，${a + b}－${c}＝${ans}`;
      } else if (form === '---') {
        ans = a - b - c;
        prompt = `${n}有 ${a} ${u}，吃了 ${b} ${u}。又吃了 ${c} ${u}，还剩几${u}？`;
        sig = `w-2:${a}-${b}-${c}`;
        work = `${a}－${b}＝${a - b}，${a - b}－${c}＝${ans}`;
      } else {
        ans = a + b + c;
        prompt = `${n}有 ${a} ${u}，拿来 ${b} ${u}。再拿来 ${c} ${u}，一共几${u}？`;
        sig = `w-2:${a}+${b}+${c}`;
        work = `${a}＋${b}＝${a + b}，${a + b}＋${c}＝${ans}`;
      }
      return {
        prompt, answer: String(ans), sig, work,
        bar: { parts: [a, b, c], ask: 'total' }, facts: 3, hard: 1, example: 1,
      };
    },
  },
  {
    id: 'w-ask', label: '看算式选问题', tier: 2, think: 2, w: 5, // 反向读题：给情境+算式，选该问什么
    make(sp, lvl) {
      if (lvl === 0) return null;
      const p = wpFrame(sp, lvl); if (!p) return null;
      const [a, b] = p;
      const [n1, u1] = R.pick(NOUNS); let n2 = n1;
      while (n2 === n1) n2 = R.pick(NOUNS)[0];
      const sub = R.chance(0.5);
      const expr = sub ? `${a}－${b}` : `${a}＋${b}`;
      const prompt = `${n1} ${a} ${u1}，${n2} ${b} ${u1}。算式 ${expr} 能解决哪个问题？`;
      const correct = sub ? (a >= b ? `${n1}比${n2}多几${u1}` : `${n1}比${n2}少几${u1}`) : `一共有几${u1}`;
      const wrong = sub ? `一共有几${u1}` : (a >= b ? `${n1}比${n2}多几${u1}` : `${n2}比${n1}多几${u1}`);
      const third = R.pick([`还剩几${u1}`, `${n2}比${n1}少几${u1}`, `一样多吗`]);
      const opts = R.shuffle([[1, correct], [0, wrong], [0, third]]);
      const letters = 'ABC';
      return {
        prompt, choices: opts.map((o, i) => [letters[i], o[1]]),
        answer: letters[opts.findIndex(o => o[0])], sig: `w-ask:${a}${sub ? '-' : '+'}${b}`,
        work: `${expr} → ${correct}`, facts: 2,
      };
    },
  },
  {
    id: 'w-tell', label: '讲给同桌听', tier: 2, think: 1, w: 2, // 题面只给算式，孩子反向编情境（自述/复述）
    make(sp, lvl) {
      if (lvl < 1) return null;
      const p = pair(sp, {}, lvl); if (!p) return null;
      const one = R.pick([p[0], p[1]]), other = p[0] + p[1] - one;
      const add = R.chance(0.5);
      const expr = add ? `${one}＋${other}` : `${one + other}－${one}`;
      return {
        prompt: `${expr}＝${add ? one + other : other}。用${['铅笔', '苹果', '小鸟', '小红花'][R.int(0, 3)]}讲一个小故事，把这个算式说出来。`,
        answer: '（口头）', sig: `w-tell:${expr}`, work: `例：原来有 ${add ? one : one + other} 支，${add ? '又拿来' : '拿走'} ${add ? other : one} 支，${add ? '一共' : '还剩'} ${add ? one + other : other} 支。`,
        oral: 1, facts: 2,
      };
    },
  },
];
function u2Of(noun) {
  const hit = NOUNS.find(x => x[0] === noun);
  return hit ? hit[1] : '个';
}

const ALL_FAMILIES = FAMILIES.concat(WORDS);
const FAM_BY_ID = Object.fromEntries(ALL_FAMILIES.map(f => [f.id, f]));

/* 节点允许的题型族。口算核心族 + 按 spec 开放的族。 */
function familiesFor(sp, cfg) {
  const allow = [];
  allow.push('add');
  if (!sp.addOnly) allow.push('sub');
  if (sp.chain || sp.lim >= 10) allow.push('chain');
  if (sp.bond && !(cfg && cfg.skipBond)) allow.push('bond');
  if (sp.lim >= 10 || sp.carry || sp.cmp) allow.push('cmp-expr');
  allow.push('miss');
  if (sp.lim >= 10) allow.push('equiv');
  if (sp.lim >= 10) allow.push('maxfill');
  allow.push('sort', 'between');
  if (cfg.wordMix > 0) { allow.push('w-join', 'w-take', 'w-diff', 'w-extra', 'w-2step', 'w-ask', 'w-same', 'w-tell'); }
  return allow;
}
