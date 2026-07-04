// src/components/staffchat/StaffChatSystemCard.jsx — the "ระบบ" notification card
// rendered for staff-chat messages with a `system` payload (AV198).
// Style A (user-approved): full card, sparkles icon, fire-red identity accent,
// headline by kind, customer row that live-resolves to a CLICKABLE name + HN.
// The customer NAME is ALWAYS sky-blue, NEVER red (Thai culture — no red on a
// patient name/HN); gold when VIP (2026-07-04). Fire-red is only the icon +
// the left accent border — EXCEPT the tfp-doctor card which is violet.
//
// (2026-07-04 spec ③④⑤⑥) 4 card kinds now carry an action button (v2-A
// "tinted per card accent" — flat chip-language, no gradient/glow):
//   intake      → 📄 ดูข้อมูลรับเข้า   (StaffChatIntakeModal — shared OPD body)
//   followup    → 📊 ดูแบบประเมิน     (EDDetailModal via StaffChatEdModalLauncher)
//   tfp-vitals  → 🩺 เปิดบันทึกการรักษา (deep link ?treatment= — new tab)
//   tfp-doctor  → 🩺 เปิดบันทึกการรักษา + "โดยแพทย์: …" (violet card)
import { useState } from 'react';
import { Sparkles, ExternalLink } from 'lucide-react';
import { useSystemCardCustomer } from '../../lib/staffChatNotifyResolve.js';
import { buildTreatmentEditUrl } from '../../lib/customerNavigation.js';
import { VipName } from '../VipBadge.jsx';
import { StaffChatIntakeModal } from './StaffChatIntakeModal.jsx';
import { StaffChatEdModalLauncher } from './StaffChatEdModalLauncher.jsx';
import { useStaffChatSystemModal } from './StaffChatSystemModalHost.jsx';

const HEADLINE = {
  intake: 'กรอกข้อมูลรับเข้าเสร็จแล้ว',
  followup: 'กรอกแบบประเมินติดตามเสร็จแล้ว',
  'tfp-vitals': '📋 บันทึกซักประวัติเสร็จแล้ว',
  'tfp-doctor': '🩺 แพทย์ลงบันทึกเสร็จแล้ว',
};

