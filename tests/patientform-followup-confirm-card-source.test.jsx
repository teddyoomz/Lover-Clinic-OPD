// Task 5 source-grep — R1 read-only confirm card (+ editable fallback) · R2 pill removed · 🔴 province gate.
// PatientForm is heavy to mount (anon-auth + onSnapshot + providers); the codebase
// convention is source-grep for its contract (see patientform-types-gate.test.jsx),
// with the RENDER behavior proven by the Rule Q L1 real-browser pass (Task 8).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pf = readFileSync(path.resolve(process.cwd(), 'src/pages/PatientForm.jsx'), 'utf8');

describe('PatientForm — ED follow-up v2 (R1 card / R2 pill / province fix)', () => {
  it('R1: confirmInfo state declared + read from the session snapshot', () => {
    expect(pf).toMatch(/const \[confirmInfo, setConfirmInfo\] = useState\(null\)/);
    expect(pf).toMatch(/setConfirmInfo\(data\.confirmInfo \|\| null\)/);
  });

  it('R1: read-only card renders for follow-up WITH a snapshot', () => {
    expect(pf).toMatch(/isFollowUp && confirmInfo && \(/);
    expect(pf).toMatch(/data-testid="pf-confirm-card"/);
    // shows name + phone (masked) labels
    expect(pf).toMatch(/'ชื่อ-สกุล'/);
    expect(pf).toMatch(/'เบอร์โทร'/);
    expect(pf).toMatch(/confirmInfo\.phoneMasked/);
  });

  it('R1: editable fields FALL BACK when no confirmInfo (old links / intake / custom)', () => {
    // the prefix/firstName row is gated off when the card shows
    expect(pf).toMatch(/\{!\(isFollowUp && confirmInfo\) && \(/);
    // age/bloodType/date gates flipped so they hide for follow-up+confirmInfo but stay for custom
    expect(pf).toMatch(/\(\(isFollowUp && !confirmInfo\) \|\| isCustom\) && \(/);
    expect(pf).not.toMatch(/\{\(isFollowUp \|\| isCustom\) && \(/); // old gate gone
  });

  it('R1: identity values are NEUTRAL — never red on name/HN (Thai culture)', () => {
    // the card values use var(--tx-secondary), not a red color token
    const cardStart = pf.indexOf('data-testid="pf-confirm-card"');
    const cardChunk = pf.slice(cardStart, cardStart + 1600);
    expect(cardChunk).toMatch(/color: 'var\(--tx-secondary\)'/);
    expect(cardChunk).not.toMatch(/#dc2626|#ef4444|text-red|color:\s*'red'/);
  });

  it('R2: session pill removed (no pf-session-pill in markup)', () => {
    expect(pf).not.toMatch(/className="pf-session-pill"/);
    expect(pf).not.toMatch(/className="pf-session-id"/);
  });

  it('🔴 province check gated to intake/deposit (was unconditional → blocked follow-up submit)', () => {
    expect(pf).toMatch(/if \(isIntake && !formData\.province\)/);
    expect(pf).not.toMatch(/if \(!formData\.province\) \{/); // old unconditional gate gone
  });
});
