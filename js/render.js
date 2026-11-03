// 卷面渲染：A4 试卷 + 答案页 + 读题练习页
'use strict';

function sheetHeader(cfg, meta) {
  const child = cfg.childName || '妮妮';
  const school = cfg.schoolName || '上海嘉定华五小学（徐行镇）';
  return `<div class="sheet-head">
  <div class="sheet-qr-box">
    <div class="sheet-qr-canvas" title="手机扫码直接批改"></div>
    <div class="sheet-qr-desc">📱 手机扫码批改</div>
  </div>
  <div class="school-tag">${esc(school)} · 一年级数学天天练</div>
  <div class="title">
    <span>${esc(meta.title)}</span>
    <span class="fill">姓名：<u>&nbsp;${esc(child)}&nbsp;</u>　日期：____月____日　用时：____分　对题：____/${cfg.count}</span>
  </div>
  <div class="sub">🎯 目标：${esc(meta.sub)}</div>
</div>`;
}

function formatPromptHtml(it, cfg) {
  let p = esc(it.prompt);

  // 1. 处理填空括号（不用方块，保留规范圆括号与足够铅笔书写留空）
  p = p.replace(/（\s*）|\(\s*\)|□/g, () => {
    if (cfg.showAnswer) {
      return `<span class="blank-paren">（<span class="ans-inline">${esc(it.answer)}</span>）</span>`;
    }
    return `<span class="blank-paren">（<span class="write-blank-inner">&nbsp;</span>）</span>`;
  });

  // 2. 处理比大小圆圈
  p = p.replace(/○/g, () => {
    if (cfg.showAnswer) {
      return `<span class="cmp-circle-ans">${esc(it.answer)}</span>`;
    }
    return `<span class="cmp-circle">○</span>`;
  });

  // 3. 处理等号尾巴：绝不替换等号，保留＝并跟上书写下划线
  if (/＝\s*$/.test(p)) {
    if (cfg.showAnswer) {
      p = p.replace(/＝\s*$/, `＝<span class="write-line filled"><span class="ans-inline">${esc(it.answer)}</span></span>`);
    } else {
      p = p.replace(/＝\s*$/, `＝<span class="write-line"></span>`);
    }
  }

  return p;
}

function itemCell(it, cfg) {
  const star = it.think === 2 ? '<span class="star" title="动脑筋变式题">★</span>' : '';
  const rev = it.review ? '<span class="tag rev" title="先修知识复习">复</span>' : '';
  const refr = it.refresher ? '<span class="tag refr" title="近几日见过的数族">炉</span>' : '';
  const reinf = it.reinforce ? `<span class="tag reinf" title="针对妮妮弱项精准强化：${esc(it.reinforceCause || '')}">强</span>` : '';
  const tagGroup = (rev || refr || reinf) ? `<span class="tag-group no-print">${rev}${refr}${reinf}</span>` : '';
  const mark = cfg.showAnswer ? '' : '<span class="mark no-print" title="点击批改对错"></span>';
  const qHtml = formatPromptHtml(it, cfg);
  return `<div class="item ${it.wide ? 'wide' : it.full ? 'full' : ''} fam-${it.fam}" data-no="${it.no}" data-topic="${esc(it.topicId)}" data-fam="${esc(it.fam)}">
  <span class="no">${it.no}.</span><span class="q">${qHtml}${star}</span>${tagGroup}${mark}
</div>`;
}

function wordItem(it, cfg) {
  const tier = cfg.annotate === 'full' ? annotate(it.prompt, 'full') : annotate(it.prompt, 'keyword');
  const bar = cfg.showBar ? barSvg(it) : '';
  const line = `<div class="wline"><span class="no">${it.no}.</span><span class="wq">${tier}</span>${it.think === 2 ? '<span class="star">★</span>' : ''}${it.review ? '<span class="tag rev">复</span>' : ''}</div>`;
  const choices = it.choices
    ? `<div class="choices">${it.choices.map(c => `<label class="ch"><input type="radio" name="q${it.no}" disabled><b>${c[0]}</b> ${esc(c[1])}</label>`).join('')}</div>`
    : '';

  const writeArea = `<div class="word-write-area">
    <div class="line-write"><span class="lbl">算式：</span><span class="work-line"></span></div>
    <div class="line-write"><span class="lbl">答：</span><span class="work-ans-paren">（&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;）</span></div>
  </div>`;

  return `<div class="witem fam-${it.fam}" data-no="${it.no}" data-topic="${esc(it.topicId)}" data-fam="${esc(it.fam)}" data-speak="${esc(it.prompt)}">
  ${line}${choices}
  <div class="witem-body">${bar}${writeArea}</div>
  ${cfg.showAnswer ? `<div class="sans">参考：${esc(it.work || it.answer)}</div>` : ''}
</div>`;
}

