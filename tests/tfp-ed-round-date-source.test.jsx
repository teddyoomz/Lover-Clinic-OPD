// Task 6 source-grep — TFP R4: each ED round shows its date + "วันนี้" badge.
// formatRoundDate logic is unit-tested in ed-confirm-and-date-helpers.test.js;
// here we lock the TFP wiring (intake-date source + render + no IIFE-in-JSX).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const tfp = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');

describe('TFP — R4 round date + วันนี้ badge', () => {
  it('imports formatRoundDate', () => {
    expect(tfp).toMatch(/import \{[^}]*formatRoundDate[^}]*\} from '\.\.\/lib\/edScoreDisplay\.js'/);
  });
  it('intake round date: patientData.assessmentDate || createdAt fallback (merged at TFP, not the shared helper)', () => {
    expect(tfp).toMatch(/const \[customerCreatedISO, setCustomerCreatedISO\] = useState\(''\)/);
    expect(tfp).toMatch(/assessmentDate: \(patientData\?\.assessmentDate \|\| customerCreatedISO \|\| ''\)/);
    // createdAt captured as Bangkok YYYY-MM-DD
    expect(tfp).toMatch(/toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Bangkok' \}\)/);
  });
  it('renders the date via formatRoundDate + a วันนี้ badge', () => {
    expect(tfp).toMatch(/const fd = formatRoundDate\(r\.assessmentDate, thaiTodayISO\(\)\)/);
    expect(tfp).toMatch(/fd\.isToday &&/);
    expect(tfp).toMatch(/data-testid="ed-today-badge"/);
    expect(tfp).toMatch(/วันนี้/);
  });
  it('uses a .map BLOCK body (no IIFE-in-JSX — Vite OXC)', () => {
    // the round map opens a block `=> {` and returns — NOT an inline `(() => {...})()`
    expect(tfp).toMatch(/edLatest2\.map\(\(r\) => \{/);
    // the old un-dated inline form is gone
    expect(tfp).not.toMatch(/ครั้งที่ \{r\.round\}\{r\.assessmentDate \? `/);
  });
});
