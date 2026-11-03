// 妮妮口算天天练 · 手机专属极速批改核心逻辑
'use strict';

const NINI_PROFILE_KEY = 'kousuan_nini_profile';
const NINI_ERRORS_KEY = 'kousuan_nini_errors';
const NINI_HISTORY_KEY = 'kousuan_nini_history';
const PROF_KEY = 'kousuan_prof_v1';
const LEDGER_KEY = 'kousuan_ledger_v1';
const CFG_KEY = 'kousuan_cfg_v1';

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

  // 初始化云端并加载活跃试卷
  await Cloud.init();
  updateCloudBadge();
  await loadActiveSheet();

  // 渲染学情与错题
  renderErrors();
  renderProgress();
});

// 云端状态胶囊
function updateCloudBadge() {
  const badge = $('#cloudStatusBadge');
  if (!badge) return;
  if (Cloud.status === 'connected') {
    badge.textContent = '🟢 云端已连接';
    badge.style.background = '#dcfce7';
    badge.style.color = '#166534';
  } else if (Cloud.status === 'kv_unbound') {
    badge.textContent = '🟡 本地离线 (KV未绑)';
    badge.style.background = '#fef9c3';
    badge.style.color = '#854d0e';
  } else {
    badge.textContent = '⚪ 本地模式';
    badge.style.background = '#f1f5f9';
    badge.style.color = '#475569';
  }
}

// 加载活跃试卷
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
  badNos.clear();

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
  $$('.matrix-cell, .list-cell').forEach(el => {
    el.classList.remove('bad');
    const b = el.querySelector('.mc-badge, .lc-status');
    if (b) b.textContent = '✔';
  });
  updateCounters();
}

// 工具栏与视图绑定
function bindTools() {
  // 刷新试卷
  $('#btnRefreshSheet').onclick = async () => {
    const btn = $('#btnRefreshSheet');
    btn.style.transform = 'rotate(180deg)';
    btn.style.transition = 'transform 0.4s';
    await loadActiveSheet();
    setTimeout(() => { btn.style.transform = 'none'; }, 400);
  };

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

// 记录批改成绩并回传云端
async function saveGradingSession() {
  if (!currentSheet || !currentSheet.items) return;
  const total = currentSheet.items.length;
  const wrongCount = badNos.size;
  const rightCount = total - wrongCount;
  const accuracy = rightCount / total;

  let stars = accuracy >= 1.0 ? 3 : accuracy >= 0.9 ? 2 : 1;

  // 1. 记录错题与掌握度
  const errorItems = [];
  const prof = Store.get(PROF_KEY, {});

  currentSheet.items.forEach(it => {
    const isBad = badNos.has(String(it.no));
    if (isBad) {
      errorItems.push(it);
      recordErrorItem(it);
    }
    // 更新掌握度
    if (it.topicId) {
      if (!prof[it.topicId]) prof[it.topicId] = { seen: 0, right: 0, acc: 1 };
      prof[it.topicId].seen += 1;
      if (!isBad) prof[it.topicId].right += 1;
      prof[it.topicId].acc = prof[it.topicId].right / prof[it.topicId].seen;
    }
  });
  Store.set(PROF_KEY, prof);

  // 2. 记录练习历史
  const history = Store.get(NINI_HISTORY_KEY, []);
  const sessionRecord = {
    date: new Date().toISOString(),
    total,
    correct: rightCount,
    wrong: wrongCount,
    accuracy,
    durationMinutes: selectedMins,
    stars,
    sheetTitle: currentSheet.title || '口算天天练'
  };
  history.unshift(sessionRecord);
  Store.set(NINI_HISTORY_KEY, history.slice(0, 100)); // 保留最近100次

  // 3. 更新档案统计
  const profile = Store.get(NINI_PROFILE_KEY, { totalSheets: 0, totalQuestions: 0, totalStars: 0 });
  profile.totalSheets = (profile.totalSheets || 0) + 1;
  profile.totalQuestions = (profile.totalQuestions || 0) + total;
  profile.totalStars = (profile.totalStars || 0) + stars;
  Store.set(NINI_PROFILE_KEY, profile);

  // 4. 同步至云端 Cloudflare KV
  try {
    await fetch('/api/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ child: 'nini', record: sessionRecord })
    });
  } catch (_) {}

  try {
    await Cloud.syncToCloud();
  } catch (_) {}

  // 重新渲染相关视图
  renderErrors();
  renderProgress();
}

