// 天天口算 · 界面装配与交互引擎
// 专为上海嘉定华五小学一年级学生（妮妮）打造
'use strict';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

let cfg = loadCfg();
let sheet = null;
let currentGradeFilter = '1-up'; // 默认：一年级上册 (解决需求 2)

const PRESETS = [
  ['现在：10 以内加减法', ['cnm_p010', 'cnm_p011', 'cnm_p012', 'cnm_p013']],
  ['打基础：分与合 + 5 以内', ['cnm_p004', 'cnm_p006', 'cnm_p007', 'cnm_p010']],
  ['下一站：20 以内进位加', ['cnm_p019', 'cnm_p020', 'cnm_p021', 'cnm_p251']],
  ['再下一站：20 以内退位减', ['cnm_p025', 'cnm_p026', 'cnm_p027']],
  ['稳了：加到 100 以内', ['cnm_p030', 'cnm_p031', 'cnm_p032']],
  ['应用题专练（读题突破）', ['cnm_p253', 'cnm_p256', 'cnm_p035', 'cnm_p217', 'cnm_p218']],
];

/* ---------- 侧栏与控件初始化 ---------- */
function syncFontPtButtons(pt) {
  $$('.btn-preset, .btn-font-pt').forEach(btn => {
    btn.classList.toggle('active', Math.abs(parseFloat(btn.dataset.pt) - parseFloat(pt)) < 0.1);
  });
}

function buildControls() {
  $('#count').value = cfg.count;
  $('#level').value = String(cfg.level);
  $('#flu').value = Math.round(cfg.fluencyMix * 100);
  $('#th').value = Math.round(cfg.thinkMix * 100);
  $('#wd').value = Math.round(cfg.wordMix * 100);
  $('#cdSig').value = cfg.cooldownSig;
  $('#cdFact').value = cfg.cooldownFact;
  $('#cols').value = cfg.cols || 4;
  $('#fontPt').value = cfg.fontPt || 14.5;
  syncFontPtButtons(cfg.fontPt || 14.5);
  $('#gap').value = cfg.gap;
  $('#strictDedup').checked = !!cfg.strictDedup;
  $('#showAnswer').checked = !!cfg.showAnswer;
  $('#showBar').checked = cfg.showBar !== false;
  $('#showWordCard').checked = cfg.showWordCard !== false;
  $('#showZiCard').checked = cfg.showZiCard !== false;
  $('#fluOnly').checked = !!cfg.fluOnly;
  $('#skipWord').checked = !!cfg.skipWord;
  cfg.skipBond = cfg.skipBond !== false;
  $('#skipBond').checked = cfg.skipBond;
  $('#annotate').value = cfg.annotate || 'full';
  $('#adaptiveErrors').checked = cfg.adaptiveErrors !== false;

  // 运算项数与连加连减选项 (解决需求 6)
  if (!cfg.terms) cfg.terms = { allow2: true, allow3: true, allow4: false };
  if (!cfg.chainForms) cfg.chainForms = { add: true, sub: true, mix: true };
  $('#allow2').checked = cfg.terms.allow2 !== false;
  $('#allow3').checked = cfg.terms.allow3 !== false;
  $('#allow4').checked = !!cfg.terms.allow4;
  $('#chainAdd').checked = cfg.chainForms.add !== false;
  $('#chainSub').checked = cfg.chainForms.sub !== false;
  $('#chainMix').checked = cfg.chainForms.mix !== false;

  syncModeUI();

  // 预设按钮
  $('#presets').innerHTML = PRESETS.map((p, i) => `<button class="preset" data-i="${i}">${esc(p[0])}</button>`).join('');
  $('#presets').onclick = e => {
    const b = e.target.closest('.preset'); if (!b) return;
    cfg.targets = [...PRESETS[+b.dataset.i][1]];
    // 自动切换到该预设对应的学期标签
    const firstT = G.byId.get(cfg.targets[0]);
    if (firstT) {
      currentGradeFilter = firstT.grade === 1 ? (firstT.term === '下' ? '1-down' : '1-up') : '2';
      $$('.grade-tab').forEach(t => t.classList.toggle('on', t.dataset.g === currentGradeFilter));
    }
    saveCfg(cfg); renderTopicList(); generate();
  };

  // 年级学期分类切换 (解决需求 2)
  $('#gradeTabs').onclick = e => {
    const b = e.target.closest('.grade-tab'); if (!b) return;
    currentGradeFilter = b.dataset.g;
    $$('.grade-tab').forEach(t => t.classList.toggle('on', t === b));
    renderTopicList();
  };

  renderTopicList();
  updateNiniProfileUI();
}

