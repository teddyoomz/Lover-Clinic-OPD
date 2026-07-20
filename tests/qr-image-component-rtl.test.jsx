// @vitest-environment jsdom
// ─── qr-image-component-rtl (2026-07-21) — <QrImage> contract ───────────────
// RTL bank for the shared QR renderer (engine mocked here; the REAL generator
// is executed in tests/qr-self-host-execution.test.js — node env, no canvas
// resolution ambiguity).
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';

const mockGen = vi.fn();
vi.mock('../src/lib/documentPrintEngine.js', () => ({
  generateQrDataUrl: (...a) => mockGen(...a),
}));
const { default: QrImage } = await import('../src/components/QrImage.jsx');

beforeEach(() => { cleanup(); mockGen.mockReset(); });

describe('QI — QrImage component', () => {
  it('QI1.1 renders the generated data URL as <img> with the given className', async () => {
    mockGen.mockResolvedValue('data:image/png;base64,QQ==');
    render(<QrImage value="https://x/?session=A" size={500} className="w-40 h-40" alt="QR ทดสอบ" />);
    const img = await screen.findByTestId('qr-image');
    expect(img.getAttribute('src')).toBe('data:image/png;base64,QQ==');
    expect(img.className).toBe('w-40 h-40');
    expect(img.getAttribute('alt')).toBe('QR ทดสอบ');
    expect(mockGen).toHaveBeenCalledWith('https://x/?session=A', { width: 500, margin: 2, errorCorrectionLevel: 'Q' });
  });

  it('QI1.2 pending placeholder keeps the layout box before the QR resolves', () => {
    mockGen.mockReturnValue(new Promise(() => {})); // never resolves
    render(<QrImage value="https://x" className="w-40 h-40" />);
    expect(screen.getByTestId('qr-image-pending').className).toBe('w-40 h-40');
  });

  it('QI1.3 FAIL-SOFT — generator rejection renders the placeholder, never throws', async () => {
    mockGen.mockRejectedValue(new Error('qr lib exploded'));
    render(<QrImage value="https://x" className="w-40 h-40" />);
    await waitFor(() => expect(mockGen).toHaveBeenCalled());
    expect(screen.getByTestId('qr-image-pending')).toBeTruthy();
    expect(screen.queryByTestId('qr-image')).toBeNull();
  });

  it('QI1.4 empty value → placeholder only, generator never called', () => {
    render(<QrImage value="" className="w-40 h-40" />);
    expect(screen.getByTestId('qr-image-pending')).toBeTruthy();
    expect(mockGen).not.toHaveBeenCalled();
  });

  it('QI1.5 value change regenerates (patient-link ↔ session QR toggle flow)', async () => {
    mockGen.mockResolvedValueOnce('data:image/png;base64,AA==').mockResolvedValueOnce('data:image/png;base64,BB==');
    const { rerender } = render(<QrImage value="https://x/?session=A" />);
    await screen.findByTestId('qr-image');
    rerender(<QrImage value="https://x/?patient=B" />);
    await waitFor(() => expect(screen.getByTestId('qr-image').getAttribute('src')).toBe('data:image/png;base64,BB=='));
    expect(mockGen).toHaveBeenCalledTimes(2);
  });
});
