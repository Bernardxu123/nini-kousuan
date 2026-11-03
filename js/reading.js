// 读题支持：常规词表、注音、关键词、读题三问、朗读。
// 应用题的句式是我自己生成的固定词表，所以能内置一份精准注音表。
'use strict';

/* 生僻字表外的字一律不注音，退化成原文，不会报错 */
const PINYIN = {
  一: 'yī', 二: 'èr', 三: 'sān', 四: 'sì', 五: 'wǔ', 六: 'liù', 七: 'qī', 八: 'bā', 九: 'jiǔ', 十: 'shí',
  百: 'bǎi', 零: 'líng', 多: 'duō', 少: 'shǎo', 大: 'dà', 小: 'xiǎo', 几: 'jǐ', 个: 'gè', 只: 'zhī',
  支: 'zhī', 本: 'běn', 朵: 'duǒ', 棵: 'kē', 辆: 'liàng', 块: 'kuài', 颗: 'kē', 张: 'zhāng', 片: 'piàn',
  有: 'yǒu', 又: 'yòu', 再: 'zài', 来: 'lái', 了: 'le', 走: 'zǒu', 掉: 'diào', 吃: 'chī', 拿: 'ná',
  放: 'fàng', 借: 'jiè', 出: 'chū', 送: 'sòng', 给: 'gěi', 买: 'mǎi', 卖: 'mài', 开: 'kāi', 关: 'guān',
  飞: 'fēi', 游: 'yóu', 跑: 'pǎo', 停: 'tíng', 站: 'zhàn', 坐: 'zuò', 看: 'kàn', 读: 'dú', 写: 'xiě',
  画: 'huà', 剪: 'jiǎn', 折: 'zhé', 拍: 'pāi', 踢: 'tī', 跳: 'tiào',
  铅: 'qiān', 笔: 'bǐ', 皮: 'pí', 球: 'qiú', 糖: 'táng', 果: 'guǒ', 气: 'qì', 垫: 'diàn',
  红: 'hóng', 花: 'huā', 黄: 'huáng', 叶: 'yè', 苹: 'píng', 梨: 'lí', 桃: 'táo', 草: 'cǎo',
  莓: 'méi', 鸡: 'jī', 鸭: 'yā', 鸟: 'niǎo', 蝶: 'dié', 鱼: 'yú', 猫: 'māo', 狗: 'gǒu',
  车: 'chē', 书: 'shū', 盒: 'hé', 子: 'zi', 里: 'lǐ', 中: 'zhōng', 上: 'shàng', 下: 'xià',
  前: 'qián', 后: 'hòu', 旁: 'páng', 边: 'biān', 间: 'jiān', 外: 'wài',
  一: 'yī', 共: 'gòng', 现: 'xiàn', 在: 'zài', 原: 'yuán', 第: 'dì', 组: 'zǔ', 次: 'cì',
  同: 'tóng', 学: 'xué', 男: 'nán', 生: 'shēng', 女: 'nǚ', 家: 'jiā', 班: 'bān', 友: 'yǒu',
  问: 'wèn', 题: 'tí', 目: 'mù', 什: 'shén', 么: 'me', 哪: 'nǎ', 样: 'yàng', 是: 'shì',
  算: 'suàn', 式: 'shì', 得: 'de', 数: 'shù', 答: 'dá', 案: 'àn', 不: 'bù', 用: 'yòng',
  要: 'yào', 求: 'qiú', 知: 'zhī', 道: 'dào', 和: 'hé', 与: 'yǔ', 或: 'huò', 但: 'dàn',
  最: 'zuì', 每: 'měi', 另: 'lìng', 一: 'yī', 种: 'zhǒng', 两: 'liǎng', 都: 'dōu',
  比: 'bǐ', 按: 'àn', 排: 'pái', 序: 'xù', 列: 'liè', 从: 'cóng', 到: 'dào',
  分: 'fēn', 合: 'hé', 成: 'chéng', 加: 'jiā', 减: 'jiǎn', 法: 'fǎ', 填: 'tián',
  括: 'kuò', 号: 'hào', 号: 'hào', 空: 'kōng', 可: 'kě', 以: 'yǐ', 解: 'jiě',
  决: 'jué', 根: 'gēn', 据: 'jù', 该: 'gāi', 怎: 'zěn', 结: 'jié', 果: 'guǒ',
  第: 'dì', 个: 'gè', 图: 'tú', 画: 'huà', 圈: 'quān', 读: 'dú', 先: 'xiān',
  后: 'hòu', 顺: 'shùn', 序: 'xù', 路: 'lù', 树: 'shù', 池: 'chí', 塘: 'táng',
  桌: 'zhuō', 椅: 'yǐ', 盘: 'pán', 碗: 'wǎn', 瓶: 'píng', 杯: 'bēi', 柜: 'guì',
  珠: 'zhū', 干: 'gān', 饼: 'bǐng', 具: 'jù', 文: 'wén', 套: 'tào', 盒: 'hé',
  摆: 'bǎi', 插: 'chā', 贴: 'tiē', 叠: 'dié', 装: 'zhuāng', 撤: 'chè',
  多: 'duō', 余: 'yú', 关: 'guān', 注: 'zhù', 意: 'yì', 仔: 'zǐ', 细: 'xì',
  清: 'qīng', 楚: 'chǔ', 谁: 'shéi', 谁: 'shéi', 它: 'tā', 他: 'tā', 她: 'tā',
  们: 'men', 呀: 'ya', 呢: 'ne', 吗: 'ma', 吧: 'ba', 哦: 'ó',
};