/* ---------- 知识点列表：严格按课本教学顺序排列 (解决需求 2) ---------- */
function renderTopicList() {
  const filtered = G.topics.filter(t => {
    if (currentGradeFilter === 'all') return true;
    if (currentGradeFilter === '1-up') return t.grade === 1 && t.term === '上';
    if (currentGradeFilter === '1-down') return t.grade === 1 && t.term === '下';
    if (currentGradeFilter === '2') return t.grade === 2;
    return true;
  });

  const groups = {};
  filtered.forEach(t => {
    const unitTitle = (t.huj && t.huj.unit) || t.chapter || '其他单元';
    const k = `${t.grade}年级${t.term}册 · ${unitTitle}`;
    (groups[k] || (groups[k] = [])).push(t);
  });

  // 按 G.order 排序各单元分组
  const keys = Object.keys(groups).sort((a, b) => G.order(groups[a][0].id, groups[b][0].id));

  $('#topicList').innerHTML = keys.length ? keys.map(k => `<div class="tgroup">
    <div class="tgh">${esc(k)}</div>
    ${groups[k].sort((a, b) => G.order(a.id, b.id)).map(t => {
      const on = cfg.targets.includes(t.id);
      const spec = specOf(t.id);
      return `<label class="trow${on ? ' on' : ''}" title="${esc(t.desc || '')}\n掌握标准：${esc((t.mastery || []).join('；'))}">
      <input type="checkbox" data-id="${t.id}"${on ? ' checked' : ''}>
      <span class="tn">${esc(t.name)}</span>
      <span class="tmeta">L${spec.lim}${spec.chain ? ' 连' : ''}${spec.bond ? ' 分合' : ''}</span>
    </label>`;
    }).join('')}
  </div>`).join('') : '<p class="dim" style="padding:10px 0;text-align:center">该学期分类下暂无知识点</p>';

  $('#topicList').onchange = e => {
    const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
    const id = cb.dataset.id;
    cfg.targets = cb.checked ? [...new Set(cfg.targets.concat(id))] : cfg.targets.filter(x => x !== id);
    saveCfg(cfg); renderTopicList(); generate();
  };
}

/* ---------- 妮妮专属档案与错题状态同步 (解决需求 5) ---------- */
function updateNiniProfileUI() {
  const prof = getNiniProfile();
  const errors = getNiniErrors().filter(e => !e.resolved);

  $('#statStreak').textContent = `${prof.streak || 0} 天`;
  $('#statStars').textContent = `${prof.stars || 0} 颗`;
  $('#statErrors').textContent = `${errors.length} 道`;

  // 导航栏角标
  const badge = $('#errorBadge');
  if (badge) {
    badge.textContent = String(errors.length);
    badge.style.display = errors.length > 0 ? 'inline-block' : 'none';
  }
  const unres = $('#unresolvedCount');
  if (unres) unres.textContent = String(errors.length);

  // 成长足迹页面数据
  if ($('#pSheets')) $('#pSheets').textContent = `${prof.totalSheets || 0} 张`;
  if ($('#pQuestions')) $('#pQuestions').textContent = `${prof.totalQuestions || 0} 题`;
  if ($('#pAccuracy')) {
    const acc = prof.totalQuestions ? Math.round((prof.totalCorrect / prof.totalQuestions) * 100) : 100;
    $('#pAccuracy').textContent = `${acc}%`;
  }
  if ($('#pStars')) $('#pStars').textContent = `${prof.stars || 0} 颗 ⭐`;

  renderErrorList();
  renderHistoryList();
}

/* ---------- 试卷生成 ---------- */
function generate(forceSeed) {
  if (!cfg.targets.length) {
    $('#paper').innerHTML = '<p class="empty">请先在左侧勾选妮妮今天要练习的知识点。</p>';
    return;
  }
  const L = loadLedger();
  R.seed(hashStr((forceSeed || '') + todayKey() + '-' + Math.random().toFixed(6) + '-' + cfg.targets.join(',')));
  cfg.errorPaperMode = false;
  sheet = buildSheet(cfg, L);
  saveLedger(L);
  paint();
  refreshStats();
}

// 生成错题专练卷
function generateErrorPaper() {
  const errors = getNiniErrors().filter(e => !e.resolved);
  if (!errors.length) {
    alert('🎉 妮妮太棒了！当前错题本里没有待攻克的错题！');
    return;
  }
  const L = loadLedger();
  cfg.errorPaperMode = true;
  sheet = buildErrorSheet(cfg, L);
  paint('妮妮错题专项攻克提分卷');
  refreshStats();
  // 切换到试卷标签
  switchTab('paper');
}

