// Cloudflare KV 云端同步管理模块
// 支持本地离线运行（localStorage）与 Cloudflare Edge KV 全球云端实时同步双模式
// 注意：电脑端 index.html 与手机端 grade.html 共用本模块，对外方法名/返回值语义必须保持兼容。
'use strict';

const Cloud = {
  status: 'checking', // 'connected' | 'local_only' | 'kv_unbound' | 'syncing' | 'error'
  lastSyncTime: null,
  isCloudflare: false,
  // 单一 Promise 队列：串行化 syncToCloud，连续调用不会并发「读-改-写」而互相覆盖
  _queue: Promise.resolve(),

  async init() {
    try {
      const res = await fetch('/api/sync?child=nini', { method: 'GET' });
      if (!res.ok) {
        Cloud.status = 'local_only';
        return;
      }
      const json = await res.json();
      if (json.isCloudflare && !json.kvBound) {
        Cloud.status = 'kv_unbound';
        Cloud.isCloudflare = true;
      } else if (json.ok && json.kvBound) {
        Cloud.status = 'connected';
        Cloud.isCloudflare = true;
        if (json.updatedAt) Cloud.lastSyncTime = new Date(json.updatedAt);
      } else {
        Cloud.status = 'local_only';
      }
    } catch (e) {
      Cloud.status = 'local_only';
    }
  },

  // 云端是否可用（新增方法，供手机端启动/切页判断）
  isConnected() {
    return Cloud.status === 'connected';
  },

  // 把服务端返回的数据快照写回本地：只处理「存在的字段」，避免用空值覆盖本地数据
  // 同步（small snapshot）与拉取（完整数据）共用这一处
  applyData(data) {
    if (!data || typeof data !== 'object') return;
    const fieldMap = {
      profile: NINI_PROFILE_KEY,
      cfg: CFG_KEY,
      ledger: LEDGER_KEY,
      errors: NINI_ERRORS_KEY,
      history: NINI_HISTORY_KEY,
      mastery: PROF_KEY,
      sheet: CURRENT_SHEET_KEY,
    };
    Object.keys(fieldMap).forEach(field => {
      if (!Object.prototype.hasOwnProperty.call(data, field)) return;
      const val = data[field];
      if (val === undefined || val === null) return;
      Store.set(fieldMap[field], val);
    });
  },

  // 获取完整备份数据对象
  getBackupPayload() {
    return {
      version: '1.2.0',
      child: 'nini',
      exportedAt: new Date().toISOString(),
      profile: Store.get(NINI_PROFILE_KEY, {}),
      cfg: Store.get(CFG_KEY, {}),
      ledger: Store.get(LEDGER_KEY, {}),
      errors: Store.get(NINI_ERRORS_KEY, []),
      history: Store.get(NINI_HISTORY_KEY, []),
      mastery: Store.get(PROF_KEY, {}),
      sheet: Store.get(CURRENT_SHEET_KEY, null),
    };
  },

  // 同步本地活跃试卷到云端
  async syncSheet(sheet) {
    if (!sheet) return;
    Store.set(CURRENT_SHEET_KEY, sheet);
    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ child: 'nini', sheet }),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // 从云端或本地获取当前活跃试卷
  async fetchSheet() {
    try {
      const res = await fetch('/api/sheet?child=nini');
      if (res.ok) {
        const json = await res.json();
        if (json.ok && json.hasSheet && json.sheet) {
          Store.set(CURRENT_SHEET_KEY, json.sheet);
          return json.sheet;
        }
      }
    } catch (_) {}
    return Store.get(CURRENT_SHEET_KEY, null);
  },

  // 同步本地数据到云端（服务端合并写入，成功后把合并快照写回本地）
  // 用队列串行化：返回的 Promise 永不 reject，PC 端 plan.js 里不 await 的调用也不会产生未捕获异常
  syncToCloud() {
    const run = () => Cloud._syncOnce();
    const task = Cloud._queue.then(run, run);
    Cloud._queue = task.then(() => {}, () => {});
    return task;
  },

  // 真正执行一次上传（仅由 syncToCloud 的队列调用）
  async _syncOnce() {
    if (!Cloud.isConnected()) {
      return { ok: false, offline: true, message: '当前未连接到 Cloudflare KV 云端，数据已安全保存在本地。' };
    }
    try {
      const payload = Cloud.getBackupPayload();
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json && json.ok) {
        // 服务端合并后的快照写回本地，保证多端看到同一份累计数据
        Cloud.applyData(json.data);
        Cloud.lastSyncTime = new Date();
        return { ok: true, message: '同步成功！已保存至 Cloudflare KV 边缘数据库。' };
      }
      return { ok: false, message: (json && json.message) || '同步失败' };
    } catch (e) {
      return { ok: false, message: '网络连接异常：' + e.message };
    }
  },

  // 从云端拉取并恢复本地数据（PC 端"从云端恢复"按钮语义：覆盖本地）
  async pullFromCloud() {
    if (!Cloud.isConnected()) {
      return { ok: false, message: '未连接云端' };
    }
    try {
      const res = await fetch('/api/sync?child=nini');
      const json = await res.json();
      if (json && json.ok && json.data && json.hasData !== false) {
        const d = json.data;
        Cloud.applyData(d);
        Cloud.lastSyncTime = d.updatedAt ? new Date(d.updatedAt) : (json.updatedAt ? new Date(json.updatedAt) : new Date());
        return { ok: true, message: '已从云端拉取最新数据并恢复！' };
      }
      return { ok: false, message: '云端暂无数据可拉取' };
    } catch (e) {
      return { ok: false, message: '拉取失败：' + e.message };
    }
  },

  // 导出 JSON 备份文件
  exportFile() {
    const payload = Cloud.getBackupPayload();
    const str = JSON.stringify(payload, null, 2);
    const blob = new Blob([str], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `妮妮口算天天练_数据备份_${dateStr}.json`;
    a.click();
    URL.revokeObjectURL(url);
  },

  // 导入 JSON 备份文件
  importFile(file, callback) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const d = JSON.parse(e.target.result);
        Cloud.applyData(d);
        if (callback) callback({ ok: true, message: '数据导入成功！' });
      } catch (err) {
        if (callback) callback({ ok: false, message: '备份文件解析失败：' + err.message });
      }
    };
    reader.readAsText(file);
  },
};
