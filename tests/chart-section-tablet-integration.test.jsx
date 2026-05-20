import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('ChartSection tablet integration (T8)', () => {
  it('I1 ChartSection imports the pairing modal + session hook + funnels through handleSave', () => {
    const s = fs.readFileSync('src/components/ChartSection.jsx', 'utf8');
    expect(s).toMatch(/PcPairingModal/);
    expect(s).toMatch(/useChartEditSession/);
    expect(s).toMatch(/onSaved:.*handleSave/);
  });
  it('I2 App routes ?tablet=chart → editor page (staff auth, NOT anon)', () => {
    const a = fs.readFileSync('src/App.jsx', 'utf8');
    expect(a).toMatch(/tabletFromUrl === 'chart'/);
    expect(a).toMatch(/TabletChartEditorPage/);
    // tablet is NOT in needsPublicAuth (that would trigger signInAnonymously) — it uses staff auth
    expect(a).toMatch(/needsPublicAuth = !!\(sessionFromUrl \|\| patientFromUrl \|\| scheduleFromUrl\)/);
  });
  it('I3 TFP is NOT wired to chart-edit internals (only an optional patientLabel prop)', () => {
    const tfp = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(tfp).not.toMatch(/useChartEditSession|chartEditSession|PcPairingModal|TabletChartEditorPage/);
    expect(tfp).toMatch(/patientLabel=/);
  });
});
