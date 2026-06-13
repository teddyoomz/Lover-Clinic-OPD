// src/components/backend/FbSettingsTab.jsx
// V75 Item 3 — Per-branch FB Page settings.
// Mirrors LineSettingsTab.jsx structure but for be_fb_configs/{branchId}.
// (2026-06-13 AV195 — the legacy auto-seed banner from clinic_settings/chat_config
// was removed; that client read is rule-denied by WS1-C2-bis. Admin configures
// each branch's FB credentials manually.) fbConfigClient uses direct Firestore
// (Task 13 was DROPPED — no /api/admin/fb-config-by-branch endpoint); only the
// connection-test path goes through /api/admin/fb-test (CORS-proxy).

import { useState, useEffect, useCallback } from 'react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import {
  getFbConfig,
  saveFbConfig,
  validateFbConfig,
  DEFAULT_FB_CONFIG,
} from '../../lib/fbConfigClient.js';
import { testFbConnection } from '../../lib/fbTestClient.js';

const EMPTY_CFG = { ...DEFAULT_FB_CONFIG };

export default function FbSettingsTab() {
  const { branchId, branch } = useSelectedBranch();
  const [cfg, setCfg] = useState(EMPTY_CFG);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [validationErrors, setValidationErrors] = useState([]);
  const [savedAt, setSavedAt] = useState(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError('');
    setValidationErrors([]);
    try {
      const data = await getFbConfig(branchId);
      if (!data) {
        setCfg({ ...EMPTY_CFG });
        return;
      }
      setCfg({
        pageId: data.pageId || '',
        pageAccessToken: data.pageAccessToken || '',
        appSecret: data.appSecret || '',
        verifyToken: data.verifyToken || '',
        displayName: data.displayName || '',
        enabled: !!data.enabled,
      });
    } catch (e) {
      setError(e?.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setSaving(true);
    setError('');
    setValidationErrors([]);
    setSavedAt(null);
    try {
      const v = validateFbConfig(cfg);
      if (!v.valid) {
        setValidationErrors(v.errors);
        setSaving(false);
        return;
      }
      await saveFbConfig(branchId, cfg);
      setAutoSeeded(false);
      setSavedAt(Date.now());
      await load();
    } catch (e) {
      setError(e?.message || 'บันทึกล้มเหลว');
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setError('');
    try {
      const r = await testFbConnection({
        pageId: cfg.pageId,
        pageAccessToken: cfg.pageAccessToken,
      });
      setTestResult(r);
    } catch (e) {
      setTestResult({ ok: false, reason: e?.message || 'ทดสอบล้มเหลว' });
    } finally {
      setTesting(false);
    }
  };

  const webhookUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}/api/webhook/facebook`
      : '/api/webhook/facebook';

  const copyWebhook = async () => {
    try {
      await navigator.clipboard?.writeText(webhookUrl);
    } catch {
      /* clipboard unavailable; ignore */
    }
  };

  return (
    <div className="p-6 space-y-6 text-slate-200">
      <h2 className="text-2xl font-bold">
        📘 ตั้งค่า FB Page — สาขา {branch?.name || branchId || '—'}
      </h2>


      <section>
        <h3 className="font-semibold">Channel credentials</h3>

        <label className="block mt-2">
          <span className="text-sm">Page ID</span>
          <input
            type="text"
            value={cfg.pageId}
            onChange={(e) => setCfg({ ...cfg, pageId: e.target.value })}
            data-field="fb-pageId"
            className="block w-full mt-1 rounded px-2 py-1 bg-slate-900 border border-slate-700"
          />
        </label>

        <label className="block mt-2">
          <span className="text-sm">Page Access Token</span>
          <div className="flex gap-2 items-center">
            <input
              type={showToken ? 'text' : 'password'}
              value={cfg.pageAccessToken}
              onChange={(e) => setCfg({ ...cfg, pageAccessToken: e.target.value })}
              data-field="fb-pageAccessToken"
              className="flex-1 mt-1 rounded px-2 py-1 bg-slate-900 border border-slate-700"
            />
            <button
              type="button"
              aria-label="แสดง token"
              onClick={() => setShowToken((v) => !v)}
              className="px-2 py-1 text-xs"
            >
              {showToken ? '🙈' : '👁'}
            </button>
          </div>
        </label>

        <label className="block mt-2">
          <span className="text-sm">App Secret</span>
          <div className="flex gap-2 items-center">
            <input
              type={showSecret ? 'text' : 'password'}
              value={cfg.appSecret}
              onChange={(e) => setCfg({ ...cfg, appSecret: e.target.value })}
              data-field="fb-appSecret"
              className="flex-1 mt-1 rounded px-2 py-1 bg-slate-900 border border-slate-700"
            />
            <button
              type="button"
              aria-label="แสดง secret"
              onClick={() => setShowSecret((v) => !v)}
              className="px-2 py-1 text-xs"
            >
              {showSecret ? '🙈' : '👁'}
            </button>
          </div>
        </label>

        <label className="block mt-2">
          <span className="text-sm">Verify Token</span>
          <input
            type="text"
            value={cfg.verifyToken}
            onChange={(e) => setCfg({ ...cfg, verifyToken: e.target.value })}
            data-field="fb-verifyToken"
            className="block w-full mt-1 rounded px-2 py-1 bg-slate-900 border border-slate-700"
          />
        </label>

        <label className="block mt-2">
          <span className="text-sm">Display Name</span>
          <input
            type="text"
            value={cfg.displayName}
            onChange={(e) => setCfg({ ...cfg, displayName: e.target.value })}
            data-field="fb-displayName"
            className="block w-full mt-1 rounded px-2 py-1 bg-slate-900 border border-slate-700"
          />
        </label>
      </section>

      <section>
        <h3 className="font-semibold">ทดสอบการเชื่อมต่อ</h3>
        <button
          type="button"
          onClick={test}
          disabled={testing || !cfg.pageId || !cfg.pageAccessToken}
          className="mt-2 px-3 py-1 rounded bg-sky-700 hover:bg-sky-600 disabled:opacity-50"
        >
          {testing ? 'กำลังทดสอบ...' : 'ทดสอบการเชื่อมต่อ'}
        </button>
        {testResult && (
          <div
            className={`mt-2 text-sm ${testResult.ok ? 'text-green-400' : 'text-rose-400'}`}
            data-testid="fb-test-result"
          >
            {testResult.ok
              ? `✅ ${testResult.pageName || 'OK'}`
              : `❌ ${testResult.reason || 'unknown error'}`}
          </div>
        )}
      </section>

      <section>
        <h3 className="font-semibold">เปิด / ปิดใช้งาน</h3>
        <label className="inline-flex items-center mt-2 gap-2">
          <input
            type="checkbox"
            checked={cfg.enabled}
            onChange={(e) => setCfg({ ...cfg, enabled: e.target.checked })}
            data-field="fb-enabled"
          />
          <span className="text-sm">เปิดใช้งาน FB Page สำหรับสาขานี้</span>
        </label>
      </section>

      <section>
        <h3 className="font-semibold">Webhook URL</h3>
        <code className="block text-xs bg-slate-900 p-2 rounded mt-2 break-all">
          {webhookUrl}
        </code>
        <button
          type="button"
          onClick={copyWebhook}
          className="mt-2 px-3 py-1 rounded bg-slate-700 hover:bg-slate-600"
        >
          คัดลอก URL
        </button>
      </section>

      {validationErrors.length > 0 && (
        <div className="rounded border border-rose-500/40 bg-rose-950/30 p-3 text-rose-300 text-sm">
          {validationErrors.map((e, i) => (
            <div key={i}>❌ {e}</div>
          ))}
        </div>
      )}

      {error && (
        <div className="text-rose-400 text-sm" role="alert">
          ❌ {error}
        </div>
      )}

      {savedAt && !error && validationErrors.length === 0 && (
        <div className="text-green-400 text-sm">✅ บันทึกแล้ว</div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={saving || loading}
        className="px-4 py-2 rounded bg-green-700 hover:bg-green-600 disabled:opacity-50"
      >
        {saving ? 'กำลังบันทึก...' : 'บันทึก'}
      </button>
    </div>
  );
}