function paint(customTitle) {
  const meta = {
    title: customTitle || `${G.name(cfg.targets[0])} 天天练`,
    sub: cfg.targets.map(id => G.name(id)).join(' ＋ ') + `　｜　${G.place(cfg.targets[0])}`,
  };
  const rendered = renderSheet(sheet, cfg, meta);
  const zi = renderZiCardPage(sheet, cfg);
  const key = cfg.showAnswer ? '' : renderAnswerKey(sheet, cfg);
  const st = `style="--cols:${cfg.cols || 4};--font-pt:${cfg.fontPt || 14.5};font-size:${cfg.fontPt || 14.5}pt"`;

  let html = `<section class="flow" ${st}>${rendered.page1}</section>`;
  if (rendered.page2) html += `<section class="flow p2head" ${st}>${rendered.page2}</section>`;
  if (zi) html += `<section class="flow p2head" ${st}>${zi}</section>`;
  if (key) html += `<section class="flow keywrap no-print" ${st}>${key}</section>`;
  $('#paper').innerHTML = html;
  if (window.__ksShowTags === false) {
    $('#paper').classList.add('hide-tags');
  }
  const btnQuickAns = $('#btnQuickAns');
  if (btnQuickAns) {
    btnQuickAns.classList.toggle('active', !!cfg.showAnswer);
    btnQuickAns.textContent = cfg.showAnswer ? '👀 参考答案: 显示' : '👀 参考答案: 隐藏';
  }
  syncModeUI();
  $('#readingPane').innerHTML = renderReadingPage(sheet, cfg);
  bindPaper();
  // 渲染纸面右上角手机扫码极速批改二维码
  renderQRCodes();
  // 同步当前活跃试卷至云端与本地存储，供手机端极速批改
  syncCurrentSheet(sheet, cfg, meta);

  // 计算排版高度与打印页数评估 (排除仅在屏幕显示的家长讲评答案页)
  const printFlows = $$('#paper .flow').filter(f => !f.classList.contains('no-print'));
  const pages = printFlows.length || 1;
  const h = printFlows.reduce((a, f) => a + f.getBoundingClientRect().height, 0);
  const badge = $('#previewBadge');
  if (badge) {
    badge.textContent = pages === 1 ? `A4 1页满卷 · ${sheet.items.length} 题` : `A4 打印约 ${pages} 页`;
  }
  $('#pageInfo').textContent = `排版高度 ${(h / 96 * 25.4).toFixed(0)}mm → 打印约 ${pages} 页 A4`;
  if (pages > 1) {
    const one = `<button id="btnOnePage" type="button" style="margin-left:8px">自动压入 1 页（48 题满页）</button>`;
    $('#pageInfo').insertAdjacentHTML('beforeend', one);
    const b = $('#btnOnePage');
    if (b) b.onclick = () => setOnePage48Mode();
  }

  updateGradeSummary();
}

function setOnePage48Mode() {
  cfg.count = 48;
  cfg.fontPt = 14.5;
  cfg.skipWord = true;
  cfg.skipBond = true;
  cfg.showZiCard = false;
  cfg.cols = 4;
  $('#fontPt').value = 14.5;
  $('#count').value = 48;
  $('#skipWord').checked = true;
  if ($('#skipBond')) $('#skipBond').checked = true;
  $('#showZiCard').checked = false;
  syncFontPtButtons(14.5);
  saveCfg(cfg);
  buildControls();
  generate();
}

function updateGradeSummary() {
  if (!sheet || !sheet.items) return;
  const total = sheet.items.length;
  const wrong = $$('#paper .bad').length;
  const score = Math.max(0, Math.round((total - wrong) / total * 100));
  const elTotal = $('#gradeTotal');
  const elWrong = $('#wrongCount');
  const elScore = $('#scoreDisplay');
  if (elTotal) elTotal.textContent = String(total);
  if (elWrong) elWrong.textContent = String(wrong);
  if (elScore) {
    elScore.textContent = String(score);
    elScore.className = score === 100 ? 'text-success' : score >= 90 ? 'text-primary' : 'text-danger';
  }
}

let cachedQrSvg = '';
async function getGradeQrSvg() {
  if (cachedQrSvg) return cachedQrSvg;
  if (typeof QRCode !== 'undefined') {
    const url = window.location.origin + '/grade.html';
    try {
      cachedQrSvg = await QRCode.toString(url, { type: 'svg', margin: 0, width: 48 });
    } catch (_) {}
  }
  return cachedQrSvg;
}

function renderQRCodes() {
  getGradeQrSvg().then(svg => {
    if (svg) {
      $$('.sheet-qr-canvas').forEach(el => { el.innerHTML = svg; });
    }
  });
}

