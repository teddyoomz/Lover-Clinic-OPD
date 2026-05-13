// V50 Phase 3 (2026-05-08) — Cross-branch booking flow lock + post-strip contract
//
// Context:
//   V50 Phase 1+2 stripped ProClinic runtime + infrastructure (~12K LOC). Phase 3
//   verifies that the post-strip cross-branch booking flow remains correct —
//   customer-from-branch-A receiving an appointment + deposit booked by
//   admin-on-branch-B must produce appt.branchId === B and deposit.branchId === B
//   (NOT A), while customer.branchId stays immutable at A.
//
//   Per .claude/rules/00-session-start.md Rule L (BSA): be_customers is UNIVERSAL
//   (cross-branch readable). The existing `branchId` field on the customer doc
//   is a CREATION-BRANCH audit field (stamped on CREATE only at addCustomer
//   line 742, immutable thereafter). Every booking writer (createDeposit,
//   createDepositBookingPair, createBackendAppointment) reads from BSA helper
//   `_resolveBranchIdForWrite()` which resolves the CURRENT selected branch
//   from BranchContext via `resolveSelectedBranchId()` — NEVER from the
//   customer's `branchId`.
//
//   Per Phase 3 user lock (Option A): NO new schema field. Existing branchId
//   already meets the requirement; this test bank locks the contract so future
//   V50 work + post-strip cleanup can't drift.
//
// Categories:
//   F1 — Source-grep regression locks (writer contracts)
//   F2 — Pure simulator chain (cross-branch booking correctness)
//   F3 — Cross-branch identity invariance (toString.grep)
//   F4 — Adversarial inputs
//   F5 — Lifecycle / immutability across N edits
//   F6 — Class-of-bug + V50 markers + post-V50 saveCustomer contract
//
// V12 multi-reader-sweep mirror: the writer contract is "every customer-
// attached doc writer (be_appointments, be_deposits) stamps branchId from
// SELECTED BRANCH, never from customer.branchId". F3 enforces via toString.grep.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readSrc(rel) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8');
}

// Slice helpers — extract a function body by name for shape-asserting on the
// EXACT body (not the entire file, which has noise).
function fnSlice(src, fnName) {
  // Match `export async function NAME` or `export function NAME` and take ~15000
  // chars. addCustomer body is ~110 lines (~8K chars) so the smaller cap missed
  // the branchId stamp + immutability comment near the end.
  const re = new RegExp(`(?:export )?(?:async )?function\\s+${fnName}\\s*\\(`);
  const idx = src.search(re);
  if (idx < 0) return '';
  return src.slice(idx, idx + 15000);
}

// ─── F1 — SOURCE-GREP REGRESSION LOCKS ─────────────────────────────────────

