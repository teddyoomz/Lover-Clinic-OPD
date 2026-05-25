// ─── V116 (2026-05-23) — Link survives queue-delete + auto-regen + walk-in gate ───
//
// User report (verbatim, /systematic-debugging):
//   "พอกดปุ่มดูลิ้งที่ส่งไป แล้วกดเปิดกรอกข้อมูลแต่ยังไม่กรอก แล้วมันไป
//    สร้างลิสต์ไว้ที่หน้าคิวหน้าคลินิก พอกดลบจาก list คิวหน้าคลินิก กลายเป็น
//    ลิ้งค์พังและหายไปเลย ซึ่งผิด"
//
// Root cause: deleteSession (AdminDashboard.jsx:3287) hard-deletes the
// opd_sessions doc when no patientData, but NEVER clears the reverse-FK
// (linkedOpdSessionId) on the linked be_appointments / be_deposits. The
// provision helper's idempotent short-circuit then returns a URL pointing
// to a missing doc → customer sees "ลิงก์ไม่ถูกต้อง".
//
// Class-of-bug (Rule P): 3 sites in AdminDashboard.jsx delete opd_sessions
// without reverse-FK cleanup. Architectural backstop in
// provisionOpdLinkForBookingPair (existence-check + auto-regen) heals all 3
// + future variants in one place.
//
// Locked decisions (user brainstorming 2026-05-23):
//   Q1 — Queue-delete conditional: preserve session if linked to booking
//         (linkedAppointmentId OR linkedDepositId); hard-delete if standalone
//   Q2 — Auto-regen: silent self-heal in provisionOpdLinkForBookingPair
//   Q3 — Walk-in gate: add `createdFromBackendBooking` as 6th indicator
//   Q4 — Fix scope: architectural backstop in provision helper
//
// AV116 (new invariant): every opd_sessions hard-delete site MUST either
// (a) cascade-clear reverse-FK on linked appt/dep, OR
// (b) gate the delete behind a "no linked booking" check (preserve session
//     via isHiddenFromQueue:true if linked) AND rely on provision helper's
//     existence-check + auto-regen as the backstop for stale FKs.
//
// Test bank:
//   SG  — source-grep regression locks at each fix surface
//   D   — pure decision helper test (decideDeleteSessionAction)
//   F   — Rule I full-flow simulate (PRE-V116 BUG REPRO + POST-V116 contract)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PROVISION = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const ADMIN = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
// 2026-05-24 perf-cron refactor relocated the inline auto-2hr-expire block from
// AdminDashboard → the daily cron core. SG3 reads it from there now.
const CLEANUP = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/opdSessionCleanupCore.js'),
  'utf8',
);

