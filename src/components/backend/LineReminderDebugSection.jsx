// ─── LineReminderDebugSection — Task 11 (2026-05-15) ──────────────────────────
//
// Debug-fire UI section for LINE OA Appointment Reminder. Per-branch.
// Renders inside LineSettingsTab.jsx. Calls `/api/admin/line-reminder-debug-fire`
// (Task 6 endpoint; will exist by deploy time).
//
// Spec ref §5 C.2:
//   - reminderType radio: dayBefore / dayOf
//   - mode radio: dry-run (default) / single / all (with branch-name confirm)
//   - single: customer picker (simple search input; can be empty input)
//   - all: red warning banner + admin must type branch name verbatim
//   - "ทดสอบเลย" button → POST endpoint with admin token
//   - Result panel: {sent, failed, skipped} counts + details
//
// Note: this section is purely UI; the endpoint POST is wrapped here. Auth via
// Firebase ID token (mirrors customerLineLinkClient pattern).

import { useState } from 'react';
import { Loader2, AlertTriangle, Zap, CheckCircle2, AlertCircle } from 'lucide-react';
import { auth } from '../../firebase.js';

const ENDPOINT = '/api/admin/line-reminder-debug-fire';

const inputCls =
  'w-full px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-sm text-[var(--tx-primary)]';
const labelCls = 'block text-xs text-[var(--tx-muted)] mb-1';

async function getIdTokenForAdmin() {
  const u = auth?.currentUser;
  if (!u || typeof u.getIdToken !== 'function') {
    throw new Error('ต้องเข้าสู่ระบบก่อนเรียกใช้ debug-fire');
  }
  return u.getIdToken();
}

