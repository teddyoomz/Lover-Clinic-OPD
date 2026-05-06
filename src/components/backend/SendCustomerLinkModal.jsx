// ─── SendCustomerLinkModal — share OPD-fill link with customer-later booking ──
//
// Phase 24.0-vicies-novies (2026-05-07)
//
// User directive (locked via brainstorming): "เวลาเราส่ง link ให้ใครอะ มันสร้าง
// unique link มาอยู่แล้ว มึงก็เอาไปประกอบกับ มัดจำ กับนัดหมาย ดิวะ มันไม่ซ้ำ
// กันอยู่แล้ว พอลูกค้าส่งข้อมูลมาผ่านลิ้งนั้น มันก็ไป match กับ unique link
// ที่บันทึกไปก่อนหน้านี้ ใน มัดจำ กับนัดหมาย".
//
// Triggered by:
//   - DepositPanel "📤 ส่งลิ้งค์ลูกค้า" button (customer-later deposit cards)
//   - AppointmentFormModal pickLater "📤 ส่งลิ้งค์ลูกค้า" button (edit mode)
//
// Caller has already invoked provisionOpdLinkForBookingPair (which mints the
// opd_sessions doc + stamps linkedOpdSessionId on the existing deposit +
// appointment). This modal just SURFACES the resulting URL + QR + copy/print
// helpers so admin can send the link via LINE/SMS/etc.
//
// The customer fills the form via this URL → opd_sessions/{sessionId} updates
// → admin reviews submission + clicks "บันทึกลง OPD" in AdminDashboard →
// addCustomer creates be_customers → handleOpdClick post-save hook calls
// attachCustomerToOpdSessionLinks(sessionId, customer) → the deposit +
// appointment auto-attach to the new customerId.

import React, { useEffect, useState } from 'react';
import { X, Copy, CheckCircle2, ExternalLink, Printer, QrCode } from 'lucide-react';
import { generateQrDataUrl } from '../../lib/documentPrintEngine.js';

/**
 * Props:
 *   isOpen      — boolean
 *   onClose     — () => void
 *   sessionId   — opd_sessions doc id (the unique link)
 *   url         — full URL (e.g. https://lover-clinic-app.vercel.app/?session=BL-...)
 *   sessionName — display label (defaults to "ลิ้งค์กรอกข้อมูล OPD")
 *   alreadyProvisioned — true when re-opening modal for an existing link
 */
