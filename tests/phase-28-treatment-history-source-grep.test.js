// tests/phase-28-treatment-history-source-grep.test.js
//
// Phase 28 Task 9 (2026-05-14) — source-grep regression bank.
//
// Locks the post-Phase-28 architecture in source-grep form:
//   - CDV imports + JSX wire to <TreatmentHistoryCard />
//   - Inline 290-line block deleted (no paginatedTreatments.map / inline lifecycle)
//   - Resolver module exports all 6 Phase 28 helpers
//   - Extracted modules exist: ROLE_LABEL_TH, formatBadgeTime, TreatmentDetailExpanded
//   - Bangkok TZ discipline: Date.UTC for date-only parsing in resolvers
//
// Future drift fails build. Mirrors the V52 BS-11 / V49 AV27 source-grep
// regression-test pattern (Rule P Tier 2 artifact).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = process.cwd();
const cdvSource = readFileSync(resolve(ROOT, 'src/components/backend/CustomerDetailView.jsx'), 'utf8');
const cardSource = readFileSync(resolve(ROOT, 'src/components/backend/treatment-history/TreatmentHistoryCard.jsx'), 'utf8');
const resolverSource = readFileSync(resolve(ROOT, 'src/lib/treatmentDisplayResolvers.js'), 'utf8');

describe('Phase 28 · source-grep regression locks', () => {
  it('SG1.1 CDV imports TreatmentHistoryCard from new path', () => {
    expect(cdvSource).toMatch(
      /import\s*\{\s*TreatmentHistoryCard\s*\}\s*from\s*['"]\.\/treatment-history\/TreatmentHistoryCard\.jsx['"]/
    );
  });

  it('SG1.2 CDV no longer contains inline paginatedTreatments.map (delegated to Card)', () => {
    expect(cdvSource).not.toMatch(/paginatedTreatments\.map\s*\(/);
  });

  it('SG1.3 CDV renders <TreatmentHistoryCard /> JSX with required props', () => {
    expect(cdvSource).toMatch(/<TreatmentHistoryCard\b/);
    // Verify required props passed
    expect(cdvSource).toMatch(/treatmentSummary=\{treatmentSummary\}/);
    expect(cdvSource).toMatch(/expandedTreatment=\{expandedTreatment\}/);
    expect(cdvSource).toMatch(/todayISO=\{thaiTodayISO\(\)\}/);
  });

  it('SG1.4 resolver module exports all 6 Phase 28 helpers', () => {
    const required = [
      'getTreatmentLifecycle',
      'getTreatmentStatusLabel',
      'getStepLabels',
      'computeRelativeThaiDateLabel',
      'groupTreatmentsByDate',
      'computeRowAction',
    ];
    for (const fn of required) {
      expect(resolverSource).toMatch(new RegExp(`export\\s+function\\s+${fn}\\b`));
    }
  });

  it('SG1.5 CDV no longer contains inline lifecycle pre-compute', () => {
    expect(cdvSource).not.toMatch(/const _vStage = !!/);
    expect(cdvSource).not.toMatch(/const _dStage = !!/);
    expect(cdvSource).not.toMatch(/const _cStage = !!/);
  });

  it('SG1.6 TreatmentHistoryCard imports from treatmentDisplayResolvers', () => {
    expect(cardSource).toMatch(/from\s*['"]\.\.\/\.\.\/\.\.\/lib\/treatmentDisplayResolvers\.js['"]/);
  });

  it('SG1.7 Phase 28 marker comment present in TreatmentHistoryCard', () => {
    expect(cardSource).toMatch(/Phase 28/);
  });

  it('SG1.8 TreatmentHistoryCard composes all 5 sub-components + Stepper indirectly via Row', () => {
    expect(cardSource).toMatch(/TreatmentHistoryHeader/);
    expect(cardSource).toMatch(/TreatmentDateHeader/);
    expect(cardSource).toMatch(/TreatmentHistoryRow/);
    expect(cardSource).toMatch(/TreatmentHistoryExpandedBody/);
    expect(cardSource).toMatch(/TreatmentHistoryPagination/);
  });

  it('SG1.9 ROLE_LABEL_TH no longer defined inline in CDV (extracted to lib/roleLabels.js)', () => {
    expect(cdvSource).not.toMatch(/const ROLE_LABEL_TH\s*=\s*\{/);
  });

  it('SG1.10 resolvers module uses Date.UTC for Bangkok TZ stability (V53 lesson)', () => {
    expect(resolverSource).toMatch(/Date\.UTC\(/);
  });

  it('SG1.11 ROLE_LABEL_TH lives in src/lib/roleLabels.js', () => {
    const roleLabelsSource = readFileSync(resolve(ROOT, 'src/lib/roleLabels.js'), 'utf8');
    expect(roleLabelsSource).toMatch(/export\s+const\s+ROLE_LABEL_TH/);
  });

  it('SG1.12 formatBadgeTime extracted to src/lib/formatBadgeTime.js (Rule C1)', () => {
    const formatSource = readFileSync(resolve(ROOT, 'src/lib/formatBadgeTime.js'), 'utf8');
    expect(formatSource).toMatch(/export\s+function\s+formatBadgeTime/);
    expect(formatSource).toMatch(/export\s+function\s+toBadgeMs/);
  });

  it('SG1.13 TreatmentDetailExpanded extracted from CDV', () => {
    const tdcSource = readFileSync(
      resolve(ROOT, 'src/components/backend/treatment-history/TreatmentDetailComponents.jsx'),
      'utf8'
    );
    expect(tdcSource).toMatch(/export\s+function\s+TreatmentDetailExpanded/);
    // CDV no longer defines it inline
    expect(cdvSource).not.toMatch(/^function TreatmentDetailExpanded\b/m);
    expect(cdvSource).not.toMatch(/^const TreatmentDetailExpanded\s*=/m);
  });

  it('SG1.14 No raw new Date(iso) for date-only parsing in resolvers (Bangkok TZ discipline)', () => {
    // Only specific ISO timestamps (with T) should reach Date constructor (via toBadgeMs)
    // Bare YYYY-MM-DD parsing must use Date.UTC midday pattern.
    // Skip comment / docstring lines — Phase 28.1-bis lesson is preserved as
    // explanatory text inside getTreatmentLifecycle (`new Date(fsTimestamp).getTime()
    // returns NaN ...`).
    const lines = resolverSource.split('\n');
    const violations = lines.filter((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return false;
      return /new Date\(\w+\)\.getTime/.test(line);
    });
    expect(violations).toHaveLength(0); // Phase 28.1-bis fixed this
  });

  it('SG1.15 No paginatedTreatments useMemo in CDV (now in Card composer)', () => {
    // CDV may still compute paginatedTreatments for auto-clamp/auto-fold useEffects,
    // but it should NOT have a useMemo that drives JSX rendering (that's the Card's job).
    // Verify by checking it's NOT followed by .map within ~5 lines
    expect(cdvSource).not.toMatch(/paginatedTreatments[\s\S]{0,200}\.map/);
  });
});