// v2-A button classes — red tint on red-accent cards, violet tint on the
// doctor card. Same chip language as the HN/LINE/status chips already in chat.
const BTN_RED = 'mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold border transition-colors bg-red-500/10 border-red-500/25 text-red-700 dark:text-rose-300 hover:bg-red-500/20';
const BTN_VIOLET = 'mt-2 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[12px] font-bold border transition-colors bg-violet-500/10 border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/20';

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatSystemCard({ message }) {
  const sys = message.system || {};
  const kind = sys.kind || 'intake';
  const { pending, missing, customerId, name, hn } = useSystemCardCustomer(message);
  const time = formatTime(message.createdAt);
  const isDoctorCard = kind === 'tfp-doctor';
  const accent = isDoctorCard ? '#7c3aed' : '#ef4444';
  // (⑤⑥) in-chat modals — PREFER the widget-level host (bug-hunt R1 #3: the
  // 50-message window can evict this card while the modal is open; a hosted
  // modal survives on a click-time snapshot). Cards mounted without the host
  // (standalone tests / embeds) fall back to local state.
  const modalHost = useStaffChatSystemModal();
  const [showIntake, setShowIntake] = useState(false);
  const [showAssessment, setShowAssessment] = useState(false);
  const openIntake = () => {
    if (modalHost) modalHost.open({ type: 'intake', sessionId: sys.sessionId, customerId, name });
    else setShowIntake(true);
  };
  const openAssessment = () => {
    if (modalHost) modalHost.open({ type: 'assessment', customerId });
    else setShowAssessment(true);
  };

  return (
    <div
      data-testid="staff-chat-system-card"
      data-kind={kind}
      data-pending={pending ? 'true' : 'false'}
      className="self-stretch rounded-r-xl border border-l-4 px-3 py-2.5 my-0.5 max-w-[92%]"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--bd)', borderLeftColor: accent }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full flex-none" style={{ background: accent }}>
          <Sparkles size={16} color="#fff" />
        </span>
        <div className="leading-tight">
          {/* theme-aware (AA): deep rose/violet in light, soft in dark — the "ระบบ"
              label is the system identity, not a patient name, so this is culturally fine. */}
          <div className={`text-[10px] font-bold ${isDoctorCard ? 'text-violet-700 dark:text-violet-300' : 'text-rose-700 dark:text-rose-300'}`}>ระบบ · LoverClinic</div>
          <div className="text-[13px] font-bold" style={{ color: 'var(--tx-primary)' }}>{HEADLINE[kind] || HEADLINE.intake}</div>
        </div>
        {time && <div className="ml-auto text-[9px] flex-none" style={{ color: 'var(--tx-muted)' }}>{time}</div>}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        {pending ? (
          <>
            <span data-testid="system-card-customer-name" className="text-[13px] font-bold" style={{ color: 'var(--tx-primary)' }}>
              {name || '—'}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-md text-amber-700 dark:text-amber-300" style={{ background: 'rgba(202,163,122,0.15)' }}>
              รอลงทะเบียน
            </span>
          </>
        ) : missing ? (
          <>
            {/* customer was deleted after the card was written — plain text, no 404 link */}
            <span data-testid="system-card-customer-name" className="text-[13px] font-bold" style={{ color: 'var(--tx-primary)' }}>
              {name || '—'}
            </span>
            <span data-testid="system-card-missing" className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-hover)', color: 'var(--tx-muted)' }}>
              ไม่พบข้อมูลลูกค้า
            </span>
          </>
        ) : (
          <>
            <a
              data-testid="system-card-customer-link"
              href={`/?backend=1&customer=${encodeURIComponent(customerId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[13px] font-bold text-sky-700 dark:text-sky-300 hover:underline underline-offset-2 inline-flex items-center gap-1"
              title={`เปิดข้อมูล ${name} ในแท็บใหม่`}
            >
              <VipName customerId={customerId}>{name || '—'}</VipName><ExternalLink size={12} className="-mt-0.5" />
            </a>
            {hn && (
              <span data-testid="system-card-hn" className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-hover)', color: 'var(--tx-muted)' }}>
                HN {hn}
              </span>
            )}
          </>
        )}
      </div>

      {/* (④) โดยแพทย์ — from the TFP header doctor select, snapshotted at save */}
      {isDoctorCard && sys.doctorName && (
        <div className="mt-1.5 text-[12px]" style={{ color: 'var(--tx-muted)' }} data-testid="system-card-doctor-name">
          โดยแพทย์: <span className="font-bold" style={{ color: 'var(--tx-primary)' }}>{sys.doctorName}</span>
        </div>
      )}

      {/* (③④) เปิดบันทึกการรักษา — deep link to the EXACT TFP (new tab) */}
      {(kind === 'tfp-vitals' || kind === 'tfp-doctor') && sys.treatmentId && customerId && (
        <div>
          <a
            data-testid="system-card-open-treatment"
            href={buildTreatmentEditUrl(customerId, sys.treatmentId)}
            target="_blank"
            rel="noopener noreferrer"
            className={isDoctorCard ? BTN_VIOLET : BTN_RED}
          >
            🩺 เปิดบันทึกการรักษา <span className="opacity-75">›</span>
          </a>
        </div>
      )}

      {/* (⑤) ดูข้อมูลรับเข้า — shared OPD intake body in a portal modal */}
      {kind === 'intake' && !pending && !missing && (
        <div>
          <button
            type="button"
            data-testid="system-card-view-intake"
            onClick={openIntake}
            className={BTN_RED}
          >
            📄 ดูข้อมูลรับเข้า <span className="opacity-75">›</span>
          </button>
        </div>
      )}

      {/* (⑥) ดูแบบประเมิน — the REAL EDDetailModal (compare/switch rounds) */}
      {kind === 'followup' && customerId && (
        <div>
          <button
            type="button"
            data-testid="system-card-view-assessment"
            onClick={openAssessment}
            className={BTN_RED}
          >
            📊 ดูแบบประเมิน <span className="opacity-75">›</span>
          </button>
        </div>
      )}

      {showIntake && (
        <StaffChatIntakeModal
          sessionId={sys.sessionId}
          customerId={customerId}
          name={name}
          onClose={() => setShowIntake(false)}
        />
      )}
      {showAssessment && (
        <StaffChatEdModalLauncher customerId={customerId} onClose={() => setShowAssessment(false)} />
      )}
    </div>
  );
}
