import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(p, 'utf8');

describe('AV101 — tablet chart editor boundaries', () => {
  it('AV101.1 TFP is NOT wired to chart-edit internals (TFP-untouched guard)', () => {
    const tfp = read('src/components/TreatmentFormPage.jsx');
    expect(tfp).not.toMatch(/useChartEditSession|chartEditSession|PcPairingModal|TabletChartEditorPage|chartEditSessionCore/);
  });
  it('AV101.2 the tablet result funnels through ChartSection.handleSave (no direct be_treatments write)', () => {
    const cs = read('src/components/ChartSection.jsx');
    expect(cs).toMatch(/onSaved:.*handleSave/);
    expect(cs).not.toMatch(/be_treatments/);
  });
  it('AV101.3 the pairing collections are written ONLY by backendClient.js across src/ (closed writer list)', () => {
    const offenders = [];
    const walk = (d) => {
      for (const f of fs.readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, f.name);
        if (f.isDirectory()) { walk(fp); continue; }
        if (!/\.(js|jsx)$/.test(f.name)) continue;
        if (fp.replace(/\\/g, '/').endsWith('lib/backendClient.js')) continue;   // sanctioned writer
        const src = read(fp);
        if (/(setDoc|updateDoc|tx\.set)\([^)]*be_chart_(tablet_presence|edit_sessions)/.test(src)) offenders.push(fp);
      }
    };
    walk('src');
    expect(offenders).toEqual([]);
  });
  it('AV101.4 the orphan-sweep cron is CRON_SECRET-gated + targets the sessions collection', () => {
    const cron = read('api/cron/chart-edit-session-sweep.js');
    expect(cron).toMatch(/be_chart_edit_sessions/);
    expect(cron).toMatch(/CRON_SECRET/);
  });
});