/* 应用题里出现的「常规词」——这些词要让孩子天天见到、先认下来 */
const ROUTINE_WORDS = [
  ['一共有', 'yī gòng yǒu'], ['还剩', 'hái shèng'], ['又拿来', 'yòu ná lái'],
  ['又添上', 'yòu tiān shàng'], ['原来', 'yuán lái'], ['现在', 'xiàn zài'],
  ['比', 'bǐ'], ['多几', 'duō jǐ'], ['少几', 'shǎo jǐ'], ['其中', 'qí zhōng'],
  ['送出去', 'sòng chū qù'], ['飞走了', 'fēi zǒu le'], ['吃掉', 'chī diào'],
  ['拿走', 'ná zǒu'], ['用掉', 'yòng diào'], ['借出', 'jiè chū'],
  ['第一次', 'dì yī cì'], ['第二次', 'dì èr cì'], ['根据算式', 'gēn jù suàn shì'],
  ['哪个问题', 'nǎ gè wèn tí'], ['按从小到大', 'àn cóng xiǎo dào dà'],
  ['按从大到小', 'àn cóng dà dào xiǎo'], ['可以分成', 'kě yǐ fēn chéng'], ['合成', 'hé chéng'],
];

function annotate(text, mode) {
  if (mode === 'off') return esc(text);
  const ruby = ch => {
    const py = PINYIN[ch];
    return py ? `<ruby>${esc(ch)}<rt>${py}</rt></ruby>` : esc(ch);
  };
  // 词组优先整体注音（词卡里的固定说法）
  let html = esc(text);
  for (const [w, py] of ROUTINE_WORDS) {
    const W = esc(w);
    if (html.includes(W)) {
      html = html.split(W).join(`<b class="kw" title="${py}">${W}</b>`);
    }
  }
  if (mode === 'keyword') return html;
  // full = 逐字注音（只在「读题练习页」用，A4 口算卷不开）
  return html.replace(/[一-鿿]/g, ch => {
    // 已被 <b class=kw> 包住的不动
    return PINYIN[ch] ? `<ruby>${ch}<rt>${PINYIN[ch]}</rt></ruby>` : ch;
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* 读题三问：印在每个应用题区块的开头 */
const READ_STEPS = [
  ['①', '读第一遍：圈出数字'],
  ['②', '读第二遍：画出方块图'],
  ['③', '想一想：变多了还是变少了？'],
];

/* 方块图（部分-整体图 / 比较条形）。单位宽度按最大值缩放，永远不为负。 */
function barSvg(it, opts = {}) {
  const b = it.bar;
  if (!b) return '';
  const W = opts.w || 210, H = 20, gap = 2;

  // 比较型：两行条，长度按最大值缩放
  if (b.rows) {
    const max = Math.max(...b.rows.map(r => r.n), 1);
    const unit = (W - 40) / max;
    const rows = b.rows.map((r, i) => {
      const y = i * (H + 5), w = Math.max(3, r.n * unit);
      const q = b.ask === 'diff' && i === 0 ? '' : '';
      return `<rect x="0" y="${y}" width="${w}" height="${H}" fill="#eaf1fb" stroke="#8db0dd"/>`
        + `<text x="3" y="${y + H - 6}" font-size="10" fill="#33507a">${esc(r.label)} ${r.n}${q}</text>`;
    }).join('');
    // 差值段用虚线标出
    let diff = '';
    if (b.ask === 'diff' && b.rows.length === 2) {
      const hi = Math.max(b.rows[0].n, b.rows[1].n), lo = Math.min(b.rows[0].n, b.rows[1].n);
      const x = lo * unit, w2 = Math.max(3, (hi - lo) * unit);
      diff = `<rect x="${x}" y="${H + 5}" width="${w2}" height="${H}" fill="#fff3d6" stroke="#d9a441" stroke-dasharray="3 2"/>`
        + `<text x="${x + 2}" y="${2 * H + 12}" font-size="10" fill="#8a5a00">差 ${hi - lo}</text>`;
    }
    const h2 = b.rows.length * (H + 5) + (diff ? H + 8 : 4);
    return `<svg class="bar" viewBox="0 0 ${W} ${h2}" width="${W}" height="${h2}" role="img" aria-label="方块图">${rows}${diff}</svg>`;
  }

  // 部分-整体型
  const ps = (b.parts || []).filter(n => n > 0);
  const total = b.ask === 'total' ? ps.reduce((x, y) => x + y, 0) : (b.total || ps.reduce((x, y) => x + y, 0));
  if (!total || !ps.length) return '';
  const unit = (W - 40) / total;

  // 第一行：整体（求总数时留空框）
  const topW = Math.max(4, total * unit);
  const top = b.ask === 'total'
    ? `<rect x="0" y="0" width="${topW}" height="${H}" fill="#f6f9fe" stroke="#8db0dd" stroke-dasharray="4 3"/>`
      + `<text x="${topW + 4}" y="${H - 6}" font-size="10" fill="#33507a">一共 ？</text>`
    : `<rect x="0" y="0" width="${topW}" height="${H}" fill="#eaf1fb" stroke="#8db0dd"/>`
      + `<text x="3" y="${H - 6}" font-size="10" fill="#33507a">一共 ${total}</text>`;

  // 第二行：分段
  let x = 0;
  const segs = ps.map((n, i) => {
    const w = Math.max(3, n * unit - gap);
    const seg = `<rect x="${x}" y="${H + 5}" width="${w}" height="${H}" fill="${i ? '#dff0e4' : '#eaf1fb'}" stroke="${i ? '#7fbf93' : '#8db0dd'}"/>`
      + `<text x="${x + 3}" y="${2 * H + 1}" font-size="10" fill="#33507a">${n}</text>`;
    x += n * unit + gap;
    return seg;
  }).join('');
  // 要求的部分画成虚线
  let ask2 = '';
  if (b.ask === 'rest' || b.ask === 'total') {
    const remain = Math.max(0, total - ps.reduce((s, v) => s + v, 0));
    if (b.ask === 'rest' && remain > 0) {
      ask2 = `<rect x="0" y="${H + 5}" width="${Math.max(4, remain * unit)}" height="${H}" fill="#fff" stroke="#8db0dd" stroke-dasharray="4 3"/>`
        + `<text x="3" y="${2 * H + 1}" font-size="10" fill="#33507a">？</text>`;
    }
  }
  const junkY = 2 * H + 10;
  const junk = b.junk ? `<text x="0" y="${junkY + 8}" font-size="10" fill="#a33">${esc(b.junk.label)} ${b.junk.n}：这句用不上，划掉</text>` : '';
  const hh = 2 * H + 12 + (b.junk ? 14 : 0);
  return `<svg class="bar" viewBox="0 0 ${W} ${hh}" width="${W}" height="${hh}" role="img" aria-label="方块图">${top}${segs}${ask2}${junk}</svg>`;
}

/* 朗读：浏览器内置中文语音；一年级卷面语速放慢并对算式进行口语化润色 */
const Speak = {
  activeUtterance: null,
  on(text, onEnd) {
    if (!('speechSynthesis' in window)) return false;
    speechSynthesis.cancel();

    // 针对6岁孩子口语化读题：将符号转换为亲切自然的中文语音
    const cleanText = text
      .replace(/（\s*）|\(\s*\)|□/g, '几')
      .replace(/＝/g, '等于')
      .replace(/＋/g, '加')
      .replace(/－/g, '减')
      .replace(/＜/g, '小于')
      .replace(/＞/g, '大于')
      .replace(/○/g, '圆圈');

    const u = new SpeechSynthesisUtterance(cleanText);
    u.lang = 'zh-CN';
    u.rate = 0.82; // 0.82 慢速亲切，适合一年级跟读
    u.pitch = 1.05; // 稍高语调更具亲和力

    const vs = speechSynthesis.getVoices().filter(v => /zh|Chinese|Xiaoxiao|Yunxi/i.test(v.lang || v.name));
    if (vs.length) u.voice = vs[0];

    if (onEnd) u.onend = onEnd;
    Speak.activeUtterance = u;
    speechSynthesis.speak(u);
    return true;
  },
  stop() {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
    }
  },
};

/* ---------- 十格阵 (Ten-frame) 视觉脚手架 (Singapore / CPA 核心工具) ----------
   6岁儿童视觉计数与数感神器：通过 2×5 的十格网格，将抽象数字具象化为红蓝圆点，
   帮助孩子瞬间建立 5 的结构、10 的分合与进退位直觉表征。 */
function tenFrameSvg(a, b = 0, max = 10) {
  const cellW = 16, cellH = 16, r = 5.5;
  const cols = 5, rows = 2;
  const W = cols * cellW + 4, H = rows * cellH + 4;
  let circles = '';
  let count = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cx = 2 + col * cellW + cellW / 2;
      const cy = 2 + row * cellH + cellH / 2;
      const rect = `<rect x="${2 + col * cellW}" y="${2 + row * cellH}" width="${cellW}" height="${cellH}" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>`;
      circles += rect;
      if (count < a) {
        circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ef4444" />`;
      } else if (count < a + b) {
        circles += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#3b82f6" />`;
      }
      count++;
    }
  }
  return `<svg class="ten-frame" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" title="十格阵：红点${a}，蓝点${b}">${circles}</svg>`;
}

