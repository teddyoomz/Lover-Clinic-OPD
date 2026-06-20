import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// Lock: the LINE OA quick-link (onOpenLineForAppt, AdminDashboard.jsx) must
// URL-encode the customer ref so a special-char HN/id can't break the deep-link
// query. Byte-identical for normal LC- ids (URL-safe). Source-grep regression —
// the URL is built inline in a JSX handler, so we lock the SHAPE of the real code.
const SRC = readFileSync(path.resolve(process.cwd(), 'src/pages/AdminDashboard.jsx'), 'utf8');

describe('encode customer id in LINE OA url', () => {
  it('wraps the customer ref in encodeURIComponent', () => {
    expect(SRC).toMatch(
      /oaMessage\/@loverclinic\/\?customer=\$\{encodeURIComponent\(appt\.customerHN \|\| appt\.customerId\)\}/
    );
  });

  it('no raw (unencoded) customer ref remains in the oaMessage url', () => {
    // anti-regression: the pre-fix raw interpolation must be gone
    expect(SRC).not.toMatch(
      /oaMessage\/@loverclinic\/\?customer=\$\{appt\.customerHN \|\| appt\.customerId\}/
    );
  });

  it('preserves the customerLineUserId gate (button only fires for linked customers)', () => {
    expect(SRC).toMatch(/onOpenLineForAppt=\{\(appt\) => \{\s*if \(!appt\.customerLineUserId\) return;/);
  });

  it('preserves the LINE OA target + query prefix (no accidental retarget)', () => {
    expect(SRC).toContain('https://line.me/R/oaMessage/@loverclinic/?customer=');
  });

  // Behavioral proof of the "byte-identical for normal ids / safe for special chars"
  // claim, mirroring the exact handler expression (encodeURIComponent(customerHN || customerId)).
  const ref = (appt) => encodeURIComponent(appt.customerHN || appt.customerId);
  it('normal HN/id is byte-identical (no behavior change on the working path)', () => {
    expect(ref({ customerHN: 'LC-26000123', customerId: '2853' })).toBe('LC-26000123');
    expect(ref({ customerHN: '', customerId: 'LC-26000074' })).toBe('LC-26000074');
    expect(ref({ customerHN: '2853', customerId: '2853' })).toBe('2853');
  });

  it('special-char ref is safely encoded (the bug this fixes)', () => {
    expect(ref({ customerHN: 'A B&C', customerId: 'x' })).toBe('A%20B%26C');
    expect(ref({ customerHN: 'นาย ก', customerId: 'x' })).toBe(encodeURIComponent('นาย ก'));
    expect(ref({ customerHN: 'a?b#c=d', customerId: 'x' })).toBe('a%3Fb%23c%3Dd');
  });
});
