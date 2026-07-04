// StaffChatIntakeModal (2026-07-04, spec ⑤) — "📄 ดูข้อมูลรับเข้า" from the
// staff-chat intake card. Portal modal (precedent: StaffChatImageLightbox)
// hosting the SHARED OpdIntakeDetailBody — identical content to the queue's
// "ประวัติผู้ป่วย OPD" modal.
//
// Data fallback chain (works for EVERY registration flow):
//   1) live opd_sessions/{sessionId} (kiosk/queue flow — session survives)
//   2) session gone (booking flow HARD-DELETES it, AV131) → getCustomer +
//      synthesizeSessionFromCustomer (__synthetic — AppointmentHub precedent)
//   3) neither → "ไม่พบข้อมูลรับเข้า"
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2, FileText } from 'lucide-react';
import { OpdIntakeDetailBody } from '../OpdIntakeDetailBody.jsx';
import { useEscToClose } from '../../lib/useEscToClose.js';

export function StaffChatIntakeModal({ sessionId, customerId, name, onClose }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  // ESC closes (AV78 — backdrop click does NOT close). Stack-disciplined
  // (bug-hunt R1 #12): when stacked over another modal, ESC closes only the top.
  useEscToClose(onClose);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (sessionId) {
          const [{ doc, getDoc }, { db, appId }] = await Promise.all([
            import('firebase/firestore'),
            import('../../firebase.js'),
          ]);
          const snap = await getDoc(doc(db, `artifacts/${appId}/public/data/opd_sessions/${sessionId}`));
          if (snap.exists()) {
            if (alive) { setSession({ id: snap.id, ...snap.data() }); setLoading(false); }
            return;
          }
        }
        if (customerId) {
          const [{ getCustomer }, { synthesizeSessionFromCustomer }] = await Promise.all([
            import('../../lib/scopedDataLayer.js'),
            import('../../lib/opdSessionState.js'),
          ]);
          const c = await getCustomer(customerId);
          if (c) {
            if (alive) { setSession(synthesizeSessionFromCustomer(c)); setLoading(false); }
            return;
          }
        }
        if (alive) { setSession(null); setLoading(false); }
      } catch {
        if (alive) { setSession(null); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [sessionId, customerId]);

  return createPortal(
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / ESC).
    // z-[9600] (bug-hunt R1 #1): the staff-chat panel is z-[9000] — a modal
    // launched FROM it must stack above (NamePicker 9500 / lightbox 9700 tier);
    // the original low z rendered BENEATH the near-full-screen mobile panel.
    <div
      className="fixed inset-0 z-[9600] flex items-center justify-center p-2 md:p-4 bg-black/70 backdrop-blur-sm"
      data-testid="staffchat-intake-modal"
    >
      <div
        className="bg-[var(--bg-elevated)] border border-[var(--bd)] rounded-xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-[var(--bd)] flex items-center gap-2 shrink-0 bg-[var(--bg-surface)]">
          <FileText size={16} className="text-red-400 flex-none" />
          <h2 className="text-sm font-bold text-[var(--tx-primary)] truncate">
            📄 ประวัติผู้ป่วย OPD{name ? ` — ${name}` : ''}
          </h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="staffchat-intake-modal-close"
            className="ml-auto w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)] flex-none"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>
        <div className="p-4 md:p-6 overflow-y-auto bg-[var(--bg-base)] flex-1">
          {loading ? (
            <div className="p-12 flex items-center justify-center text-[var(--tx-muted)] gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> กำลังโหลดข้อมูลรับเข้า…
            </div>
          ) : session ? (
            <OpdIntakeDetailBody session={session} showClinicalSummary />
          ) : (
            <div className="p-12 text-center text-[var(--tx-muted)] text-sm" data-testid="staffchat-intake-notfound">
              ไม่พบข้อมูลรับเข้า
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default StaffChatIntakeModal;
