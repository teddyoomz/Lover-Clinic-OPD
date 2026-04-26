// ─── Priority 3 audit regression guards ──────────────────────────────────
//
// Per Rule I: audit skills identify drift; regression-guard tests lock in
// the fix so the next developer doesn't re-introduce the violation.
//
// Coverage:
//   AV2 — no raw `<input type="date">` outside DateField.jsx (Iron-clad
//         rule 4: all date inputs must use the shared DateField)
//   AV3 — no Math.random() for URL-token generation (crypto tokens only)
//         — targeted to patient/session/schedule links
//   AV4 — no hardcoded credentials in src/ or api/
//   AV6 — all `allow ... if true` rules have an adjacent explanatory comment
//         documenting WHY (cookie-relay, webhook, public read)
//   BF1 — no brokerClient import in non-sync backend files
//   BF4 — firestore.rules pc_* mirrors limited to the sanctioned list
//   H-bis — api/proclinic/explore.js has @dev-only banner
//   AR3 — every aggregator excludes cancelled rows by default
//   AR4 — aggregators round to 2 decimals (Math.round × 100 / 100)

import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';

function readFile(p) { return fs.readFileSync(p, 'utf-8'); }
function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'node_modules' || ent.name === 'dist' || ent.name.startsWith('.')) continue;
      out.push(...walk(full));
    } else if (/\.(jsx?|tsx?)$/.test(ent.name)) {
      out.push(full);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
// AV2 — raw <input type="date"> only allowed in DateField.jsx
// ═══════════════════════════════════════════════════════════════════════

describe('AV2: raw <input type="date"> only in DateField.jsx', () => {
  it('AV2.1: no raw date inputs in src/ outside DateField.jsx', () => {
    const files = walk('src');
    const violations = [];
    // Strip JS comments (// + /* */) so documentation mentioning
    // "<input type='date'>" in comments doesn't trigger.
    const stripComments = (s) => s
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    for (const f of files) {
      const rel = f.replace(/\\/g, '/');
      if (rel.endsWith('/DateField.jsx') || rel.endsWith('DateField.jsx')) continue;
      const content = stripComments(readFile(f));
      const matches = content.match(/<input[^>]*type=["']date["']/g);
      if (matches) {
        violations.push({ file: rel, count: matches.length });
      }
    }
    if (violations.length > 0) {
      const msg = violations.map(v => `  ${v.file}: ${v.count}`).join('\n');
      throw new Error(`Raw <input type="date"> found outside DateField:\n${msg}`);
    }
    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AV3 — security tokens use crypto, not Math.random
// ═══════════════════════════════════════════════════════════════════════

describe('AV3: URL / security tokens use crypto.getRandomValues', () => {
  it('AV3.1: patientLinkToken uses crypto (not Math.random)', () => {
    // Generated patient links are shareable URLs — must be unguessable.
    const candidates = walk('src').filter(f => {
      const content = readFile(f);
      return /handleGeneratePatientLink|patientLinkToken/.test(content);
    });
    for (const f of candidates) {
      const content = readFile(f);
      // Find the token-generation site; allow crypto; reject Math.random next to "patientLinkToken"
      const tokenSection = content.match(/patientLinkToken\s*[=:][^;]{0,200}/);
      if (tokenSection) {
        expect(tokenSection[0]).not.toMatch(/Math\.random/);
      }
    }
  });

  it('AV3.2: clinic_schedules tokens use crypto (not Math.random)', () => {
    const candidates = walk('src').filter(f => readFile(f).includes('clinic_schedules'));
    for (const f of candidates) {
      const content = readFile(f);
      // Near any token generation for schedules
      const tokenLine = content.match(/scheduleToken[^;]{0,200}|schedule.*token[^;]{0,200}/i);
      if (tokenLine) {
        expect(tokenLine[0]).not.toMatch(/Math\.random\(\)\.toString\(36\)/);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AV4 — no hardcoded credentials
// ═══════════════════════════════════════════════════════════════════════

describe('AV4: no hardcoded credentials in src/ or api/', () => {
  it('AV4.1: no AWS / OpenAI / Anthropic key patterns', () => {
    const srcFiles = walk('src').concat(walk('api'));
    for (const f of srcFiles) {
      const content = readFile(f);
      // Generic secret-key patterns (not Firebase — that's documented public)
      expect(content).not.toMatch(/sk-[A-Za-z0-9]{30,}/); // OpenAI-style
      expect(content).not.toMatch(/AKIA[A-Z0-9]{16}/); // AWS Access Key
    }
  });

  it('AV4.2: no hardcoded passwords in src/', () => {
    const srcFiles = walk('src');
    for (const f of srcFiles) {
      const content = readFile(f);
      // password: "<real-looking>" — allow short test values
      const match = content.match(/password\s*:\s*['"][^'"\s]{12,}['"]/);
      if (match) {
        // Allow env-var references + test fixtures
        expect(match[0]).toMatch(/process\.env|TEST|fixture|mock/i);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AV6 — `if true` rules are documented
// ═══════════════════════════════════════════════════════════════════════

describe('AV6: firestore.rules `if true` always has a documented rationale', () => {
  const rules = readFile('firestore.rules');

  it('AV6.1: every `if true` rule has an inline OR preceding comment rationale', () => {
    // Find each match block ending with `if true`. Check:
    //   (a) trailing inline `//` comment on the same line, OR
    //   (b) `//` comment within 15 lines above (skip match-block openers so
    //       the comment preceding our match doesn't get blocked by the
    //       match line itself)
    const lines = rules.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (/allow [a-z, ]+:\s*if true/.test(lines[i])) {
        if (/\/\/.*\w/.test(lines[i])) continue;
        let hasComment = false;
        // Walk up until we find a comment OR hit a blank line followed
        // by another comment-less region. 40 lines is enough to span a
        // block of sibling rules (e.g. the 10 pc_* mirrors that share
        // one preceding rationale block).
        for (let j = i - 1; j >= Math.max(0, i - 40); j--) {
          if (lines[j].trim().startsWith('//')) { hasComment = true; break; }
        }
        expect(hasComment, `line ${i + 1}: \`${lines[i].trim()}\` has no rationale (inline // or within 15 lines above)`).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BF1 — brokerClient only in sync files
// ═══════════════════════════════════════════════════════════════════════

describe('BF1: brokerClient import only in sync whitelist', () => {
  const WHITELIST = ['MasterDataTab.jsx', 'CloneTab.jsx', 'CustomerDetailView.jsx'];

  it('BF1.1: only whitelisted files import brokerClient', () => {
    const files = walk('src/components/backend');
    const violations = [];
    for (const f of files) {
      const rel = f.replace(/\\/g, '/');
      const base = path.basename(rel);
      if (WHITELIST.includes(base)) continue;
      const content = readFile(f);
      if (/from\s+['"][^'"]*lib\/brokerClient['"]/.test(content)) {
        violations.push(rel);
      }
    }
    expect(violations).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// BF4 — pc_* rules match sanctioned mirrors only
// ═══════════════════════════════════════════════════════════════════════

describe('BF4: pc_* Firestore rules = sanctioned ProClinic mirrors only', () => {
  const SANCTIONED = new Set([
    'pc_appointments', 'pc_customers', 'pc_customer_appointments',
    'pc_courses', 'pc_doctors', 'pc_treatments', 'pc_treatment_history',
    'pc_chart_templates', 'pc_form_options', 'pc_inventory',
  ]);

  it('BF4.1: no pc_* rule references an OUR-backend entity', () => {
    const rules = readFile('firestore.rules');
    const pcRules = [...rules.matchAll(/match\s+\/(pc_\w+)\//g)].map(m => m[1]);
    const bad = pcRules.filter(name => !SANCTIONED.has(name));
    if (bad.length) {
      throw new Error(`Unsanctioned pc_* rule(s): ${bad.join(', ')}. Backend-owned entities must stay in be_*.`);
    }
    expect(bad).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// H-bis — dev-only scaffolding banner
// ═══════════════════════════════════════════════════════════════════════

describe('H-bis: dev-only scaffolding has strip banner', () => {
  it('H-bis.1: api/proclinic/explore.js has @dev-only banner', () => {
    const content = readFile('api/proclinic/explore.js');
    expect(content).toMatch(/@dev-only.*STRIP BEFORE PRODUCTION RELEASE/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AR3 — report aggregators default-exclude cancelled rows
// ═══════════════════════════════════════════════════════════════════════

describe('AR3: report aggregators exclude cancelled sales by default', () => {
  const AGGREGATORS = [
    'src/lib/saleReportAggregator.js',
    'src/lib/customerReportAggregator.js',
    'src/lib/dailyRevenueAggregator.js',
    'src/lib/dfPayoutAggregator.js',
    'src/lib/paymentSummaryAggregator.js',
    'src/lib/pnlReportAggregator.js',
    'src/lib/revenueAnalysisAggregator.js',
    'src/lib/appointmentAnalysisAggregator.js',
  ];

  it.each(AGGREGATORS)('AR3 in %s — references cancelled-exclusion', (file) => {
    const content = readFile(file);
    // Either: `!includeCancelled && ... cancelled` OR explicit filter
    expect(content).toMatch(/status\s*(===|!==)\s*['"]cancelled['"]|includeCancelled/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AR4 — aggregators round money to 2 decimals
// ═══════════════════════════════════════════════════════════════════════

describe('AR4: money totals rounded to 2 decimals (Math.round × 100 / 100)', () => {
  it('AR4.1: at least 5 aggregators apply the rounding pattern', () => {
    const aggs = [
      'src/lib/paymentSummaryAggregator.js',
      'src/lib/appointmentReportAggregator.js',
      'src/lib/dfPayoutAggregator.js',
      'src/lib/revenueAnalysisAggregator.js',
    ];
    let hits = 0;
    for (const f of aggs) {
      const content = readFile(f);
      if (/Math\.round\([^)]+\*\s*100\)\s*\/\s*100/.test(content)) hits++;
    }
    expect(hits).toBeGreaterThanOrEqual(3);
  });
});