function syncCurrentSheet(sh, c, meta) {
  if (!sh || !sh.items || !sh.items.length) return;
  const payload = {
    sheetId: 'sheet_' + Date.now(),
    title: meta ? meta.title : '10以内的加减法 天天练',
    childName: c.childName || '妮妮',
    schoolName: c.schoolName || '上海嘉定华五小学（徐行镇）',
    count: sh.items.length,
    createdAt: new Date().toISOString(),
    items: sh.items.map(it => ({
      no: it.no,
      prompt: it.prompt,
      answer: String(it.answer),
      fam: it.fam,
      topicId: it.topicId,
      factKey: it.factKey || ''
    }))
  };
  Cloud.syncSheet(payload);
}

function bindPaper() {
  $$('#paper .speak').forEach(b => b.onclick = () => Speak.on(b.parentElement.dataset.speak || ''));
  $$('#paper [data-speak]').forEach(el => el.ondblclick = () => Speak.on(el.dataset.speak));

  // 在线批改：默认全部正确，点一下红色是错，再点一下取消！
  $$('#paper .item, #paper .witem').forEach(el => {
    el.onclick = e => {
      if (e.target.closest('input')) return;
      el.classList.toggle('bad');
      updateGradeSummary();
    };
  });
}

/* ---------- 统计与图谱联动 ---------- */
function refreshStats() {
  const prof = Store.get(PROF_KEY, {}), L = loadLedger();
  const days = Object.keys(L.days).length;
  const total = Object.values(L.days).reduce((a, b) => a + b, 0);
  $('#statLine').innerHTML = `妮妮累计已练 ${total} 题 · ${days} 张试卷 · 知识库 ${Object.keys(L.sig).length} 条出题记录`;

  const rows = G.topics.filter(t => prof[t.id]).sort((a, b) => prof[b.id].seen - prof[a.id].seen).slice(0, 14);
  $('#mastery').innerHTML = rows.length ? rows.map(t => {
    const m = prof[t.id];
    const pct = Math.round(m.acc * 100);
    return `<div class="mrow"><span class="mn">${esc(t.name)}</span>
    <span class="mbar"><i style="width:${pct}%"></i></span>
    <span class="mv">${pct}% (${m.right}/${m.seen})</span>
    ${m.seen >= 12 && m.acc >= 0.9 ? '<span class="badge ok">已达标</span>' : m.seen >= 4 && m.acc < 0.6 ? '<span class="badge warn">需回溯</span>' : ''}</div>`;
  }).join('') : '<p class="dim">批改几份试卷后，这里会自动分析妮妮在每个知识点的掌握度。</p>';

  const ns = nextStep(cfg);
  $('#advice').innerHTML = ns
    ? `<b>${esc(ns.done.join('、'))}</b> 已达标，知识图谱推荐下一步：` + ns.next.map(n => `<span class="chip">${esc(n.name)}<i>${esc(n.place)}</i></span>`).join('')
    : '<span class="dim">当前目标练习达标后（样本≥12题，正确率≥90%），图谱会自动给出下一步拓展建议。</span>';

  const warn = [];
  for (const id of cfg.targets) {
    const m = prof[id];
    if (m && m.seen >= 4 && m.acc < 0.6) {
      warn.push(`<div class="bk"><b>${esc(G.name(id))}</b> 正确率 ${Math.round(m.acc * 100)}% → 沿先修边回溯：` +
        backtrack(id).map(x => `${esc(x.name)}${x.strength ? `<i>(${x.strength === 'hard' ? '硬先修' : '软先修'})</i>` : ''}`).join(' ← ') + '</div>');
    }
  }
  $('#backtrack').innerHTML = warn.join('') || '<span class="dim">某个知识点正确率掉到 60% 以下时，图谱会沿着先修依赖链列出回溯补课路径。</span>';
}

/* ---------- 错题本列表渲染与消灭错题 (满足需求 5) ---------- */
function renderErrorList() {
  const container = $('#errorListContainer');
  if (!container) return;
  const errors = getNiniErrors();
  const active = errors.filter(e => !e.resolved);

  if (!active.length) {
    container.innerHTML = '<p class="empty" style="grid-column:1/-1">🎉 妮妮太棒了！当前没有待攻克的错题！</p>';
    return;
  }

  container.innerHTML = active.map(e => `
    <div class="error-card" data-eid="${e.id}">
      <div class="error-card-top">
        <span class="error-cause-badge">${esc(e.cause || '待分析')}</span>
        <span class="error-date">${e.date}</span>
      </div>
      <div class="error-prompt">${esc(e.prompt)}</div>
      <div class="error-ans">正确答案：${esc(e.answer)}</div>
      <div class="error-actions">
        <button class="primary btn-resolve" type="button" data-eid="${e.id}">💪 重新攻克</button>
      </div>
    </div>
  `).join('');

  container.querySelectorAll('.btn-resolve').forEach(b => {
    b.onclick = () => {
      const eid = b.dataset.eid;
      const err = errors.find(x => x.id === eid);
      if (!err) return;
      const input = prompt(`请妮妮作答：\n${err.prompt}`, '');
      if (input == null) return;
      if (input.trim() === String(err.answer).trim()) {
        alert('🌟 太棒啦！妮妮答对了，成功消灭这道错题！');
        resolveNiniError(eid);
        updateNiniProfileUI();
      } else {
        alert(`回答不对哦，正确答案是 ${err.answer}，继续加油！`);
      }
    };
  });
}

