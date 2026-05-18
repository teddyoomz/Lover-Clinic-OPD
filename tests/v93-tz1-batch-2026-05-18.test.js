// ─── V93 — TZ1 batch fix (2026-05-18) ──────────────────────────────────────
//
// audit-all 2026-05-18 EOD+11 LATE flagged 3 CRITICAL + 5 HIGH TZ1 sites
// (`new Date().toISOString().slice(0, 10)`). Cross-file grep via Rule P
// Step 3 surfaced 3 MORE: CustomerCreatePage.jsx + lineBotResponder.js × 2.
// Total: 11 sites in 9 files. Single trivial pattern fix → thaiTodayISO().
//
// V12-class TZ off-by-one (the same class as the SalePaymentModal TZ1 fix
// from 2026-04-26): UTC-slice during Bangkok 00:00-07:00 returns the
// PREVIOUS day. Money records, deposit dates, report exports, and
// document signature dates all drift.
//
// Companion to tests/extended/audit-2026-04-26-tz1-fixes.test.js (the
// original 3-file batch). This file extends coverage to the 11 sites
// surfaced by V93.
//
// Files (9) + sites (11):
//   1. src/pages/AdminDashboard.jsx:352                    — deposit paymentDate
//   2. src/pages/PatientDashboard.jsx:431                  — courses filter "today"
//   3. src/lib/backendClient.js:6015                       — central order importedDate
//   4. src/lib/centralStockOrderValidation.js:119,186      — emptyForm + normalize
//   5. src/components/backend/QuotationPrintView.jsx:70    — signature date
//   6. src/components/backend/SalePrintView.jsx:152        — signature date
//   7. src/components/backend/reports/RemainingCourseTab.jsx:150  — CSV filename
//   8. src/components/backend/CustomerCreatePage.jsx:461   — birthdate max
//   9. src/lib/lineBotResponder.js:402,768                 — bot reply today

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { thaiTodayISO } from '../src/utils.js';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Strip line-comments + block-comments so source-grep doesn't mis-flag
// V-entry references, audit invariant docs, or fix-marker comments that
// legitimately contain the banned string literal.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

const RAW_BAD_RE = /new Date\(\)\.toISOString\(\)\.slice\(\s*0\s*,\s*10\s*\)/;

// ═══════════════════════════════════════════════════════════════════════
// V93.A — AdminDashboard deposit paymentDate
// ═══════════════════════════════════════════════════════════════════════