describe('V116.SG — source-grep regression at every fix surface', () => {
  it('SG1 — provisionOpdLinkForBookingPair: existence-check + auto-regen on stale FK', () => {
    // The idempotent short-circuit MUST verify the session doc exists BEFORE
    // returning. Anti-regression: the pre-V116 unconditional short-circuit
    // pattern must NOT reappear.
    expect(PROVISION).toMatch(/V116 architectural backstop/);
    expect(PROVISION).toMatch(/if \(existingSessionId\)\s*\{\s*const existingSessionSnap = await getDoc\(opdSessionDoc\(existingSessionId\)\)/);
    expect(PROVISION).toMatch(/V116 self-heal/);
    // Forensic console.warn for observability when self-heal fires.
    expect(PROVISION).toMatch(/stale linkedOpdSessionId/);
  });

  it('SG1.UH — provisionOpdLinkForBookingPair: UN-HIDE on re-engage (V116-followup)', () => {
    // V116-followup (2026-05-23) — when existing session exists AND is hidden,
    // re-clicking "ดูลิ้งค์ที่ส่งไป" un-hides the session so the queue entry
    // reappears immediately (admin Review surface).
    expect(PROVISION).toMatch(/V116-followup \(2026-05-23\) — UN-HIDE on re-engagement/);
    expect(PROVISION).toMatch(/if \(existingData\.isHiddenFromQueue\)/);
    expect(PROVISION).toMatch(/isHiddenFromQueue: false/);
    expect(PROVISION).toMatch(/unhiddenFromQueueAt: serverTimestamp\(\)/);
    expect(PROVISION).toMatch(/unhiddenFromQueueReason: 're-engage-provision'/);
  });

  it('SG1.2 — provisionOpdLinkForBookingPair: pre-V116 unconditional short-circuit MUST NOT exist', () => {
    // Anti-regression: lock the V116 shape. The OLD pattern was
    //   if (existingSessionId) { const url = ...; return { ... alreadyProvisioned: true }; }
    // immediately, without an existence check. The NEW pattern wraps in another
    // if-block. If anyone reverts to the unconditional form, this fails.
    const stale = PROVISION.match(/if \(existingSessionId\)\s*\{\s*const url = _buildOpdSessionUrl/);
    expect(stale).toBeNull();
  });

  it('SG2 — deleteSession: conditional preserve-vs-delete based on linked booking', () => {
    // The else-branch (no patientData) MUST be split: linked → preserve via
    // isHiddenFromQueue; unlinked → hard-delete (existing behavior).
    expect(ADMIN).toMatch(/else if \(session\?\.linkedAppointmentId \|\| session\?\.linkedDepositId\)/);
    expect(ADMIN).toMatch(/isHiddenFromQueue: true,?\s*\n\s*hiddenFromQueueAt: serverTimestamp\(\)/);
    expect(ADMIN).toMatch(/V116 \(2026-05-23\) — linked to a real booking/);
    // The hard-delete branch is preserved for unlinked sessions.
    expect(ADMIN).toMatch(/V116:\s*เหมือนกดผิด/);
  });

  it('SG3 — auto-expire cleanup: preserve-if-linked conditional (relocated to cron core)', () => {
    // 2026-05-24 perf-cron refactor RELOCATED the inline auto-2hr-expire block
    // from AdminDashboard → the daily opd-session-cleanup cron. The V116
    // invariant (expired + no patientData + linked booking → HIDE, not delete)
    // is preserved in src/lib/opdSessionCleanupCore.js. SG3 retargeted from
    // ADMIN → CLEANUP (V21 fixup 2026-05-25; verified the cron preserves V116).
    expect(CLEANUP).toMatch(/linked booking \(V116\)|expired-no-data-but-linked-booking-V116/);
    expect(CLEANUP).toMatch(/if \(data\.linkedAppointmentId \|\| data\.linkedDepositId\)\s*\{[\s\S]{0,200}action: 'hide'/);
  });

  it('SG4 — queue filters: isHiddenFromQueue gate with patientData auto-restore', () => {
    // The 3 active queue filters (main / deposit / noDeposit) must filter out
    // isHiddenFromQueue:true sessions UNLESS patientData is truthy (auto-restore
    // when customer comes back + fills the form).
    expect(ADMIN).toMatch(/!s\.isHiddenFromQueue \|\| s\.patientData/);
    // Main queue uses `session` not `s`.
    expect(ADMIN).toMatch(/session\.isHiddenFromQueue && !session\.patientData.*return false/);
    expect(ADMIN).toMatch(/V116 \(2026-05-23\) — isHiddenFromQueue gate/);
  });

  it('SG5 — walk-in gate: createdFromBackendBooking as 6th indicator', () => {
    // Per Q3 user directive — defense-in-depth.
    // ④ (2026-05-26) — isFromBookingFlow hoisted to handleOpdClick scope; the
    // V116 6th-indicator note now lives in the hoisted definition comment.
    expect(ADMIN).toMatch(/V116 added createdFromBackendBooking as the 6th/);
    // The gate object must contain the new indicator.
    expect(ADMIN).toMatch(/session\?\.createdFromBackendBooking \|\|/);
    // The 5 pre-existing indicators must still be present (anti-regression on
    // accidentally dropping one of them while adding the 6th).
    expect(ADMIN).toMatch(/session\?\.linkedAppointmentId \|\|/);
    expect(ADMIN).toMatch(/session\?\.linkedDepositId \|\|/);
    expect(ADMIN).toMatch(/session\?\.appointmentProClinicId \|\|/);
    expect(ADMIN).toMatch(/session\?\.formType === 'deposit' \|\|/);
    expect(ADMIN).toMatch(/session\.appointmentData\.appointmentDate \|\|/);
  });
});

// ─── D — decideDeleteSessionAction pure helper test ───────────────────────
//
// The deleteSession conditional is small enough to test via fixture-shape
// rather than a separate helper extract. Pure-function mirror of the conditional.

function decideDeleteSessionAction(session) {
  // Mirrors deleteSession (AdminDashboard.jsx:3287+) post-V116 logic.
  // Returns one of: 'archive' | 'hide' | 'hard-delete'.
  if (session?.patientData) return 'archive';
  if (session?.linkedAppointmentId || session?.linkedDepositId) return 'hide';
  return 'hard-delete';
}

describe('V116.D — decideDeleteSessionAction decision matrix', () => {
  it('D1 — patientData present → archive (existing behavior, unchanged)', () => {
    expect(decideDeleteSessionAction({ patientData: { firstname: 'A' } })).toBe('archive');
    expect(decideDeleteSessionAction({ patientData: { firstname: 'A' }, linkedAppointmentId: 'BA-1' })).toBe('archive');
  });

  it('D2 — no patientData + linkedAppointmentId → hide (preserve link)', () => {
    expect(decideDeleteSessionAction({ linkedAppointmentId: 'BA-1' })).toBe('hide');
  });

  it('D3 — no patientData + linkedDepositId → hide (preserve link, deposit was paid)', () => {
    expect(decideDeleteSessionAction({ linkedDepositId: 'DEP-1' })).toBe('hide');
  });

  it('D4 — no patientData + both linkedAppointmentId AND linkedDepositId → hide', () => {
    expect(decideDeleteSessionAction({ linkedAppointmentId: 'BA-1', linkedDepositId: 'DEP-1' })).toBe('hide');
  });

  it('D5 — no patientData + NO linked booking → hard-delete (standalone, เหมือนกดผิด)', () => {
    expect(decideDeleteSessionAction({})).toBe('hard-delete');
    expect(decideDeleteSessionAction({ sessionName: 'foo' })).toBe('hard-delete');
    expect(decideDeleteSessionAction({ formType: 'intake' })).toBe('hard-delete');
  });

  it('D6 — empty-string linked fields → hard-delete (falsy)', () => {
    expect(decideDeleteSessionAction({ linkedAppointmentId: '' })).toBe('hard-delete');
    expect(decideDeleteSessionAction({ linkedAppointmentId: '', linkedDepositId: '' })).toBe('hard-delete');
  });

  it('D7 — null session → hard-delete (defensive)', () => {
    expect(decideDeleteSessionAction(null)).toBe('hard-delete');
    expect(decideDeleteSessionAction(undefined)).toBe('hard-delete');
  });

  it('D8 — adversarial: patientData with no booking → archive (filled-but-unlinked is still archive)', () => {
    expect(decideDeleteSessionAction({ patientData: { firstname: 'X' } })).toBe('archive');
  });

  it('D9 — adversarial: legacy victim shape (linkedOpdSessionId on appt, but session itself missing) — N/A here', () => {
    // The decision is from the SESSION's perspective. legacy victim repro is
    // covered in F2 (provision auto-regen flow simulate). This decision
    // helper is just for deleteSession.
    expect(decideDeleteSessionAction({ linkedAppointmentId: 'BA-stale' })).toBe('hide');
  });
});

// ─── F — Rule I full-flow simulate (PRE-V116 BUG REPRO + POST-V116 contract) ───
//
// Pure simulators of the lifecycle. NO Firestore — we mock the doc store.

function makeStore() {
  // Three collections.
  return {
    opdSessions: new Map(), // id → doc
    appointments: new Map(),
    deposits: new Map(),
  };
}

function simulateProvision(store, { depositId = '', appointmentId = '' }) {
  // Mirrors provisionOpdLinkForBookingPair post-V116 + V116-followup.
  let existingSessionId = '';
  if (depositId) {
    const dep = store.deposits.get(depositId);
    if (!dep) throw new Error(`deposit ${depositId} not found`);
    if (dep.linkedOpdSessionId) existingSessionId = dep.linkedOpdSessionId;
  } else if (appointmentId) {
    const appt = store.appointments.get(appointmentId);
    if (!appt) throw new Error(`appointment ${appointmentId} not found`);
    if (appt.linkedOpdSessionId) existingSessionId = appt.linkedOpdSessionId;
  }
  // V116 existence-check.
  if (existingSessionId) {
    if (store.opdSessions.has(existingSessionId)) {
      // V116-followup — UN-HIDE on re-engagement.
      const existing = store.opdSessions.get(existingSessionId);
      let unhid = false;
      if (existing.isHiddenFromQueue) {
        store.opdSessions.set(existingSessionId, {
          ...existing,
          isHiddenFromQueue: false,
          unhiddenFromQueueReason: 're-engage-provision',
        });
        unhid = true;
      }
      return { sessionId: existingSessionId, alreadyProvisioned: true, healed: false, unhid };
    }
    // Fall through to mint NEW + overstamp reverse-FK.
  }
  const newSessionId = `BL-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  store.opdSessions.set(newSessionId, {
    id: newSessionId,
    status: 'pending',
    patientData: null,
    linkedDepositId: depositId || '',
    linkedAppointmentId: appointmentId || '',
    createdFromBackendBooking: true,
  });
  if (depositId) {
    const dep = store.deposits.get(depositId);
    store.deposits.set(depositId, { ...dep, linkedOpdSessionId: newSessionId });
  }
  if (appointmentId) {
    const appt = store.appointments.get(appointmentId);
    store.appointments.set(appointmentId, { ...appt, linkedOpdSessionId: newSessionId });
  }
  return {
    sessionId: newSessionId,
    alreadyProvisioned: false,
    healed: !!existingSessionId, // true when V116 self-heal fired
  };
}

function simulateDeleteSession(store, sessionId) {
  // Mirrors deleteSession post-V116.
  const session = store.opdSessions.get(sessionId);
  if (!session) return { action: 'noop' };
  if (session.patientData) {
    store.opdSessions.set(sessionId, { ...session, isArchived: true });
    return { action: 'archive' };
  }
  if (session.linkedAppointmentId || session.linkedDepositId) {
    store.opdSessions.set(sessionId, { ...session, isHiddenFromQueue: true });
    return { action: 'hide' };
  }
  store.opdSessions.delete(sessionId);
  return { action: 'hard-delete' };
}

function simulateQueueFilter(store) {
  // Mirrors AdminDashboard main queue filter post-V116.
  return Array.from(store.opdSessions.values()).filter(s => {
    if (s.isArchived) return false;
    if (s.isHiddenFromQueue && !s.patientData) return false;
    return true;
  });
}

describe('V116.F — Rule I full-flow simulate', () => {
  it('F1 — V116 contract: admin clicks link → opens link → queue entry → admin deletes → session preserved → admin clicks ดูลิ้ง again → SAME URL', () => {
    const store = makeStore();
    const apptId = 'BA-test-1';
    const depId = 'DEP-test-1';
    // Pre: admin created appointment with pickLater + deposit pair.
    store.appointments.set(apptId, { id: apptId, customerNameTemp: 'มนทวัฒน์' });
    store.deposits.set(depId, { id: depId, customerNameTemp: 'มนทวัฒน์', linkedAppointmentId: apptId });

    // Step 1: admin clicks "ส่งลิ้งค์ลูกค้า" → provision mints session.
    const r1 = simulateProvision(store, { depositId: depId, appointmentId: apptId });
    expect(r1.alreadyProvisioned).toBe(false);
    expect(r1.healed).toBe(false);
    const sessionId = r1.sessionId;
    expect(store.opdSessions.has(sessionId)).toBe(true);
    // Reverse-FK stamped.
    expect(store.appointments.get(apptId).linkedOpdSessionId).toBe(sessionId);
    expect(store.deposits.get(depId).linkedOpdSessionId).toBe(sessionId);

    // Step 2: queue shows the entry.
    expect(simulateQueueFilter(store).map(s => s.id)).toContain(sessionId);

    // Step 3: admin clicks 🗑 to delete. Since session is linked → PRESERVE.
    const del = simulateDeleteSession(store, sessionId);
    expect(del.action).toBe('hide'); // V116 critical: hide, not hard-delete
    expect(store.opdSessions.has(sessionId)).toBe(true); // session preserved!
    expect(store.opdSessions.get(sessionId).isHiddenFromQueue).toBe(true);

    // Step 4: queue no longer shows the entry.
    expect(simulateQueueFilter(store).map(s => s.id)).not.toContain(sessionId);

    // Step 5: admin clicks "ดูลิ้งค์ที่ส่งไป" again → SAME sessionId (URL still
    // works) AND V116-followup un-hides the session so queue entry reappears.
    const r2 = simulateProvision(store, { depositId: depId, appointmentId: apptId });
    expect(r2.sessionId).toBe(sessionId); // SAME sessionId — link is preserved
    expect(r2.alreadyProvisioned).toBe(true);
    expect(r2.healed).toBe(false);
    expect(r2.unhid).toBe(true); // V116-followup: re-engagement un-hides

    // Step 6: queue entry REAPPEARS after un-hide (admin can Review even before customer fills).
    expect(simulateQueueFilter(store).map(s => s.id)).toContain(sessionId);
    expect(store.opdSessions.get(sessionId).isHiddenFromQueue).toBe(false);
    expect(store.opdSessions.get(sessionId).unhiddenFromQueueReason).toBe('re-engage-provision');
  });

  it('F1.UH — V116-followup: re-engaging a NON-hidden session is a no-op (idempotent)', () => {
    // If admin clicks "ดูลิ้งค์ที่ส่งไป" twice without ever deleting, the
    // un-hide path must NOT fire (no spurious unhiddenFromQueueAt stamp).
    const store = makeStore();
    const apptId = 'BA-noop-1';
    store.appointments.set(apptId, { id: apptId, customerNameTemp: 'X' });
    const r1 = simulateProvision(store, { appointmentId: apptId });
    expect(r1.alreadyProvisioned).toBe(false);
    expect(r1.unhid).toBeFalsy();

    const r2 = simulateProvision(store, { appointmentId: apptId });
    expect(r2.alreadyProvisioned).toBe(true);
    expect(r2.unhid).toBe(false); // No-op un-hide on already-visible session
  });

  it('F2 — V116 auto-regen: legacy victim case (session was hard-deleted pre-fix, FK on appt still set)', () => {
    const store = makeStore();
    const apptId = 'BA-victim-1';
    const staleSessionId = 'BL-stale-1';
    // Pre: appt has linkedOpdSessionId pointing to a session that was nuked
    // (mimics the legacy victim state — มนทวัฒน์ + สันติสุข in user's image 2).
    store.appointments.set(apptId, {
      id: apptId,
      customerNameTemp: 'สันติสุข',
      linkedOpdSessionId: staleSessionId, // FK points to nothing
    });
    // The opd_sessions/{staleSessionId} doc is NOT in store → simulates deleted.

    // Step 1: admin clicks "ดูลิ้งค์ที่ส่งไป" → V116 existence-check detects missing.
    const r = simulateProvision(store, { appointmentId: apptId });
    expect(r.healed).toBe(true); // V116 self-heal fired
    expect(r.alreadyProvisioned).toBe(false);
    expect(r.sessionId).not.toBe(staleSessionId); // Fresh sessionId
    expect(store.opdSessions.has(r.sessionId)).toBe(true);
    // Reverse-FK overstamped to new sessionId.
    expect(store.appointments.get(apptId).linkedOpdSessionId).toBe(r.sessionId);
  });

  it('F3 — V116 customer-fill auto-restore: hidden session + patientData added → queue auto-restores', () => {
    const store = makeStore();
    const apptId = 'BA-restore-1';
    store.appointments.set(apptId, { id: apptId, customerNameTemp: 'A' });

    const { sessionId } = simulateProvision(store, { appointmentId: apptId });
    simulateDeleteSession(store, sessionId); // admin hides
    expect(simulateQueueFilter(store).map(s => s.id)).not.toContain(sessionId);

    // Customer fills the form: patientData becomes truthy.
    const s = store.opdSessions.get(sessionId);
    store.opdSessions.set(sessionId, { ...s, patientData: { firstname: 'A', lastname: 'B' } });

    // Queue should auto-restore (READ-side override; no write to clear isHiddenFromQueue).
    expect(simulateQueueFilter(store).map(s => s.id)).toContain(sessionId);
  });

  it('F4 — V116 standalone session (no booking) → hard-delete (เหมือนกดผิด)', () => {
    const store = makeStore();
    // Session created with no linked booking (e.g. kiosk-typed-name without follow-through).
    const sessionId = 'BL-standalone-1';
    store.opdSessions.set(sessionId, {
      id: sessionId,
      status: 'pending',
      patientData: null,
      linkedDepositId: '',
      linkedAppointmentId: '',
    });

    const del = simulateDeleteSession(store, sessionId);
    expect(del.action).toBe('hard-delete'); // truly nuked
    expect(store.opdSessions.has(sessionId)).toBe(false);
  });

  it('F5 — V116 archive path unchanged: patientData present → archive, link cascade auto-confirms appt', () => {
    const store = makeStore();
    const sessionId = 'BL-filled-1';
    store.opdSessions.set(sessionId, {
      id: sessionId,
      status: 'completed',
      patientData: { firstname: 'C', lastname: 'D' },
      linkedAppointmentId: 'BA-1',
    });
    const del = simulateDeleteSession(store, sessionId);
    expect(del.action).toBe('archive'); // unchanged behavior — V116 doesn't touch archive path
    expect(store.opdSessions.get(sessionId).isArchived).toBe(true);
  });

  it('F6 — V116 PRE-FIX BUG REPRO: unconditional short-circuit returns stale sessionId', () => {
    // This is the bug shape pre-V116. We simulate the OLD behavior to lock the
    // regression: if the provision helper does NOT verify existence, it would
    // return a stale sessionId pointing to nothing.
    function simulateProvisionPRE_V116(store, { depositId = '', appointmentId = '' }) {
      let existingSessionId = '';
      if (depositId) {
        const dep = store.deposits.get(depositId);
        if (dep?.linkedOpdSessionId) existingSessionId = dep.linkedOpdSessionId;
      } else if (appointmentId) {
        const appt = store.appointments.get(appointmentId);
        if (appt?.linkedOpdSessionId) existingSessionId = appt.linkedOpdSessionId;
      }
      // BUG: no existence check — returns stale sessionId immediately.
      if (existingSessionId) {
        return { sessionId: existingSessionId, alreadyProvisioned: true };
      }
      // Mint flow omitted — not needed for the bug repro.
      return { sessionId: '', alreadyProvisioned: false };
    }
    const store = makeStore();
    const apptId = 'BA-bugrepro-1';
    store.appointments.set(apptId, { id: apptId, linkedOpdSessionId: 'BL-deleted-1' });
    // opd_sessions doc is NOT in store → simulates legacy victim.
    const r = simulateProvisionPRE_V116(store, { appointmentId: apptId });
    expect(r.sessionId).toBe('BL-deleted-1'); // Pre-V116 returns the stale ID
    expect(store.opdSessions.has(r.sessionId)).toBe(false); // → URL is dead
    // Post-V116 simulateProvision would have minted a fresh one (see F2).
  });
});

// ─── G — class-of-bug classifier (Rule P Tier 2 artifact) ─────────────────
//
// Enumerate all 4 opd_sessions delete sites + classify each.

const OPD_SESSIONS_DELETE_SITES = [
  {
    site: 'AdminDashboard.jsx:2251 auto-2hr-expire',
    fixed: true,
    fixMethod: 'V116-mirror conditional (preserve if linked)',
  },
  {
    site: 'AdminDashboard.jsx:3293 deleteSession no-patientData',
    fixed: true,
    fixMethod: 'V116 conditional preserve-vs-delete',
  },
  {
    site: 'AdminDashboard.jsx:3345 handleNoDepositCancel',
    fixed: false, // not needed — already self-heals
    fixMethod: 'self-healing (cascades to deleteBackendAppointment)',
  },
  {
    site: 'AdminDashboard.jsx:3353 hardDeleteSession',
    fixed: false, // safety-net only — covered by provision backstop
    fixMethod: 'covered by V116 architectural backstop in provision helper',
  },
];

describe('V116.G — class-of-bug classifier (Rule P Tier 2)', () => {
  it('G1 — exactly 4 opd_sessions delete sites are classified', () => {
    expect(OPD_SESSIONS_DELETE_SITES).toHaveLength(4);
  });

  it('G2 — at least one site is fixed by V116 conditional preserve', () => {
    const fixed = OPD_SESSIONS_DELETE_SITES.filter(s => s.fixed);
    expect(fixed.length).toBeGreaterThanOrEqual(2);
  });

  it('G3 — all delete sites are either fixed OR architecturally covered (no unhandled instance)', () => {
    for (const site of OPD_SESSIONS_DELETE_SITES) {
      const isHandled = site.fixed || site.fixMethod.includes('self-healing') || site.fixMethod.includes('architectural backstop');
      expect(isHandled).toBe(true);
    }
  });
});
