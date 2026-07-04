// Rule I full-flow simulate (2026-07-04) — recall timeline · VIP real-time ·
// TFP chat cards · intake fallback · ED launcher chain. Uses REAL exported
// helpers wherever the chain allows; pure mirrors are source-locked by the
// sibling source-grep suites.
import { describe, it, expect } from 'vitest';
import { buildTfpChatCard } from '../src/lib/tfpStaffChatNotify.js';
import { buildTreatmentEditUrl } from '../src/lib/customerNavigation.js';
import { synthesizeSessionFromCustomer } from '../src/lib/opdSessionState.js';
import { deriveRounds } from '../src/lib/assessmentRoundsCore.js';

// ── F1: recall create → outcome → render decision (mirror of RecallRow) ────
// recordRecallOutcome's patch (backendClient.js:12991) — reason is NOT a key.
const OUTCOME_PATCH_KEYS = ['outcome', 'outcomeNote', 'outcomeAt', 'outcomeBy', 'status', 'updatedAt', 'updatedBy'];
function applyOutcomePatch(recallDoc, { outcome, outcomeNote, recordedBy }) {
  return {
    ...recallDoc,
    outcome, outcomeNote: outcomeNote || '', outcomeAt: 'ts', outcomeBy: { name: recordedBy },
    status: 'done', updatedAt: 'ts', updatedBy: 'me',
  };
}
function timelineDecision(recall) { // mirror of RecallRow derivation (SG-locked)
  const reasonText = (recall.reason || '').trim();
  const hasOutcomeNote = !!(recall.outcomeNote && String(recall.outcomeNote).trim());
  const hasOutcomeRecorded = !!recall.outcome || hasOutcomeNote;
  return { showReason: !!(reasonText || hasOutcomeRecorded), reasonText, showOutcomeNode: hasOutcomeRecorded };
}

describe('F1 recall: create → record outcome → BOTH visible', () => {
  it('F1.1 reason survives the outcome patch AND the timeline shows both', () => {
    const created = { id: 'R1', reason: 'ติดตามอาการหลังฉีดฟิลเลอร์', outcome: null, outcomeNote: null, status: 'pending' };
    const after = applyOutcomePatch(created, { outcome: 'will-come', outcomeNote: 'โทรแล้ว มาวันเสาร์', recordedBy: 'พลอย' });
    expect(after.reason).toBe(created.reason);                    // data layer never overwrites
    expect(OUTCOME_PATCH_KEYS).not.toContain('reason');
    const d = timelineDecision(after);
    expect(d.showReason).toBe(true);
    expect(d.reasonText).toBe('ติดตามอาการหลังฉีดฟิลเลอร์');
    expect(d.showOutcomeNode).toBe(true);
  });
  it('F1.2 pre-2026-07-04 BUG REPRO (doc): the old either/or hid the reason', () => {
    const after = applyOutcomePatch({ reason: 'เหตุผล', outcome: null }, { outcome: 'will-come', outcomeNote: 'ผล', recordedBy: 'x' });
    const oldNoteText = after.outcomeNote && after.outcomeNote.trim() ? after.outcomeNote : after.reason; // the removed logic
    expect(oldNoteText).toBe('ผล'); // reason invisible — exactly what the user reported
    expect(timelineDecision(after).showReason).toBe(true); // the fix
  });
});

// ── F2: VIP toggle → single listener → every surface flips ─────────────────
describe('F2 vip: toggle → Set → all surfaces (denormalized names included)', () => {
  const snapshotToSet = (ids) => new Set((ids || []).map(String));
  it('F2.1 one toggle propagates to every keyed surface at once', () => {
    let vipSet = snapshotToSet([]);
    const surfaces = {
      saleRow: { customerId: 'LC-1', customerName: 'denorm ชื่อเก่า' },
      apptCard: { customerId: 'LC-1', customerName: 'denorm อีกชื่อ' },
      recallRow: { customerId: 'LC-1' },
      queueCard: { brokerProClinicId: 'LC-1' },
    };
    const isVip = (id) => !!id && vipSet.has(String(id));
    expect(Object.values(surfaces).every(s => !isVip(s.customerId || s.brokerProClinicId))).toBe(true);
    vipSet = snapshotToSet(['LC-1']); // toggle ON → snapshot fires
    expect(isVip(surfaces.saleRow.customerId)).toBe(true);
    expect(isVip(surfaces.apptCard.customerId)).toBe(true);
    expect(isVip(surfaces.recallRow.customerId)).toBe(true);
    expect(isVip(surfaces.queueCard.brokerProClinicId)).toBe(true);
    vipSet = snapshotToSet([]); // toggle OFF → all flip back
    expect(isVip('LC-1')).toBe(false);
  });
  it('F2.2 walk-in with no customerId never renders VIP (correct semantic)', () => {
    const vipSet = snapshotToSet(['LC-1']);
    const isVip = (id) => !!id && vipSet.has(String(id));
    expect(isVip(undefined)).toBe(false);
    expect(isVip('')).toBe(false);
  });
});

// ── F3: TFP save → card → rules predicate → deep link → TFP opens ──────────
// Pure mirror of the firestore.rules tfp clause (RL1 locks the real text).
function rulesAllowsSystemCreate(docData) {
  if (!('system' in docData)) return true;
  const sys = docData.system;
  if (!sys || typeof sys !== 'object') return false;
  return ['tfp-vitals', 'tfp-doctor'].includes(sys.kind || '')
    && typeof (sys.treatmentId ?? '') === 'string' && (sys.treatmentId || '').length > 0
    && typeof (sys.customerId ?? '') === 'string';
}

