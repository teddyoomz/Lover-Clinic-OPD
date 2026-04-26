// ─── LinkLineInstructionsModal — V33.4 (2026-04-27) ────────────────────
// Replaces LinkLineQrModal. NO QR code generation anymore (V33.4 directive #2).
//
// Two render states based on customer.lineUserId:
//   1. NOT LINKED — show Thai instructions on how the customer DM's their
//      nationalId / passport to the LINE OA. Display the IDs with copy
//      buttons so admin can hand them to the customer.
//   2. ALREADY LINKED — show masked lineUserId + status badge + 2 actions:
//      ปิดชั่วคราว / เปิดใหม่ (when suspended) / ยกเลิกการผูก
//
// Per V33.4 directive #3 (webhook bare-ID detection): customer no longer
// needs the "ผูก " prefix. Just sending the 13-digit ID OR passport as a
// single message bubble triggers the link request flow.

import { useState, useEffect } from 'react';
import {
  X, Loader2, AlertCircle, CheckCircle2, Copy, IdCard, MessageSquare,
  Pause, Play, Unlink, Info, Clock,
} from 'lucide-react';
import { suspendLineLink, resumeLineLink, unlinkLineAccount } from '../../lib/customerLineLinkClient.js';
import {
  getLineLinkState, formatLineLinkStatusBadge, maskLineUserId, LINK_STATES,
} from '../../lib/customerLineLinkState.js';

function CopyButton({ value, label = 'คัดลอก', testId }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(String(value || ''));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('[CopyButton] clipboard write failed');
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid={testId || 'copy-btn'}
      className="px-2.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1 hover:shadow-sm active:scale-95"
      style={{
        color: copied ? '#06C755' : '#60a5fa',
        borderColor: copied ? 'rgba(6,199,85,0.3)' : 'rgba(96,165,250,0.3)',
        backgroundColor: copied ? 'rgba(6,199,85,0.08)' : 'rgba(96,165,250,0.08)',
      }}
    >
      {copied ? <CheckCircle2 size={11} /> : <Copy size={11} />}
      {copied ? 'คัดลอกแล้ว' : label}
    </button>
  );
}

function fmtThaiBE(iso) {
  if (!iso) return '-';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyyBE = d.getFullYear() + 543;
    return `${dd}/${mm}/${yyyyBE}`;
  } catch { return '-'; }
}