/* ---------- 读题识字卡 ----------
   只收孩子自己卷面上天天出现的词。依据：6 岁儿童应用题解题失败首因是
   字词解码而非算术（Leanza 2015 综述）；高频复现 + 拼音支架把词练成
   「整词识别」（sight-word，Ehri 2005；LaBerge & Samuels 1974 自动化），
   解码自动化后工作记忆才腾得出来想数量关系。
   s = 例句，全部取自本工具题面的固定句式，卷面上会原样再见。 */
const ZI_DECK = [
  { w: '一共', py: 'yī gòng', s: '2 支和 3 支，一共 5 支。' },
  { w: '还剩', py: 'hái shèng', s: '5 颗糖吃掉 2 颗，还剩 3 颗。' },
  { w: '又拿来', py: 'yòu ná lái', s: '有 4 个，又拿来 2 个。' },
  { w: '原来', py: 'yuán lái', s: '原来有 6 只，飞走了 2 只。' },
  { w: '现在', py: 'xiàn zài', s: '现在有几只？' },
  { w: '拿走', py: 'ná zǒu', s: '拿走 3 个，还剩几个？' },
  { w: '吃掉', py: 'chī diào', s: '吃掉 2 块，还剩几块？' },
  { w: '比…多几', py: 'bǐ…duō jǐ', s: '6 比 4 多 2。' },
  { w: '比…少几', py: 'bǐ…shǎo jǐ', s: '3 比 5 少 2。' },
  { w: '同样多', py: 'tóng yàng duō', s: '你 4 个，我 4 个，同样多。' },
  { w: '其中', py: 'qí zhōng', s: '10 个果子，其中 3 个是梨。' },
  { w: '送出去', py: 'sòng chū qù', s: '送出去 2 支，还剩几支？' },
  { w: '飞走了', py: 'fēi zǒu le', s: '9 只鸟，飞走了 5 只。' },
  { w: '又添上', py: 'yòu tiān shàng', s: '有 1 朵，又添上 3 朵。' },
  { w: '借出', py: 'jiè chū', s: '借出 1 支，还剩几支？' },
  { w: '用掉', py: 'yòng diào', s: '用掉 4 张，还剩几张？' },
];

/* 注音覆盖率体检：把卷面用到的汉字和注音表对一下 */
function coverage(items) {
  const miss = new Set();
  items.forEach(it => {
    (it.prompt || '').replace(/\d/g, '').split('').forEach(ch => {
      if (/[一-鿿]/.test(ch) && !PINYIN[ch]) miss.add(ch);
    });
  });
  return [...miss];
}
