// Cloudflare KV 云端同步管理模块
// 支持本地离线运行（localStorage）与 Cloudflare Edge KV 全球云端实时同步双模式
'use strict';

const Cloud = {
  status: 'checking', // 'connected' | 'local_only' | 'kv_unbound' | 'syncing' | 'error'
  lastSyncTime: null,
  isCloudflare: false,

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
    };
  },

  // 同步本地数据到云端
  async syncToCloud() {
    if (Cloud.status !== 'connected') {
      return { ok: false, message: '当前未连接到 Cloudflare KV 云端，数据已安全保存在本地。' };
    }
    try {
      const payload = Cloud.getBackupPayload();
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.ok) {
        Cloud.lastSyncTime = new Date();
        return { ok: true, message: '同步成功！已保存至 Cloudflare KV 边缘数据库。' };
      }
      return { ok: false, message: json.message || '同步失败' };
    } catch (e) {
      return { ok: false, message: '网络连接异常：' + e.message };
    }
  },

  // 从云端拉取并覆盖本地
  async pullFromCloud() {
    if (Cloud.status !== 'connected') {
      return { ok: false, message: '未连接云端' };
    }
    try {
      const res = await fetch('/api/sync?child=nini');
      const json = await res.json();
      if (json.ok && json.data) {
        const d = json.data;
        if (d.profile) Store.set(NINI_PROFILE_KEY, d.profile);
        if (d.cfg) Store.set(CFG_KEY, d.cfg);
        if (d.ledger) Store.set(LEDGER_KEY, d.ledger);
        if (d.errors) Store.set(NINI_ERRORS_KEY, d.errors);
        if (d.history) Store.set(NINI_HISTORY_KEY, d.history);
        if (d.mastery) Store.set(PROF_KEY, d.mastery);
        Cloud.lastSyncTime = d.updatedAt ? new Date(d.updatedAt) : new Date();
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
        if (d.profile) Store.set(NINI_PROFILE_KEY, d.profile);
        if (d.cfg) Store.set(CFG_KEY, d.cfg);
        if (d.ledger) Store.set(LEDGER_KEY, d.ledger);
        if (d.errors) Store.set(NINI_ERRORS_KEY, d.errors);
        if (d.history) Store.set(NINI_HISTORY_KEY, d.history);
        if (d.mastery) Store.set(PROF_KEY, d.mastery);
        if (callback) callback({ ok: true, message: '数据导入成功！' });
      } catch (err) {
        if (callback) callback({ ok: false, message: '备份文件解析失败：' + err.message });
      }
    };
    reader.readAsText(file);
  },
};