// V69 (2026-05-15) — extracted to satisfy iron-clad Vite-OXC ban on
// JSX-IIFE close pattern (`{(() => { ... })()}` crashes the OXC parser).
// Reads the endpoint response shape:
//   { ok, mode, totalAttempted, results: { sent, skipped, failed, details } }  for single|all
//   { ok, mode, totalEligible, previews }                                       for dry-run
// Pre-V69 the parent component read result.sent/skipped/failed from ROOT
// (wrong path — endpoint returns counters under `results.*`). Bug B fix.
function ResultPanel({ result, mode }) {
  const counters = result.results || {};
  const sent = Number(counters.sent || 0);
  const skipped = Number(counters.skipped || 0);
  const failed = Number(counters.failed || 0);
  const details = Array.isArray(counters.details) ? counters.details : [];
  const totalAttempted = Number(result.totalAttempted ?? result.totalEligible ?? 0);
  const previews = Array.isArray(result.previews) ? result.previews : [];
  const isDryRun = result.mode === 'dry-run';

  return (
    <div
      className="px-3 py-2 rounded-lg bg-emerald-900/15 border border-emerald-700/40 text-emerald-200 text-xs"
      data-testid="debug-fire-result"
    >
      <div className="flex items-start gap-2 mb-1.5">
        <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
        <strong>ผลลัพธ์ ({result.mode || mode}):</strong>
      </div>
      {isDryRun ? (
        <div className="ml-5 mb-2">
          <div className="text-[var(--tx-primary)]">
            ตรวจสอบนัดที่จะยิง: <strong data-testid="debug-fire-eligible">{totalAttempted}</strong> รายการ · ตัวอย่างที่จะส่ง: <strong>{previews.length}</strong>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 ml-5 mb-2">
            <div>
              <div className="text-[10px] text-[var(--tx-muted)]">Sent</div>
              <div className="text-emerald-300 font-bold text-lg" data-testid="debug-fire-sent">
                {sent}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--tx-muted)]">Skipped</div>
              <div className="text-amber-300 font-bold text-lg" data-testid="debug-fire-skipped">
                {skipped}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--tx-muted)]">Failed</div>
              <div className="text-red-300 font-bold text-lg" data-testid="debug-fire-failed">
                {failed}
              </div>
            </div>
          </div>
          {totalAttempted === 0 && (
            <div className="ml-5 mb-2 text-[11px] text-amber-300" data-testid="debug-fire-no-candidates">
              ⚠️ ไม่พบนัดหมายที่ตรงกับโหมดและวันที่ — ลองเปลี่ยนเป็นโหมด {mode === 'single' ? '"เข้าวันนัด (dayOf)"' : 'อื่น'} หรือตรวจสอบว่าลูกค้ามีนัดในวันนี้/พรุ่งนี้
            </div>
          )}
        </>
      )}
      {(details.length > 0 || previews.length > 0) && (
        <details className="mt-1 ml-5">
          <summary className="cursor-pointer text-[10px] text-[var(--tx-muted)] hover:text-[var(--tx-primary)]">
            รายละเอียด ({(details.length || previews.length)} รายการ)
          </summary>
          <pre className="text-[10px] font-mono mt-1 max-h-60 overflow-auto p-1.5 rounded bg-[var(--bg-hover)] text-[var(--tx-primary)]">
            {JSON.stringify(isDryRun ? previews : details, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}

export function LineReminderDebugSection({ branchId, branchName }) {
  const [reminderType, setReminderType] = useState('dayBefore'); // dayBefore | dayOf
  const [mode, setMode] = useState('dry-run');                   // dry-run | single | all
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [branchConfirm, setBranchConfirm] = useState('');
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);   // { sent, failed, skipped, details? }
  const [error, setError] = useState('');

  const allModeConfirmed =
    mode !== 'all' || (branchConfirm.trim() && branchConfirm.trim() === String(branchName || '').trim());

  // Single mode requires a customerId. Dry-run + all don't.
  const singleModeReady = mode !== 'single' || !!customerId;

  const canFire = !!branchId && allModeConfirmed && singleModeReady && !running;

  const handleFire = async () => {
    setError('');
    setResult(null);
    if (!canFire) return;
    setRunning(true);
    try {
      const token = await getIdTokenForAdmin();
      const payload = {
        branchId,
        reminderType,
        mode,
      };
      if (mode === 'single') payload.customerId = customerId;
      // V69 (2026-05-15) Bug C fix — endpoint destructures `confirmBranchName`
      // (api/admin/line-reminder-debug-fire.js:70). Pre-V69 UI sent
      // `branchNameConfirm` (different key) → server saw undefined →
      // String('').trim() → BRANCH_NAME_CONFIRM_MISMATCH on every all-mode click.
      if (mode === 'all') payload.confirmBranchName = branchConfirm.trim();

      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      let body = null;
      try { body = await res.json(); } catch { /* ignore non-JSON */ }
      if (!res.ok) {
        throw new Error(body?.error || `debug-fire ล้มเหลว (HTTP ${res.status})`);
      }
      setResult(body);
    } catch (e) {
      setError(e?.message || 'เกิดข้อผิดพลาดขณะยิง debug');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div
      className="rounded-xl bg-[var(--bg-card)] border border-[var(--bd)] p-4 space-y-3"
      data-testid="line-reminder-debug-section"
    >
      <div className="flex items-center gap-2">
        <Zap size={16} className="text-amber-400" />
        <h3 className="text-sm font-bold text-[var(--tx-heading)]">🔧 Debug ยิงแจ้งเตือน (ทดสอบ pipeline)</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className={labelCls}>ประเภทการแจ้งเตือน</label>
          <div className="flex items-center gap-3 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="reminderType"
                value="dayBefore"
                checked={reminderType === 'dayBefore'}
                onChange={() => setReminderType('dayBefore')}
                data-field="reminderType-dayBefore"
              />
              วันก่อนนัด (dayBefore)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="reminderType"
                value="dayOf"
                checked={reminderType === 'dayOf'}
                onChange={() => setReminderType('dayOf')}
                data-field="reminderType-dayOf"
              />
              เช้าวันนัด (dayOf)
            </label>
          </div>
        </div>

        <div>
          <label className={labelCls}>โหมด</label>
          <div className="flex flex-col gap-1.5 text-xs">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="mode"
                value="dry-run"
                checked={mode === 'dry-run'}
                onChange={() => setMode('dry-run')}
                data-field="mode-dry-run"
              />
              Dry-run preview (ไม่ push จริง — แนะนำ)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="mode"
                value="single"
                checked={mode === 'single'}
                onChange={() => setMode('single')}
                data-field="mode-single"
              />
              ยิงเฉพาะลูกค้า (เลือกคน)
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                name="mode"
                value="all"
                checked={mode === 'all'}
                onChange={() => setMode('all')}
                data-field="mode-all"
              />
              ยิงทุกคนพรุ่งนี้/วันนี้ (เทสจริง)
            </label>
          </div>
        </div>
      </div>

      {mode === 'single' && (
        <div data-testid="debug-fire-single-customer-picker">
          <label className={labelCls}>เลือกลูกค้า (กรอก customerId หรือชื่อ)</label>
          <input
            type="text"
            value={customerQuery}
            onChange={(e) => {
              setCustomerQuery(e.target.value);
              setCustomerId(e.target.value.trim());
            }}
            data-field="single-customer-query"
            className={inputCls}
            placeholder="LC-26000001 หรือชื่อลูกค้า..."
          />
          <p className="text-[10px] text-[var(--tx-muted)] mt-1">
            ลูกค้าจะต้องผูก LINE กับสาขานี้แล้ว — endpoint จะตรวจสอบ
          </p>
        </div>
      )}

      {mode === 'all' && (
        <div
          className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs"
          data-testid="debug-fire-all-warning"
        >
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>คำเตือน:</strong> โหมดนี้จะ push แจ้งเตือนไปยังทุกลูกค้าที่มีนัดในวันนี้/พรุ่งนี้
              ของสาขา <strong>{branchName}</strong> โปรดพิมพ์ชื่อสาขาเพื่อยืนยัน
            </div>
          </div>
          <input
            type="text"
            value={branchConfirm}
            onChange={(e) => setBranchConfirm(e.target.value)}
            data-field="branch-name-confirm"
            className={inputCls}
            placeholder={`พิมพ์ "${branchName}" เพื่อยืนยัน`}
          />
        </div>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2"
          data-testid="debug-fire-error">
          <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      {result && (
        <ResultPanel result={result} mode={mode} />
      )}

      <div className="flex items-center justify-end pt-1">
        <button
          type="button"
          onClick={handleFire}
          disabled={!canFire}
          data-testid="debug-fire-button"
          className="text-xs flex items-center gap-1 px-3 py-1.5 rounded font-bold bg-amber-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
          {running ? 'กำลังยิง...' : 'ทดสอบเลย'}
        </button>
      </div>
    </div>
  );
}

export default LineReminderDebugSection;
