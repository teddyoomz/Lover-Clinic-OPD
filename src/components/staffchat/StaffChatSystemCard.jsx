// src/components/staffchat/StaffChatSystemCard.jsx — the "ระบบ" notification card
// rendered for staff-chat messages with a `system` payload (AV198).
// Style A (user-approved): full card, sparkles icon, fire-red identity accent,
// headline by kind, customer row that live-resolves to a CLICKABLE name + HN.
// The customer NAME is ALWAYS sky-blue, NEVER red (Thai culture — no red on a
// patient name/HN). Fire-red is only the icon + the left accent border.
import { Sparkles, ExternalLink } from 'lucide-react';
import { useSystemCardCustomer } from '../../lib/staffChatNotifyResolve.js';

const HEADLINE = {
  intake: 'กรอกข้อมูลรับเข้าเสร็จแล้ว',
  followup: 'กรอกแบบประเมินติดตามเสร็จแล้ว',
};

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatSystemCard({ message }) {
  const kind = (message.system && message.system.kind) || 'intake';
  const { pending, missing, customerId, name, hn } = useSystemCardCustomer(message);
  const time = formatTime(message.createdAt);
  return (
    <div
      data-testid="staff-chat-system-card"
      data-kind={kind}
      data-pending={pending ? 'true' : 'false'}
      className="self-stretch rounded-r-xl border border-l-4 px-3 py-2.5 my-0.5 max-w-[92%]"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--bd)', borderLeftColor: '#ef4444' }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-full flex-none" style={{ background: '#ef4444' }}>
          <Sparkles size={16} color="#fff" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-bold" style={{ color: '#f3b4b4' }}>ระบบ · LoverClinic</div>
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
            <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(202,163,122,0.15)', color: '#caa37a' }}>
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
              {name || '—'}<ExternalLink size={12} className="-mt-0.5" />
            </a>
            {hn && (
              <span data-testid="system-card-hn" className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'var(--bg-hover)', color: 'var(--tx-muted)' }}>
                HN {hn}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}