/* ---------- 历史练习记录渲染 ---------- */
function renderHistoryList() {
  const container = $('#historyList');
  if (!container) return;
  const history = getNiniHistory();
  if (!history.length) {
    container.innerHTML = '<p class="dim">完成并提交今日批改后，历史打卡成绩将展示在这里。</p>';
    return;
  }
  container.innerHTML = history.slice(0, 10).map(h => `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f8fafc;border-radius:8px;margin-bottom:6px;font-size:13px">
      <div>
        <b>${h.date}</b> <span style="color:#64748b;margin-left:6px">${h.timeStr || ''}</span>
        <span style="margin-left:12px">对 ${h.correct}/${h.total} 题</span>
      </div>
      <div>
        <span style="font-weight:700;color:${h.accuracy >= 0.9 ? 'var(--success)' : 'var(--warn)'}">
          ${Math.round(h.accuracy * 100)}%
        </span>
        <span style="margin-left:8px;color:#f59e0b">${'⭐'.repeat(h.stars || 1)}</span>
      </div>
    </div>
  `).join('');
}

/* ---------- 批改结算与星星奖励弹窗 (满足需求：默认正确，红标为错) ---------- */
function finishGrading() {
  if (!sheet || !sheet.items.length) {
    alert('请先生成试卷！');
    return;
  }
  const total = sheet.items.length;
  const badNos = new Set($$('#paper .bad').map(el => el.dataset.no));
  const wrong = badNos.size;
  const correct = total - wrong;
  const accuracy = correct / total;

  // 记录错题与掌握度：标红的记为错题，其余默认正确
  sheet.items.forEach(it => {
    if (badNos.has(String(it.no))) {
      recordNiniError(it, '错题');
      recordResult(it.topicId, false);
    } else {
      recordResult(it.topicId, true);
    }
  });

  let mins = prompt('本次练习妮妮用时几分钟？', '6');
  mins = mins ? parseInt(mins, 10) || 6 : 6;

  const result = recordPracticeSession({
    total, correct, wrong, accuracy, durationMinutes: mins, targets: cfg.targets
  });

  // 弹窗激励
  $('#modalStars').textContent = '⭐'.repeat(result.earnedStars);
  if (accuracy >= 1.0) {
    $('#modalTitle').textContent = '🏆 满分！妮妮太棒了！';
    $('#modalMsg').textContent = `妮妮以满分完成了全部 ${total} 道题，用时 ${mins} 分钟！获得 3 颗闪耀小星星！`;
  } else if (accuracy >= 0.9) {
    $('#modalTitle').textContent = '🌟 优秀！妮妮思维敏捷！';
    $('#modalMsg').textContent = `完成了 ${total} 题，做对 ${correct} 题，正确率 ${Math.round(accuracy * 100)}%！错题已录入错题本，明天优先强化！`;
  } else {
    $('#modalTitle').textContent = '💪 妮妮加油，每天都在进步！';
    $('#modalMsg').textContent = `完成了 ${total} 题，做对 ${correct} 题。有 ${wrong} 道题已自动加入专属错题本，明天智能针对回炉！`;
  }

  $('#modalReward').style.display = 'flex';
  refreshStats();
  updateNiniProfileUI();
}