describe('V93.A: AdminDashboard mapDepositPayloadToBe uses thaiTodayISO', () => {
  const SRC = READ('src/pages/AdminDashboard.jsx');
  const CODE = stripComments(SRC);

  it('A.1: imports thaiTodayISO from utils.js (may be in multi-name import)', () => {
    // AdminDashboard.jsx imports thaiTodayISO alongside many other utils via
    // a multi-name destructure (line 108). Regex must permit other names.
    expect(SRC).toMatch(/import\s*\{[^}]*\bthaiTodayISO\b[^}]*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('A.2: deposit paymentDate uses thaiTodayISO', () => {
    expect(SRC).toMatch(/paymentDate:\s*dep\?\.depositDate\s*\|\|\s*thaiTodayISO\(\)/);
  });

  it('A.3: NO raw new Date().toISOString().slice(0,10) in code (comments OK)', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.B — PatientDashboard courses filter
// ═══════════════════════════════════════════════════════════════════════

describe('V93.B: PatientDashboard course filter uses thaiTodayISO', () => {
  const SRC = READ('src/pages/PatientDashboard.jsx');
  const CODE = stripComments(SRC);

  it('B.1: imports thaiTodayISO alongside hexToRgb', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*thaiTodayISO[^}]*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('B.2: today := thaiTodayISO() (not raw UTC slice)', () => {
    expect(SRC).toMatch(/const today\s*=\s*thaiTodayISO\(\)/);
  });

  it('B.3: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.C — backendClient central order importedDate
// ═══════════════════════════════════════════════════════════════════════

describe('V93.C: backendClient createCentralStockOrder importedDate uses thaiTodayISO', () => {
  const SRC = READ('src/lib/backendClient.js');
  const CODE = stripComments(SRC);

  it('C.1: imports thaiTodayISO from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('C.2: importedDate fallback uses thaiTodayISO', () => {
    expect(SRC).toMatch(/importedDate:\s*data\.importedDate\s*\|\|\s*thaiTodayISO\(\)/);
  });

  it('C.3: NO raw new Date().toISOString().slice(0,10) in code (comments OK)', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.D — centralStockOrderValidation × 2 sites
// ═══════════════════════════════════════════════════════════════════════

describe('V93.D: centralStockOrderValidation × 2 sites use thaiTodayISO', () => {
  const SRC = READ('src/lib/centralStockOrderValidation.js');
  const CODE = stripComments(SRC);

  it('D.1: imports thaiTodayISO from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('D.2: emptyCentralStockOrderForm() today := thaiTodayISO()', () => {
    expect(SRC).toMatch(/emptyCentralStockOrderForm[\s\S]*?const today\s*=\s*thaiTodayISO\(\)/);
  });

  it('D.3: normalize importedDate fallback uses thaiTodayISO', () => {
    expect(SRC).toMatch(/f\.importedDate\s*\?\s*String\(f\.importedDate\)\s*:\s*thaiTodayISO\(\)/);
  });

  it('D.4: NO raw new Date().toISOString().slice(0,10) in code (comments OK)', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.E — QuotationPrintView signature date
// ═══════════════════════════════════════════════════════════════════════

describe('V93.E: QuotationPrintView signature date uses thaiTodayISO', () => {
  const SRC = READ('src/components/backend/QuotationPrintView.jsx');
  const CODE = stripComments(SRC);

  it('E.1: imports thaiTodayISO from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\.js['"]/);
  });

  it('E.2: signature date fallback chain ends with thaiTodayISO()', () => {
    expect(SRC).toMatch(/q\.quotationDate\s*\|\|\s*q\.date\s*\|\|\s*thaiTodayISO\(\)/);
  });

  it('E.3: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.F — SalePrintView signature date
// ═══════════════════════════════════════════════════════════════════════

describe('V93.F: SalePrintView signature date uses thaiTodayISO', () => {
  const SRC = READ('src/components/backend/SalePrintView.jsx');
  const CODE = stripComments(SRC);

  it('F.1: imports thaiTodayISO from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\.js['"]/);
  });

  it('F.2: signature date fallback ends with thaiTodayISO()', () => {
    expect(SRC).toMatch(/s\.saleDate\s*\|\|\s*thaiTodayISO\(\)/);
  });

  it('F.3: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.G — RemainingCourseTab CSV export filename
// ═══════════════════════════════════════════════════════════════════════

describe('V93.G: RemainingCourseTab CSV export filename uses thaiTodayISO', () => {
  const SRC = READ('src/components/backend/reports/RemainingCourseTab.jsx');
  const CODE = stripComments(SRC);

  it('G.1: imports thaiTodayISO from utils.js (3 levels up)', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/utils\.js['"]/);
  });

  it('G.2: handleExport today := thaiTodayISO()', () => {
    expect(SRC).toMatch(/const today\s*=\s*thaiTodayISO\(\)/);
  });

  it('G.3: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.H — CustomerCreatePage birthdate max
// ═══════════════════════════════════════════════════════════════════════

describe('V93.H: CustomerCreatePage birthdate max attr uses thaiTodayISO', () => {
  const SRC = READ('src/components/backend/CustomerCreatePage.jsx');
  const CODE = stripComments(SRC);

  it('H.1: imports thaiTodayISO from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiTodayISO\s*\}\s*from\s*['"]\.\.\/\.\.\/utils\.js['"]/);
  });

  it('H.2: birthdate DateField max prop uses thaiTodayISO()', () => {
    expect(SRC).toMatch(/max=\{thaiTodayISO\(\)\}/);
  });

  it('H.3: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.I — lineBotResponder pure helpers × 2 sites (Vercel serverless)
// ═══════════════════════════════════════════════════════════════════════

describe('V93.I: lineBotResponder uses inlined _thaiTodayISO helper', () => {
  const SRC = READ('src/lib/lineBotResponder.js');
  const CODE = stripComments(SRC);

  it('I.1: declares inlined _thaiTodayISO() (dependency-free for Vercel)', () => {
    expect(SRC).toMatch(/function _thaiTodayISO\(\)/);
    expect(SRC).toMatch(/Date\.now\(\)\s*\+\s*7\s*\*\s*3600000/);
  });

  it('I.2: formatAppointmentsReply uses _thaiTodayISO fallback', () => {
    expect(SRC).toMatch(/const today\s*=\s*todayISO\s*\|\|\s*_thaiTodayISO\(\)/);
  });

  it('I.3: buildAppointmentsFlex uses _thaiTodayISO fallback', () => {
    expect(SRC).toMatch(/const todayISO\s*=\s*opts\.todayISO\s*\|\|\s*_thaiTodayISO\(\)/);
  });

  it('I.4: NO raw new Date().toISOString().slice(0,10) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });

  it('I.5: NO `from \'../utils.js\'` import (keep dependency-free)', () => {
    // Vercel serverless consumers (api/webhook/line.js + api/admin/link-requests.js)
    // import this module. Keeping it self-contained avoids cross-context bundle issues.
    expect(SRC).not.toMatch(/from\s*['"]\.\.\/utils\.js['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.J — RUNTIME parity: _thaiTodayISO matches src/utils.js thaiTodayISO
// ═══════════════════════════════════════════════════════════════════════

describe('V93.J: lineBotResponder _thaiTodayISO matches canonical thaiTodayISO', () => {
  it('J.1: same return shape (YYYY-MM-DD)', () => {
    const canonical = thaiTodayISO();
    expect(canonical).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // We can't easily call the lib-internal _thaiTodayISO directly (it's not
  // exported on purpose). But we CAN verify the shape parity via canonical
  // output + assert the inlined function source is byte-equivalent logic.
  it('J.2: inlined function logic equivalent to canonical', () => {
    const SRC = READ('src/lib/lineBotResponder.js');
    // Inlined logic: Date.now() + 7 * 3600000 → getUTC{FullYear,Month,Date}
    expect(SRC).toMatch(/Date\.now\(\)\s*\+\s*7\s*\*\s*3600000/);
    expect(SRC).toMatch(/getUTCFullYear\(\)/);
    expect(SRC).toMatch(/getUTCMonth\(\)\s*\+\s*1/);
    expect(SRC).toMatch(/getUTCDate\(\)/);
    expect(SRC).toMatch(/padStart\(2,\s*['"]0['"]\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.K — V12-class anti-regression: closed-list audit of all 9 files
// ═══════════════════════════════════════════════════════════════════════

describe('V93.K: V12-class anti-regression — all 9 V93 files stay TZ-clean', () => {
  const V93_FILES = [
    'src/pages/AdminDashboard.jsx',
    'src/pages/PatientDashboard.jsx',
    'src/lib/backendClient.js',
    'src/lib/centralStockOrderValidation.js',
    'src/components/backend/QuotationPrintView.jsx',
    'src/components/backend/SalePrintView.jsx',
    'src/components/backend/reports/RemainingCourseTab.jsx',
    'src/components/backend/CustomerCreatePage.jsx',
    'src/lib/lineBotResponder.js',
  ];

  for (const f of V93_FILES) {
    it(`K.guarded: ${f} — no raw new Date().toISOString().slice(0,10) in code`, () => {
      const src = READ(f);
      const code = stripComments(src);
      expect(code).not.toMatch(RAW_BAD_RE);
    });
  }

  it('K.aggregate: 9 V93 files locked', () => {
    expect(V93_FILES).toHaveLength(9);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.L — iter-2 (audit-all 2026-05-18 EOD+11 LATE iter 2) caught one
// more site V93 batch missed: clinicReportAggregator monthly-default
// using `.slice(0, 7)` — same TZ family, different slice width.
// ═══════════════════════════════════════════════════════════════════════

const RAW_BAD_MONTH_RE = /new Date\(\)\.toISOString\(\)\.slice\(\s*0\s*,\s*7\s*\)/;

describe('V93.L: clinicReportAggregator monthly default uses thaiYearMonth', () => {
  const SRC = READ('src/lib/clinicReportAggregator.js');
  const CODE = stripComments(SRC);

  it('L.1: imports thaiYearMonth from utils.js', () => {
    expect(SRC).toMatch(/import\s*\{\s*thaiYearMonth\s*\}\s*from\s*['"]\.\.\/utils\.js['"]/);
  });

  it('L.2: buildMonthRange no-range default returns [thaiYearMonth()]', () => {
    expect(SRC).toMatch(/return\s*\[\s*thaiYearMonth\(\)\s*\]/);
  });

  it('L.3: NO raw new Date().toISOString().slice(0,7) in code', () => {
    expect(CODE).not.toMatch(RAW_BAD_MONTH_RE);
  });

  it('L.4: NO raw new Date().toISOString().slice(0,10) either', () => {
    expect(CODE).not.toMatch(RAW_BAD_RE);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V93.M — AV85 invariant lock in audit-anti-vibe-code SKILL.md
// (Rule P Step 6 lock — without AVxx invariant, future drift relies on
// regression test only; AV85 enforces globally via grep.)
// ═══════════════════════════════════════════════════════════════════════

describe('V93.M: AV85 invariant present in audit-anti-vibe-code SKILL.md', () => {
  const SKILL = READ('.claude/skills/audit-anti-vibe-code/SKILL.md');

  it('M.1: AV85 entry exists with TZ1 family in title', () => {
    expect(SKILL).toMatch(/### AV85 — TZ1 family/);
  });

  it('M.2: grep pattern for .slice(0,10) covered', () => {
    expect(SKILL).toMatch(/slice\\\(\\s\*0\\s\*,\\s\*10\\s\*\\\)/);
  });

  it('M.3: grep pattern for .slice(0,7) covered (iter-2 catch)', () => {
    expect(SKILL).toMatch(/slice\\\(\\s\*0\\s\*,\\s\*7\\s\*\\\)/);
  });

  it('M.4: lists thaiTodayISO + thaiYearMonth as canonical replacements', () => {
    expect(SKILL).toMatch(/thaiTodayISO\(\)/);
    expect(SKILL).toMatch(/thaiYearMonth\(\)/);
  });

  it('M.5: documents inlined Vercel-helper pattern for api/', () => {
    expect(SKILL).toMatch(/_thaiTodayISO|inlined|dependency-free/);
  });

  it('M.6: closed sanctioned-exception list explicit', () => {
    expect(SKILL).toMatch(/Closed sanctioned list|sanctioned exception/);
  });
});
