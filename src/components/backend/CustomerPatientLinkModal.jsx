// ─── CustomerPatientLinkModal (2026-05-25) ──────────────────────────────────
// Mirror of the AdminDashboard patient-link modal, customer-scoped. Generates a
// link the customer (anon, no login) opens at ?patient=<token> to view the
// existing PatientDashboard view (นัดหมาย + คอร์สคงเหลือ). Data flows via the
// /api/patient-view endpoint (admin SDK) — this modal only mints/revokes the
// token on be_customers (clinic-staff write).
// AV78: backdrop does NOT close — explicit close only (X). Purple = patient-link theme.
import { useState } from 'react';
import { Link, Loader2, X, ClipboardList, ExternalLink, Unlink, Check } from 'lucide-react';
import { generateCustomerPatientLink, setCustomerPatientLinkEnabled, revokeCustomerPatientLink } from '../../lib/scopedDataLayer.js';
import { useModalScrollLock } from '../../lib/useModalScrollLock.js';

const linkUrl = (token) => `${window.location.origin}${window.location.pathname}?patient=${token}`;
const qrUrl = (token) => `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(linkUrl(token))}&margin=10&color=000000&ecc=Q`;

export default function CustomerPatientLinkModal({ customer, onClose, onUpdated, isDark }) {
  useModalScrollLock(true); // AV205 — renders only while open
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const token = customer?.patientLinkToken;
  const enabled = customer?.patientLinkEnabled;
  const cid = customer?.id;

  const doGenerate = async () => { setLoading(true); try { await generateCustomerPatientLink(cid); onUpdated?.(); } finally { setLoading(false); } };
  const doToggle = async () => { setLoading(true); try { await setCustomerPatientLinkEnabled(cid, !enabled); onUpdated?.(); } finally { setLoading(false); } };
  const doRevoke = async () => {
    if (!window.confirm('เพิกถอนลิงก์นี้? ลิงก์เดิมจะใช้ไม่ได้อีก')) return;
    setLoading(true); try { await revokeCustomerPatientLink(cid); onUpdated?.(); } finally { setLoading(false); }
  };
  const copy = (t) => { try { navigator.clipboard?.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* clipboard unavailable */ } };

  return (
    <div data-testid="cust-link-backdrop" className="fixed inset-0 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto overscroll-contain">
      {/* AV78: backdrop click does NOT close — explicit close only (X) */}
      <div className="w-full max-w-sm rounded-2xl border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-2.5 p-4 border-b border-[var(--bd)]">
          <div className="w-8 h-8 rounded-lg bg-purple-950/40 flex items-center justify-center shrink-0"><Link size={16} className="text-purple-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-purple-400">ลิงก์ดูข้อมูลของผู้ป่วย</p>
            <p className="text-sm font-bold text-white truncate">{customer?.name || '-'}</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="p-2 rounded-lg text-gray-600 hover:text-white hover:bg-[var(--bg-hover)] transition-colors shrink-0"><X size={16} /></button>
        </div>

        {/* Body */}
        <div className="p-5 flex flex-col gap-4">
          {!token ? (
            <>
              <p className="text-xs text-gray-500 leading-relaxed text-center">สร้างลิงก์ดูข้อมูลเพื่อให้ผู้ป่วยดูข้อมูลนัดหมาย<br />และคอร์สคงเหลือได้ทุกเวลา</p>
              <button onClick={doGenerate} disabled={loading}
                className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                style={{ background: 'rgba(168,85,247,0.85)', boxShadow: '0 0 20px rgba(168,85,247,0.3)' }}>
                {loading ? <Loader2 size={15} className="animate-spin" /> : <Link size={15} />} สร้างลิงก์ดูข้อมูล
              </button>
            </>
          ) : (
            <>
              {!enabled && (
                <p className="text-xs text-amber-400 text-center bg-amber-950/20 border border-amber-900/40 rounded-lg py-2 px-3">ลิงก์ถูกปิดใช้งานอยู่ — ผู้ป่วยจะเปิดดูไม่ได้จนกว่าจะเปิดใช้งาน</p>
              )}
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-gray-600 font-bold">ลิงก์</p>
                <div className="flex items-center gap-2">
                  <input readOnly value={linkUrl(token)} className="flex-1 bg-[var(--bg-card)] border border-[var(--bd)] text-gray-500 text-xs p-2.5 rounded-lg outline-none font-mono min-w-0" />
                  <button onClick={() => copy(linkUrl(token))} aria-label="คัดลอกลิงก์" title="คัดลอก" className="p-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400 hover:text-white transition-colors shrink-0">
                    {copied ? <Check size={14} className="text-green-400" /> : <ClipboardList size={14} />}
                  </button>
                  <a href={linkUrl(token)} target="_blank" rel="noopener noreferrer" aria-label="เปิดลิงก์" title="เปิด" className="p-2.5 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-gray-400 hover:text-purple-400 transition-colors shrink-0"><ExternalLink size={14} /></a>
                </div>
              </div>
              <div className="bg-white rounded-xl p-3 flex justify-center"><img src={qrUrl(token)} alt="QR ลิงก์ดูข้อมูล" className="w-40 h-40" /></div>
              <div className="flex gap-2">
                <button onClick={doToggle} disabled={loading} className="flex-1 py-2.5 rounded-lg border border-[var(--bd)] text-xs font-bold text-gray-300 hover:bg-[var(--bg-hover)] transition-colors flex items-center justify-center gap-1.5">
                  <Unlink size={13} /> {enabled ? 'ปิดใช้งานลิงก์' : 'เปิดใช้งานลิงก์'}
                </button>
                <button onClick={doRevoke} disabled={loading} className="flex-1 py-2.5 rounded-lg border border-red-800/50 bg-red-950/20 text-xs font-bold text-red-400 hover:bg-red-900/40 transition-colors">เพิกถอนลิงก์</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