/* ---------- 知识图谱视图 ---------- */
function renderGraphView() {
  const sel = cfg.targets;
  const nodes = new Set(sel);
  sel.forEach(id => G.prereqs(id, 3).forEach(p => nodes.add(p.id)));
  const list = [...nodes].filter(id => G.byId.get(id));
  const edges = KG.deps.filter(d => nodes.has(d.from) && nodes.has(d.to));
  const byGrade = {};
  list.forEach(id => { const t = G.byId.get(id); (byGrade[t.grade] || (byGrade[t.grade] = [])).push(id); });
  const grades = Object.keys(byGrade).sort();
  const colW = 160, rowH = 34, padX = 20, padY = 40;
  let maxRows = 0; grades.forEach(g => maxRows = Math.max(maxRows, byGrade[g].length));
  const pos = {};
  grades.forEach((g, gi) => byGrade[g].forEach((id, ii) => pos[id] = { x: padX + gi * colW, y: padY + ii * rowH }));
  const W = padX * 2 + grades.length * colW, H = padY + maxRows * rowH + 20;

  const eSvg = edges.map(e => {
    const a = pos[e.from], b = pos[e.to]; if (!a || !b) return '';
    return `<line x1="${a.x + 65}" y1="${a.y + 10}" x2="${b.x + 65}" y2="${b.y + 10}"
      stroke="${e.s === 'hard' ? '#ef4444' : '#cbd5e1'}" stroke-width="${e.s === 'hard' ? 1.8 : 1}" ${e.s === 'hard' ? '' : 'stroke-dasharray="3 3"'}/>`;
  }).join('');

  const nSvg = list.map(id => {
    const p = pos[id], t = G.byId.get(id), main = sel.includes(id);
    return `<g class="gn${main ? ' main' : ''}" transform="translate(${p.x},${p.y})" data-id="${id}">
      <rect width="130" height="22" rx="6" fill="${main ? '#2563eb' : '#f1f5f9'}" stroke="${main ? '#1d4ed8' : '#cbd5e1'}"/>
      <text x="8" y="15" font-size="11" fill="${main ? '#fff' : '#1e293b'}" font-weight="600">${esc(t.name.slice(0, 9))}</text></g>`;
  }).join('');

  const gLabels = grades.map((g, gi) => `<text x="${padX + gi * colW}" y="20" font-size="12" font-weight="700" fill="#475569">${g} 年级</text>`).join('');
  $('#graphSvg').innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">${eSvg}${nSvg}${gLabels}</svg>`;

  $('#graphSvg').onclick = e => {
    const g = e.target.closest('.gn'); if (!g) return;
    const id = g.dataset.id, t = G.byId.get(id);
    $('#graphDetail').innerHTML = `<b>${esc(t.name)}</b>
    <div class="kv">教材落点：${esc(G.place(id))}</div>
    <div class="kv">阶段分类：${esc(G.termName(t))} · L${specOf(id).lim}${specOf(id).chain ? '（含连加连减）' : ''}${specOf(id).bond ? '（含分与合）' : ''}</div>
    <div class="kv">${esc(t.desc || '')}</div>
    <div class="kv">掌握标准：${(t.mastery || []).map(esc).join('；')}</div>
    <div class="kv">硬先修（基础）：${(G.parents.get(id) || []).filter(p => p.strength === 'hard').map(p => esc(G.name(p.id))).join('、') || '—'}</div>
    <div class="kv">后续能学：${(G.children.get(id) || []).map(p => esc(G.name(p.id))).join('、') || '—'}</div>`;
  };
  const hit = coverage(sheet ? sheet.items : []);
  $('#pyCov').textContent = hit.length ? `注音表还缺 ${hit.length} 个生字：${hit.slice(0, 15).join(' ')}` : '注音表已完整覆盖今天全部用字';
}

/* ---------- 控件绑定 ---------- */
function bindNumber(sel, key, parse = Number) {
  $(sel).oninput = e => { cfg[key] = parse(e.target.value); saveCfg(cfg); debouncedGen(); };
}
let genTimer;
function debouncedGen() { clearTimeout(genTimer); genTimer = setTimeout(() => generate(), 220); }

function syncModeUI() {
  const fluOnly = !!cfg.fluOnly, noWord = fluOnly || !!cfg.skipWord;
  ['#flu', '#th', '#wd'].forEach(s => { $(s).disabled = fluOnly; });
  if (fluOnly) { $('#mixPct').textContent = `只出口算 ${cfg.count} 题`; return; }
  const s = (cfg.fluencyMix + cfg.thinkMix) || 1;
  const f = Math.round(cfg.count * (noWord ? cfg.fluencyMix / s : cfg.fluencyMix));
  const t = Math.round(cfg.count * (noWord ? cfg.thinkMix / s : cfg.thinkMix));
  const w = noWord ? 0 : Math.max(0, cfg.count - f - t);
  $('#mixPct').textContent = `${f} / ${t} / ${w}` + (noWord ? '（不出读题）' : '');
}

function switchTab(tabName) {
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tabName));
  $$('.tabpane').forEach(p => p.classList.toggle('on', p.id === 'pane-' + tabName));
  if (tabName === 'graph') renderGraphView();
  if (tabName === 'progress') refreshStats();
  if (tabName === 'errors') renderErrorList();
}

