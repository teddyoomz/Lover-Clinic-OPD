// EDFollowupModal — doctor sends a follow-up ED assessment to the customer.
// Shows "ครั้งที่ N" (derived), a type picker (ADAM/IIEF/MRS/PE), then mints a
// per-round be_assessments(pending) + an opd_session(followup_ed, types[], +1d
// expiry) and renders a link + QR (full-screen for the customer to scan on mobile).
// AV78: backdrop click does NOT close — explicit close only (X / ปิด / ESC).
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { QrCode, X, Copy, Maximize2 } from 'lucide-react';
import { ED_TYPE_META } from '../../lib/edScoreDisplay.js';
import { createAssessmentRound, createAssessmentSession, supersedePendingFollowups } from '../../lib/scopedDataLayer.js';
import { generateQrDataUrl } from '../../lib/documentPrintEngine.js';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

const TYPE_ORDER = ['adam', 'iief', 'mrs', 'pe'];
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export default function EDFollowupModal({ customerId, roundNumber, intakeTypes, branchId, confirmInfo, isDark, onClose, onCreated }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const defaults = intakeTypes && intakeTypes.length ? intakeTypes : ['adam', 'iief'];
  const [picked, setPicked] = useState(() => new Set(defaults));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState(null); // { link, qr, sessionId }
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (fullscreen) setFullscreen(false); else onClose?.(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen, onClose]);

  const toggle = (t) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(t)) next.delete(t); else next.add(t);
    return next;
  });
  // Named close handlers (NOT inline `() => onClose()` / `() => setFullscreen(false)`)
  // so the AV78 audit (backdrop-must-not-close) sees these are on BUTTONS, not the
  // backdrop. The backdrop divs themselves carry NO onClick (explicit-close-only).
  const closeModal = () => onClose?.();
  const openFullscreen = () => setFullscreen(true);
  const closeFullscreen = () => setFullscreen(false);

  const handleCreate = async () => {
    const types = TYPE_ORDER.filter((t) => picked.has(t));
    if (types.length === 0) { setErr('เลือกอย่างน้อย 1 แบบประเมิน'); return; }
    setErr(''); setBusy(true);
    try {
      // R3 — kill any prior PENDING link + round for this customer+branch FIRST,
      // so only this newest link is valid (prevents duplicate submissions).
      await supersedePendingFollowups({ customerId, branchId });
      const expiresAt = Date.now() + ONE_DAY_MS;
      const roundId = await createAssessmentRound({ customerId, types, expiresAt });
      // R1 — confirmInfo (read-only identity snapshot) so the link shows the
      // customer instead of asking them to re-type their data.
      const sessionId = await createAssessmentSession({ customerId, types, branchId, expiresAt, roundId, confirmInfo });
      const link = `${window.location.origin}/?session=${sessionId}`;
      const qr = await generateQrDataUrl(link, { width: 600 });
      setResult({ link, qr, sessionId });
      onCreated?.({ roundId, sessionId });
    } catch (e) {
      setErr('สร้างลิงก์ไม่สำเร็จ: ' + (e?.message || e));
    } finally { setBusy(false); }
  };

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(result.link); } catch { /* clipboard blocked — link is visible */ }
  };

  const panel = isDark ? 'bg-[#0a0a0a] border-[#222] text-[var(--tx-primary)]' : 'bg-white border-gray-200 text-[var(--tx-primary)]';

  // Full-screen QR — portaled to document.body (AV98) so a glow-card ancestor
  // can't confine this fixed overlay.
  if (fullscreen && result) {
    return createPortal(
      <div className="fixed inset-0 z-[120] bg-black flex flex-col items-center justify-center p-4 overflow-y-auto overscroll-contain" data-testid="ed-qr-fullscreen" role="dialog" aria-modal="true" aria-label="QR แบบประเมินติดตาม">
        <div className="flex items-center justify-between w-full max-w-md mb-4">
          <span className="text-white font-bold">แบบประเมิน ครั้งที่ {roundNumber}</span>
          <button type="button" onClick={closeFullscreen} aria-label="ปิด" className="text-gray-400 hover:text-white p-2 -m-2" data-testid="ed-qr-fullscreen-close"><X size={24} /></button>
        </div>
        <img src={result.qr} alt="QR แบบประเมิน" className="w-full max-w-md aspect-square rounded-xl bg-white" />
        <div className="text-gray-300 text-sm mt-4 text-center">ให้ลูกค้าสแกนด้วยกล้องมือถือ</div>
        <div className="text-gray-500 text-xs mt-1 text-center">ลิงก์หมดอายุใน 1 วัน หรือเมื่อกรอกเสร็จ</div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    // AV98: portal to document.body so a glow-card ancestor can't confine this fixed overlay.
    <div className="fixed inset-0 z-[110] bg-black/60 flex items-center justify-center p-4 overflow-y-auto overscroll-contain" data-testid="ed-followup-modal" role="dialog" aria-modal="true" aria-labelledby="ed-followup-title">
      <div className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border ${panel}`}>
        <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center justify-between">
          <span id="ed-followup-title" className="font-bold">ส่งแบบประเมินติดตาม — <span className="text-orange-500">ครั้งที่ {roundNumber}</span></span>
          <button type="button" onClick={closeModal} aria-label="ปิด" className="text-[var(--tx-muted)] hover:text-[var(--tx-secondary)] p-2 -m-2" data-testid="ed-modal-close"><X size={18} /></button>
        </div>

        <div className="p-4">
          {!result ? (
            <>
              <div className="text-[11px] text-[var(--tx-muted)] mb-2">เลือกแบบประเมินที่จะส่ง</div>
              <div className="flex flex-col gap-2">
                {TYPE_ORDER.map((t) => (
                  <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={picked.has(t)} onChange={() => toggle(t)} data-testid={`ed-type-${t}`} className="rounded border-gray-400 accent-orange-500" />
                    <span className="font-bold">{ED_TYPE_META[t].label}</span>
                    <span className="text-[var(--tx-muted)] text-xs">({ED_TYPE_META[t].full})</span>
                  </label>
                ))}
              </div>
              {err && <div className="mt-3 text-xs text-red-500">{err}</div>}
              <button type="button" onClick={handleCreate} disabled={busy} data-testid="ed-create-link-btn"
                className="mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 disabled:opacity-50">
                <QrCode size={16} /> {busy ? 'กำลังสร้าง…' : 'สร้างลิงก์ + QR'}
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center">
              <button type="button" onClick={openFullscreen} data-testid="ed-qr-fullscreen-btn" title="แตะขยายเต็มจอ">
                <img src={result.qr} alt="QR แบบประเมิน" className="w-40 h-40 rounded-lg bg-white" />
              </button>
              <div className="text-[11px] text-[var(--tx-muted)] mt-2">หมดอายุใน 1 วัน หรือเมื่อกรอกเสร็จ</div>
              <div className="w-full mt-3 text-xs break-all bg-black/[0.04] dark:bg-white/[0.04] rounded-md px-2 py-1.5 text-blue-500">{result.link}</div>
              <div className="flex gap-2 mt-3 w-full">
                <button type="button" onClick={copyLink} data-testid="ed-copy-link-btn"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-blue-500/40 text-blue-500 hover:bg-blue-500/10">
                  <Copy size={14} /> คัดลอกลิงก์
                </button>
                <button type="button" onClick={openFullscreen} data-testid="ed-qr-fullscreen-btn-2"
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-orange-500/40 text-orange-500 hover:bg-orange-500/10">
                  <Maximize2 size={14} /> QR เต็มจอ
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
