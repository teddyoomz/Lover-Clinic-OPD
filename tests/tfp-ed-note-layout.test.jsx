import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tfp = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');

describe('TFP — ED Score in หมายเหตุทั่วไป (Task 12)', () => {
  it('imports the ED helpers', () => {
    expect(tfp).toMatch(/import \{ listenToAssessments \} from '\.\.\/lib\/scopedDataLayer\.js'/);
    expect(tfp).toMatch(/import \{ pickKioskAssessmentFields \} from '\.\.\/lib\/kioskAssessmentFields\.js'/);
    expect(tfp).toMatch(/import \{ latestRounds \} from '\.\.\/lib\/assessmentRoundsCore\.js'/);
    // ED follow-up v2 (2026-06-15) — TFP now also imports formatRoundDate (R4 round date).
    expect(tfp).toMatch(/import \{ scoreForType, ED_TYPE_META, stripScreeningSection, formatRoundDate \} from '\.\.\/lib\/edScoreDisplay\.js'/);
  });
  it('subscribes assessments + derives latest-2 + stripped note', () => {
    expect(tfp).toMatch(/const \[edAssessments, setEdAssessments\] = useState\(\[\]\)/);
    expect(tfp).toMatch(/listenToAssessments\(\s*customerId,\s*setEdAssessments/);
    expect(tfp).toMatch(/edLatest2 = useMemo\(\(\) => latestRounds\(edIntakePerf, edAssessments, 2\)/);
    expect(tfp).toMatch(/edStrippedNote = useMemo\(\(\) => stripScreeningSection\(customerNote\)\.trim\(\)/);
  });
  it('หมายเหตุทั่วไป renders the STRIPPED note + ED latest-2 (not the raw baked note)', () => {
    expect(tfp).toMatch(/\{\(edStrippedNote \|\| edLatest2\.length > 0\) && \(/);
    expect(tfp).toMatch(/data-testid="tfp-ed-latest2"/);
    expect(tfp).toMatch(/ED Score · 2 ครั้งล่าสุด/);
    // anti-regression: no longer renders the raw String(customerNote) in the note card
    expect(tfp).not.toMatch(/\{String\(customerNote \|\| ''\)\.trim\(\)\}/);
  });
});

describe('TFP — layout polish (Task 13)', () => {
  it('DX/Tx/Plan textareas are 2× taller (rows 6/6/4)', () => {
    expect(tfp).toMatch(/\['diagnosis', 'DX — วินิจฉัยโรค \(Diagnosis\)', 6\]/);
    expect(tfp).toMatch(/\['treatmentInfo', 'Tx — รักษา \/ Dr\. Note', 6\]/);
    expect(tfp).toMatch(/\['treatmentPlan', 'Plan — แผนการรักษา', 4\]/);
  });
  it('health-info textareas enlarged (rows 4) to balance the column', () => {
    expect(tfp).toMatch(/<LocalTextarea value=\{val\} onCommit=\{setter\} rows=\{4\}/);
  });
  it('button row-align mechanism preserved (left mt-auto + right flex-1)', () => {
    expect(tfp).toMatch(/className="mb-3 mt-auto"/);                 // left vitals-save bottom-pin
    expect(tfp).toMatch(/<FormSection isDark=\{isDark\} className="flex-1 flex flex-col">/); // right OPD card grows
  });
});