/* 新题型第一次出现时的例题（worked example，之后自动撤掉） */
const EXAMPLE_TEXT = {
  miss: '例：（　）＋ 4 ＝ 7。想：4 和几合成 7？4 和 3 合成 7，所以括号里填 3。',
  equiv: '例：3 ＋ 5 ＝（　）＋ 4。先算左边 3 ＋ 5 ＝ 8；再想 4 和几合成 8？是 4，所以括号里填 4。',
  'cmp-expr': '例：4 ＋ 3  ○  2 ＋ 6。两边都算出来：7 和 8，7 比 8 小，填 ＜。',
  maxfill: '例：（　）＋ 6 ＜ 10。6 和 4 合成 10，要「小于」10 就只能填比 4 小的数，最大填 3。',
  bond: '例：7 可以分成 3 和（　）。想：3 和几合成 7？是 4。',
  'w-extra': '例：铅笔有 5 支。橡皮有 3 块。铅笔又添上 2 支，铅笔有几支？——问的是铅笔，橡皮那句用不上，划掉。',
  'w-2step': '例：有 4 个，拿来 3 个，又送出 2 个。先算 4 ＋ 3 ＝ 7，再算 7 － 2 ＝ 5。',
  'w-ask': '例：苹果 6 个，梨 2 个，算式是 6 － 2。减号比的是「差多少」，所以选「苹果比梨多几个」。',
  'w-same': '例：哥哥 8 张，弟弟 4 张。先算差 8 － 4 ＝ 4 张，把多的这 4 张平分，给 2 张就一样多。',
  'w-tell': '例：算式 7 － 3 ＝ 4，可以说：盘里原来有 7 个桃，吃了 3 个，还剩 4 个。',
};

function renderSheet(sheet, cfg, meta) {
  const flu = sheet.flu, th = sheet.think, p2 = sheet.word;
  let out = sheetHeader(cfg, meta);

  out += `<div class="goal">${esc(cfgGoal(cfg))}</div>`;

  if (flu.length) {
    out += `<h3 class="sec">一、口算 <small>直接写得数</small></h3><div class="grid cols-${cfg.cols}">`
      + flu.map(i => itemCell(i, cfg)).join('') + '</div>';
  }
  if (th.length) {
    const exs = [...new Set(th.filter(i => i.example).map(i => i.fam))].slice(0, 1);
    out += `<h3 class="sec">二、变式 <small>★ 要动脑筋</small></h3>`
      + exs.map(f => EXAMPLE_TEXT[f] ? `<div class="explain">${esc(EXAMPLE_TEXT[f])}</div>` : '').join('')
      + `<div class="grid cols-${cfg.cols}">`
      + th.map(i => itemCell(i, cfg)).join('') + '</div>';
  }

  const stats = sheetStats(sheet);
  out += `<div class="sheet-foot">${esc(stats)}</div>`;
  if (!p2.length) return { page1: out, page2: '' };

  let out2 = `<div class="sheet-head"><div class="title">${esc(meta.title)} · 第 2 页</div>
    <div class="sub">${esc(READ_LADDER[cfg.readStep - 1][1])}</div></div>`;
  if (cfg.showWordCard) {
    const words = pickCardWords(p2);
    out2 += `<div class="wordcard"><b>今日词卡</b>（先说一遍这个词在故事里是什么意思）：`
      + words.map(w => `<span class="wc"><b>${esc(w[0])}</b><i>${esc(w[1])}</i></span>`).join('') + '</div>';
  }
  out2 += `<h3 class="sec">三、读题解决问题 <small>读两遍：第一遍圈数字，第二遍说变多还是变少</small></h3>
  <div class="readsteps">${READ_STEPS.map(s => `<span><b>${s[0]}</b>${esc(s[1])}</span>`).join('')}</div>
  <div class="wordlist">` + p2.map(i => wordItem(i, cfg)).join('') + '</div>';
  return { page1: out, page2: out2 };
}

/* ---------- 读题识字卡（可打印第 3 页） ----------
   每天开场 1 分钟指读；读对打勾，连 3 天全对的词算「熟字」。
   词序：今天卷面上出现过的排前面，其余按牌库顺序补满 12 个。 */
function todayZiWords(wordItems) {
  const text = wordItems.map(i => i.prompt || '').join('');
  const hit = ZI_DECK.filter(d => text.includes(d.w.replace('…', '')));
  const rest = ZI_DECK.filter(d => !text.includes(d.w.replace('…', '')));
  return hit.concat(rest).slice(0, 12);
}

function ziCardHtml(deck) {
  return deck.map(d => `<div class="zcard">
    <div class="zw"><ruby>${esc(d.w)}<rt>${esc(d.py)}</rt></ruby></div>
    <div class="zs">${esc(d.s)}</div>
    <div class="zt">读对打勾<span class="tick"></span><span class="tick"></span><span class="tick"></span></div>
  </div>`).join('');
}