function SendCustomerLinkModal({
  isOpen,
  onClose,
  sessionId,
  url,
  sessionName = '',
  alreadyProvisioned = false,
}) {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);

  // Generate the QR dataURL whenever the URL changes (and the modal is open).
  useEffect(() => {
    if (!isOpen || !url) {
      setQrDataUrl('');
      return;
    }
    let alive = true;
    (async () => {
      try {
        const data = await generateQrDataUrl(url, { width: 280, margin: 2 });
        if (alive) setQrDataUrl(data);
      } catch (e) {
        console.warn('[SendCustomerLinkModal] generateQrDataUrl failed:', e);
        if (alive) setQrDataUrl('');
      }
    })();
    return () => { alive = false; };
  }, [isOpen, url]);

  const handleCopy = async () => {
    if (!url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Legacy fallback — temp <textarea>
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.warn('[SendCustomerLinkModal] copy failed:', e);
    }
  };

  const handlePrintQr = () => {
    if (!qrDataUrl) return;
    const win = window.open('', '_blank', 'width=420,height=560');
    if (!win) return;
    const safeName = (sessionName || 'ลิ้งค์กรอกข้อมูล OPD')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const safeUrl = String(url || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>QR ลิ้งค์ลูกค้า</title>
      <style>body{font-family:system-ui,sans-serif;text-align:center;padding:24px;}
        h2{margin:8px 0 16px;font-size:18px;}
        img{display:block;margin:0 auto 16px;width:280px;height:280px;border:1px solid #ddd;padding:8px;border-radius:8px;}
        .url{font-family:monospace;font-size:11px;word-break:break-all;color:#444;border-top:1px dashed #ccc;padding-top:12px;margin-top:12px;}
        @media print {body{padding:0;}}
      </style></head><body>
      <h2>${safeName}</h2>
      <img src="${qrDataUrl}" alt="QR" />
      <div class="url">${safeUrl}</div>
      <script>setTimeout(() => window.print(), 200);</script>
      </body></html>`);
    win.document.close();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
      data-testid="send-customer-link-modal"
    >
      <div
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl shadow-2xl w-full max-w-md p-5 sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-[var(--tx-heading)] flex items-center gap-2">
              <QrCode size={20} className="text-emerald-500" />
              ส่งลิ้งค์ลูกค้ากรอก OPD
            </h2>
            <p className="text-xs text-[var(--tx-muted)] mt-0.5">
              {alreadyProvisioned
                ? 'ลิ้งค์ที่ส่งไว้ก่อนหน้านี้ — ใช้ลิ้งค์เดิมหรือพิมพ์ QR ใหม่ได้'
                : 'ลิ้งค์ใหม่สำหรับให้ลูกค้ากรอกข้อมูล OPD จากระยะไกล'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 -mr-1 -mt-1 rounded-lg hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-heading)] transition-colors"
            aria-label="ปิด"
            data-testid="send-customer-link-close"
          >
            <X size={18} />
          </button>
        </div>

        {/* QR */}
        {qrDataUrl ? (
          <div className="mx-auto bg-white rounded-xl p-3 mb-4 w-full max-w-[240px] aspect-square shadow-md">
            <img
              src={qrDataUrl}
              alt="QR ลิ้งค์ลูกค้า"
              className="w-full h-full object-contain"
              data-testid="send-customer-link-qr"
            />
          </div>
        ) : (
          <div className="mx-auto bg-[var(--bg-input)] border border-[var(--bd)] rounded-xl mb-4 w-full max-w-[240px] aspect-square flex items-center justify-center text-[var(--tx-muted)] text-xs">
            กำลังสร้าง QR ...
          </div>
        )}

        {/* Session ID */}
        <div className="mb-3">
          <p className="text-[11px] text-[var(--tx-muted)] font-semibold mb-1">รหัสลิ้งค์ (Session ID)</p>
          <p
            className="font-mono text-sm font-bold bg-[var(--bg-input)] px-3 py-2 rounded-lg border border-[var(--bd)] text-center text-emerald-400 break-all"
            data-testid="send-customer-link-session-id"
          >
            {sessionId || '—'}
          </p>
        </div>

        {/* URL + copy + open */}
        <div className="mb-4">
          <p className="text-[11px] text-[var(--tx-muted)] font-semibold mb-1">URL ส่งให้ลูกค้า</p>
          <div className="flex gap-2">
            <input
              readOnly
              value={url || ''}
              className="flex-1 min-w-0 bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-muted)] text-xs px-3 py-2 rounded-lg outline-none font-mono"
              data-testid="send-customer-link-url"
              onClick={(e) => e.target.select()}
            />
            <button
              onClick={handleCopy}
              className="bg-[var(--bg-hover)] hover:bg-emerald-900/30 hover:text-emerald-300 p-2 rounded-lg border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0"
              title="คัดลอก URL"
              data-testid="send-customer-link-copy-url"
            >
              {copied ? <CheckCircle2 size={16} className="text-green-500" /> : <Copy size={16} />}
            </button>
            <a
              href={url || '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[var(--bg-hover)] hover:bg-blue-900/30 hover:text-blue-300 p-2 rounded-lg border border-[var(--bd)] text-[var(--tx-heading)] transition-colors flex-shrink-0 inline-flex items-center"
              title="เปิดในแท็บใหม่"
              data-testid="send-customer-link-open"
            >
              <ExternalLink size={16} />
            </a>
          </div>
          {copied && (
            <p className="text-[11px] text-emerald-400 mt-1" data-testid="send-customer-link-copied-toast">
              ✓ คัดลอกแล้ว — วางในแชท LINE หรือ SMS ส่งให้ลูกค้าได้เลย
            </p>
          )}
        </div>

        {/* Action row: print QR + close */}
        <div className="flex gap-2">
          <button
            onClick={handlePrintQr}
            disabled={!qrDataUrl}
            className="flex-1 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover2)] disabled:opacity-50 disabled:cursor-not-allowed text-[var(--tx-heading)] py-2 px-3 rounded-lg border border-[var(--bd)] transition-colors flex items-center justify-center gap-1.5 text-sm"
            data-testid="send-customer-link-print"
          >
            <Printer size={14} />
            พิมพ์ QR
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1.5 text-sm font-semibold"
            data-testid="send-customer-link-done"
          >
            <CheckCircle2 size={14} />
            เรียบร้อย
          </button>
        </div>

        <p className="mt-3 text-[10px] text-[var(--tx-muted)] leading-relaxed">
          หมายเหตุ: เมื่อลูกค้ากรอกข้อมูลและส่งกลับมาแล้ว เจ้าหน้าที่กดปุ่ม
          "บันทึกลง OPD" ในหน้าหลัก ระบบจะผูกข้อมูลลูกค้ากับนัด/มัดจำที่จองไว้
          โดยอัตโนมัติ
        </p>
      </div>
    </div>
  );
}

export default SendCustomerLinkModal;