function init() {
  G.init();
  buildControls();

  bindNumber('#count', 'count');
  bindNumber('#level', 'level');
  $('#flu').oninput = e => { cfg.fluencyMix = e.target.value / 100; autoBalance(); };
  $('#th').oninput = e => { cfg.thinkMix = e.target.value / 100; autoBalance(); };
  $('#wd').oninput = e => { cfg.wordMix = e.target.value / 100; autoBalance(); };
  bindNumber('#cdSig', 'cooldownSig');
  bindNumber('#cdFact', 'cooldownFact');
  bindNumber('#cols', 'cols');
  bindNumber('#fontPt', 'fontPt');
  $('#gap').onchange = e => { cfg.gap = e.target.value; saveCfg(cfg); paint(); };
  $('#annotate').onchange = e => { cfg.annotate = e.target.value; saveCfg(cfg); paint(); };

  ['strictDedup', 'showAnswer', 'showBar', 'showWordCard', 'showZiCard', 'showExample', 'autoPrereq', 'fluOnly', 'skipWord', 'skipBond', 'adaptiveErrors'].forEach(k => {
    $('#' + k).onchange = e => { cfg[k] = e.target.checked; saveCfg(cfg); generate(); };
  });

  // 项数与连加连减绑定 (解决需求 6)
  ['allow2', 'allow3', 'allow4'].forEach(k => {
    $('#' + k).onchange = e => {
      cfg.terms[k] = e.target.checked;
      if (!cfg.terms.allow2 && !cfg.terms.allow3 && !cfg.terms.allow4) {
        cfg.terms.allow2 = true;
        $('#allow2').checked = true;
      }
      saveCfg(cfg); generate();
    };
  });
  [['chainAdd', 'add'], ['chainSub', 'sub'], ['chainMix', 'mix']].forEach(([elId, prop]) => {
    $('#' + elId).onchange = e => {
      cfg.chainForms[prop] = e.target.checked;
      saveCfg(cfg); generate();
    };
  });

  bindNumber('#reviewRatio', 'reviewRatio', v => v / 100);
  $('#reviewRatio').addEventListener('input', e => { $('#reviewPct').textContent = e.target.value + '%'; });
  $('#readStep').onchange = e => { cfg.readStep = +e.target.value; saveCfg(cfg); paint(); };
  $('#count').addEventListener('input', () => syncModeUI());

  // 标签页切换
  $$('.tabs button').forEach(b => b.onclick = () => switchTab(b.dataset.tab));

  // 字号快捷按钮与联动
  $$('.btn-preset, .btn-font-pt').forEach(btn => {
    btn.onclick = () => {
      const pt = parseFloat(btn.dataset.pt);
      cfg.fontPt = pt;
      $('#fontPt').value = pt;
      syncFontPtButtons(pt);
      saveCfg(cfg);
      paint();
    };
  });
  $('#fontPt').oninput = e => {
    const pt = parseFloat(e.target.value) || 14.5;
    cfg.fontPt = pt;
    syncFontPtButtons(pt);
    saveCfg(cfg);
    paint();
  };

  // 顶部核心按钮
  $('#btnNew').onclick = () => generate(String(Date.now()));
  $('#btnPrint').onclick = () => window.print();
  const btnQuickPrint = $('#btnQuickPrint');
  if (btnQuickPrint) btnQuickPrint.onclick = () => window.print();

  const btnOne48 = $('#btnOnePage48');
  if (btnOne48) btnOne48.onclick = () => setOnePage48Mode();

  // 网页试卷预览工具栏控制
  window.__ksShowTags = true;
  const btnToggleTags = $('#btnToggleTags');
  if (btnToggleTags) {
    btnToggleTags.onclick = () => {
      window.__ksShowTags = !window.__ksShowTags;
      $('#paper').classList.toggle('hide-tags', !window.__ksShowTags);
      btnToggleTags.classList.toggle('active', window.__ksShowTags);
      btnToggleTags.textContent = window.__ksShowTags ? '🏷️ 标记: 显示' : '🏷️ 标记: 隐藏';
    };
  }

  const btnQuickAns = $('#btnQuickAns');
  if (btnQuickAns) {
    btnQuickAns.onclick = () => {
      cfg.showAnswer = !cfg.showAnswer;
      const chk = $('#showAnswer');
      if (chk) chk.checked = cfg.showAnswer;
      saveCfg(cfg);
      paint();
    };
  }

  $$('.btn-zoom').forEach(btn => {
    btn.onclick = () => {
      $$('.btn-zoom').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const z = btn.dataset.zoom;
      const paper = $('#paper');
      if (!paper) return;
      if (z === '100') {
        paper.style.zoom = '1';
        paper.style.transform = 'none';
      } else if (z === '90') {
        paper.style.zoom = '0.9';
        paper.style.transform = 'none';
      } else if (z === 'fit') {
        const container = $('.paper-preview-container') || paper.parentElement;
        if (container) {
          const avail = container.clientWidth - 28;
          const target = 794;
          const s = Math.min(1, Math.max(0.65, +(avail / target).toFixed(2)));
          paper.style.zoom = String(s);
          paper.style.transform = 'none';
        }
      }
    };
  });

  // 批改操作按钮：全部重置为对 & 提交批改
  const btnResetGrade = $('#btnResetGrade');
  if (btnResetGrade) {
    btnResetGrade.onclick = () => {
      $$('#paper .bad').forEach(el => el.classList.remove('bad'));
      updateGradeSummary();
    };
  }

  $('#btnErrorPaper').onclick = () => generateErrorPaper();
  const btnErr2 = $('#btnGenErrorSheet2');
  if (btnErr2) btnErr2.onclick = () => generateErrorPaper();
  $('#btnOnlineGrade').onclick = () => {
    switchTab('paper');
    const firstCell = $('.grid .item');
    if (firstCell) firstCell.scrollIntoView({ behavior: 'smooth' });
  };
  $('#btnFinishGrading').onclick = () => finishGrading();
  $('#btnCloseModal').onclick = () => { $('#modalReward').style.display = 'none'; };

  // 手机端访问横幅引导
  if (window.innerWidth < 768) {
    const banner = $('#mobileTipBanner');
    if (banner) banner.style.display = 'block';
  }

  // 手机批改扫码弹窗
  const btnShowMobileQr = $('#btnShowMobileQr');
  if (btnShowMobileQr) {
    btnShowMobileQr.onclick = async () => {
      const modal = $('#modalMobileQr');
      if (!modal) return;
      modal.style.display = 'flex';
      const url = window.location.origin + '/grade.html';
      const urlEl = $('#pcQrUrl');
      if (urlEl) urlEl.textContent = url;
      const container = $('#pcQrContainer');
      if (container) {
        const svg = await getGradeQrSvg();
        if (svg) container.innerHTML = svg;
      }
    };
  }
  const btnCloseMobileQr = $('#btnCloseMobileQr');
  if (btnCloseMobileQr) {
    btnCloseMobileQr.onclick = () => {
      const modal = $('#modalMobileQr');
      if (modal) modal.style.display = 'none';
    };
  }

  $('#btnClear').onclick = () => {
    if (!confirm('确定清空本地练习台账与掌握记录？（历史卷将允许重复出现）')) return;
    [LEDGER_KEY, PROF_KEY, HIST_KEY, NINI_ERRORS_KEY, NINI_HISTORY_KEY].forEach(k => localStorage.removeItem(k));
    refreshStats(); updateNiniProfileUI(); generate();
  };

  // 云端同步按钮组 (解决需求 4)
  initCloudUI();

  $('#guideBody').innerHTML = GUIDE;
  generate();
  renderGraphView();
}