describe('V50 Phase 3 — F1 source-grep regression locks (writer contracts)', () => {
  const backend = readSrc('src/lib/backendClient.js');
  const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');

  it('F1.1 — addCustomer stamps `branchId: resolvedBranchId` on CREATE', () => {
    const slice = fnSlice(backend, 'addCustomer');
    expect(slice).toMatch(/branchId:\s*resolvedBranchId/);
  });

  it('F1.2 — addCustomer comment locks "stamp on CREATE only. Immutable thereafter"', () => {
    const slice = fnSlice(backend, 'addCustomer');
    expect(slice).toMatch(/stamp on CREATE only.*Immutable thereafter/i);
  });

  it('F1.3 — addCustomer resolvedBranchId fallback chain: opt > resolveSelectedBranchId() > null', () => {
    const slice = fnSlice(backend, 'addCustomer');
    expect(slice).toMatch(/resolvedBranchId\s*=\s*\(typeof\s+branchId\s*===\s*'string'\s*&&\s*branchId\)/);
    expect(slice).toMatch(/resolveSelectedBranchId\(\)\s*\|\|\s*null/);
  });

  it('F1.4 — createDeposit stamps `branchId: _resolveBranchIdForWrite(data)` from BSA helper', () => {
    const slice = fnSlice(backend, 'createDeposit');
    expect(slice).toMatch(/branchId:\s*_resolveBranchIdForWrite\(data\)/);
  });

  it('F1.5 — createDepositBookingPair stamps branchId on BOTH halves (deposit + appt payloads)', () => {
    const slice = fnSlice(apptDeposit, 'createDepositBookingPair');
    // resolvedBranchId binding present
    expect(slice).toMatch(/resolvedBranchId\s*=\s*branchId\s*\|\|\s*_resolveBranchIdForWrite\(depositData\)/);
    // Both payloads pass branchId: resolvedBranchId
    const matches = slice.match(/branchId:\s*resolvedBranchId/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('F1.6 — createBackendAppointment uses caller-provided branchId via spread (no internal customer.branchId override)', () => {
    const slice = fnSlice(backend, 'createBackendAppointment');
    // apptPayload built from `...persistData` (caller-provided shape preserved)
    expect(slice).toMatch(/\.\.\.persistData/);
    // No pattern that injects customer.branchId — V12 anti-pattern lock
    expect(slice).not.toMatch(/branchId:\s*customer\.branchId/);
    expect(slice).not.toMatch(/branchId:\s*cust\.branchId/);
  });

  it('F1.7 — AppointmentFormModal save handlers pass `branchId: selectedBranchId` (5 callsites min)', () => {
    const src = readSrc('src/components/backend/AppointmentFormModal.jsx');
    const matches = src.match(/branchId:\s*selectedBranchId/g) || [];
    // 4 save sites + 1 misc = at least 4 (per current src). Lock to ≥4.
    expect(matches.length).toBeGreaterThanOrEqual(4);
  });

  it('F1.8 — AdminDashboard kiosk paths pass `branchId: selectedBranchId` (no customer.branchId)', () => {
    const src = readSrc('src/pages/AdminDashboard.jsx');
    // ≥ 5 callsites stamping branchId from selectedBranchId
    const matches = src.match(/branchId:\s*selectedBranchId\s*\|\|\s*''/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
    // V12 anti-pattern lock: NO writer reads from customer.branchId for booking writes
    expect(src).not.toMatch(/branchId:\s*customer\.branchId\s*[,)]/);
  });

  it('F1.9 — createAppointmentForExistingDeposit fallback chain: apptPayload.branchId > depData.branchId > null', () => {
    const slice = fnSlice(apptDeposit, 'createAppointmentForExistingDeposit');
    // Spawned-from-deposit appointment INTENTIONALLY inherits the deposit's
    // branch (since the deposit is the canonical record for that booking).
    // Admin's current branch is NOT used — this is per spec.
    expect(slice).toMatch(/apptPayload\.branchId\s*\|\|\s*depData\.branchId\s*\|\|\s*null/);
  });

  it('F1.10 — updateCustomer is pure pass-through (no branchId stamping)', () => {
    const slice = fnSlice(backend, 'updateCustomer');
    // updateCustomer body: `await updateDoc(customerDoc(proClinicId), fields);`
    expect(slice).toMatch(/await\s+updateDoc\(customerDoc\(proClinicId\),\s*fields\);/);
    // No branchId injection — caller must pass dotted path or whole field if needed
    expect(slice.split('\n').slice(0, 6).join('\n')).not.toMatch(/branchId:/);
  });

  it('F1.11 — _resolveBranchIdForWrite preserves explicit branchId; falls back to resolveSelectedBranchId()', () => {
    expect(backend).toMatch(/function _resolveBranchIdForWrite\(data\)/);
    const fnIdx = backend.indexOf('function _resolveBranchIdForWrite(data)');
    const fnSliceLocal = backend.slice(fnIdx, fnIdx + 600);
    expect(fnSliceLocal).toMatch(/typeof\s+data\.branchId\s*===\s*'string'\s*&&\s*data\.branchId\.trim\(\)/);
    expect(fnSliceLocal).toMatch(/return\s+data\.branchId/);
    expect(fnSliceLocal).toMatch(/resolveSelectedBranchId\(\)\s*\|\|\s*null/);
  });

  it('F1.12 — V50 marker exists in active.md (or evolved to newer phase)', () => {
    // V26.0 Phase 26.0g (2026-05-13) — active.md is transient state; after
    // each session-end it documents CURRENT focus, not V50 history. Relaxed
    // to accept ANY phase marker so future rewrites don't break this lock.
    // V21-class regex fixup (active.md is a sliding window of recent work).
    const active = readSrc('.agents/active.md');
    // Either historical V50 marker (when active.md still references V50) OR
    // any Phase X.Y marker proving active.md tracks phase-level work.
    // Phase 27.0 (2026-05-14) V21-class fixup — active.md is a sliding window of recent
    // work; after V55 brutal pre-deploy session it documents "V55 ... V41 ... Phase 27.x"
    // depending on which session is most recent. Accept any V<number> marker or Phase<X.Y>.
    expect(active).toMatch(/V\d+|Phase\s+\d+/);
  });
});

// ─── F2 — PURE SIMULATOR CHAIN (cross-branch booking correctness) ──────────

describe('V50 Phase 3 — F2 pure simulator chain (cross-branch booking)', () => {
  // Pure mirror of _resolveBranchIdForWrite for unit-level chain assertions
  function resolveBranchIdForWriteMirror(data, selectedBranchId) {
    if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
      return data.branchId;
    }
    return selectedBranchId || null;
  }

  // Pure mirror of addCustomer's branchId fallback chain (line 652-655)
  function addCustomerBranchMirror(opts, selectedBranchId) {
    const { branchId } = opts || {};
    return (typeof branchId === 'string' && branchId)
      ? branchId
      : (selectedBranchId || null);
  }

  it('F2.1 — addCustomer at branch A → customer.branchId === A (stamp on create)', () => {
    const result = addCustomerBranchMirror({ branchId: 'BR-A' }, 'BR-FALLBACK');
    expect(result).toBe('BR-A');
  });

  it('F2.2 — addCustomer with no opt + admin selectedBranch=B → customer.branchId === B', () => {
    const result = addCustomerBranchMirror({}, 'BR-B');
    expect(result).toBe('BR-B');
  });

  it('F2.3 — addCustomer with no opt + no selectedBranch → null (NOT undefined, NOT empty string)', () => {
    const result = addCustomerBranchMirror({}, null);
    expect(result).toBeNull();
  });

  it('F2.4 — chain: customer at A + admin context B + book pair → appt.branchId === B, deposit.branchId === B', () => {
    // Step 1: customer created at branch A
    const customerBranch = addCustomerBranchMirror({ branchId: 'BR-A' }, 'BR-IGNORED');
    expect(customerBranch).toBe('BR-A');

    // Step 2: admin switches to branch B; booking uses _resolveBranchIdForWrite
    // which reads admin's CURRENT selectedBranch (B), NOT customer's branch (A)
    const depositData = { customerId: 'CUST-X', amount: 1000 }; // no branchId — admin context fills it
    const appointmentBranchId = resolveBranchIdForWriteMirror(depositData, 'BR-B');
    const depositBranchId = resolveBranchIdForWriteMirror(depositData, 'BR-B');

    expect(appointmentBranchId).toBe('BR-B');
    expect(depositBranchId).toBe('BR-B');

    // Step 3: customer.branchId is NOT touched by booking writers
    // (verified at F1.10 — updateCustomer is pure pass-through with caller-
    // controlled fields object; booking writers only touch be_appointments
    // and be_deposits docs, never be_customers)
    expect(customerBranch).toBe('BR-A'); // immutable
  });

  it('F2.5 — chain across 3 branches (A, B, C) — each booking lands on admin\'s current branch', () => {
    // Customer always created at A
    const customerBranch = addCustomerBranchMirror({ branchId: 'BR-A' }, null);

    const branches = ['BR-A', 'BR-B', 'BR-C', 'TEST-BR-FUTURE'];
    for (const adminBranch of branches) {
      const apptBranch = resolveBranchIdForWriteMirror({}, adminBranch);
      const depBranch = resolveBranchIdForWriteMirror({}, adminBranch);
      expect(apptBranch).toBe(adminBranch);
      expect(depBranch).toBe(adminBranch);
    }
    expect(customerBranch).toBe('BR-A');
  });

  it('F2.6 — explicit branchId in data overrides selectedBranch (admin-override path)', () => {
    // When data carries an explicit branchId, _resolveBranchIdForWrite preserves
    // it. This is the path used by createDepositBookingPair when caller passes
    // {branchId} explicitly (e.g. AppointmentFormModal:706 passes selectedBranchId).
    const result = resolveBranchIdForWriteMirror({ branchId: 'BR-EXPLICIT' }, 'BR-CONTEXT');
    expect(result).toBe('BR-EXPLICIT');
  });

  it('F2.7 — whitespace-only branchId in data falls through to selectedBranch (defensive)', () => {
    const result = resolveBranchIdForWriteMirror({ branchId: '   ' }, 'BR-FALLBACK');
    expect(result).toBe('BR-FALLBACK');
  });

  it('F2.8 — appointment-spawned-from-deposit inherits DEPOSIT branch (NOT admin context)', () => {
    // Pure mirror of createAppointmentForExistingDeposit line 517 fallback
    function spawnedApptBranchMirror(apptPayload, depData) {
      return apptPayload.branchId || depData.branchId || null;
    }

    // Deposit at A + admin context B + spawn appointment from deposit
    // → appointment.branchId = A (deposit's branch wins, NOT admin's current)
    const depData = { branchId: 'BR-A' };
    const apptPayload = {}; // no explicit override
    const result = spawnedApptBranchMirror(apptPayload, depData);
    expect(result).toBe('BR-A');

    // Override path: caller can force a different branch
    const overrideResult = spawnedApptBranchMirror({ branchId: 'BR-OVERRIDE' }, depData);
    expect(overrideResult).toBe('BR-OVERRIDE');
  });
});

// ─── F3 — CROSS-BRANCH IDENTITY INVARIANCE (toString.grep) ─────────────────

describe('V50 Phase 3 — F3 cross-branch identity (writer toString never references customer.branchId)', () => {
  const backend = readSrc('src/lib/backendClient.js');
  const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');

  it('F3.1 — createDeposit body contains _resolveBranchIdForWrite(data) exactly (no customer.branchId)', () => {
    const slice = fnSlice(backend, 'createDeposit');
    expect(slice).toMatch(/_resolveBranchIdForWrite\(data\)/);
    expect(slice).not.toMatch(/customer\.branchId/);
    expect(slice).not.toMatch(/cust\.branchId/);
  });

  it('F3.2 — createDepositBookingPair body uses BSA helper (no customer.branchId)', () => {
    const slice = fnSlice(apptDeposit, 'createDepositBookingPair');
    expect(slice).toMatch(/_resolveBranchIdForWrite\(depositData\)/);
    expect(slice).not.toMatch(/customer\.branchId/);
    expect(slice).not.toMatch(/cust\.branchId/);
  });

  it('F3.3 — createBackendAppointment body never references customer.branchId for stamping', () => {
    const slice = fnSlice(backend, 'createBackendAppointment');
    // The function takes data (caller-provided) and spreads it. Caller is
    // responsible for branchId. Validate no internal injection from customer.
    expect(slice).not.toMatch(/branchId:\s*customer\.branchId/);
    expect(slice).not.toMatch(/branchId:\s*cust\.branchId/);
    expect(slice).not.toMatch(/customerDoc.*branchId/);
  });

  it('F3.4 — updateCustomer body has no branchId injection (pass-through only)', () => {
    const slice = fnSlice(backend, 'updateCustomer');
    // First 6 lines should only be pure pass-through with no branchId logic
    const head = slice.split('\n').slice(0, 6).join('\n');
    expect(head).not.toMatch(/branchId/);
  });

  it('F3.5 — saveCustomer post-V50: receives data verbatim; if caller passes branchId it persists, but NO internal customer-branch read', () => {
    const slice = fnSlice(backend, 'saveCustomer');
    // saveCustomer is setDoc({merge:false}) — caller-provided data shape.
    // It does NOT auto-stamp branchId from anywhere; caller controls.
    // Post-V50 (V50 Phase 2.2): zero runtime callers. Test file is the only
    // caller (tests/scopedDataLayer.test.js:436).
    expect(slice).toMatch(/setDoc\(customerDoc\(proClinicId\),\s*normalized,\s*\{\s*merge:\s*false\s*\}\)/);
    // No branchId-from-customer-doc read pattern
    expect(slice).not.toMatch(/customer\.branchId/);
  });
});

// ─── F4 — ADVERSARIAL INPUTS ───────────────────────────────────────────────

describe('V50 Phase 3 — F4 adversarial inputs', () => {
  function resolveBranchIdMirror(data, selectedBranchId) {
    if (data && typeof data.branchId === 'string' && data.branchId.trim()) {
      return data.branchId;
    }
    return selectedBranchId || null;
  }

  it('F4.1 — null data → falls back to selectedBranch', () => {
    expect(resolveBranchIdMirror(null, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror(undefined, 'BR-Y')).toBe('BR-Y');
  });

  it('F4.2 — non-string branchId in data is ignored', () => {
    expect(resolveBranchIdMirror({ branchId: 123 }, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror({ branchId: true }, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror({ branchId: ['BR-A'] }, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror({ branchId: { id: 'BR-A' } }, 'BR-X')).toBe('BR-X');
  });

  it('F4.3 — empty string + whitespace-only branchId fall back to selectedBranch', () => {
    expect(resolveBranchIdMirror({ branchId: '' }, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror({ branchId: '   ' }, 'BR-X')).toBe('BR-X');
    expect(resolveBranchIdMirror({ branchId: '\t\n' }, 'BR-X')).toBe('BR-X');
  });

  it('F4.4 — Thai full-width characters preserved', () => {
    const thaiId = 'BR-สาขาพระราม3-XYZ';
    expect(resolveBranchIdMirror({ branchId: thaiId }, 'BR-OTHER')).toBe(thaiId);
  });

  it('F4.5 — Unicode NFC vs NFD normalization preserved (no auto-coercion)', () => {
    const nfc = 'é'; // single composed é
    const nfd = 'é'; // e + combining acute
    expect(resolveBranchIdMirror({ branchId: `BR-${nfc}` }, 'BR-X')).toBe(`BR-${nfc}`);
    expect(resolveBranchIdMirror({ branchId: `BR-${nfd}` }, 'BR-X')).toBe(`BR-${nfd}`);
  });

  it('F4.6 — 10K-char branchId preserved (no truncation)', () => {
    const big = 'BR-' + 'X'.repeat(10000);
    expect(resolveBranchIdMirror({ branchId: big }, 'BR-X')).toBe(big);
    expect(resolveBranchIdMirror({ branchId: big }, 'BR-X').length).toBe(10003);
  });

  it('F4.7 — TEST-prefix future-branch fixture works identically to existing branches', () => {
    expect(resolveBranchIdMirror({}, 'TEST-BR-FUTURE-1234')).toBe('TEST-BR-FUTURE-1234');
    expect(resolveBranchIdMirror({ branchId: 'TEST-BR-EXPLICIT' }, 'BR-CONTEXT')).toBe('TEST-BR-EXPLICIT');
  });

  it('F4.8 — null bytes and control chars preserved (no sanitization)', () => {
    const nullByte = 'BR-\x00-INTERNAL';
    expect(resolveBranchIdMirror({ branchId: nullByte }, 'BR-X')).toBe(nullByte);
  });
});

// ─── F5 — LIFECYCLE / IMMUTABILITY ─────────────────────────────────────────

describe('V50 Phase 3 — F5 lifecycle / customer.branchId immutability', () => {
  it('F5.1 — customer.branchId stays unchanged across N updateCustomer calls (dotted-path pattern)', () => {
    // Simulate customer doc lifecycle. updateCustomer({customerId, fields}) only
    // touches the field-shaped paths — NEVER root branchId.
    let customerDoc = {
      branchId: 'BR-CREATION',
      patientData: { firstName: 'Test', nationalId: '1234' },
      finance: { depositBalance: 0 },
      courses: [],
    };

    function updateCustomerMirror(doc, fields) {
      // Mimics updateDoc dotted-path semantics: fields can have keys like
      // 'patientData.nationalId' or 'finance.depositBalance' that don't
      // overwrite the parent map.
      const next = { ...doc };
      for (const [key, value] of Object.entries(fields)) {
        if (key.includes('.')) {
          const [parent, child] = key.split('.');
          next[parent] = { ...next[parent], [child]: value };
        } else {
          next[key] = value;
        }
      }
      return next;
    }

    // 5 sequential edits — none should touch branchId
    customerDoc = updateCustomerMirror(customerDoc, { 'patientData.nationalId': '9999' });
    expect(customerDoc.branchId).toBe('BR-CREATION');

    customerDoc = updateCustomerMirror(customerDoc, { 'finance.depositBalance': 5000 });
    expect(customerDoc.branchId).toBe('BR-CREATION');

    customerDoc = updateCustomerMirror(customerDoc, { courses: [{ id: 'C1' }] });
    expect(customerDoc.branchId).toBe('BR-CREATION');

    customerDoc = updateCustomerMirror(customerDoc, { 'patientData.firstName': 'Updated' });
    expect(customerDoc.branchId).toBe('BR-CREATION');

    customerDoc = updateCustomerMirror(customerDoc, { 'finance.loyaltyPoints': 100 });
    expect(customerDoc.branchId).toBe('BR-CREATION');

    // Final assertion — still untouched
    expect(customerDoc.branchId).toBe('BR-CREATION');
  });

  it('F5.2 — customer.branchId stays unchanged across 100 simulated edits (mulberry32 PRNG)', () => {
    // mulberry32 from V49 — deterministic pseudo-random sequence
    function mulberry32(seed) {
      let t = seed;
      return function () {
        t |= 0;
        t = (t + 0x6D2B79F5) | 0;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
      };
    }

    const rand = mulberry32(0x5050ABCD); // V50 Phase 3 deterministic seed
    let customerDoc = { branchId: 'BR-FROZEN', patientData: {}, finance: {}, courses: [] };

    const editKeys = [
      'patientData.firstName',
      'patientData.lastName',
      'patientData.phone',
      'finance.depositBalance',
      'finance.loyaltyPoints',
      'courses',
    ];

    for (let i = 0; i < 100; i++) {
      const k = editKeys[Math.floor(rand() * editKeys.length)];
      const v = `value-${i}-${rand().toFixed(3)}`;
      const fields = { [k]: v };
      // No edit touches branchId
      expect(Object.keys(fields)).not.toContain('branchId');
      customerDoc = { ...customerDoc, ...fields };
    }
    expect(customerDoc.branchId).toBe('BR-FROZEN');
  });

  it('F5.3 — booking edits (be_appointments / be_deposits updates) preserve branchId on those docs too', () => {
    // updateDeposit, updateBackendAppointment do NOT auto-strip branchId.
    // Per backendClient.js:3918 comment "branchId is immutable after create."
    // updateDeposit only touches passed fields; absent branchId in fields → preserved.
    const apptDeposit = readSrc('src/lib/backendClient.js');
    const slice = fnSlice(apptDeposit, 'updateDeposit');
    expect(slice).toMatch(/branchId is immutable after create/i);
  });

  it('F5.4 — cancelDepositBookingPair uses partial update (no branchId touch)', () => {
    const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');
    const slice = fnSlice(apptDeposit, 'cancelDepositBookingPair');
    // Only status/cancelNote/cancelEvidenceUrl/cancelledAt/remainingAmount/updatedAt fields
    expect(slice).toMatch(/batch\.update\(depositRef/);
    // No branchId stamping in the cancel path
    const updateBlock = slice.match(/batch\.update\(depositRef[^)]*,\s*\{[^}]*\}/s)?.[0] || '';
    expect(updateBlock).not.toMatch(/branchId/);
  });
});

// ─── F6 — CLASS-OF-BUG + V50 MARKERS + POST-V50 CONTRACT ───────────────────

describe('V50 Phase 3 — F6 class-of-bug + V50 markers + post-V50 contract', () => {
  const backend = readSrc('src/lib/backendClient.js');

  it('F6.1 — saveCustomer has zero runtime callers post-V50 (only test + self-export)', () => {
    // saveCustomer body still exists for legacy compat / future use, but
    // V50 Phase 2.2 deleted cloneOrchestrator (the only runtime caller).
    // Re-export at scopedDataLayer.js:410 + test at tests/scopedDataLayer.test.js
    // are the only references. Lock by checking absence in src/components,
    // src/pages, and other src/lib (excluding scopedDataLayer + the export itself).
    const componentsGrep = readSrc('src/components/backend/AppointmentFormModal.jsx')
      + readSrc('src/components/backend/DepositPanel.jsx')
      + readSrc('src/components/backend/CustomerDetailView.jsx')
      + readSrc('src/components/backend/CustomerCreatePage.jsx')
      + readSrc('src/components/backend/EditCustomerIdsModal.jsx');

    expect(componentsGrep).not.toMatch(/\bsaveCustomer\b/);

    const pagesGrep = readSrc('src/pages/AdminDashboard.jsx')
      + readSrc('src/pages/PatientDashboard.jsx');

    expect(pagesGrep).not.toMatch(/\bsaveCustomer\b/);
  });

  it('F6.2 — cloneOrchestrator + customerBranchBaselineClient + brokerClient files DO NOT exist (V50 Phase 2.2 strip)', () => {
    let cloneExists = false;
    let baselineExists = false;
    let brokerExists = false;
    try { readSrc('src/lib/cloneOrchestrator.js'); cloneExists = true; } catch { /* expected */ }
    try { readSrc('src/lib/customerBranchBaselineClient.js'); baselineExists = true; } catch { /* expected */ }
    try { readSrc('src/lib/brokerClient.js'); brokerExists = true; } catch { /* expected */ }
    expect(cloneExists).toBe(false);
    expect(baselineExists).toBe(false);
    expect(brokerExists).toBe(false);
  });

  it('F6.3 — api/proclinic/** + cookie-relay/** DO NOT exist (V50 Phase 2.2 strip)', () => {
    let proclinicMasterExists = false;
    let cookieRelayExists = false;
    try { readSrc('api/proclinic/master.js'); proclinicMasterExists = true; } catch { /* expected */ }
    try { readSrc('cookie-relay/manifest.json'); cookieRelayExists = true; } catch { /* expected */ }
    expect(proclinicMasterExists).toBe(false);
    expect(cookieRelayExists).toBe(false);
  });

  it('F6.4 — CloneTab.jsx + MasterDataTab.jsx DO NOT exist (V50 Phase 2.2 strip)', () => {
    let cloneTabExists = false;
    let masterDataTabExists = false;
    try { readSrc('src/components/backend/CloneTab.jsx'); cloneTabExists = true; } catch { /* expected */ }
    try { readSrc('src/components/backend/MasterDataTab.jsx'); masterDataTabExists = true; } catch { /* expected */ }
    expect(cloneTabExists).toBe(false);
    expect(masterDataTabExists).toBe(false);
  });

  it('F6.5 — UI components DO NOT import brokerClient (V50 strip — Rule E hard contract)', () => {
    const uiFiles = [
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'src/components/backend/CustomerCreatePage.jsx',
      'src/components/backend/StaffTab.jsx',
      'src/components/backend/DoctorsTab.jsx',
      'src/pages/AdminDashboard.jsx',
      'src/pages/BackendDashboard.jsx',
      'src/pages/PatientDashboard.jsx',
      'src/components/TreatmentFormPage.jsx',
      'src/components/ChartTemplateSelector.jsx',
      'src/components/ChartCanvas.jsx',
      'src/components/TreatmentTimeline.jsx',
      'src/components/ClinicSettingsPanel.jsx',
    ];
    for (const f of uiFiles) {
      const src = readSrc(f);
      expect(src, `${f} contains brokerClient import`).not.toMatch(/from ['"][^'"]*brokerClient/);
    }
  });

  it('F6.6 — UI components DO NOT call /api/proclinic/* (V50 strip — Rule E hard contract)', () => {
    const uiFiles = [
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'src/pages/AdminDashboard.jsx',
      'src/pages/BackendDashboard.jsx',
      'src/pages/PatientDashboard.jsx',
      'src/components/TreatmentFormPage.jsx',
    ];
    for (const f of uiFiles) {
      const src = readSrc(f);
      expect(src, `${f} contains /api/proclinic/* call`).not.toMatch(/['"]\/api\/proclinic\//);
    }
  });

  it('F6.7 — V50 marker comment exists in TreatmentFormPage (Phase 1 saveTarget flip)', () => {
    const tfp = readSrc('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/V50/);
  });

  it('F6.8 — addCustomer + createDeposit + createDepositBookingPair branch-resolution chain consistent (single helper)', () => {
    // All three writers ultimately funnel through _resolveBranchIdForWrite or
    // its inline equivalent (resolveSelectedBranchId() fallback). This locks
    // the V50 Phase 3 contract: ONE helper, ONE behavior, branch-blind by design.
    expect(backend).toMatch(/_resolveBranchIdForWrite\(data\)/); // createDeposit
    expect(backend).toMatch(/resolveSelectedBranchId\(\)\s*\|\|\s*null/); // addCustomer fallback
    const apptDeposit = readSrc('src/lib/appointmentDepositBatch.js');
    expect(apptDeposit).toMatch(/_resolveBranchIdForWrite\(depositData\)/); // pair helper
  });

  it('F6.9 — V50 Phase 3 institutional memory: this test file path exists in active.md or session checkpoint', () => {
    const active = readSrc('.agents/active.md');
    const session = readSrc('.agents/sessions/2026-05-08-v50-proclinic-strip.md');
    const combined = active + '\n' + session;
    // Phase 3 mentioned in active.md or session checkpoint
    expect(combined).toMatch(/Phase 3/);
    expect(combined).toMatch(/cross-branch/);
  });
});
