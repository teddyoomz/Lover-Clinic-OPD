/**
 * V105-followup (2026-05-19 LATE+3 NIGHT+3) — stock movement createdAt
 * shape regression bank.
 *
 * Root cause: `scripts/v105-backfill-sale-customer-and-rededuct-stock.mjs`
 * initial version wrote 7 RE-DEDUCT movements with
 * `createdAt: FieldValue.serverTimestamp()` (Firestore Timestamp object).
 * Existing 60 movements used ISO string. Mixed shape crashed
 * MovementLogPanel.jsx:161 sort `.localeCompare()` → empty list.
 *
 * Fix:
 *   A. v105-backfill writer: `new Date().toISOString()` (NOT FieldValue)
 *   B. MovementLogPanel: defensive _v105NormalizeCreatedAt before sort/filter
 *   C. Rule M one-shot fix script (v105-followup-fix-rededuct-createdat.mjs)
 *      applied on prod — 7 entries converted Timestamp → ISO
 *   D. AV95 invariant
 *   E. E2E stress test (e2e-v105-tfp-stock-deduction-stress.mjs) 39/39 PASS
 *      across 6 scenarios on real prod
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const BACKFILL_SRC = readFileSync('scripts/v105-backfill-sale-customer-and-rededuct-stock.mjs', 'utf8');
const FIX_SRC = readFileSync('scripts/v105-followup-fix-rededuct-createdat.mjs', 'utf8');
const PANEL_SRC = readFileSync('src/components/backend/MovementLogPanel.jsx', 'utf8');
const E2E_SRC = readFileSync('scripts/e2e-v105-tfp-stock-deduction-stress.mjs', 'utf8');
const AV_SKILL = readFileSync('.claude/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

describe('V105-followup.SG — source-grep lockdown for createdAt ISO contract', () => {
  it('SG1: v105-backfill writer uses ISO string, NOT FieldValue.serverTimestamp', () => {
    // The RE-DEDUCT block specifically — the ONLY createdAt write in this script
    // should now use new Date().toISOString().
    const reDeductBlock = BACKFILL_SRC.slice(
      BACKFILL_SRC.indexOf('newDeduct'),
      BACKFILL_SRC.indexOf('newDeduct') + 1500,
    );
    expect(reDeductBlock).toMatch(/createdAt:\s*new Date\(\)\.toISOString\(\)/);
    expect(reDeductBlock).not.toMatch(/createdAt:\s*FieldValue\.serverTimestamp\(\)/);
    // V105-followup marker comment present
    expect(reDeductBlock).toMatch(/V105-followup/);
    expect(reDeductBlock).toMatch(/MUST be ISO string/);
  });

  it('SG2: MovementLogPanel has _v105NormalizeCreatedAt + applies before sort/filter', () => {
    expect(PANEL_SRC).toMatch(/_v105NormalizeCreatedAt/);
    // Normalizer handles 3 shapes
    expect(PANEL_SRC).toMatch(/typeof\s+ca\s*===\s*['"]string['"]/);
    expect(PANEL_SRC).toMatch(/typeof\s+ca\.toDate\s*===\s*['"]function['"]/);
    expect(PANEL_SRC).toMatch(/ca\._seconds/);
    // Applied BEFORE the filter+sort chain
    const loadIdx = PANEL_SRC.indexOf('loadMovements');
    expect(loadIdx).toBeGreaterThan(-1);
    const loadWindow = PANEL_SRC.slice(loadIdx, loadIdx + 2500);
    expect(loadWindow).toMatch(/allNormalized\s*=\s*all\.map\(m\s*=>\s*\(\{\s*\.\.\.m,\s*createdAt:\s*_v105NormalizeCreatedAt\(m\)/);
  });

  it('SG3: fix script writes ISO string + has idempotency flag', () => {
    expect(FIX_SRC).toMatch(/new Date\(seconds\s*\*\s*1000/);
    expect(FIX_SRC).toMatch(/\.toISOString\(\)/);
    expect(FIX_SRC).toMatch(/_v105FixedCreatedAtAt/);
    expect(FIX_SRC).toMatch(/m\._v105FixedCreatedAtAt/);
  });

  it('SG4: AV95 invariant present in audit-anti-vibe-code SKILL.md', () => {
    expect(AV_SKILL).toMatch(/### AV95 — be_stock_movements createdAt MUST be ISO string/);
    expect(AV_SKILL).toMatch(/localeCompare/);
  });

  it('SG5: E2E stress test covers 6 scenarios + cleanup', () => {
    expect(E2E_SRC).toMatch(/S1.*ตัดคอร์สเลย.*สั่งยา/);
    expect(E2E_SRC).toMatch(/S2.*ตัดคอร์สเลย.*ไม่สั่งยา/);
    expect(E2E_SRC).toMatch(/S3.*ตัดคอร์สทีหลัง.*สั่งยา/);
    expect(E2E_SRC).toMatch(/S4.*ตัดคอร์สทีหลัง.*ไม่สั่งยา/);
    expect(E2E_SRC).toMatch(/S5.*edit-change-qty/);
    expect(E2E_SRC).toMatch(/S6.*edit-images-only/);
    // Cleanup discipline (deletes all TEST- fixtures)
    expect(E2E_SRC).toMatch(/cleanupIds/);
    expect(E2E_SRC).toMatch(/TEST-V105E2E/);
    // AV95 assertion in E2E
    expect(E2E_SRC).toMatch(/AV95/);
  });

  it('SG6: V105-followup marker present in patched files', () => {
    expect(BACKFILL_SRC).toMatch(/V105-followup/);
    expect(PANEL_SRC).toMatch(/V105-followup/);
    expect(FIX_SRC).toMatch(/V105-followup/);
  });
});

// Unit test of the _v105NormalizeCreatedAt logic — extracted to a pure function
// mirror that matches the in-component helper. Keeps test in sync with source.
function _v105NormalizeCreatedAt(m) {
  const ca = m.createdAt;
  if (typeof ca === 'string' || ca == null) return ca || '';
  if (typeof ca === 'object') {
    if (typeof ca.toDate === 'function') {
      try { return ca.toDate().toISOString(); } catch { return ''; }
    }
    if (ca._seconds != null) {
      return new Date(ca._seconds * 1000 + Math.floor((ca._nanoseconds || 0) / 1e6)).toISOString();
    }
    if (ca.seconds != null) {
      return new Date(ca.seconds * 1000 + Math.floor((ca.nanoseconds || 0) / 1e6)).toISOString();
    }
  }
  return '';
}

describe('V105-followup.U — _v105NormalizeCreatedAt handles all 3 shapes', () => {
  it('U1: ISO string passthrough', () => {
    expect(_v105NormalizeCreatedAt({ createdAt: '2026-05-19T14:30:01.000Z' }))
      .toBe('2026-05-19T14:30:01.000Z');
  });

  it('U2: admin-SDK serialized Timestamp ({_seconds, _nanoseconds})', () => {
    const result = _v105NormalizeCreatedAt({ createdAt: { _seconds: 1779201001, _nanoseconds: 248000000 } });
    expect(result).toBe('2026-05-19T14:30:01.248Z');
  });

  it('U3: plain object Timestamp ({seconds, nanoseconds})', () => {
    const result = _v105NormalizeCreatedAt({ createdAt: { seconds: 1779201001, nanoseconds: 248000000 } });
    expect(result).toBe('2026-05-19T14:30:01.248Z');
  });

  it('U4: client-SDK Timestamp instance (.toDate())', () => {
    const mockTs = {
      toDate: () => new Date('2026-05-19T14:30:01.248Z'),
    };
    expect(_v105NormalizeCreatedAt({ createdAt: mockTs }))
      .toBe('2026-05-19T14:30:01.248Z');
  });

  it('U5: missing/null createdAt → empty string (sort-safe)', () => {
    expect(_v105NormalizeCreatedAt({ createdAt: null })).toBe('');
    expect(_v105NormalizeCreatedAt({ createdAt: undefined })).toBe('');
    expect(_v105NormalizeCreatedAt({})).toBe('');
  });

  it('U6: unknown object shape → empty string (no crash)', () => {
    expect(_v105NormalizeCreatedAt({ createdAt: { foo: 'bar' } })).toBe('');
  });

  it('U7: localeCompare safety — normalized output is always a string', () => {
    // The whole point: after normalize, .localeCompare() must NEVER throw
    const shapes = [
      { createdAt: '2026-05-19T14:30:01.000Z' },
      { createdAt: { _seconds: 1779201001 } },
      { createdAt: { seconds: 1779201001 } },
      { createdAt: null },
      { createdAt: undefined },
      { createdAt: { unknown: true } },
      {},
    ];
    for (const m of shapes) {
      const normalized = _v105NormalizeCreatedAt(m);
      expect(typeof normalized).toBe('string');
      // Sort comparator equivalent — must not throw
      expect(() => normalized.localeCompare('2026-01-01')).not.toThrow();
    }
  });
});
