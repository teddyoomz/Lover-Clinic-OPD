import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const cdv = readFileSync(path.resolve(process.cwd(), 'src/components/backend/CustomerDetailView.jsx'), 'utf8');

describe('CustomerDetailView — ED Score wiring', () => {
  it('imports the ED components + lib helpers from the correct layers', () => {
    expect(cdv).toMatch(/import EDScoreBox from '\.\/EDScoreBox\.jsx'/);
    expect(cdv).toMatch(/import EDFollowupModal from '\.\/EDFollowupModal\.jsx'/);
    expect(cdv).toMatch(/listenToAssessments,/);                       // from scopedDataLayer (BS-1)
    expect(cdv).toMatch(/import \{ pickKioskAssessmentFields \} from '\.\.\/\.\.\/lib\/kioskAssessmentFields\.js'/);
    // ED follow-up v2 (2026-06-15) — CDV now also imports buildConfirmInfo (R1 confirm card).
    expect(cdv).toMatch(/import \{ stripScreeningSection, buildConfirmInfo \} from '\.\.\/\.\.\/lib\/edScoreDisplay\.js'/);
    expect(cdv).toMatch(/import \{ latestPerType, ED_TYPES \} from '\.\.\/\.\.\/lib\/assessmentRoundsCore\.js'/);
  });

  it('subscribes the assessments listener keyed on customerId', () => {
    expect(cdv).toMatch(/listenToAssessments\(\s*customerId,\s*setAssessments/);
    expect(cdv).toMatch(/const \[assessments, setAssessments\] = useState\(\[\]\)/);
    expect(cdv).toMatch(/const \[edModalRound, setEdModalRound\] = useState\(null\)/);
  });

  it('computes intakePerf + edTypesDone for the box + modal', () => {
    expect(cdv).toMatch(/intakePerf = useMemo\(\(\) => pickKioskAssessmentFields\(pd\)/);
    expect(cdv).toMatch(/edTypesDone = ED_TYPES\.filter/);
  });

  it('renders EDScoreBox (below 4-tab box) wired to send → setEdModalRound', () => {
    expect(cdv).toMatch(/<EDScoreBox[\s\S]{0,200}intakePerf=\{intakePerf\}/);
    expect(cdv).toMatch(/<EDScoreBox[\s\S]{0,250}onSend=\{\(n\) => setEdModalRound\(n\)\}/);
  });

  it('renders EDFollowupModal gated on edModalRound with derived round + types + branch', () => {
    expect(cdv).toMatch(/edModalRound != null &&/);
    expect(cdv).toMatch(/<EDFollowupModal[\s\S]{0,300}roundNumber=\{edModalRound\}/);
    expect(cdv).toMatch(/<EDFollowupModal[\s\S]{0,300}intakeTypes=\{edTypesDone\}/);
  });

  it('หมายเหตุทั่วไป is rendered from the ED-STRIPPED note (not the raw baked note)', () => {
    expect(cdv).toMatch(/edStrippedNote = useMemo\([\s\S]{0,120}stripScreeningSection/);
    expect(cdv).toMatch(/\{edStrippedNote && \(/);                     // card gated on stripped note
    expect(cdv).toMatch(/data-testid="customer-detail-note">\s*\{edStrippedNote\}/);
    // anti-regression: the displayed value is NOT the raw note anymore
    expect(cdv).not.toMatch(/data-testid="customer-detail-note">\s*\{String\(customer\?\.note/);
  });
});
