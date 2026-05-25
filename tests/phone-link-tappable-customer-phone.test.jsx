/**
 * Customer phone "tap-to-dial" coverage (2026-05-18).
 *
 * User: "ทำให้ทุกที่ที่โชว์เบอร์โทรศัพท์ลูกค้า ทั้ง Frontend และ backend ทั้งหน้า
 * ข้อมูลลูกค้า ทำให้เบอร์โทรนั้นสามารถกดแล้วเด้งปุ่มโทรออกได้เลยถ้าใครใช้ใน mobile
 * เพื่อความสะดวกของ User"
 *
 * This bank locks 3 contracts:
 *   1. formatPhoneForTel helper handles Thai mobile / landline / international
 *      / placeholder / adversarial inputs correctly (P1)
 *   2. PhoneLink component renders `<a href="tel:...">` for valid phones and
 *      a plain `<span>` for invalid ones (P2)
 *   3. Source-grep across every customer phone display site asserts PhoneLink
 *      is wired — prevents future regressions if a callsite reverts to raw
 *      text (P3)
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import PhoneLink from '../src/components/PhoneLink.jsx';
import { formatPhoneForTel } from '../src/lib/phoneLink.js';

const REPO_ROOT = path.resolve(__dirname, '..');
const readSrc = (rel) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

// ─── P1 — formatPhoneForTel helper ──────────────────────────────────────
describe('P1 — formatPhoneForTel helper contract', () => {
  it('P1.1 Thai mobile 10-digit returns tel:0XXXXXXXXX', () => {
    expect(formatPhoneForTel('0812345678')).toBe('tel:0812345678');
  });

  it('P1.2 Thai mobile with dashes is normalized', () => {
    expect(formatPhoneForTel('081-234-5678')).toBe('tel:0812345678');
  });

  it('P1.3 Thai mobile with spaces is normalized', () => {
    expect(formatPhoneForTel('081 234 5678')).toBe('tel:0812345678');
  });

  it('P1.4 Thai landline 9-digit returns tel:0XXXXXXXX', () => {
    expect(formatPhoneForTel('021234567')).toBe('tel:021234567');
  });

  it('P1.5 International +66 preserves leading +', () => {
    expect(formatPhoneForTel('+66 81 234 5678')).toBe('tel:+66812345678');
  });

  it('P1.6 International +1 (US) preserves leading +', () => {
    expect(formatPhoneForTel('+1 415 555 0123')).toBe('tel:+14155550123');
  });

  it('P1.7 Placeholder "-" returns null', () => {
    expect(formatPhoneForTel('-')).toBeNull();
  });

  it('P1.8 Empty string returns null', () => {
    expect(formatPhoneForTel('')).toBeNull();
  });

  it('P1.9 Whitespace-only returns null', () => {
    expect(formatPhoneForTel('   ')).toBeNull();
  });

  it('P1.10 Non-string (number) returns null', () => {
    expect(formatPhoneForTel(812345678)).toBeNull();
  });

  it('P1.11 Non-string (null) returns null', () => {
    expect(formatPhoneForTel(null)).toBeNull();
  });

  it('P1.12 Non-string (undefined) returns null', () => {
    expect(formatPhoneForTel(undefined)).toBeNull();
  });

  it('P1.13 Too-short (< 9 digits) returns null', () => {
    expect(formatPhoneForTel('081-234')).toBeNull();
  });

  it('P1.14 Letters mixed with digits — strips letters but still < 9 digits', () => {
    expect(formatPhoneForTel('081abc')).toBeNull();
  });

  it('P1.15 Letters mixed with valid phone digits still normalize', () => {
    expect(formatPhoneForTel('call 0812345678 now')).toBe('tel:0812345678');
  });

  it('P1.16 Multiple + signs — only leading + preserved', () => {
    expect(formatPhoneForTel('+66 + 81 234 5678')).toBe('tel:+66812345678');
  });

  it('P1.17 Parentheses are stripped', () => {
    expect(formatPhoneForTel('(081) 234-5678')).toBe('tel:0812345678');
  });
});

// ─── P2 — PhoneLink component contract ──────────────────────────────────
describe('P2 — PhoneLink component contract', () => {
  it('P2.1 Valid phone renders <a href="tel:...">', () => {
    const { container } = render(<PhoneLink value="0812345678" />);
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor.getAttribute('href')).toBe('tel:0812345678');
  });

  it('P2.2 Valid phone with country code preserves + in href', () => {
    const { container } = render(<PhoneLink value="+66 81 234 5678" />);
    const anchor = container.querySelector('a');
    expect(anchor.getAttribute('href')).toBe('tel:+66812345678');
  });

  it('P2.3 Invalid phone "-" renders <span>, not <a>', () => {
    const { container } = render(<PhoneLink value="-" />);
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('span')).not.toBeNull();
  });

  it('P2.4 Empty value renders <span>, not <a>', () => {
    const { container } = render(<PhoneLink value="" />);
    expect(container.querySelector('a')).toBeNull();
  });

  it('P2.5 children prop renders as link text (not value)', () => {
    const { container } = render(<PhoneLink value="0812345678">081-234-5678</PhoneLink>);
    const anchor = container.querySelector('a');
    expect(anchor.textContent).toBe('081-234-5678');
    expect(anchor.getAttribute('href')).toBe('tel:0812345678');
  });

  it('P2.6 No children → value renders as text', () => {
    const { container } = render(<PhoneLink value="0812345678" />);
    expect(container.querySelector('a').textContent).toBe('0812345678');
  });

  it('P2.7 className is applied to anchor', () => {
    const { container } = render(<PhoneLink value="0812345678" className="font-mono text-blue-500" />);
    const anchor = container.querySelector('a');
    expect(anchor.className).toContain('font-mono');
    expect(anchor.className).toContain('text-blue-500');
  });

  it('P2.8 className is applied to span when invalid', () => {
    const { container } = render(<PhoneLink value="" className="text-gray-500" />);
    const span = container.querySelector('span');
    expect(span.className).toContain('text-gray-500');
  });

  it('P2.9 data-testid="phone-link" is set on valid link', () => {
    const { container } = render(<PhoneLink value="0812345678" />);
    const anchor = container.querySelector('[data-testid="phone-link"]');
    expect(anchor).not.toBeNull();
  });

  it('P2.10 aria-label defaults to "โทรหา <value>" for accessibility', () => {
    const { container } = render(<PhoneLink value="0812345678" />);
    const anchor = container.querySelector('a');
    expect(anchor.getAttribute('aria-label')).toBe('โทรหา 0812345678');
  });

  it('P2.11 custom ariaLabel overrides default', () => {
    const { container } = render(<PhoneLink value="0812345678" ariaLabel="Call patient" />);
    expect(container.querySelector('a').getAttribute('aria-label')).toBe('Call patient');
  });
});

// ─── P3 — Source-grep regression: every customer-phone display uses PhoneLink ─
describe('P3 — Customer phone display sites must use PhoneLink', () => {
  const SITES = [
    {
      file: 'src/pages/AdminDashboard.jsx',
      label: 'AdminDashboard',
      mustContain: [
        "import PhoneLink from '../components/PhoneLink.jsx';",
        // (2026-05-26) deposit/no-deposit/history card phones removed with the tabs;
        // queue card patient phone + emergency + appt list + picker = 4 PhoneLink occurrences
      ],
      minPhoneLinkCount: 4,
    },
    {
      file: 'src/pages/PatientDashboard.jsx',
      label: 'PatientDashboard',
      mustContain: [
        "import PhoneLink from '../components/PhoneLink.jsx';",
        '<PhoneLink value={d.phone}>',
      ],
      minPhoneLinkCount: 1,
    },
    {
      file: 'src/components/backend/CustomerCard.jsx',
      label: 'CustomerCard',
      mustContain: [
        "import PhoneLink from '../PhoneLink.jsx';",
        '<PhoneLink value={phone}>',
      ],
      minPhoneLinkCount: 1,
    },
    {
      file: 'src/components/backend/CustomerDetailView.jsx',
      label: 'CustomerDetailView',
      mustContain: [
        "import PhoneLink from '../PhoneLink.jsx';",
        // primary phone row + emergency phone — 2 PhoneLink occurrences
      ],
      minPhoneLinkCount: 2,
    },
    {
      file: 'src/components/backend/recall/RecallCreateModal.jsx',
      label: 'RecallCreateModal',
      mustContain: [
        "import PhoneLink from '../../PhoneLink.jsx';",
      ],
      minPhoneLinkCount: 2,
    },
    {
      file: 'src/components/backend/recall/RecallEditModal.jsx',
      label: 'RecallEditModal',
      mustContain: [
        "import PhoneLink from '../../PhoneLink.jsx';",
        '<PhoneLink value={recall.customerPhone}>',
      ],
      minPhoneLinkCount: 1,
    },
    {
      file: 'src/components/backend/reports/CustomerReportTab.jsx',
      label: 'CustomerReportTab',
      mustContain: [
        "import PhoneLink from '../../PhoneLink.jsx';",
      ],
      minPhoneLinkCount: 2,
    },
    {
      file: 'src/components/backend/AppointmentCalendarView.jsx',
      label: 'AppointmentCalendarView',
      mustContain: [
        "import PhoneLink from '../PhoneLink.jsx';",
        '<PhoneLink value={appt.customerPhoneTemp}>',
      ],
      minPhoneLinkCount: 1,
    },
    {
      file: 'src/components/backend/DepositPanel.jsx',
      label: 'DepositPanel',
      mustContain: [
        "import PhoneLink from '../PhoneLink.jsx';",
        '<PhoneLink value={dep.customerPhoneTemp}>',
      ],
      minPhoneLinkCount: 1,
    },
    {
      file: 'src/components/admin/AppointmentHubRowCard.jsx',
      label: 'AppointmentHubRowCard',
      mustContain: [
        "import PhoneLink from '../PhoneLink.jsx';",
        '<PhoneLink value={summary.phone}>',
      ],
      minPhoneLinkCount: 1,
    },
  ];

  for (const site of SITES) {
    describe(site.label, () => {
      const src = readSrc(site.file);

      it(`imports PhoneLink + uses it ≥ ${site.minPhoneLinkCount} time(s)`, () => {
        for (const needle of site.mustContain) {
          expect(src, `${site.file} must contain: ${needle}`).toContain(needle);
        }
        const matches = src.match(/<PhoneLink\b/g) || [];
        expect(matches.length, `${site.file} expected ≥ ${site.minPhoneLinkCount} <PhoneLink occurrence(s)`).toBeGreaterThanOrEqual(site.minPhoneLinkCount);
      });
    });
  }

  // Anti-regression: legacy "raw phone display" patterns must not survive
  it('P3.anti.1 AdminDashboard no longer has bare formatPhoneNumberDisplay span at queue-card patient phone', () => {
    const src = readSrc('src/pages/AdminDashboard.jsx');
    // Must not have a bare span wrapping formatPhoneNumberDisplay(d.phone, ...) WITHOUT being wrapped in PhoneLink
    // (2026-05-26) deposit/no-deposit/history card phones removed with the tabs.
    // Conservative check: surviving formatPhoneNumberDisplay phones (queue card +
    // emergency + appt secondary) are still wrapped in PhoneLink.
    const phoneLinkMatches = src.match(/<PhoneLink\s+value=\{formatPhoneNumberDisplay\(/g) || [];
    expect(phoneLinkMatches.length).toBeGreaterThanOrEqual(3);
  });

  it('P3.anti.2 PatientDashboard no longer renders bare {d.phone} after <Phone> icon', () => {
    const src = readSrc('src/pages/PatientDashboard.jsx');
    // The legacy pattern was: <Phone ... />{d.phone}  (icon directly followed by raw value).
    // Post-V82-Phone, must be a PhoneLink wrap.
    expect(src).toMatch(/<PhoneLink value=\{d\.phone\}>/);
  });
});
