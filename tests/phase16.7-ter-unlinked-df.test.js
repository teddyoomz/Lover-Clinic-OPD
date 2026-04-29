// tests/phase16.7-ter-unlinked-df.test.js — Phase 16.7-ter (2026-04-29 session 33)
//
// Coverage for the user-reported all-zeros bug fix:
//   "เป็น 0 หมดเนี่ยนะ ใช้ได้ ? และลองตัดการรักษาทั้งแพทย์และผู้ช่วย
//   โดยใส่ค่ามือไปด้วย ก็ไม่มาปรากฎในนี้เลย"
//
// Investigation found: 6 treatments in April had filled `detail.dfEntries[]`
// but ALL had `linkedSaleId=''` (consume-existing-course case). The Phase 14.5
// path in dfPayoutAggregator requires the treatment-to-sale join → these
// DF entries were invisible. ExpenseReportTab + DfPayoutReportTab both
// showed ฿0 across the board.
//
// Fix: computeUnlinkedTreatmentDfBuckets + mergeUnlinkedDfIntoPayoutRows
// surface the DF for these treatments. Baht-type direct (value), percent-
// type via course price lookup callback.

import { describe, it, expect } from 'vitest';
import {
  computeUnlinkedTreatmentDfBuckets,
  mergeUnlinkedDfIntoPayoutRows,
} from '../src/lib/expenseReportHelpers.js';

