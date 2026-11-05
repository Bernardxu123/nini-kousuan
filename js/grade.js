// 妮妮口算天天练 · 手机专属极速批改核心逻辑
'use strict';

let currentSheet = null;
const badNos = new Set();
let selectedMins = 6;
let currentMode = 'matrix'; // 'matrix' | 'list'

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// 初始化
document.addEventListener('DOMContentLoaded', async () => {
  G.init();
  bindNavigation();
  bindTools();
  bindModal();

  // 1. 初始化云端状态徽章
  await Cloud.init();
  updateCloudBadge();

  // 2. 连上云端时先拉取最新数据，手机端「学情足迹 / 错题本」才有内容
  if (Cloud.isConnected()) {
    // 本机若留有尚未上云的记录，先推送一次（服务端合并去重、不会覆盖），避免随后的拉取把离线数据冲掉
    const localHistory = Store.get(NINI_HISTORY_KEY, []);
    const localErrors = Store.get(NINI_ERRORS_KEY, []);
    if ((localHistory && localHistory.length) || (localErrors && localErrors.length)) {
      try { await Cloud.syncToCloud(); } catch (_) {}
    }
    // 失败静默：离线也能正常批改，只是学情停留在本地
    try { await Cloud.pullFromCloud(); } catch (_) {}
    updateCloudBadge();
  }

  // 3. 加载活跃试卷
  await loadActiveSheet();

  // 4. 渲染学情与错题
  renderErrors();
  renderProgress();
});

// 云端状态胶囊：已同步显示上次同步时间，离线提示本地保存
function updateCloudBadge() {
  const badge = $('#cloudStatusBadge');
  if (!badge) return;

  if (Cloud.status === 'kv_unbound') {
    badge.textContent = '🟡 本地离线 (KV未绑)';
    badge.style.background = '#fef9c3';
    badge.style.color = '#854d0e';
    return;
  }

  if (Cloud.isConnected()) {
    badge.style.background = '#dcfce7';
    badge.style.color = '#166534';
    if (Cloud.lastSyncTime) {
      const t = Cloud.lastSyncTime instanceof Date ? Cloud.lastSyncTime : new Date(Cloud.lastSyncTime);
      const hh = String(t.getHours()).padStart(2, '0');
      const mm = String(t.getMinutes()).padStart(2, '0');
      badge.textContent = `🟢 已同步 ${hh}:${mm}`;
    } else {
      badge.textContent = '🟢 云端已连接';
    }
    return;
  }

  badge.textContent = '🟡 离线·本地保存';
  badge.style.background = '#fef9c3';
  badge.style.color = '#854d0e';
}

// 静默拉取云端最新数据（防重入；离线/失败不打扰用户）
let cloudRefreshing = false;
async function refreshFromCloud() {
  if (cloudRefreshing || !Cloud.isConnected()) return false;
  cloudRefreshing = true;
  try {
    const res = await Cloud.pullFromCloud();
    if (res && res.ok) {
      updateCloudBadge();
      return true;
    }
    return false;
  } catch (_) {
    return false;
  } finally {
    cloudRefreshing = false;
  }
}

// 轻提示：复用/创建 div.sync-toast（class 追加 ok|warn|err 与 show），样式由 css/grade.css 提供
let toastTimer = null;
function showToast(msg, type = 'ok') {
  let el = document.querySelector('.sync-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'sync-toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  const t = type === 'warn' ? 'warn' : type === 'err' ? 'err' : 'ok';
  el.className = `sync-toast show ${t}`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('show');
  }, 2400);
}

// 本地错题点选状态暂存，防止手机意外刷新丢失批改进度
function saveBadNos() {
  if (!currentSheet || !currentSheet.sheetId) return;
  Store.set('ks_bad_' + currentSheet.sheetId, Array.from(badNos));
}
function restoreBadNos(sheetId) {
  const arr = Store.get('ks_bad_' + sheetId, []);
  badNos.clear();
  arr.forEach(n => badNos.add(String(n)));
}
function clearSavedBadNos(sheetId) {
  if (sheetId) Store.set('ks_bad_' + sheetId, []);
}

