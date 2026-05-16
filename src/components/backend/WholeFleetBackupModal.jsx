// src/components/backend/WholeFleetBackupModal.jsx
// V77 (2026-05-16 EOD+1) — One-click whole-fleet customer backup trigger.
//
// POSTs to /api/admin/whole-fleet-customer-backup-export with userNote +
// optional branchId filter. Shows progress + result panel with manifest
// download link + per-customer counts + failedCustomers warnings.
//
// Long-running by nature (6500 customers × Storage hash takes minutes).
// vercel.json bumps function maxDuration to 300s. For ENORMOUS clinics
// (>5000 customers) the CLI mirror is recommended:
//   node scripts/customer-backup-export.mjs --all-customers --apply

import { useState } from 'react';
import { X, Loader2, Download, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { auth } from '../../firebase.js';

export default function WholeFleetBackupModal({ isOpen, onClose, onComplete }) {
  const [userNote, setUserNote] = useState('');
  const [branchIdFilter, setBranchIdFilter] = useState('');
  const [maxCustomers, setMaxCustomers] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('ไม่ได้ login');
      const payload = {
        userNote: userNote.trim(),
        branchId: branchIdFilter.trim(),
      };
      const maxN = parseInt(maxCustomers, 10);
      if (Number.isFinite(maxN) && maxN > 0) payload.maxCustomers = maxN;
      const r = await fetch('/api/admin/whole-fleet-customer-backup-export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      // V77-fix1 (2026-05-16 NIGHT — Rule Q L1 user-found bug): the
      // endpoint can return non-JSON bodies (Vercel's "An error occurred"
      // plain text on timeout/crash/OOM). Parse defensively: read text,
      // try JSON; on fail, surface the raw body + HTTP status so the
      // real failure mode is visible to the admin instead of being
      // masked by a generic "Unexpected token 'A'..." JSON.parse error.
      const text = await r.text();
      let json = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        // Non-JSON response (usually Vercel timeout / crash page)
        const head = text.slice(0, 240).trim();
        throw new Error(
          `HTTP ${r.status} — non-JSON response (likely Vercel timeout/crash). ` +
            `Body head: "${head}" · ลองลด maxCustomers (เช่น 5-10) หรือใช้ CLI: ` +
            `scripts/customer-backup-export.mjs --all-customers --apply`
        );
      }
      if (!r.ok || !json || !json.ok) {
        throw new Error(json?.error || `HTTP ${r.status}`);
      }
      setResult(json);
      if (typeof onComplete === 'function') onComplete(json);
    } catch (e) {
      setError(e?.message || 'BACKUP_FAILED');
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    setUserNote('');
    setBranchIdFilter('');
    setResult(null);
    setError('');
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
      onClick={handleClose}
      data-testid="whole-fleet-backup-modal"
    >
      <div
        className="bg-slate-900 border border-amber-700/40 rounded-lg p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-amber-200">📦 สำรองลูกค้าทุกคน</h2>
          <button
            onClick={handleClose}
            disabled={busy}
            className="text-slate-400 hover:text-slate-200 disabled:opacity-40"
            aria-label="ปิด"
          >
            <X size={20} />
          </button>
        </div>

        {!result && (
          <div className="space-y-4">
            <div className="text-xs text-slate-300 bg-slate-800/40 border border-slate-700 rounded p-3">
              ⚠ การสำรองข้อมูลลูกค้าทุกคนอาจใช้เวลานาน (หลายนาที). ห้ามปิด tab
              ระหว่างกำลังสำรอง. ไฟล์ manifest + per-customer backup เก็บที่
              <code className="font-mono text-xs text-amber-300"> backups/whole-fleet-customers/</code>
              และไฟล์ลูกค้าแต่ละคนที่
              <code className="font-mono text-xs text-amber-300"> backups/customers/{'{cid}'}/</code>.
            </div>

            <label className="block">
              <span className="text-sm text-slate-200">หมายเหตุ (เช่น "สำรองก่อน migration")</span>
              <textarea
                value={userNote}
                onChange={(e) => setUserNote(e.target.value)}
                rows={2}
                maxLength={200}
                disabled={busy}
                className="mt-1 w-full p-2 bg-slate-800 rounded border border-slate-700 text-sm text-slate-100 disabled:opacity-50"
                placeholder="EOD pre-migration / quarterly snapshot / ..."
                data-testid="whole-fleet-user-note"
              />
              <span className="text-[10px] text-slate-500">{userNote.length}/200</span>
            </label>

            <label className="block">
              <span className="text-sm text-slate-200">
                จำกัดแค่สาขา (optional — เว้นว่าง = ทุกสาขา)
              </span>
              <input
                type="text"
                value={branchIdFilter}
                onChange={(e) => setBranchIdFilter(e.target.value)}
                disabled={busy}
                className="mt-1 w-full p-2 bg-slate-800 rounded border border-slate-700 text-sm text-slate-100 font-mono disabled:opacity-50"
                placeholder="BR-XXXX (optional)"
                data-testid="whole-fleet-branch-filter"
              />
            </label>

            <label className="block">
              <span className="text-sm text-slate-200">
                ทดสอบเฉพาะ N ลูกค้าแรก (optional — เว้นว่าง = ทุกคน)
              </span>
              <input
                type="number"
                min="1"
                max="10000"
                value={maxCustomers}
                onChange={(e) => setMaxCustomers(e.target.value)}
                disabled={busy}
                className="mt-1 w-full p-2 bg-slate-800 rounded border border-slate-700 text-sm text-slate-100 font-mono disabled:opacity-50"
                placeholder="ลองใส่ 5 ถ้า timeout"
                data-testid="whole-fleet-max-customers"
              />
              <span className="text-[10px] text-slate-500">
                Endpoint หมดเวลาที่ 300s. ถ้าลูกค้าเยอะ + Storage เยอะ → ลองใส่
                5-20 ก่อน. ถ้ายังหมดเวลา → ใช้ CLI:{' '}
                <code className="text-amber-300">
                  scripts/customer-backup-export.mjs --all-customers --apply
                </code>
              </span>
            </label>

            {error && (
              <div className="rounded border border-rose-700/40 bg-rose-950/30 p-3 text-rose-300 text-sm flex items-start gap-2">
                <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
              </div>
            )}

            <button
              onClick={start}
              disabled={busy}
              data-testid="whole-fleet-start-btn"
              className="w-full px-4 py-2 rounded bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  กำลังสำรอง... (อาจใช้เวลาหลายนาที)
                </>
              ) : (
                <>📦 เริ่มสำรองลูกค้าทุกคน</>
              )}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-3" data-testid="whole-fleet-result">
            <div className="rounded border border-emerald-700/40 bg-emerald-950/30 p-3 text-emerald-300 text-sm flex items-start gap-2">
              <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
              <div>
                <div className="font-bold">✅ สำรองสำเร็จ</div>
                <div className="text-xs text-emerald-200/80 mt-1">
                  ลูกค้า {result.successful} คน ({result.failed} fail) · ใช้เวลา{' '}
                  {(result.durationMs / 1000).toFixed(1)}s
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-1">
              <div>
                <span className="text-slate-500">Total scanned:</span> {result.scanned} ·
                <span className="text-slate-500 ml-2">Branch filter:</span>{' '}
                {result.branchIdFilter || '(ทุกสาขา)'}
              </div>
              <div>
                <span className="text-slate-500">Manifest:</span>{' '}
                <code className="font-mono text-amber-300 break-all">{result.manifestRef}</code>
              </div>
              <div>
                <span className="text-slate-500">manifestHash:</span>{' '}
                <code className="font-mono text-slate-400 text-[10px] break-all">
                  {result.manifestHash}
                </code>
              </div>
              <div>
                <span className="text-slate-500">Size:</span>{' '}
                {(result.sizeBytes / 1024).toFixed(2)} KB
              </div>
            </div>

            {result.failed > 0 && (
              <div className="rounded border border-amber-700/40 bg-amber-950/30 p-3 text-amber-300 text-sm">
                <div className="font-bold mb-1 flex items-center gap-1">
                  <AlertTriangle size={14} /> {result.failed} ลูกค้า fail
                </div>
                <ul className="text-xs space-y-0.5 max-h-40 overflow-y-auto">
                  {(result.failedCustomers || []).map((f, i) => (
                    <li key={i}>
                      <code className="font-mono text-amber-200">{f.cid}</code>: {f.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <a
              href={result.downloadUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center px-4 py-2 rounded bg-sky-700 hover:bg-sky-600 text-white font-bold"
              data-testid="whole-fleet-download-link"
            >
              <Download size={14} className="inline mr-1" />
              ดาวน์โหลด manifest.json
            </a>

            <button
              onClick={handleClose}
              className="w-full px-4 py-2 rounded border border-slate-700 hover:bg-slate-800 text-slate-300"
            >
              ปิด
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