function initCloudUI() {
  Cloud.init().then(() => {
    updateCloudStatusBadge();
  });

  $('#btnSyncCloud').onclick = async () => {
    const res = await Cloud.syncToCloud();
    alert(res.message);
    updateCloudStatusBadge();
  };
  $('#btnPullCloud').onclick = async () => {
    if (!confirm('从云端拉取将覆盖本地当前数据，是否继续？')) return;
    const res = await Cloud.pullFromCloud();
    alert(res.message);
    if (res.ok) {
      cfg = loadCfg();
      buildControls();
      generate();
      updateCloudStatusBadge();
    }
  };
  $('#btnExportJson').onclick = () => Cloud.exportFile();
  $('#btnImportJson').onclick = () => $('#fileImport').click();
  $('#fileImport').onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    Cloud.importFile(file, res => {
      alert(res.message);
      if (res.ok) location.reload();
    });
  };
}

function updateCloudStatusBadge() {
  const ind = $('#cloudStatusIndicator');
  if (!ind) return;
  ind.className = 'cloud-pill ' + Cloud.status;
  if (Cloud.status === 'connected') {
    const t = Cloud.lastSyncTime ? Cloud.lastSyncTime.toLocaleTimeString() : '刚刚';
    ind.innerHTML = `🟢 已连接 Cloudflare KV 全球云端 (上次同步：${t})`;
  } else if (Cloud.status === 'kv_unbound') {
    ind.innerHTML = `🔴 Cloudflare Pages 已运行，但未绑定 KOUSUAN_KV 变量`;
  } else {
    ind.innerHTML = `🟡 本地运行模式 (数据保存在浏览器 localStorage)`;
  }
}

function autoBalance() {
  const s = cfg.fluencyMix + cfg.thinkMix + cfg.wordMix;
  if (s > 1) {
    const over = s - 1;
    if (cfg.wordMix >= over) cfg.wordMix -= over;
    else if (cfg.thinkMix >= over) cfg.thinkMix -= over;
    else cfg.fluencyMix = Math.max(0.1, cfg.fluencyMix - over);
  }
  $('#flu').value = Math.round(cfg.fluencyMix * 100);
  $('#th').value = Math.round(cfg.thinkMix * 100);
  $('#wd').value = Math.round(cfg.wordMix * 100);
  syncModeUI();
  saveCfg(cfg); debouncedGen();
}

document.addEventListener('DOMContentLoaded', init);
