// ─── qr-self-host-execution (2026-07-21) — REAL qrcode-lib execution ────────
// The customer-intake kiosk QR / patient-link QR / schedule-link QR moved off
// api.qrserver.com (free service, no SLA, no monitor) onto the in-repo qrcode
// lib. This bank EXECUTES the real generator (no mocks) + locks the swap so a
// future surface can't quietly reintroduce the third-party dependency.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { generateQrDataUrl } from '../src/lib/documentPrintEngine.js';

const ROOT = join(__dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('QE — generateQrDataUrl real execution', () => {
  it('QE1.1 produces a PNG data URL for a real link payload', async () => {
    const url = await generateQrDataUrl('https://lover-clinic-app.vercel.app/?session=IN-TEST123');
    expect(url.startsWith('data:image/png;base64,')).toBe(true);
    expect(url.length).toBeGreaterThan(500); // a real QR, not a stub
  });

  it('QE1.2 honors the errorCorrectionLevel option (Q > M payload density)', async () => {
    const text = 'https://lover-clinic-app.vercel.app/?patient=PL-ABCDEFGH12345678';
    const m = await generateQrDataUrl(text, { width: 300, errorCorrectionLevel: 'M' });
    const q = await generateQrDataUrl(text, { width: 300, errorCorrectionLevel: 'Q' });
    expect(m.startsWith('data:image/png;base64,')).toBe(true);
    expect(q.startsWith('data:image/png;base64,')).toBe(true);
    expect(q).not.toBe(m); // EC level actually changes the matrix
  });

  it('QE1.3 empty/non-string input → empty string (fail-soft, unchanged contract)', async () => {
    expect(await generateQrDataUrl('')).toBe('');
    expect(await generateQrDataUrl(null)).toBe('');
  });
});

describe('QG — no third-party QR dependency remains (universal classifier)', () => {
  const walk = (dir, out = []) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      if (e.isDirectory()) walk(`${dir}/${e.name}`, out);
      else if (/\.(jsx?|mjs)$/.test(e.name)) out.push(`${dir}/${e.name}`);
    }
    return out;
  };

  it('QG1.1 ZERO functional api.qrserver.com URLs anywhere in src/ (comments excluded by the /v1 path)', () => {
    const offenders = walk('src').filter((f) => read(f).includes('api.qrserver.com/v1'));
    expect(offenders).toEqual([]);
  });

  it('QG1.2 all 4 former surfaces render through the shared <QrImage>', () => {
    const admin = read('src/pages/AdminDashboard.jsx');
    expect((admin.match(/<QrImage /g) || []).length).toBe(3); // schedule-link + renderQrCard + QR sidebar
    expect(read('src/components/backend/CustomerPatientLinkModal.jsx')).toMatch(/<QrImage /);
  });

  it('QG1.3 QrImage uses the canonical generator with ecc Q (screen-scan parity with the old service)', () => {
    const src = read('src/components/QrImage.jsx');
    expect(src).toMatch(/generateQrDataUrl/);
    expect(src).toMatch(/errorCorrectionLevel: 'Q'/);
  });
});