describe('UD.A — computeUnlinkedTreatmentDfBuckets — baht type', () => {
  it('UD.A.1 — empty input returns empty Map', () => {
    expect(computeUnlinkedTreatmentDfBuckets([]).size).toBe(0);
    expect(computeUnlinkedTreatmentDfBuckets(null).size).toBe(0);
    expect(computeUnlinkedTreatmentDfBuckets(undefined).size).toBe(0);
  });

  it('UD.A.2 — treatment without dfEntries is skipped', () => {
    const t = [{ id: 'T-1', detail: { treatmentDate: '2026-04-29' } }];
    expect(computeUnlinkedTreatmentDfBuckets(t).size).toBe(0);
  });

  it('UD.A.3 — single baht-type entry produces correct bucket', () => {
    const t = [{
      id: 'T-1',
      detail: {
        treatmentDate: '2026-04-29',
        dfEntries: [{
          doctorId: '410',
          rows: [{ courseId: '1057', courseName: 'IV Drip', value: 100, type: 'baht', enabled: true }],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t);
    expect(buckets.size).toBe(1);
    expect(buckets.get('410').totalDf).toBe(100);
    expect(buckets.get('410').lineCount).toBe(1);
  });

  it('UD.A.4 — multiple enabled baht rows sum together', () => {
    const t = [{
      id: 'T-1',
      detail: {
        dfEntries: [{
          doctorId: '410',
          rows: [
            { courseId: '1057', value: 100, type: 'baht', enabled: true },
            { courseId: 'NSS', value: 20, type: 'baht', enabled: true },
            { courseId: 'Vit C', value: 999, type: 'baht', enabled: false }, // disabled — skip
          ],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t);
    expect(buckets.get('410').totalDf).toBe(120);
    expect(buckets.get('410').lineCount).toBe(2);
  });

  it('UD.A.5 — multiple doctors split into separate buckets', () => {
    const t = [{
      id: 'T-1',
      detail: {
        dfEntries: [
          { doctorId: '308', rows: [{ courseId: 'X', value: 500, type: 'baht', enabled: true }] },
          { doctorId: '309', rows: [{ courseId: 'Y', value: 10, type: 'baht', enabled: true }] },
        ],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t);
    expect(buckets.size).toBe(2);
    expect(buckets.get('308').totalDf).toBe(500);
    expect(buckets.get('309').totalDf).toBe(10);
  });

  it('UD.A.6 — multiple treatments aggregate per doctor', () => {
    const t = [
      { id: 'T-1', detail: { dfEntries: [{ doctorId: '308', rows: [{ courseId: 'X', value: 100, type: 'baht', enabled: true }] }] } },
      { id: 'T-2', detail: { dfEntries: [{ doctorId: '308', rows: [{ courseId: 'Y', value: 50, type: 'baht', enabled: true }] }] } },
    ];
    const buckets = computeUnlinkedTreatmentDfBuckets(t);
    expect(buckets.get('308').totalDf).toBe(150);
    expect(buckets.get('308').lineCount).toBe(2);
  });

  it('UD.A.7 — value=0 or negative is skipped', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [
            { value: 0, type: 'baht', enabled: true },
            { value: -10, type: 'baht', enabled: true },
            { value: 100, type: 'baht', enabled: true },
          ],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t);
    expect(buckets.get('308').totalDf).toBe(100);
    expect(buckets.get('308').lineCount).toBe(1);
  });
});

describe('UD.B — percent type with priceLookup', () => {
  const priceLookup = (cid) => ({ '891': 5000, '24275': 8000, '896': 3000 }[cid] || 0);

  it('UD.B.1 — single percent entry computes price × pct', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [{ courseId: '891', courseName: 'NA-Botox', value: 10, type: 'percent', enabled: true }],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, { priceLookup });
    expect(buckets.get('308').totalDf).toBe(500); // 5000 × 10% = 500
  });

  it('UD.B.2 — multiple percent rows sum', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [
            { courseId: '891', value: 10, type: 'percent', enabled: true },   // 5000 × 10% = 500
            { courseId: '24275', value: 10, type: 'percent', enabled: true }, // 8000 × 10% = 800
            { courseId: '896', value: 10, type: 'percent', enabled: true },   // 3000 × 10% = 300
          ],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, { priceLookup });
    expect(buckets.get('308').totalDf).toBe(1600);
  });

  it('UD.B.3 — percent without priceLookup → skipped', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [{ courseId: '891', value: 10, type: 'percent', enabled: true }],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t); // no priceLookup arg
    expect(buckets.size).toBe(0);
  });

  it('UD.B.4 — priceLookup returning 0 → row skipped', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [{ courseId: 'UNKNOWN', value: 10, type: 'percent', enabled: true }],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, { priceLookup });
    expect(buckets.size).toBe(0);
  });

  it('UD.B.5 — mixed baht + percent in same entry', () => {
    const t = [{
      detail: {
        dfEntries: [{
          doctorId: '308',
          rows: [
            { courseId: '891', value: 10, type: 'percent', enabled: true }, // 500
            { courseId: 'X', value: 100, type: 'baht', enabled: true },     // 100
          ],
        }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, { priceLookup });
    expect(buckets.get('308').totalDf).toBe(600);
    expect(buckets.get('308').lineCount).toBe(2);
  });
});

describe('UD.C — alreadyCountedSaleIds dedup vs dfPayoutAggregator', () => {
  it('UD.C.1 — treatment with linkedSaleId in alreadyCounted is SKIPPED', () => {
    const t = [{
      detail: {
        linkedSaleId: 'INV-100',
        dfEntries: [{ doctorId: '308', rows: [{ value: 100, type: 'baht', enabled: true }] }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, {
      alreadyCountedSaleIds: new Set(['INV-100']),
    });
    expect(buckets.size).toBe(0);
  });

  it('UD.C.2 — treatment with linkedSaleId NOT in alreadyCounted is processed', () => {
    const t = [{
      detail: {
        linkedSaleId: 'INV-100',
        dfEntries: [{ doctorId: '308', rows: [{ value: 100, type: 'baht', enabled: true }] }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, {
      alreadyCountedSaleIds: new Set(['INV-OTHER']),
    });
    expect(buckets.get('308').totalDf).toBe(100);
  });

  it('UD.C.3 — empty linkedSaleId always processed', () => {
    const t = [{
      detail: {
        linkedSaleId: '',
        dfEntries: [{ doctorId: '308', rows: [{ value: 100, type: 'baht', enabled: true }] }],
      },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, {
      alreadyCountedSaleIds: new Set(['INV-100']),
    });
    expect(buckets.get('308').totalDf).toBe(100);
  });

  it('UD.C.4 — top-level linkedSaleId also recognized (Phase 12.2b mirror)', () => {
    const t = [{
      linkedSaleId: 'INV-200',
      detail: { dfEntries: [{ doctorId: '308', rows: [{ value: 100, type: 'baht', enabled: true }] }] },
    }];
    const buckets = computeUnlinkedTreatmentDfBuckets(t, {
      alreadyCountedSaleIds: new Set(['INV-200']),
    });
    expect(buckets.size).toBe(0); // skipped via top-level field
  });
});

describe('UD.D — mergeUnlinkedDfIntoPayoutRows', () => {
  it('UD.D.1 — empty buckets returns rows as-is', () => {
    const rows = [{ doctorId: '308', doctorName: 'X', totalDf: 100, lineCount: 2, breakdown: [] }];
    const merged = mergeUnlinkedDfIntoPayoutRows(rows, new Map(), []);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalDf).toBe(100);
  });

  it('UD.D.2 — bucket adds to existing doctor row', () => {
    const rows = [{ doctorId: '308', doctorName: 'X', totalDf: 100, lineCount: 1, breakdown: [{ saleId: 'A' }] }];
    const buckets = new Map([['308', { totalDf: 50, lineCount: 1, breakdown: [{ source: 'unlinked' }] }]]);
    const merged = mergeUnlinkedDfIntoPayoutRows(rows, buckets, []);
    expect(merged).toHaveLength(1);
    expect(merged[0].totalDf).toBe(150);
    expect(merged[0].lineCount).toBe(2);
    expect(merged[0].breakdown).toHaveLength(2);
  });

  it('UD.D.3 — bucket with NEW doctorId creates synthetic row', () => {
    const rows = [{ doctorId: '308', doctorName: 'X', totalDf: 100, lineCount: 1, breakdown: [] }];
    const buckets = new Map([['410', { totalDf: 120, lineCount: 1, breakdown: [] }]]);
    const doctors = [{ id: '410', name: 'หมอ ใหม่' }];
    const merged = mergeUnlinkedDfIntoPayoutRows(rows, buckets, doctors);
    expect(merged).toHaveLength(2);
    const newRow = merged.find(r => r.doctorId === '410');
    expect(newRow.totalDf).toBe(120);
    expect(newRow.doctorName).toBe('หมอ ใหม่');
    expect(newRow.saleCount).toBe(0);
  });

  it('UD.D.4 — does NOT mutate input rows', () => {
    const rows = [{ doctorId: '308', doctorName: 'X', totalDf: 100, lineCount: 1, breakdown: [] }];
    const buckets = new Map([['308', { totalDf: 50, lineCount: 1, breakdown: [] }]]);
    const before = rows[0].totalDf;
    mergeUnlinkedDfIntoPayoutRows(rows, buckets, []);
    expect(rows[0].totalDf).toBe(before);
  });

  it('UD.D.5 — synthetic row resolves doctorName via firstname+lastname fallback', () => {
    const rows = [];
    const buckets = new Map([['D-1', { totalDf: 100, lineCount: 1, breakdown: [] }]]);
    const doctors = [{ id: 'D-1', firstname: 'หมอ', lastname: 'A' }];
    const merged = mergeUnlinkedDfIntoPayoutRows(rows, buckets, doctors);
    expect(merged[0].doctorName).toBe('หมอ A');
  });

  it('UD.D.6 — synthetic row falls back to doctorId when no name', () => {
    const buckets = new Map([['D-X', { totalDf: 100, lineCount: 1, breakdown: [] }]]);
    const merged = mergeUnlinkedDfIntoPayoutRows([], buckets, []);
    expect(merged[0].doctorName).toBe('D-X');
  });
});

describe('UD.E — User scenario reconstruction (real production data)', () => {
  // Reconstruct the exact scenario from session 33 user report:
  // 6 treatments with dfEntries, all with empty linkedSaleId.
  // Pre-fix: dfPayoutAggregator returned [] → all-zeros UI.
  // Post-fix: helpers surface ~14,710 baht across 3 doctors.

  it('UD.E.1 — 3 treatments, all unlinked, baht type → correct totals', () => {
    const treatments = [
      { id: 'T-1', detail: {
        treatmentDate: '2026-04-29',
        linkedSaleId: '',
        dfEntries: [{ doctorId: '410', rows: [
          { courseId: '1057', value: 100, type: 'baht', enabled: true },
          { courseId: 'NSS', value: 20, type: 'baht', enabled: true },
        ] }],
      } },
      { id: 'T-2', detail: {
        treatmentDate: '2026-04-24',
        linkedSaleId: '',
        dfEntries: [{ doctorId: '308', rows: [
          { courseId: 'X', value: 150, type: 'baht', enabled: true },
          { courseId: 'Y', value: 500, type: 'baht', enabled: true },
        ] }],
      } },
      { id: 'T-3', detail: {
        treatmentDate: '2026-04-24',
        linkedSaleId: '',
        dfEntries: [
          { doctorId: '308', rows: [{ courseId: 'Z', value: 50, type: 'baht', enabled: true }] },
          { doctorId: '309', rows: [{ courseId: 'Z', value: 10, type: 'baht', enabled: true }] },
        ],
      } },
    ];
    const buckets = computeUnlinkedTreatmentDfBuckets(treatments);
    expect(buckets.get('410').totalDf).toBe(120);
    expect(buckets.get('308').totalDf).toBe(700); // 150+500+50
    expect(buckets.get('309').totalDf).toBe(10);
  });

  it('UD.E.2 — totalUnlinkedDf reconciles with summary tile expectation', () => {
    const treatments = [
      { detail: { dfEntries: [{ doctorId: '410', rows: [{ value: 120, type: 'baht', enabled: true }] }] } },
      { detail: { dfEntries: [{ doctorId: '308', rows: [{ value: 14580, type: 'baht', enabled: true }] }] } },
      { detail: { dfEntries: [{ doctorId: '309', rows: [{ value: 10, type: 'baht', enabled: true }] }] } },
    ];
    const buckets = computeUnlinkedTreatmentDfBuckets(treatments);
    let total = 0;
    for (const b of buckets.values()) total += b.totalDf;
    expect(total).toBe(14710); // matches preview_eval-verified production value
  });
});

describe('UD.F — Source-grep regression guards', () => {
  it('UD.F.1 — expenseReportAggregator imports + uses the helpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    expect(src).toMatch(/computeUnlinkedTreatmentDfBuckets/);
    expect(src).toMatch(/mergeUnlinkedDfIntoPayoutRows/);
    expect(src).toMatch(/listCourses/);
    expect(src).toMatch(/priceLookup/);
  });

  it('UD.F.2 — DfPayoutReportTab imports + uses the helpers', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/DfPayoutReportTab.jsx', 'utf-8');
    expect(src).toMatch(/computeUnlinkedTreatmentDfBuckets/);
    expect(src).toMatch(/mergeUnlinkedDfIntoPayoutRows/);
  });

  it('UD.F.3 — totalAll formula in computeExpenseSummary uses totalCategory + totalUnlinkedDf', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/lib/expenseReportHelpers.js', 'utf-8');
    expect(src).toMatch(/totalAll\s*=\s*roundTHB\(totalCategory\s*\+\s*unlinkedDf/);
  });

  it('UD.F.4 — Phase 16.7-ter institutional-memory marker present', async () => {
    const { readFileSync } = await import('node:fs');
    const helpers = readFileSync('src/lib/expenseReportHelpers.js', 'utf-8');
    const aggregator = readFileSync('src/lib/expenseReportAggregator.js', 'utf-8');
    const dfTab = readFileSync('src/components/backend/reports/DfPayoutReportTab.jsx', 'utf-8');
    expect(helpers).toMatch(/Phase 16\.7-ter/);
    expect(aggregator).toMatch(/Phase 16\.7-ter/);
    expect(dfTab).toMatch(/Phase 16\.7-ter/);
  });

  it('UD.F.5 — ExpenseReportTab branch sidebar empty-state message updated', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync('src/components/backend/reports/ExpenseReportTab.jsx', 'utf-8');
    // Old "ไม่มีสาขา" should be REPLACED with helpful migration hint
    expect(src).toMatch(/expense-report-no-branches-hint/);
    expect(src).toMatch(/ใช้ข้อมูลทุกสาขา/);
  });
});