function renderZiCardPage(sheet, cfg) {
  if (cfg.showZiCard === false) return '';
  const wd = sheet.items.filter(i => i.sec === 'word');
  const deck = todayZiWords(wd);
  return `<div class="sheet-head"><div class="title">读题识字卡<span class="fill">共 ${deck.length} 词 · 每天 1 分钟</span></div>
  <div class="sub">这些词全部来自孩子自己的口算卷。用法：孩子手指着，把词和例句读一遍；读对就在格子里打一个勾，连着 3 天全对这个词就算「熟字」——熟一个划一个，几周后应用题就能基本自己读。</div></div>
  <div class="zgrid">${ziCardHtml(deck)}</div>
  <div class="zquant">量词顺口念：一只鸟 · 一支笔 · 一朵花 · 一颗糖 · 一辆车 · 一本书 · 一块饼干 · 一张卡片</div>
  <div class="zfoot">这页可剪成 12 张卡片贴在书桌前，或夹进口算文件夹每天过一遍。先认熟这几十个字，读题就不卡了。</div>`;
}

function cfgGoal(cfg) {
  const mins = Math.round(cfg.count / 9);
  return `🎯 目标 ${cfg.count} 题，约 ${mins} 分钟 · 课标参考口径：20 以内口算 8–10 题/分 · 家庭自选练习，做累了可分次完成`;
}

function pickCardWords(wordItems) {
  const hit = new Set();
  wordItems.forEach(it => (it.kw || []).forEach(k => hit.add(k)));
  const out = WORD_CARD.filter(w => hit.has(w[0].split('…')[0]) || [...w[0]].some(ch => hit.has(ch)));
  const base = out.length >= 3 ? out : WORD_CARD.slice(0, 5);
  return base.slice(0, 6);
}

function sheetStats(sheet) {
  const t = {};
  sheet.items.forEach(i => t[i.fam] = (t[i.fam] || 0) + 1);
  const refr = sheet.items.filter(i => i.refresher).length;
  const rev = sheet.items.filter(i => i.review).length;
  const hard = sheet.items.filter(i => i.think === 2).length;
  return `本卷 ${sheet.items.length} 题｜回炉 ${refr}｜复习 ${rev}｜★思维 ${hard}｜题型 ${Object.keys(t).length} 种`
    + (makeOne.errors ? `｜引擎告警 ${makeOne.errors.length}` : '');
}

function renderAnswerKey(sheet, cfg) {
  const rows = sheet.items.map(it => {
    const topic = G.name(it.topicId);
    const t = it.sec === 'word' ? '读题' : it.sec === 'think' ? '思维' : '口算';
    return `<tr><td>${it.no}</td><td>${esc(it.prompt)}</td><td class="ak">${esc(it.answer)}</td><td>${esc(it.work || '')}</td><td>${t}</td><td class="tp">${esc(topic)}</td></tr>`;
  }).join('');
  return `<div class="keypage"><h3>答案与讲评</h3>
<p class="tip">讲评时问「你是怎么算的」比问「错在哪」有效：让孩子复述一遍算法，比改正这道题更能迁移。</p>
<table class="key"><thead><tr><th>号</th><th>题目</th><th>答案</th><th>过程</th><th>区</th><th>知识点</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* 读题专页：把今天的 3 道应用题放大、全篇注音，专门练读 */
function renderReadingPage(sheet, cfg) {
  const wd = sheet.items.filter(i => i.sec === 'word');
  if (!wd.length) return '<p class="empty">今天卷面上没有应用题，把「读题区」比例调上去就会出。</p>';
  return `<div class="readingpage">
  <h3>读题练习（今天卷面上的 ${wd.length} 道）</h3>
  <h4 class="zsub">先过一遍今天的词（和第 3 页识字卡是同一批）</h4>
  <div class="zgrid screen">${ziCardHtml(todayZiWords(wd))}</div>
  <p class="rule">方法：<b>指读</b>——手指着字一个个读，读完第一遍圈数字，读完第二遍画方块图，第三遍说「变多还是变少」。</p>
  ${wd.map(it => `<div class="ritem" data-speak="${esc(it.prompt)}">
    <div class="rtext">${annotate(it.prompt, 'full')}</div>
    <div class="rrow">${barSvg(it, { w: 300 })}
      <div class="rask">
        <label>已知：<input class="fillin" placeholder=""></label>
        <label>问的是：<input class="fillin" placeholder=""></label>
        <label>变多还是变少：<input class="fillin short" placeholder=""></label>
        <label>算式：<input class="fillin short" placeholder=""></label>
      </div></div>
    <button class="speak no-print" type="button">朗读</button>
    <div class="rans">答案 ${esc(it.answer)}　过程 ${esc(it.work || '')}</div>
  </div>`).join('')}
</div>`;
}