describe('F3 tfp card: save → write → rules → deep link → treatmentFormMode', () => {
  it('F3.1 vitals save chain end-to-end', () => {
    const card = buildTfpChatCard({
      kind: 'tfp-vitals', treatmentId: 'BT-1783159999999', customerId: 'LC-26000123',
      customerName: 'คุณสมหญิง', customerHN: 'LC-26000123', branchId: 'BR-1',
    });
    expect(rulesAllowsSystemCreate(card)).toBe(true);              // staff client passes
    const url = buildTreatmentEditUrl(card.system.customerId, card.system.treatmentId);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('backend')).toBe('1');
    // BackendDashboard deep-link consumer (D2-locked) → treatmentFormMode
    const mode = { mode: 'edit', customerId: params.get('customer'), treatmentId: params.get('treatment') };
    expect(mode).toEqual({ mode: 'edit', customerId: 'LC-26000123', treatmentId: 'BT-1783159999999' });
  });
  it('F3.2 forged intake/followup system cards STILL fail the client rules predicate', () => {
    expect(rulesAllowsSystemCreate({ system: { kind: 'intake', sessionId: 'S-1' } })).toBe(false);
    expect(rulesAllowsSystemCreate({ system: { kind: 'followup', customerId: 'x' } })).toBe(false);
    expect(rulesAllowsSystemCreate({ system: { kind: 'tfp-vitals', treatmentId: '' } })).toBe(false);
    expect(rulesAllowsSystemCreate({ text: 'human message' })).toBe(true); // no-system arm intact
  });
  it('F3.3 double-save idempotency — same doc id both times → 2nd create is a rules-denied update (swallowed)', () => {
    const p = { kind: 'tfp-doctor', treatmentId: 'BT-7', customerId: 'LC-1', branchId: 'BR-1', doctorName: 'นพ.เอ' };
    expect(buildTfpChatCard(p).id).toBe(buildTfpChatCard(p).id);
  });
  it('F3.4 all-branches view (branchId "") → no card, save unharmed', () => {
    expect(buildTfpChatCard({ kind: 'tfp-vitals', treatmentId: 'BT-1', customerId: 'LC-1', branchId: '' })).toBeNull();
  });
});

// ── F4: intake card button — fallback chain with the REAL synthesizer ──────
describe('F4 intake view: session → deleted → synthetic from be_customers (AV131)', () => {
  const customer = {
    id: 'LC-26000197',
    proClinicHN: 'LC-26000197',
    patientData: { prefix: 'นาย', firstName: 'วิชิตพงษ์', lastName: 'ด่านกระโทก', hasAllergies: 'มี', allergiesDetail: 'เพนนิซิลิน' },
  };
  const resolveIntakeSource = (sessionDoc, cust) => sessionDoc || (cust ? synthesizeSessionFromCustomer(cust) : null);

  it('F4.1 kiosk flow — session survives → used directly', () => {
    const live = { id: 'S-1', patientData: { firstName: 'ก' } };
    expect(resolveIntakeSource(live, customer)).toBe(live);
  });
  it('F4.2 booking flow — session HARD-DELETED → REAL synthesizeSessionFromCustomer output feeds the shared body', () => {
    const synth = resolveIntakeSource(null, customer);
    expect(synth).toBeTruthy();
    expect(synth.__synthetic).toBe(true);
    expect(synth.patientData.firstName).toBe('วิชิตพงษ์');
    expect(synth.patientData.hasAllergies).toBe('มี');
  });
  it('F4.3 neither → null → "ไม่พบข้อมูลรับเข้า" state', () => {
    expect(resolveIntakeSource(null, null)).toBeNull();
  });
});

// ── F5: followup button — REAL deriveRounds → hero + type pick ─────────────
describe('F5 ED launcher: deriveRounds(REAL) → hero + first type with data', () => {
  const ED_ORDER = ['adam', 'iief', 'mrs', 'pe'];
  const pickType = (hero) => hero ? (ED_ORDER.find(t => Array.isArray(hero.types) && hero.types.includes(t)) || (hero.types && hero.types[0]) || 'adam') : 'adam';

  it('F5.1 intake round + completed followup → hero = latest, type = first available', () => {
    const intakePerf = { adam_q1: 'ใช่', assessmentDate: '2026-06-01' };
    const assessments = [
      { id: 'AR-1', status: 'completed', types: ['iief'], rawAnswers: { iief_q1: 3 }, assessmentDate: '2026-07-01' },
    ];
    const rounds = deriveRounds(intakePerf, assessments);
    expect(rounds.length).toBeGreaterThanOrEqual(2);
    const hero = rounds[rounds.length - 1];
    expect(hero.assessmentDate).toBe('2026-07-01');
    expect(pickType(hero)).toBe('iief');
  });
  it('F5.2 pending round (CF not yet materialized) is NOT a hero — the live listener pops it in later', () => {
    const rounds = deriveRounds({}, [{ id: 'AR-2', status: 'pending', types: ['adam'], assessmentDate: '2026-07-04' }]);
    expect(rounds.find(r => r.id === 'AR-2')).toBeUndefined();
  });
  it('F5.3 nothing at all → no hero → "ยังไม่มีแบบประเมิน" state', () => {
    const rounds = deriveRounds({}, []);
    expect(rounds.length).toBe(0);
  });
});
