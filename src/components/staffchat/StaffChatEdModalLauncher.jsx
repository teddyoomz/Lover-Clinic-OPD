// StaffChatEdModalLauncher (2026-07-04, spec ⑥) — "📊 ดูแบบประเมิน" from the
// staff-chat follow-up card. Opens THE SAME EDDetailModal the customer-detail
// page uses (2-panel compare, type tabs, round pickers, swap) — reuse, NO fork.
//
// Data chain mirrors CustomerDetailView + EDScoreBox exactly:
//   getCustomer → intakePerf = pickKioskAssessmentFields(patientData) +
//   assessmentDate (round-1 virtual) · listenToAssessments(customerId) LIVE —
//   a round the Cloud Function just materialized pops into the open modal by
//   itself · deriveRounds → hero (latest) + first ED type with data.
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Loader2 } from 'lucide-react';
import { deriveRounds } from '../../lib/assessmentRoundsCore.js';
import { pickKioskAssessmentFields } from '../../lib/kioskAssessmentFields.js';
import { getCustomer, listenToAssessments } from '../../lib/scopedDataLayer.js';
import { useResolvedTheme } from '../../hooks/useTheme.js';
import { useEscToClose } from '../../lib/useEscToClose.js';
import EDDetailModal from '../backend/EDDetailModal.jsx';

const ED_ORDER = ['adam', 'iief', 'mrs', 'pe']; // EDScoreBox display order

export function StaffChatEdModalLauncher({ customerId, onClose }) {
  const resolvedTheme = useResolvedTheme();
  const isDark = resolvedTheme !== 'light';
  const [customer, setCustomer] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // (bug-hunt R1 #2/#5/#8) mount EDDetailModal only after the FIRST assessments
  // snapshot: EDDetailModal captures round?.id into state ONCE — mounting off
  // intakePerf alone (getCustomer winning the race) would lock the primary
  // panel to the intake round instead of the just-submitted one, and a
  // customer with follow-up-only rounds would flash "ยังไม่มีแบบประเมิน".
  const [assessLoaded, setAssessLoaded] = useState(false);
  const [assessments, setAssessments] = useState([]);

  // ESC also closes the loading/empty portals (stack-disciplined; the real
  // EDDetailModal registers its own token once mounted).
  useEscToClose(onClose);

  useEffect(() => {
    let alive = true;
    getCustomer(customerId)
      .then((c) => { if (alive) { setCustomer(c || null); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [customerId]);

  // LIVE — modal updates itself when the CF materializes the just-submitted round
  useEffect(() => {
    if (!customerId) { setAssessLoaded(true); return undefined; }
    setAssessLoaded(false);
    const unsub = listenToAssessments(
      customerId,
      (rows) => { setAssessments(Array.isArray(rows) ? rows : []); setAssessLoaded(true); },
      (err) => { console.warn('[StaffChatEdModalLauncher] assessments listener failed', err); setAssessLoaded(true); },
    );
    return () => { if (typeof unsub === 'function') unsub(); };
  }, [customerId]);

  const intakePerf = useMemo(() => {
    const pd = customer?.patientData || {};
    const ca = customer?.createdAt;
    const ms = ca?.toMillis?.() ?? (typeof ca === 'number' ? ca : (typeof ca === 'string' ? Date.parse(ca) : 0));
    const createdISO = ms && !Number.isNaN(ms) ? new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) : '';
    return { ...pickKioskAssessmentFields(pd), assessmentDate: (pd?.assessmentDate || createdISO || '') };
  }, [customer]);

  const rounds = useMemo(() => deriveRounds(intakePerf, assessments), [intakePerf, assessments]);
  const hero = rounds.length ? rounds[rounds.length - 1] : null;
  const type = hero ? (ED_ORDER.find((t) => Array.isArray(hero.types) && hero.types.includes(t)) || (hero.types && hero.types[0]) || 'adam') : 'adam';

  if (!loaded || !assessLoaded) {
    return createPortal(
      // z-[9600] (bug-hunt R1 #1): chat panel is z-[9000] — chat-launched
      // overlays sit ABOVE it (NamePicker 9500 / lightbox+pdf 9700 tier).
      <div className="fixed inset-0 z-[9600] flex items-center justify-center bg-black/50" data-testid="staffchat-ed-loading">
        <div className="flex items-center gap-2 text-sm text-white/80"><Loader2 size={16} className="animate-spin" /> กำลังโหลดแบบประเมิน…</div>
      </div>,
      document.body,
    );
  }

  if (!hero) {
    return createPortal(
      <div className="fixed inset-0 z-[9600] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" data-testid="staffchat-ed-empty">
        <div className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-xl shadow-2xl p-5 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-bold text-[var(--tx-primary)] mb-1">ยังไม่มีแบบประเมิน</p>
          <p className="text-xs text-[var(--tx-muted)] mb-4">{customer ? 'ลูกค้าคนนี้ยังไม่มีผลการประเมินในระบบ' : 'ไม่พบข้อมูลลูกค้า'}</p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold border border-[var(--bd)] text-[var(--tx-secondary)] hover:bg-[var(--bg-hover)] inline-flex items-center gap-1.5"
          >
            <X size={12} /> ปิด
          </button>
        </div>
      </div>,
      document.body,
    );
  }

  // The REAL modal — portals to document.body itself (AV98). z-[9600] lifts it
  // above the chat panel (z-9000); CDV's own usage keeps the default z-[110].
  return <EDDetailModal type={type} round={hero} rounds={rounds} hero={hero} isDark={isDark} onClose={onClose} zClassName="z-[9600]" />;
}

export default StaffChatEdModalLauncher;
