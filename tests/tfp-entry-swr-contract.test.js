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

// bounded extraction: fetchFormData's body ONLY (window-free — ends exactly
// where applyFormData begins, so setState assertions can't false-positive)
const fetchBody = tfp.slice(
  tfp.indexOf('const fetchFormData = async (source)'),
  tfp.indexOf('const applyFormData'),
);

describe('AV208 C2 — fetchFormData threads {source} into all 8 fetches', () => {
  const body = fetchBody;
  it('C2.1 six list getters receive opts', () => {
    expect(body).toMatch(/listDoctors\(\{ includeHidden: true, \.\.\.opts \}\)/);
    expect(body).toMatch(/listProducts\(opts\)/);
    expect(body).toMatch(/listStaff\(\{ includeHidden: true, \.\.\.opts \}\)/);
    expect(body).toMatch(/listCourses\(opts\)/);
    expect(body).toMatch(/listDfGroups\(opts\)/);
    expect(body).toMatch(/listDfStaffRates\(opts\)/);
  });
  it('C2.2 customer fetch receives opts; treatment fetch is SERVER-ALWAYS + SINGLE shared read (R1-lens2-#1 + R2-#2b)', () => {
    expect(body).toMatch(/getBackendCustomer\(customerId, opts\)/);
    // the treatment doc must NEVER be cache-sourced — hydration +
    // existingStockSnapshot freezing to a stale cache copy caused the
    // concurrent-edit lost-update + stock-diff false-negative (bug-hunt R1).
    // R2-#2b: both passes share ONE memoized server point-read.
    expect(body).toMatch(/await fetchExistingOnce\(\)/);
    expect(tfp).toMatch(/let existingPromise = null;/);
    expect(tfp).toMatch(/const fetchExistingOnce = \(\) => \{/);
    expect(tfp).toMatch(/return getBackendTreatment\(treatmentId\);/);
    expect(tfp).not.toMatch(/getBackendTreatment\(treatmentId, opts\)/);
  });
  it('C2.3 fetchFormData is FETCH-ONLY (no setState calls inside)', () => {
    expect(body).not.toMatch(/setOptions\(|setDfGroups\(|setLoading\(|setTfpSyncing\(/);
  });
});

describe('AV208 C3 — the 3 cache-MISS gates (no false paint)', () => {
  const body = fetchBody;
  it('C3.1 empty product+course lists OR empty doctors → MISS (R2-B#5: partial eviction must not paint empty pickers)', () => {
    expect(body).toMatch(/source === 'cache' && \(\(productItems\.length === 0 && courseItems\.length === 0\) \|\| doctorItems\.length === 0\)/);
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
    // R2-#2 repoint (2026-07-19): + stale() guard — a seq-invalidated run
    // reaching this line via a rejected interior await must not clear loading.
    expect(tfp).toMatch(/if \(!stale\(\) && \(!isEdit \|\| hydrated\)\) setLoading\(false\);/);
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
    const orch = slice('const run = swrRun({', 1100);
    expect(orch).toMatch(/cacheLoad: async \(\)/);
    expect(orch).toMatch(/fetchFormData\('cache'\)/);
    expect(orch).toMatch(/serverLoad: \(\) => fetchFormData\(undefined\)/);
    expect(orch).toMatch(/serverFreshRef\.current = run\.then\(\(\) => applyChain\)\.catch\(\(\) => \{\}\);/);
    expect(orch).toMatch(/await run;/);
  });

  it('C5.6 R1-#1 + R2-#1a: applies SERIALIZED into applyChain with PER-LINK catch; orchestrator awaits the chain', () => {
    const orch = slice('let applyChain = Promise.resolve();', 1700);
    expect(orch).toMatch(/applyChain = applyChain\s*\.then\(\(\) => applyFormData\(b, meta\)\)\s*\.catch\(\(e\) => \{ debugLog\('tfp-swr', 'applyFormData failed', e\); \}\);/);
    expect(orch).toMatch(/await applyChain;/);
    // ANTI: the fire-and-forget shape that opened the V101-class window
    expect(tfp).not.toMatch(/apply: \(b, meta\) => \{ applyFormData\(b, meta\); \}/);
    // ANTI: a catch-less chain link poisons the chain (R2-#1a — server apply
    // must still run after a rejected cache apply)
    expect(tfp).not.toMatch(/applyChain\.then\(\(\) => applyFormData\(b, meta\)\);/);
  });
  it('C5.5 effect cleanup cancels + applyFormData guards on stale runs', () => {
    expect(tfp).toMatch(/return \(\) => \{ cancelled = true; \};/);
    // Hunt R1-#1 repoint (2026-07-19): the paint guard is stale() — cancelled
    // extended with the retry run-seq so the ลองใหม่ button can invalidate a
    // hung run BEFORE the network toggle (its cache-settled server leg must
    // never paint).
    expect(tfp).toMatch(/if \(stale\(\) \|\| !bundle\) return;/);
    expect(tfp).toMatch(/const stale = \(\) => cancelled \|\| loadRunSeqRef\.current !== myRunSeq;/);
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

describe('AV208 C7 — bug-hunt R1 fixes (lens 3)', () => {
  it('C7.1 DF auto-create effect is gated on !tfpSyncing + has tfpSyncing in deps (stale-rate lock)', () => {
    const eff = slice('R1-lens3-#1 fix', 900);
    expect(eff).toMatch(/if \(tfpSyncing\) return;/);
    expect(tfp).toMatch(/treatmentPeopleForDf, tfpSyncing\]\);/);
  });
  it('C7.2 skipStockDeduction re-resolved from CURRENT options at serialization (stale-policy lock)', () => {
    const ser = slice('R1-lens3-#2 fix', 1600);
    expect(ser).toMatch(/skipFlagByRowId/);
    expect(ser).toMatch(/skipFlagByRowId\.has\(t\.id\) \? skipFlagByRowId\.get\(t\.id\) : !!t\.skipStockDeduction/);
    // ANTI: the bare snapshot-only shape must not return
    expect(tfp).not.toMatch(/fillLater: !!t\.fillLater, skipStockDeduction: !!t\.skipStockDeduction \}\)\),\n/);
  });
});
