// ─── Link LINE QR Modal — V32-tris-ter (2026-04-26) ─────────────────────
// Admin-side modal that mints a one-time LINE-link token + renders the
// QR code for the customer to scan with LINE. Customer scans → opens
// chat with bot → "LINK-<token>" auto-pasted → customer sends → webhook
// links lineUserId onto the customer record.

import { useState, useEffect, useRef } from 'react';
import { Loader2, X, QrCode, Copy, RefreshCw, Smartphone } from 'lucide-react';
import { createCustomerLinkToken } from '../../lib/customerLinkClient.js';
import { generateQrDataUrl } from '../../lib/documentPrintEngine.js';

export default function LinkLineQrModal({ customer, onClose }) {
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null); // { token, expiresAt, deepLink }
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const cancelRef = useRef(false);

  const customerId = customer?.customerId || customer?.id || '';
  const customerName = customer?.customerName || customer?.name || 'ลูกค้า';

  const generate = async () => {
    setBusy(true);
    setError('');
    setData(null);
    setQrDataUrl('');
    try {
      const result = await createCustomerLinkToken({ customerId, ttlMinutes: 1440 });
      if (cancelRef.current) return;
      setData(result);
      // Generate QR — use the deepLink (LINE message URL) so scanner opens LINE chat directly.
      const qr = await generateQrDataUrl(result.deepLink, { width: 280, margin: 2 });
      if (cancelRef.current) return;
      setQrDataUrl(qr);
    } catch (e) {
      if (cancelRef.current) return;
      setError(e.message || 'สร้าง QR ล้มเหลว');
    } finally {
      if (!cancelRef.current) setBusy(false);
    }
  };

  useEffect(() => {
    cancelRef.current = false;
    if (customerId) generate();
    return () => { cancelRef.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const handleCopyToken = async () => {
    if (!data?.token) return;
    try {
      await navigator.clipboard.writeText(`LINK-${data.token}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard might be blocked — non-fatal */ }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" data-testid="link-line-qr-modal">
      <div className="bg-[var(--bg-base)] rounded-xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between gap-2 p-4 border-b border-[var(--bd)]">
          <div className="flex items-center gap-2">
            <QrCode size={20} className="text-emerald-400" />
            <h3 className="text-lg font-bold text-[var(--tx-heading)]">ผูก LINE — {customerName}</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[var(--bg-hover)]" aria-label="ปิด">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="px-3 py-2 rounded-lg bg-emerald-900/20 border border-emerald-700/40 text-emerald-200 text-xs flex items-start gap-2">
            <Smartphone size={14} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">วิธีใช้:</div>
              <ol className="list-decimal pl-4 mt-1 space-y-0.5">
                <li>ลูกค้าเปิดแอป LINE บนมือถือ → กดเมนู "Add Friends" → "QR Code"</li>
                <li>สแกน QR ด้านล่าง → เปิด chat กับ Official Account ของคลินิก</li>
                <li>กด <b>ส่ง</b> ข้อความที่เด้งขึ้น (LINK-...) → บัญชีจะถูกผูกอัตโนมัติ</li>
              </ol>
            </div>
          </div>

          {busy && (
            <div className="flex flex-col items-center justify-center py-8 gap-2">
              <Loader2 size={28} className="animate-spin text-[var(--tx-muted)]" />
              <div className="text-xs text-[var(--tx-muted)]">กำลังสร้าง QR...</div>
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/40 text-red-300 text-xs" data-testid="link-line-qr-error">
              {error}
            </div>
          )}

          {!busy && qrDataUrl && (
            <div className="flex flex-col items-center gap-2">
              <img
                src={qrDataUrl}
                alt="LINE link QR"
                data-testid="link-line-qr-image"
                className="rounded border border-[var(--bd)] bg-white p-2"
                style={{ width: 280, height: 280 }}
              />
              <div className="text-xs text-[var(--tx-muted)]">
                หมดอายุ: {data?.expiresAt ? new Date(data.expiresAt).toLocaleString('th-TH') : '-'}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleCopyToken}
                  data-testid="link-line-qr-copy"
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
                  <Copy size={12} /> {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก LINK-token'}
                </button>
                <button
                  type="button"
                  onClick={generate}
                  data-testid="link-line-qr-regen"
                  className="text-xs flex items-center gap-1 px-2 py-1 rounded bg-[var(--bg-hover)] hover:bg-[var(--bg-card)]">
                  <RefreshCw size={12} /> สร้างใหม่
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-[var(--bd)]">
          <button onClick={onClose} className="px-3 py-1.5 rounded text-xs bg-neutral-700 text-white">ปิด</button>
        </div>
      </div>
    </div>
  );
}
