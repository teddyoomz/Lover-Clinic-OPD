// ─── QrImage (2026-07-21) — self-hosted QR renderer ─────────────────────────
// Replaces the api.qrserver.com <img> URLs that the customer-intake kiosk QR,
// patient-link QR and schedule-link QR depended on. That free third-party
// service has no SLA and no monitor watching it — if it rate-limits or dies,
// the front-desk intake flow breaks silently. The repo already ships the
// `qrcode` lib (generateQrDataUrl — used by document print + SendCustomerLink
// + EDFollowup), so QRs are now generated locally. errorCorrectionLevel 'Q'
// mirrors the old qrserver `ecc=Q` (screen-scan tolerant).
import React, { useEffect, useState } from 'react';
import { generateQrDataUrl } from '../lib/documentPrintEngine.js';

export default function QrImage({ value, size = 500, className = '', alt = 'QR' }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let dead = false;
    setSrc('');
    if (!value) return undefined;
    generateQrDataUrl(String(value), { width: size, margin: 2, errorCorrectionLevel: 'Q' })
      .then((u) => { if (!dead) setSrc(u); })
      .catch(() => { if (!dead) setSrc(''); }); // fail-soft: blank box, layout preserved
    return () => { dead = true; };
  }, [value, size]);
  if (!src) return <div className={className} data-testid="qr-image-pending" aria-label={alt} />;
  return <img src={src} alt={alt} className={className} data-testid="qr-image" />;
}
