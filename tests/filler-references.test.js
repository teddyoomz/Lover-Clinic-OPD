// Filler research-references: verified citations (fillerRefs.js) + the footer credit
// button/modal wiring + the user-requested removals. Source-grep + data invariants.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { FILLER_REFERENCES } from '../src/lib/fillerRefs.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('fillerRefs — verified citations', () => {
  it('R1 has exactly 5 references, each fully formed', () => {
    expect(FILLER_REFERENCES).toHaveLength(5);
    FILLER_REFERENCES.forEach((r, i) => {
      expect(r.n).toBe(i + 1);
      expect(r.url).toMatch(/^https:\/\//);
      expect(r.cite && r.ref && r.refEn && r.title).toBeTruthy(); // full paper title (replaced desc)
    });
  });
  it('R2 URLs point to the verified hosts (PMC / Oxford / ISO)', () => {
    const hosts = FILLER_REFERENCES.map((r) => new URL(r.url).host);
    expect(hosts.filter((h) => h === 'pmc.ncbi.nlm.nih.gov')).toHaveLength(3);
    expect(hosts).toContain('academic.oup.com');
    expect(hosts).toContain('www.iso.org');
  });
  it('R3 corrected attributions (Zhang not Wang · Ahn girth · +14.8mm)', () => {
    const blob = JSON.stringify(FILLER_REFERENCES);
    expect(blob).not.toMatch(/Wang/);            // PMC9809476 is ZHANG, not Wang
    expect(FILLER_REFERENCES[0].ref).toMatch(/Yang/);
    expect(FILLER_REFERENCES[1].ref).toMatch(/Zhang/);
    expect(FILLER_REFERENCES[2].ref).toMatch(/Ahn/);
    expect(FILLER_REFERENCES[3].title).toMatch(/706/);          // full title carries the 706-patient detail
    expect(FILLER_REFERENCES[4].title).toMatch(/condom/i);
    expect(FILLER_REFERENCES[4].ref).toMatch(/ISO 4074/);
    expect(FILLER_REFERENCES.map((r) => r.cite)).toEqual([
      'PMC7230452', 'PMC9809476', 'PMC8987147', 'J Sex Med 2024; 21(10):878', 'ISO 4074',
    ]);
  });
});

describe('FillerSimulator — footer research-credit button + requested removals', () => {
  const sim = read('src/pages/FillerSimulator.jsx');
  it('S1 imports the shared references + wires the modal state', () => {
    expect(sim).toMatch(/import \{ FILLER_REFERENCES \} from '\.\.\/lib\/fillerRefs\.js'/);
    expect(sim).toMatch(/const \[refsOpen, setRefsOpen\] = useState\(false\)/);
    expect(sim).toMatch(/setRefsOpen\(true\)/);
    expect(sim).toMatch(/FILLER_REFERENCES\.map/);
  });
  it('S2 each reference opens its paper in a new tab (noopener)', () => {
    expect(sim).toMatch(/window\.open\(r\.url, '_blank', 'noopener,noreferrer'\)/);
  });
  it('S3 ESC closes the references popup', () => {
    expect(sim).toMatch(/if \(!reviewOpen && !refsOpen\) return undefined/);
    expect(sim).toMatch(/setRefsOpen\(false\)/);
  });
  it('S4 the per-reference "used for" mapping chip was REMOVED (user: don\'t map research→calc)', () => {
    expect(sim).not.toMatch(/refsUsed/);                 // no t('refsUsed') chip in the modal
    expect(sim).not.toMatch(/r\.usedTh|r\.usedEn/);      // cards don't render the per-paper mapping
  });
  it('S4b the modal shows the full paper TITLE instead of the short description', () => {
    expect(sim).toMatch(/r\.title/);                     // full title rendered
    expect(sim).not.toMatch(/r\.desc/);                  // short description removed from the card
  });
  it('S5 the footer phone/LINE/FB TEXT line was REMOVED (contact buttons stay)', () => {
    expect(sim).not.toMatch(/CLINIC_CONTACT\.telDisplay\} · LINE OA/);
    expect(sim).toMatch(/<ContactButtons variant="full"/); // the buttons themselves remain
  });
  it('S6 strings exist in both TH + EN', () => {
    const s = read('src/lib/fillerStrings.js');
    expect(s.match(/refsBtn:/g) || []).toHaveLength(2);
    expect(s.match(/refsTitle:/g) || []).toHaveLength(2);
  });
});