// 加载活跃试卷（保持当前试卷与进度，只有按换题按钮才换新卷）
async function loadActiveSheet() {
  $('#sheetTitle').textContent = '正在获取试卷...';
  $('#sheetMetaText').textContent = '请稍候...';

  // 1. 尝试从云端或本地拉取
  let sh = await Cloud.fetchSheet();

  // 2. 如果都没有，生成一个保底示范试卷
  if (!sh || !sh.items || !sh.items.length) {
    sh = createFallbackSheet();
  }

  currentSheet = sh;
  // 恢复之前点选的错题，刷新页面不丢失
  restoreBadNos(sh.sheetId);

  // 渲染卷头信息
  $('#sheetTitle').textContent = sh.title || '10以内的加减法 天天练';
  const timeStr = sh.createdAt ? formatTime(sh.createdAt) : '刚刚生成';
  $('#sheetMetaText').textContent = `共 ${sh.items.length} 题 · 生成时间：${timeStr}`;

  renderQuestions(sh);
  updateCounters();
}

// 格式化时间
function formatTime(iso) {
  try {
    const d = new Date(iso);
    const m = d.getMonth() + 1;
    const date = d.getDate();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${m}月${date}日 ${h}:${min}`;
  } catch (_) {
    return '今天';
  }
}

// 两位数字补零（月份/日/时分）
function pad2(n) {
  return String(n).padStart(2, '0');
}

// 渲染题目（矩阵与列表两种视图）
function renderQuestions(sh) {
  const matrix = $('#matrixGrid');
  const list = $('#listGrid');
  if (!matrix || !list) return;

  // 1. Direction C: 48格气泡矩阵 (推荐)
  matrix.innerHTML = sh.items.map(it => {
    const isBad = badNos.has(String(it.no));
    // 简化算式展示，去掉末尾＝以适应紧凑格子
    const qClean = it.prompt.replace(/＝.*$/, '').trim();
    return `
      <div class="matrix-cell ${isBad ? 'bad' : ''}" data-no="${it.no}">
        <span class="mc-no">#${String(it.no).padStart(2, '0')}</span>
        <span class="mc-q">${qClean}</span>
        <span class="mc-ans">＝${it.answer}</span>
        <span class="mc-badge">${isBad ? '✕' : '✔'}</span>
      </div>
    `;
  }).join('');

  // 2. 详细列表视图
  list.innerHTML = sh.items.map(it => {
    const isBad = badNos.has(String(it.no));
    return `
      <div class="list-cell ${isBad ? 'bad' : ''}" data-no="${it.no}">
        <div class="lc-left">
          <span class="lc-no">${it.no}.</span>
          <span class="lc-q">${it.prompt}</span>
        </div>
        <div class="lc-right">
          <span class="lc-ans">参考：${it.answer}</span>
          <span class="lc-status">${isBad ? '✕' : '✔'}</span>
        </div>
      </div>
    `;
  }).join('');

  // 绑定点击事件（点一下标红，再点一下取消）
  $$('#matrixGrid .matrix-cell, #listGrid .list-cell').forEach(el => {
    el.onclick = () => {
      const no = String(el.dataset.no);
      toggleQuestionStatus(no);
    };
  });
}

// 切换单题状态
function toggleQuestionStatus(no) {
  if (badNos.has(no)) {
    badNos.delete(no);
  } else {
    badNos.add(no);
    // 手机端微震动触感反馈
    if (window.navigator && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(18); } catch (_) {}
    }
  }
  saveBadNos();

  // 同步更新两个视图的 DOM
  $$(`[data-no="${no}"]`).forEach(el => {
    const isBad = badNos.has(no);
    el.classList.toggle('bad', isBad);
    const badge = el.querySelector('.mc-badge, .lc-status');
    if (badge) badge.textContent = isBad ? '✕' : '✔';
  });

  updateCounters();
}

// 实时更新浮动操作栏计数
function updateCounters() {
  if (!currentSheet || !currentSheet.items) return;
  const total = currentSheet.items.length;
  const wrong = badNos.size;
  const right = total - wrong;
  const score = total > 0 ? Math.max(0, Math.round((right / total) * 100)) : 100;

  $('#txtTotal').textContent = `共 ${total} 题`;
  $('#txtRight').textContent = `✅ 对 ${right}`;
  $('#txtWrong').textContent = `❌ 错 ${wrong}`;
  $('#txtScore').textContent = `${score} 分`;

  // 根据分数变换颜色
  const elScore = $('#txtScore');
  if (score === 100) elScore.style.color = '#16a34a';
  else if (score >= 90) elScore.style.color = '#2563eb';
  else elScore.style.color = '#dc2626';
}

// 全部重置为对
function resetAllRight() {
  if (!badNos.size) return;
  badNos.clear();
  if (currentSheet) clearSavedBadNos(currentSheet.sheetId);
  $$('.matrix-cell, .list-cell').forEach(el => {
    el.classList.remove('bad');
    const b = el.querySelector('.mc-badge, .lc-status');
    if (b) b.textContent = '✔';
  });
  updateCounters();
}

// 工具栏与视图绑定
function bindTools() {
  // 同步电脑端最新打印的试卷
  $('#btnRefreshSheet').onclick = async () => {
    const btn = $('#btnRefreshSheet');
    btn.style.transform = 'rotate(180deg)';
    btn.style.transition = 'transform 0.4s';
    await loadActiveSheet();
    setTimeout(() => { btn.style.transform = 'none'; }, 400);
  };

  // 手机端主动生成新试卷按钮（只有点击时才换题目）
  const btnNewMobile = $('#btnNewSheetMobile');
  if (btnNewMobile) {
    btnNewMobile.onclick = async () => {
      if (!confirm('确定生成一套全新的 48 题天天练试卷吗？（将刷新题目）')) return;
      const sh = createFallbackSheet();
      sh.sheetId = 'sheet_' + Date.now();
      sh.createdAt = new Date().toISOString();
      currentSheet = sh;
      badNos.clear();
      clearSavedBadNos(sh.sheetId);
      await Cloud.syncSheet(sh);
      $('#sheetTitle').textContent = sh.title;
      $('#sheetMetaText').textContent = `共 ${sh.items.length} 题 · 生成时间：刚刚生成`;
      renderQuestions(sh);
      updateCounters();
    };
  }

  // 矩阵 / 列表视图切换
  $$('.mode-btn').forEach(btn => {
    btn.onclick = () => {
      $$('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
      if (currentMode === 'matrix') {
        $('#matrixGrid').style.display = 'grid';
        $('#listGrid').style.display = 'none';
      } else {
        $('#matrixGrid').style.display = 'none';
        $('#listGrid').style.display = 'flex';
      }
    };
  });

  // 重置按钮
  $('#btnResetAll').onclick = resetAllRight;

  // 提交批改按钮
  $('#btnSubmitGrade').onclick = showRewardModal;
}

// 打开奖励结算弹窗
function showRewardModal() {
  if (!currentSheet || !currentSheet.items.length) {
    alert('暂无试卷内容！');
    return;
  }
  const total = currentSheet.items.length;
  const wrong = badNos.size;
  const right = total - wrong;
  const accuracy = right / total;

  let stars = 3;
  if (accuracy >= 1.0) {
    stars = 3;
    $('#mTitle').textContent = '🏆 满分！妮妮太棒了！';
    $('#mDesc').textContent = `全部 ${total} 道题全部正确！思维敏捷，口算小达人！获得 3 颗闪亮小星星！`;
  } else if (accuracy >= 0.9) {
    stars = 2;
    $('#mTitle').textContent = '🌟 优秀！妮妮进步飞快！';
    $('#mDesc').textContent = `做对了 ${right} 题（正确率 ${Math.round(accuracy * 100)}%）。${wrong} 道错题已自动收入错题本，明天重点强化！`;
  } else {
    stars = 1;
    $('#mTitle').textContent = '💪 妮妮加油，每天都在积累！';
    $('#mDesc').textContent = `完成了 ${total} 题，做对 ${right} 题。有 ${wrong} 道题已自动加入错题本，明天继续加油！`;
  }

  $('#mStars').textContent = '⭐'.repeat(stars);
  $('#modalReward').style.display = 'flex';
}

// 绑定弹窗事件
function bindModal() {
  // 用时选择气泡
  $$('#timePills .time-pill').forEach(pill => {
    pill.onclick = () => {
      $$('#timePills .time-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedMins = parseInt(pill.dataset.min, 10) || 6;
    };
  });

  // 取消
  $('#btnCancelReward').onclick = () => {
    $('#modalReward').style.display = 'none';
  };

  // 确认记录并同步
  $('#btnConfirmReward').onclick = async () => {
    const btn = $('#btnConfirmReward');
    btn.disabled = true;
    btn.textContent = '正在同步保存成绩...';

    await saveGradingSession();

    btn.disabled = false;
    btn.textContent = '确认记录并同步成绩';
    $('#modalReward').style.display = 'none';

    // 切换到学情面板看最新成果
    switchTab('progress');
  };
}

// 记录批改成绩并同步云端（结构与电脑端 recordPracticeSession 完全对齐，便于多端合并）
async function saveGradingSession() {
  if (!currentSheet || !currentSheet.items) return;
  const total = currentSheet.items.length;
  const wrongCount = badNos.size;
  const rightCount = total - wrongCount;
  const accuracy = total > 0 ? rightCount / total : 1;

  const stars = accuracy >= 1.0 ? 3 : accuracy >= 0.9 ? 2 : 1;
  const now = new Date();
  const today = todayKey(now);

  // 1. 记录错题与掌握度（错题字段、掌握度字段都与电脑端一致；拉取后是在云端数据上累加而不是丢字段）
  const prof = Store.get(PROF_KEY, {});
  currentSheet.items.forEach(it => {
    const isBad = badNos.has(String(it.no));
    if (isBad) recordErrorItem(it);

    if (!it.topicId) return;
    const m = prof[it.topicId] || { seen: 0, right: 0, days: {}, causes: {} };
    if (!m.days || typeof m.days !== 'object') m.days = {};
    if (!m.causes || typeof m.causes !== 'object') m.causes = {};
    m.seen = (m.seen || 0) + 1;
    if (!isBad) m.right = (m.right || 0) + 1;
    m.acc = m.seen ? m.right / m.seen : 1;
    m.last = now.getTime();
    const day = m.days[today] || { seen: 0, right: 0 };
    day.seen = (day.seen || 0) + 1;
    if (!isBad) day.right = (day.right || 0) + 1;
    m.days[today] = day;
    if (isBad) m.causes['计算失误'] = (m.causes['计算失误'] || 0) + 1;
    prof[it.topicId] = m;
  });
  Store.set(PROF_KEY, prof);

  // 2. 记录练习历史（date + timeStr 结构与电脑端兼容，服务端按 id 并集去重）
  const history = Store.get(NINI_HISTORY_KEY, []);
  const sessionRecord = {
    id: 'rec_' + now.getTime(),
    date: `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`,
    timeStr: `${pad2(now.getHours())}:${pad2(now.getMinutes())}`,
    total,
    correct: rightCount,
    wrong: wrongCount,
    accuracy,
    durationMinutes: selectedMins,
    stars,
    sheetTitle: currentSheet.title || '口算天天练',
    targets: [...new Set(currentSheet.items.map(it => it.topicId).filter(Boolean))],
  };
  history.unshift(sessionRecord);
  Store.set(NINI_HISTORY_KEY, history.slice(0, 150)); // 与服务端上限一致

  // 3. 更新妮妮档案累计值（与电脑端 getNiniProfile 的字段对齐）
  const profile = Store.get(NINI_PROFILE_KEY, {});
  const lastDate = profile.lastDate || '';
  if (!lastDate) {
    profile.streak = 1;
  } else if (lastDate !== today) {
    profile.streak = (Number(today) - Number(lastDate) === 1) ? (profile.streak || 0) + 1 : 1;
  }
  profile.lastDate = today;
  profile.totalSheets = (profile.totalSheets || 0) + 1;
  profile.totalQuestions = (profile.totalQuestions || 0) + total;
  profile.totalCorrect = (profile.totalCorrect || 0) + rightCount;
  const starTotal = (profile.stars || profile.totalStars || 0) + stars;
  profile.stars = starTotal;
  profile.totalStars = starTotal; // 两套字段名同值：PC 读 stars，手机旧逻辑读 totalStars
  Store.set(NINI_PROFILE_KEY, profile);

  // 4. 同步云端：/api/sync 服务端合并写入，成功后会把合并快照写回本地
  let synced = false;
  try {
    const res = await Cloud.syncToCloud();
    synced = !!(res && res.ok);
  } catch (_) {
    synced = false;
  }
  updateCloudBadge();
  if (synced) showToast('✅ 已同步到云端', 'ok');
  else showToast('⚠️ 已保存在本机，云端未连接', 'warn');

  // 提交成功后清除暂存的错题标记
  if (currentSheet) clearSavedBadNos(currentSheet.sheetId);
  badNos.clear();

  // 提交后清空红色标记并重绘批改面板，避免切回批改页看到过期的红格与计数
  if (currentSheet && currentSheet.items) {
    renderQuestions(currentSheet);
    updateCounters();
  }

  // 重新渲染相关视图
  renderErrors();
  renderProgress();
}

// 记录单道错题（字段与电脑端 recordNiniError 对齐，便于服务端合并去重）
function recordErrorItem(it) {
  const nowIso = new Date().toISOString();
  const sig = it.sig || it.factKey || it.prompt;
  const errors = Store.get(NINI_ERRORS_KEY, []);
  // 同一题面只在未攻克的错题上累加，已攻克后再次做错视为新的错题（与电脑端一致）
  const existing = errors.find(e => !e.resolved && (
    (e.sig && sig && e.sig === sig) ||
    (e.factKey && it.factKey && e.factKey === it.factKey) ||
    (e.prompt && it.prompt && e.prompt === it.prompt)
  ));
  if (existing) {
    existing.failCount = (existing.failCount || existing.count || 1) + 1;
    existing.count = (existing.count || 1) + 1;
    existing.lastFailedAt = nowIso;
    existing.lastWrongDate = nowIso;
  } else {
    errors.unshift({
      id: 'err_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      date: nowIso.slice(0, 10),
      createdTime: nowIso,
      prompt: it.prompt,
      answer: it.answer,
      fam: it.fam,
      topicId: it.topicId,
      factKey: it.factKey || it.prompt,
      sig,
      cause: '计算失误',
      resolved: false,
      failCount: 1,
      count: 1,
      firstWrongDate: nowIso,
      lastWrongDate: nowIso,
      lastFailedAt: nowIso,
    });
  }
  Store.set(NINI_ERRORS_KEY, errors);
}

// 底部导航栏切换
function bindNavigation() {
  $$('.nav-item').forEach(btn => {
    btn.onclick = () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    };
  });
}

function switchTab(tab) {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  $$('.tab-content').forEach(pane => {
    pane.classList.toggle('active', pane.id === `pane-${tab}`);
  });

  // 浮动操作栏仅在极速批改面板显示
  const fb = $('#floatingBar');
  if (fb) fb.style.display = tab === 'grading' ? 'block' : 'none';

  // 切到「错题本 / 学情足迹」时先渲染本地，再静默拉云端最新数据补渲染（离线不报错）
  if (tab === 'errors' || tab === 'progress') {
    renderErrors();
    renderProgress();
    refreshFromCloud().then(ok => {
      if (!ok) return;
      renderErrors();
      renderProgress();
    });
  }
}

// 渲染错题本（只展示未攻克的错题，角标数量与之一致）
function renderErrors() {
  const listEl = $('#mobileErrorList');
  const badge = $('#errorCountBadge');
  if (!listEl) return;

  const errors = Store.get(NINI_ERRORS_KEY, []);
  // 保留原始下标：已攻克的错题仍留在数组里（标记 resolved），点击按钮时要定位到原数组项
  const active = errors
    .map((err, idx) => ({ err, idx }))
    .filter(x => x.err && !x.err.resolved);

  if (badge) badge.textContent = `${active.length} 道`;

  if (!active.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎉</div>
        <div>太棒了！妮妮目前没有错题记录！</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = active.map(({ err, idx }) => `
    <div class="error-card" data-idx="${idx}">
      <div class="ec-left">
        <div class="ec-q">${err.prompt}（答案：${err.answer}）</div>
        <div class="ec-info">已错 ${err.failCount || err.count || 1} 次 · 题型：${famLabel(err.fam)}</div>
      </div>
      <button type="button" class="btn-mastered" onclick="removeError(${idx})">✅ 已掌握</button>
    </div>
  `).join('');
}

// 标记错题为「已掌握」：只做本地更新 + 云端合并同步（不再 POST /api/errors）
window.removeError = async function(idx) {
  const errors = Store.get(NINI_ERRORS_KEY, []);
  if (!(idx >= 0 && idx < errors.length)) return;
  const item = errors[idx];
  if (!item) return;

  // 用 resolved 标记而不是删除：删除后服务端合并会从云端旧数据里把这道错题"复活"
  item.resolved = true;
  item.resolvedAt = new Date().toISOString();
  Store.set(NINI_ERRORS_KEY, errors);
  renderErrors();
  renderProgress();

  try {
    const res = await Cloud.syncToCloud();
    if (!res || !res.ok) showToast('⚠️ 已记录在本机，云端未连接', 'warn');
  } catch (_) {
    showToast('⚠️ 已记录在本机，云端未连接', 'warn');
  }
  updateCloudBadge();
};

function famLabel(f) {
  const map = { add: '10以内加法', sub: '10以内减法', chain: '连加连减', miss: '填未知数', bond: '分与合' };
  return map[f] || '口算题';
}

// 渲染学情足迹（数据来自云端合并后的档案 + 历史 + 掌握度）
function renderProgress() {
  const prof = Store.get(PROF_KEY, {});
  const profile = Store.get(NINI_PROFILE_KEY, {}) || {};
  const history = Store.get(NINI_HISTORY_KEY, []) || [];

  // 1. 核心指标卡：优先用档案累计值，缺失时用历史记录推导兜底
  const histQuestions = history.reduce((a, b) => a + (Number(b.total) || 0), 0);
  const histCorrect = history.reduce((a, b) => a + (Number(b.correct) || 0), 0);
  const sheets = Number(profile.totalSheets) || history.length || 0;
  const questions = Number(profile.totalQuestions) || histQuestions || 0;

  $('#statSheets').textContent = String(sheets);
  $('#statQuestions').textContent = String(questions);

  // 正确率优先用档案 totalCorrect/totalQuestions，其次历史平均正确率
  let avgAcc = null;
  if (profile.totalCorrect != null && questions > 0) {
    const totalCorrect = Number(profile.totalCorrect);
    if (isFinite(totalCorrect)) avgAcc = Math.round((totalCorrect / questions) * 100);
  }
  if (avgAcc == null && history.length) {
    const sumAcc = history.reduce((a, b) => a + (Number(b.accuracy) || 0), 0);
    avgAcc = Math.round((sumAcc / history.length) * 100);
  }
  if (avgAcc == null) avgAcc = 100;
  avgAcc = Math.max(0, Math.min(100, avgAcc));
  $('#statAccuracy').textContent = `${avgAcc}%`;

  // 星星总量：PC 写 stars，手机旧数据写 totalStars，两者兼容
  const starTotal = Number(profile.stars != null ? profile.stars : profile.totalStars) || 0;
  $('#statStars').textContent = `${starTotal} ⭐`;

  // 2. 知识点掌握度进度条
  const masteryEl = $('#mobileMasteryList');
  if (masteryEl) {
    const topics = G.topics.filter(t => prof[t.id]).sort((a, b) => (Number(prof[b.id].seen) || 0) - (Number(prof[a.id].seen) || 0)).slice(0, 8);
    if (!topics.length) {
      masteryEl.innerHTML = '<p style="color:#64748b;font-size:13px;text-align:center;padding:12px">完成批改后，这里将自动呈现妮妮各知识点的掌握情况。</p>';
    } else {
      masteryEl.innerHTML = topics.map(t => {
        const m = prof[t.id] || {};
        const seen = Number(m.seen) || 0;
        const right = Number(m.right) || 0;
        // 无 acc 时用 right/seen 兜底；老数据可能只有 seen/right
        const ratio = (typeof m.acc === 'number' && isFinite(m.acc)) ? m.acc : (seen ? right / seen : 1);
        const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
        return `
          <div class="pbar-wrap">
            <div class="pbar-info">
              <span>${t.name}</span>
              <span>${pct}% (${right}/${seen})</span>
            </div>
            <div class="pbar-track">
              <div class="pbar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. 近期练习记录（兼容电脑端 date+timeStr 与旧手机端 ISO date 两种格式）
  const histEl = $('#mobileHistoryList');
  if (histEl) {
    if (!history.length) {
      histEl.innerHTML = '<p style="color:#64748b;font-size:13px;text-align:center;padding:12px">暂无练习打卡记录，快去批改今天的卷子吧！</p>';
    } else {
      histEl.innerHTML = history.slice(0, 10).map(h => {
        const hTotal = Number(h.total) || Number(h.count) || 0;
        const hRight = Number(h.correct);
        const hAccuracy = (typeof h.accuracy === 'number' && isFinite(h.accuracy))
          ? h.accuracy
          : (hTotal ? hRight / hTotal : 1);
        const hStars = Number(h.stars) || 1;
        const hMins = Number(h.durationMinutes) || 6;
        const color = hAccuracy >= 0.9 ? '#16a34a' : '#dc2626';
        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px">
          <div>
            <div style="font-weight:700;color:#1e293b">${h.sheetTitle || '口算天天练'} · ${hTotal}题</div>
            <div style="font-size:11px;color:#94a3b8">${formatRecordWhen(h)} · 用时 ${hMins} 分钟</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;color:${color}">${Math.round(hAccuracy * 100)}分</div>
            <div style="font-size:12px">${'⭐'.repeat(Math.max(1, Math.min(3, hStars)))}</div>
          </div>
        </div>
      `;
      }).join('');
    }
  }
}

// 兼容两种历史记录时间格式：电脑端 {date:'YYYY-MM-DD', timeStr:'HH:MM'} / 旧手机端 {date: ISO 字符串}
function formatRecordWhen(h) {
  if (!h) return '今天';
  const d = String(h.date || '');
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (m) return `${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日${h.timeStr ? ' ' + h.timeStr : ''}`;
  if (d) return formatTime(d);
  return '今天';
}

// 保底示范试卷（首次进入无云端试卷时使用）
function createFallbackSheet() {
  const ops = ['＋', '－'];
  const items = [];
  for (let i = 1; i <= 48; i++) {
    const isAdd = (i % 2 === 1);
    if (isAdd) {
      const a = 1 + Math.floor(Math.random() * 8);
      const b = 1 + Math.floor(Math.random() * (10 - a));
      items.push({ no: i, prompt: `${a} ＋ ${b} ＝`, answer: String(a + b), fam: 'add', topicId: 'cnm_p010', factKey: `${a}+${b}` });
    } else {
      const a = 3 + Math.floor(Math.random() * 8);
      const b = 1 + Math.floor(Math.random() * (a - 1));
      items.push({ no: i, prompt: `${a} － ${b} ＝`, answer: String(a - b), fam: 'sub', topicId: 'cnm_p011', factKey: `${a}-${b}` });
    }
  }
  return {
    sheetId: 'sheet_sample',
    title: '10以内的加减法 天天练',
    count: 48,
    createdAt: new Date().toISOString(),
    items
  };
}
