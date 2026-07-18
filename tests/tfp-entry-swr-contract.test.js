// AV208 T5 (2026-07-18) — TFP entry SWR contract locks (source-grep).
// Locks the 2-pass orchestration shape in TreatmentFormPage.jsx so future
// edits can't silently drop a MISS gate / once-guard / the save-gate.
// Behavior chain is covered by tests/tfp-entry-swr-flow-simulate.test.js;
// real-world proof = the T9 probes (local build vs REAL prod Firestore).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const tfp = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

function slice(anchor, len = 2000, src = tfp) {
  const idx = src.indexOf(anchor);
  expect(idx, `${anchor} not found`).toBeGreaterThan(-1);
  return src.slice(idx, idx + len);
}

describe('AV208 C1 — imports', () => {
  it('C1.1 imports swrRun from swrRead.js (STATIC — V163 lesson: no dynamic-only reliance)', () => {
    expect(tfp).toMatch(/import \{ swrRun \} from '\.\.\/lib\/swrRead\.js';/);
  });
  it('C1.2 imports the shared SyncIndicator (Rule of 3 — no bespoke chip)', () => {
    expect(tfp).toMatch(/import SyncIndicator from '\.\/SyncIndicator\.jsx';/);
  });
});

describe('AV208 C2 — fetchFormData threads {source} into all 8 fetches', () => {
  const body = slice('const fetchFormData = async (source)', 3500);
  it('C2.1 six list getters receive opts', () => {
    expect(body).toMatch(/listDoctors\(\{ includeHidden: true, \.\.\.opts \}\)/);
    expect(body).toMatch(/listProducts\(opts\)/);
    expect(body).toMatch(/listStaff\(\{ includeHidden: true, \.\.\.opts \}\)/);
    expect(body).toMatch(/listCourses\(opts\)/);
    expect(body).toMatch(/listDfGroups\(opts\)/);
    expect(body).toMatch(/listDfStaffRates\(opts\)/);
  });
  it('C2.2 customer + treatment fetches receive opts', () => {
    expect(body).toMatch(/getBackendCustomer\(customerId, opts\)/);
    expect(body).toMatch(/getBackendTreatment\(treatmentId, opts\)/);
  });
  it('C2.3 fetchFormData is FETCH-ONLY (no setState calls inside)', () => {
    expect(body).not.toMatch(/setOptions\(|setDfGroups\(|setLoading\(|setTfpSyncing\(/);
  });
});

describe('AV208 C3 — the 3 cache-MISS gates (no false paint)', () => {
  const body = slice('const fetchFormData = async (source)', 3500);
  it('C3.1 empty product+course lists → MISS', () => {
    expect(body).toMatch(/source === 'cache' && productItems\.length === 0 && courseItems\.length === 0/);
  });
  it('C3.2 customer absent from cache → MISS', () => {
    expect(body).toMatch(/source === 'cache' && !custData/);
  });
  it('C3.3 edit-mode treatment absent from cache → MISS', () => {
    expect(body).toMatch(/source === 'cache' && !existing/);
  });
  it('C3.4 server-leg getTreatment errors PROPAGATE (pre-AV208 setError fidelity)', () => {
    expect(body).toMatch(/if \(source !== 'cache'\) throw e;/);
  });
});

describe('AV208 C4 — once-only guards (server pass must never clobber typing)', () => {
  it('C4.1 hydration gate: existing && !hydrated + flag flip', () => {
    expect(tfp).toMatch(/if \(isEdit && treatmentId && existing && !hydrated\) \{/);
    expect(tfp).toMatch(/hydrated = true;/);
  });
  it('C4.2 prefill gate: patientData && !prefilled + flag flip', () => {
    expect(tfp).toMatch(/if \(patientData && !prefilled\) \{/);
    expect(tfp).toMatch(/prefilled = true;/);
  });
  it('C4.3 edit-mode loading clears only after hydration', () => {
    expect(tfp).toMatch(/if \(!isEdit \|\| hydrated\) setLoading\(false\);/);
  });
});

describe('AV208 C5 — chip honesty + orchestrator', () => {
  it('C5.1 chip driven by apply meta (ON at cache paint, OFF on true server confirm)', () => {
    expect(tfp).toMatch(/setTfpSyncing\(!!fromCache\);/);
  });
  it('C5.2 header renders the chip', () => {
    expect(tfp).toMatch(/<SyncIndicator show=\{tfpSyncing\} \/>/);
  });
  it("C5.3 ANTI: the orchestrator finally must NOT clear tfpSyncing (network-down server leg keeps it ON — B1.4-bis)", () => {
    const fin = slice('// tfpSyncing is NOT cleared here', 300);
    expect(fin).not.toMatch(/setTfpSyncing\(false\)/);
  });
  it('C5.4 swrRun wiring: cacheLoad + serverLoad + never-rejecting save-gate handle', () => {
    const orch = slice('const run = swrRun({', 900);
    expect(orch).toMatch(/cacheLoad: async \(\)/);
    expect(orch).toMatch(/fetchFormData\('cache'\)/);
    expect(orch).toMatch(/serverLoad: \(\) => fetchFormData\(undefined\)/);
    expect(orch).toMatch(/serverFreshRef\.current = run\.catch\(\(\) => \{\}\);/);
    expect(orch).toMatch(/await run;/);
  });
  it('C5.5 effect cleanup cancels + applyFormData guards on cancelled', () => {
    expect(tfp).toMatch(/return \(\) => \{ cancelled = true; \};/);
    expect(tfp).toMatch(/if \(cancelled \|\| !bundle\) return;/);
  });
});

describe('AV208 C6 — save-gate (Q2=A)', () => {
  it('C6.1 handleSubmit awaits serverFreshRef bounded 15s BEFORE the write try-block', () => {
    const idx = tfp.indexOf('AV208 save-gate');
    expect(idx).toBeGreaterThan(-1);
    const win = tfp.slice(idx, idx + 700);
    expect(win).toMatch(/await Promise\.race\(\[serverFreshRef\.current, new Promise\(\(r\) => setTimeout\(r, 15000\)\)\]\);/);
  });
  it('C6.2 serverFreshRef initialized resolved (a never-painted form must not block saves)', () => {
    expect(tfp).toMatch(/const serverFreshRef = useRef\(Promise\.resolve\(\)\);/);
  });
});