// 记录单道错题
function recordErrorItem(it) {
  const errors = Store.get(NINI_ERRORS_KEY, []);
  const existing = errors.find(e => e.factKey === it.factKey || e.prompt === it.prompt);
  if (existing) {
    existing.count = (existing.count || 1) + 1;
    existing.lastWrongDate = new Date().toISOString();
  } else {
    errors.unshift({
      id: 'err_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      prompt: it.prompt,
      answer: it.answer,
      fam: it.fam,
      topicId: it.topicId,
      factKey: it.factKey || it.prompt,
      count: 1,
      firstWrongDate: new Date().toISOString(),
      lastWrongDate: new Date().toISOString()
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

  // 如果切换到错题或学情，刷新数据
  if (tab === 'errors') renderErrors();
  if (tab === 'progress') renderProgress();

  // 浮动操作栏仅在极速批改面板显示
  const fb = $('#floatingBar');
  if (fb) fb.style.display = tab === 'grading' ? 'block' : 'none';
}

// 渲染错题本
function renderErrors() {
  const listEl = $('#mobileErrorList');
  const badge = $('#errorCountBadge');
  if (!listEl) return;

  const errors = Store.get(NINI_ERRORS_KEY, []);
  if (badge) badge.textContent = `${errors.length} 道`;

  if (!errors.length) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="icon">🎉</div>
        <div>太棒了！妮妮目前没有错题记录！</div>
      </div>
    `;
    return;
  }

  listEl.innerHTML = errors.map((err, idx) => `
    <div class="error-card" data-idx="${idx}">
      <div class="ec-left">
        <div class="ec-q">${err.prompt}（答案：${err.answer}）</div>
        <div class="ec-info">已错 ${err.count || 1} 次 · 题型：${famLabel(err.fam)}</div>
      </div>
      <button type="button" class="btn-mastered" onclick="removeError(${idx})">✅ 已掌握</button>
    </div>
  `).join('');
}

// 移除错题（已掌握）
window.removeError = async function(idx) {
  const errors = Store.get(NINI_ERRORS_KEY, []);
  if (idx >= 0 && idx < errors.length) {
    errors.splice(idx, 1);
    Store.set(NINI_ERRORS_KEY, errors);
    renderErrors();
    try {
      await fetch('/api/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child: 'nini', errors })
      });
    } catch (_) {}
  }
};

function famLabel(f) {
  const map = { add: '10以内加法', sub: '10以内减法', chain: '连加连减', miss: '填未知数', bond: '分与合' };
  return map[f] || '口算题';
}

// 渲染学情足迹
function renderProgress() {
  const prof = Store.get(PROF_KEY, {});
  const profile = Store.get(NINI_PROFILE_KEY, { totalSheets: 0, totalQuestions: 0, totalStars: 0 });
  const history = Store.get(NINI_HISTORY_KEY, []);

  // 1. 核心指标卡
  $('#statSheets').textContent = String(profile.totalSheets || history.length || 0);
  $('#statQuestions').textContent = String(profile.totalQuestions || (history.length * 48) || 0);
  $('#statStars').textContent = `${profile.totalStars || 0} ⭐`;

  // 计算综合正确率
  let avgAcc = 100;
  if (history.length) {
    const sumAcc = history.reduce((a, b) => a + (b.accuracy || 1), 0);
    avgAcc = Math.round((sumAcc / history.length) * 100);
  }
  $('#statAccuracy').textContent = `${avgAcc}%`;

  // 2. 知识点掌握度进度条
  const masteryEl = $('#mobileMasteryList');
  if (masteryEl) {
    const topics = G.topics.filter(t => prof[t.id]).sort((a, b) => prof[b.id].seen - prof[a.id].seen).slice(0, 8);
    if (!topics.length) {
      masteryEl.innerHTML = '<p style="color:#64748b;font-size:13px;text-align:center;padding:12px">完成批改后，这里将自动呈现妮妮各知识点的掌握情况。</p>';
    } else {
      masteryEl.innerHTML = topics.map(t => {
        const m = prof[t.id];
        const pct = Math.round(m.acc * 100);
        return `
          <div class="pbar-wrap">
            <div class="pbar-info">
              <span>${t.name}</span>
              <span>${pct}% (${m.right}/${m.seen})</span>
            </div>
            <div class="pbar-track">
              <div class="pbar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 3. 近期练习记录
  const histEl = $('#mobileHistoryList');
  if (histEl) {
    if (!history.length) {
      histEl.innerHTML = '<p style="color:#64748b;font-size:13px;text-align:center;padding:12px">暂无练习打卡记录，快去批改今天的卷子吧！</p>';
    } else {
      histEl.innerHTML = history.slice(0, 10).map(h => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:13px">
          <div>
            <div style="font-weight:700;color:#1e293b">${h.sheetTitle || '口算天天练'} · ${h.total || 48}题</div>
            <div style="font-size:11px;color:#94a3b8">${formatTime(h.date)} · 用时 ${h.durationMinutes || 6} 分钟</div>
          </div>
          <div style="text-align:right">
            <div style="font-weight:800;color:${h.accuracy >= 0.9 ? '#16a34a' : '#dc2626'}">${Math.round((h.accuracy || 1) * 100)}分</div>
            <div style="font-size:12px">${'⭐'.repeat(h.stars || 1)}</div>
          </div>
        </div>
      `).join('');
    }
  }
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
