import { useState } from 'react';
import { createPortal } from 'react-dom';
import TabletReadyList from './TabletReadyList.jsx';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

// props: branchId, phase ('choose'|'waiting'|'failed'), error, onEditHere,
// onSendToTablet(deviceObj), onCancel, onRetry, onClose.
// AV78: the backdrop does NOT close — only the explicit ปิด / ยกเลิก buttons do.
export default function PcPairingModal({ branchId, phase, error, onEditHere, onSendToTablet, onCancel, onRetry, onClose }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const [picked, setPicked] = useState(null);
  // V123 (2026-05-27) — createPortal to document.body (AV143). Same trap class
  // as AV117: rendered inside ChartSection → TFP `fixed inset-0`; portal keeps
  // the choice modal viewport-centered regardless of ancestor transforms.
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/50 flex items-center justify-center overflow-y-auto overscroll-contain">
      <div className="bg-neutral-900 text-neutral-100 rounded-xl p-5 w-[360px] max-w-[92vw]" onClick={e => e.stopPropagation()}>
        {phase === 'choose' && (<>
          <h3 className="text-base mb-3">แก้ไข Chart ที่ไหน?</h3>
          <button data-testid="edit-here" onClick={onEditHere} className="w-full border border-neutral-600 rounded py-2 mb-2">🖥️ แก้ที่เครื่องนี้</button>
          <div className="border border-emerald-600 rounded p-2 mb-3 bg-emerald-500/10">
            <div className="text-sm mb-2">📱 แก้ที่แท็บเล็ต</div>
            <TabletReadyList branchId={branchId} value={picked?.deviceId} onChange={setPicked} />
            <button data-testid="send-tablet" disabled={!picked} onClick={() => onSendToTablet(picked)}
              className="w-full mt-2 bg-emerald-500 text-black rounded py-2 disabled:opacity-40">ส่งไปแท็บเล็ต →</button>
          </div>
          <button data-testid="pairing-close" onClick={onClose} className="text-sm text-neutral-400">ปิด</button>
        </>)}
        {phase === 'waiting' && (<div className="text-center">
          <div className="text-3xl my-2">⏳</div>
          <div className="text-sm mb-1">กำลังแก้ที่ {picked?.deviceName || 'แท็บเล็ต'}…</div>
          <div className="text-xs text-neutral-500 mb-3">รอการบันทึกจากแท็บเล็ต</div>
          <button data-testid="waiting-cancel" onClick={onCancel} className="border border-neutral-600 rounded px-4 py-2">ยกเลิก</button>
        </div>)}
        {phase === 'failed' && (<div className="text-center">
          <div className="text-3xl my-2">❌</div>
          <div className="text-sm mb-1">การแก้ไขล้มเหลว</div>
          <div className="text-xs text-neutral-500 mb-3">{error}</div>
          <button data-testid="failed-retry" onClick={onRetry} className="border border-neutral-600 rounded px-4 py-2">ลองใหม่</button>
        </div>)}
      </div>
    </div>,
    document.body,
  );
}
