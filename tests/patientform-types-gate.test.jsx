import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pf = readFileSync(path.resolve(process.cwd(), 'src/pages/PatientForm.jsx'), 'utf8');

describe('PatientForm — ED Score multi-type gate + expiresAt', () => {
  it('reads session.types[] into state', () => {
    expect(pf).toMatch(/const \[sessionTypes, setSessionTypes\] = useState\(\[\]\)/);
    expect(pf).toMatch(/setSessionTypes\(Array\.isArray\(data\.types\) \? data\.types : \[\]\)/);
  });

  it('derives edTypes + each section gate honors it', () => {
    expect(pf).toMatch(/const edTypes = Array\.isArray\(sessionTypes\) \? sessionTypes : \[\]/);
    expect(pf).toMatch(/isPerfMode = [\s\S]{0,120}edTypes\.includes\('iief'\)/);
    expect(pf).toMatch(/showAdam = [\s\S]{0,160}edTypes\.includes\('adam'\)/);
    expect(pf).toMatch(/showMrs = [\s\S]{0,160}edTypes\.includes\('mrs'\)/);
    expect(pf).toMatch(/const showPe = edTypes\.includes\('pe'\)/);
  });

  it('PE section gate extended to allow a followup with type pe', () => {
    expect(pf).toMatch(/\(\(isPerfMode && isIntake\) \|\| showPe\) &&/);
  });

  it('expiresAt supersedes the 2h timeout (honored regardless of isPermanent)', () => {
    expect(pf).toMatch(/data\.expiresAt && !isSimulation && Date\.now\(\) > Number\(data\.expiresAt\)/);
    // the legacy 2h gate now skips when an explicit expiresAt is present
    expect(pf).toMatch(/!data\.isPermanent && !data\.expiresAt && !isSimulation/);
  });
});
