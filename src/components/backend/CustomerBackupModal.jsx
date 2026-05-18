// V74 — CustomerBackupModal — admin clicks "💾 สำรองข้อมูล" on CustomerDetailView.
// POSTs /api/admin/customer-backup-export → toast with download link + counts.

import { useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { auth } from '../../firebase.js';

async function authedFetch(url, body) {
  const token = await auth.currentUser?.getIdToken();
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

export default function CustomerBackupModal({ customer, onClose }) {
  const [userNote, setUserNote] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | running | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const customerHN = customer?.hn_no || customer?.id || '?';
  const customerName = [customer?.prefix, customer?.firstname, customer?.lastname]
    .filter(Boolean).join(' ').trim() || '(ไม่มีชื่อ)';

  async function handleBackup() {
    setPhase('running');
    setError(null);
    setResult(null);
    try {
      const res = await authedFetch('/api/admin/customer-backup-export', {
        customerId: customer.id,
        userNote: userNote.trim(),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || 'BACKUP_FAILED');
        setPhase('error');
        return;
      }
      setResult(data);
      setPhase('done');
    } catch (e) {
      setError(e?.message || 'NETWORK_ERROR');
      setPhase('error');
    }
  }

  return (
    /* AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC) */
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 backdrop-blur-sm" role="dialog" data-testid="customer-backup-modal">
      <div className="w-[95vw] max-w-xl rounded-xl bg-[var(--bg-card)] border border-amber-700/40 p-6 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-amber-200">💾 สำรองข้อมูลลูกค้า</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="ปิด">
            <X size={20} />
          </button>
        </div>

        <div className="text-sm text-gray-300 space-y-1 border-l-2 border-amber-700/40 pl-3">
          <div><span className="text-gray-500">HN:</span> <span className="font-bold">{customerHN}</span></div>
          <div><span className="text-gray-500">ชื่อ:</span> {customerName}</div>
          <div className="text-xs text-gray-500 italic mt-2">
            ระบบจะสำรองข้อมูลลูกค้าทั้งหมด (คอร์ส + บริการ + ประวัติ + นัด + เงินมัดจำ + ผูก LINE + รูป + chat + อื่นๆ) ไปยัง Storage และคืนลิงก์ดาวน์โหลด (อายุ 24 ชั่วโมง)
          </div>
        </div>

        {phase === 'idle' && (
          <>
            <label className="block text-sm font-medium text-gray-300">
              บันทึก (ไม่จำเป็น — ปะป้ายให้จำง่าย)
              <textarea
                value={userNote}
                onChange={(e) => setUserNote(e.target.value.slice(0, 200))}
                placeholder="เช่น &quot;EOD 2026-05-16 ก่อนแก้ข้อมูล&quot;"
                className="mt-1 w-full px-3 py-2 rounded-lg bg-gray-900 border border-gray-700 text-sm text-gray-100 focus:border-amber-500 focus:outline-none"
                rows={2}
                maxLength={200}
                data-testid="user-note-textarea"
              />
              <span className="text-xs text-gray-500">{userNote.length} / 200</span>
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800" data-testid="cancel-btn">
                ยกเลิก
              </button>
              <button onClick={handleBackup} className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white" data-testid="confirm-backup-btn">
                💾 เริ่มสำรอง
              </button>
            </div>
          </>
        )}

        {phase === 'running' && (
          <div className="flex items-center gap-3 py-6 text-amber-300">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">กำลังสำรองข้อมูล + รูปภาพ + ประวัติ ... (อาจใช้เวลาหลายวินาทีหากมีรูปจำนวนมาก)</span>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="space-y-3" data-testid="backup-success">
            <div className="flex items-center gap-2 text-green-400">
              <CheckCircle2 size={20} />
              <span className="font-bold">สำรองข้อมูลสำเร็จ</span>
            </div>
            <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-3 space-y-2 text-xs text-gray-300">
              <div><span className="text-gray-500">File path:</span> <code className="text-amber-300">{result.backupRef}</code></div>
              <div><span className="text-gray-500">Size:</span> {(result.sizeBytes / 1024).toFixed(1)} KB</div>
              <div><span className="text-gray-500">Body hash:</span> <code className="text-gray-400 text-[10px]">{result.bodyHash?.slice(0, 16)}…</code></div>
              <div><span className="text-gray-500">Storage objects:</span> {result.storageObjectCount}</div>
              <div><span className="text-gray-500">Cascade docs:</span> {Object.values(result.perCollectionCounts || {}).reduce((a, b) => a + b, 0)}</div>
              <div><span className="text-gray-500">Subcollection docs:</span> {Object.values(result.subcollectionCounts || {}).reduce((a, b) => a + b, 0)}</div>
              <div><span className="text-gray-500">Chat conversations:</span> {result.chatConversationCount}</div>
            </div>
            <div className="flex justify-end gap-2">
              {result.downloadUrl && (
                <a
                  href={result.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-lg text-sm font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5"
                  data-testid="download-backup-btn"
                >
                  <Download size={14} /> ดาวน์โหลด (24h)
                </a>
              )}
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800" data-testid="close-btn">
                ปิด
              </button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="space-y-3" data-testid="backup-error">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle size={20} />
              <span className="font-bold">สำรองข้อมูลล้มเหลว</span>
            </div>
            <div className="text-xs text-rose-200 bg-rose-950/30 border border-rose-800/40 rounded-lg p-3">
              <code>{error}</code>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setPhase('idle'); setError(null); }} className="px-4 py-2 rounded-lg text-sm border border-amber-700/50 text-amber-300 hover:bg-amber-950/30" data-testid="retry-btn">
                ลองใหม่
              </button>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm border border-gray-700 text-gray-300 hover:bg-gray-800" data-testid="close-btn">
                ปิด
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