export default function LinkLineInstructionsModal({ customer, onClose, onActionSuccess }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [confirmAction, setConfirmAction] = useState(null);

  useEffect(() => {
    setError('');
    setSuccess('');
    setBusy(false);
    setConfirmAction(null);
  }, [customer?.id]);

  const customerId = customer?.id || customer?.customerId || customer?.proClinicId || '';
  const linkState = getLineLinkState(customer);
  const badge = formatLineLinkStatusBadge(linkState);
  const pd = customer?.patientData || {};
  const nationalId = pd.nationalId || customer?.citizen_id || '';
  const passport = pd.passport || customer?.passport_id || '';
  const lineUserIdMasked = maskLineUserId(customer?.lineUserId || '');

  const performAction = async (action) => {
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      if (action === 'suspend') await suspendLineLink(customerId);
      else if (action === 'resume') await resumeLineLink(customerId);
      else if (action === 'unlink') await unlinkLineAccount(customerId);
      const msg = action === 'suspend' ? 'ปิดการรับ-ตอบของบอตเรียบร้อย'
        : action === 'resume' ? 'เปิดการรับ-ตอบของบอตเรียบร้อย'
        : 'ยกเลิกการผูกบัญชีเรียบร้อย';
      setSuccess(msg);
      onActionSuccess?.({ action, customerId });
      setConfirmAction(null);
      setTimeout(() => onClose?.(), 1200);
    } catch (e) {
      setError(e?.message || 'การทำงานล้มเหลว');
    } finally {
      setBusy(false);
    }
  };

  const renderConfirmDialog = () => {
    if (!confirmAction) return null;
    const labels = {
      suspend: { title: 'ยืนยันปิดชั่วคราว', body: 'บอตจะหยุดตอบข้อความของลูกค้าคนนี้จนกว่าจะเปิดใหม่ ข้อความจากลูกค้ายังถูกบันทึกใน chat ตามปกติ', confirmBtn: 'ปิดชั่วคราว', confirmColor: '#f59e0b' },
      resume:  { title: 'ยืนยันเปิดใหม่', body: 'บอตจะกลับมาตอบคอร์ส/นัดหมายให้ลูกค้าคนนี้อีกครั้ง', confirmBtn: 'เปิดใหม่', confirmColor: '#06C755' },
      unlink:  { title: 'ยืนยันยกเลิกการผูก', body: 'จะลบ lineUserId ออกจากลูกค้าคนนี้ ลูกค้าต้องส่งเลขบัตร/passport ใหม่เพื่อผูกบัญชี ระบบจะไม่แจ้งลูกค้าผ่าน LINE', confirmBtn: 'ยกเลิกการผูก', confirmColor: '#ef4444' },
    };
    const l = labels[confirmAction];
    return (
      <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4" data-testid="line-link-confirm-dialog">
        <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-sm p-4">
          <h4 className="text-base font-bold text-[var(--tx-heading)] mb-2">{l.title}</h4>
          <p className="text-sm text-[var(--tx-muted)] mb-4">{l.body}</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setConfirmAction(null)} disabled={busy}
              className="px-3 py-1.5 rounded-lg text-xs bg-neutral-700 text-white disabled:opacity-50">
              ยกเลิก
            </button>
            <button onClick={() => performAction(confirmAction)} disabled={busy}
              data-testid={`confirm-${confirmAction}-btn`}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-60 inline-flex items-center gap-1"
              style={{ backgroundColor: l.confirmColor }}>
              {busy ? <Loader2 size={12} className="animate-spin" /> : null}
              {l.confirmBtn}
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center p-4 overflow-y-auto" data-testid="link-line-instructions-modal">
      <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-md my-4 flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2">
            <MessageSquare size={20} style={{ color: '#06C755' }} />
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">
              {linkState === LINK_STATES.UNLINKED ? 'วิธีผูก LINE บัญชีลูกค้า' : 'จัดการการผูก LINE'}
            </h3>
          </div>
          <button onClick={onClose} disabled={busy}
            className="p-1 rounded hover:bg-[var(--bg-hover)] disabled:opacity-50" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {linkState !== LINK_STATES.UNLINKED && (
            <div className="px-3 py-2 rounded-lg flex items-center gap-2 text-sm font-bold"
              style={{ backgroundColor: badge.bgColor, color: badge.color, border: `1px solid ${badge.color}40` }}
              data-testid="line-link-status-badge">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: badge.color }} />
              {badge.label}
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs flex items-start gap-2" data-testid="line-link-error">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2" data-testid="line-link-success">
              <CheckCircle2 size={14} className="flex-shrink-0 mt-0.5" />
              <div>{success}</div>
            </div>
          )}

          {linkState === LINK_STATES.UNLINKED && (
            <>
              <div className="px-3 py-2 rounded-lg bg-blue-900/20 border border-blue-700/40 text-blue-200 text-xs flex items-start gap-2">
                <Info size={14} className="flex-shrink-0 mt-0.5" />
                <div>
                  ลูกค้าส่งเลขบัตรประชาชน 13 หลัก หรือเลขพาสปอร์ต ของตัวเอง
                  เป็น<b>ข้อความเดี่ยวๆ</b> ใน LINE OA ของคลินิก จากนั้น admin
                  อนุมัติคำขอใน “คำขอผูกบัญชี” เพื่อเปิดใช้
                </div>
              </div>

              <ol className="list-decimal pl-5 text-sm text-[var(--tx-primary)] space-y-1.5">
                <li>เพิ่ม LINE OA คลินิกเป็นเพื่อนก่อน</li>
                <li>พิมพ์เลขบัตรประชาชน 13 หลัก <b>หรือ</b> เลขพาสปอร์ต เป็นข้อความเดี่ยว (ไม่ต้องมีคำว่า "ผูก")</li>
                <li>Admin จะได้รับคำขอใน “ผูก LINE — คำขอ” แล้วกดอนุมัติ</li>
              </ol>

              <div className="space-y-2 pt-2 border-t border-[var(--bd)]">
                <div className="text-xs text-[var(--tx-muted)] font-bold flex items-center gap-1.5">
                  <IdCard size={12} /> ข้อมูลที่จะให้ลูกค้าส่ง
                </div>
                {nationalId ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]">
                    <div className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider w-16 flex-shrink-0">เลขบัตร</div>
                    <div className="flex-1 font-mono text-sm" data-testid="copy-source-national-id">{nationalId}</div>
                    <CopyButton value={nationalId} testId="copy-national-id-btn" />
                  </div>
                ) : null}
                {passport ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)]">
                    <div className="text-[10px] text-[var(--tx-muted)] uppercase tracking-wider w-16 flex-shrink-0">Passport</div>
                    <div className="flex-1 font-mono text-sm" data-testid="copy-source-passport">{passport}</div>
                    <CopyButton value={passport} testId="copy-passport-btn" />
                  </div>
                ) : null}
                {!nationalId && !passport && (
                  <div className="px-3 py-2 rounded-lg bg-amber-900/20 border border-amber-700/40 text-amber-200 text-xs">
                    ลูกค้าคนนี้ยังไม่มีเลขบัตร/พาสปอร์ตในระบบ — ไปแก้ไขข้อมูลลูกค้าก่อนเพื่อเพิ่มข้อมูล
                  </div>
                )}
              </div>
            </>
          )}

          {(linkState === LINK_STATES.ACTIVE || linkState === LINK_STATES.SUSPENDED) && (
            <>
              <div className="px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[var(--tx-muted)]">LINE userId</span>
                  <span className="font-mono text-[var(--tx-primary)]">{lineUserIdMasked || '-'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[var(--tx-muted)] flex items-center gap-1"><Clock size={11} /> ผูกเมื่อ</span>
                  <span className="text-[var(--tx-primary)]">{fmtThaiBE(customer?.lineLinkedAt)}</span>
                </div>
                {customer?.lineLinkStatusChangedAt && (
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--tx-muted)] flex items-center gap-1"><Clock size={11} /> เปลี่ยนสถานะล่าสุด</span>
                    <span className="text-[var(--tx-primary)]">{fmtThaiBE(customer.lineLinkStatusChangedAt)}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                {linkState === LINK_STATES.ACTIVE ? (
                  <button onClick={() => setConfirmAction('suspend')} disabled={busy}
                    data-testid="suspend-line-btn"
                    className="px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 hover:shadow-md active:scale-95 disabled:opacity-50"
                    style={{ color: '#f59e0b', borderColor: 'rgba(245,158,11,0.3)', backgroundColor: 'rgba(245,158,11,0.08)' }}>
                    <Pause size={12} /> ปิดชั่วคราว
                  </button>
                ) : (
                  <button onClick={() => setConfirmAction('resume')} disabled={busy}
                    data-testid="resume-line-btn"
                    className="px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 hover:shadow-md active:scale-95 disabled:opacity-50"
                    style={{ color: '#06C755', borderColor: 'rgba(6,199,85,0.3)', backgroundColor: 'rgba(6,199,85,0.08)' }}>
                    <Play size={12} /> เปิดใหม่
                  </button>
                )}
                <button onClick={() => setConfirmAction('unlink')} disabled={busy}
                  data-testid="unlink-line-btn"
                  className="px-3 py-2 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5 hover:shadow-md active:scale-95 disabled:opacity-50"
                  style={{ color: '#ef4444', borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.08)' }}>
                  <Unlink size={12} /> ยกเลิกการผูก
                </button>
              </div>

              <div className="px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[10px] text-[var(--tx-muted)] leading-relaxed">
                <b>ปิดชั่วคราว:</b> บอตหยุดตอบ — ข้อความจากลูกค้ายังถูกบันทึกใน chat<br />
                <b>ยกเลิกการผูก:</b> ตัดการเชื่อมโยง LINE userId ทั้งหมด — ลูกค้าต้องส่งเลขบัตร/passport ใหม่เพื่อผูกบัญชี (ระบบจะไม่แจ้งลูกค้า)
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end p-3 border-t border-[var(--bd)]">
          <button onClick={onClose} disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs bg-neutral-700 text-white disabled:opacity-50">
            ปิด
          </button>
        </div>
      </div>

      {renderConfirmDialog()}
    </div>
  );
}
