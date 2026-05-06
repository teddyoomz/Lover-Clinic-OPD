// ─── Phase 24.0-vicies-novies — Send-customer-link mechanism ────────────────
//
// Backend pickLater "ส่งลิ้งค์ลูกค้า" path:
//   1. Admin creates customer-later booking via DepositPanel form OR
//      AppointmentFormModal pickLater (existing Phase 24.0-vicies flow).
//   2. Admin clicks "📤 ส่งลิ้งค์ลูกค้า" button on the customer-later card.
//   3. provisionOpdLinkForBookingPair mints a fresh opd_sessions/{BL-…} doc
//      + stamps linkedOpdSessionId on the existing be_deposits +
//      be_appointments docs via a single writeBatch.
//   4. SendCustomerLinkModal surfaces URL + QR + copy/print helpers so admin
//      can send the link via LINE/SMS/etc.
//   5. Customer fills form via the unique URL (existing PatientForm flow).
//   6. Admin clicks "บันทึกลง OPD" → handleOpdClick post-save hook calls
//      attachCustomerToOpdSessionLinks(sessionId, customer) →
//      auto-attaches deposit + appointment.
//
// Idempotency: re-clicking the button on the same booking re-uses the existing
// sessionId (alreadyProvisioned=true). User intent: same URL no matter how
// many times admin clicks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const SEND_MODAL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/SendCustomerLinkModal.jsx'),
  'utf8',
);
const DEPOSIT_PANEL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/DepositPanel.jsx'),
  'utf8',
);
const APPT_MODAL = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'),
  'utf8',
);

// ─── F. provisionOpdLinkForBookingPair helper ───────────────────────────────
describe('Phase 24.0-vicies-novies — provisionOpdLinkForBookingPair helper', () => {
  it('VN.F.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+provisionOpdLinkForBookingPair/,
    );
  });

  it('VN.F.2 — helper rejects when both depositId and appointmentId missing', async () => {
    const { provisionOpdLinkForBookingPair } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      provisionOpdLinkForBookingPair({}),
    ).rejects.toThrow(/depositId OR appointmentId required/);
  });

  it('VN.F.3 — helper signature accepts depositId / appointmentId / branchId / formType / sessionName / origin', () => {
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+provisionOpdLinkForBookingPair\(\{\s*[\s\S]{0,400}?depositId\s*=\s*['"]['"]/,
    );
    expect(PAIR_HELPER).toMatch(/appointmentId\s*=\s*['"]['"]/);
    expect(PAIR_HELPER).toMatch(/branchId\s*=\s*['"]['"]/);
    expect(PAIR_HELPER).toMatch(/formType\s*=\s*['"]intake['"]/);
    expect(PAIR_HELPER).toMatch(/sessionName\s*=\s*['"]['"]/);
    expect(PAIR_HELPER).toMatch(/origin\s*=\s*['"]['"]/);
  });

  it('VN.F.4 — helper checks idempotency via existing linkedOpdSessionId on deposit', () => {
    expect(PAIR_HELPER).toMatch(/depData\.linkedOpdSessionId/);
    expect(PAIR_HELPER).toMatch(/let\s+existingSessionId/);
    expect(PAIR_HELPER).toMatch(/alreadyProvisioned:\s*true/);
  });

  it('VN.F.5 — helper mints sessionId with BL- prefix + 8-hex suffix (Rule C2 crypto-secure)', () => {
    // The literal template-string `BL-${ts}-${suffix}` lives in the helper.
    expect(PAIR_HELPER).toMatch(/sessionId\s*=\s*`BL-/);
    expect(PAIR_HELPER).toMatch(/globalThis\.crypto\.getRandomValues/);
    // 4 bytes = 8 hex chars
    expect(PAIR_HELPER).toMatch(/new\s+Uint8Array\(4\)/);
  });

  it('VN.F.6 — helper uses writeBatch for atomicity (session create + reverse stamps)', () => {
    expect(PAIR_HELPER).toMatch(/writeBatch\(db\)/);
    expect(PAIR_HELPER).toMatch(/batch\.set\(sessionRef/);
    expect(PAIR_HELPER).toMatch(/batch\.update\(depositDoc\(depositId\)/);
    expect(PAIR_HELPER).toMatch(/batch\.update\(appointmentDoc\(appointmentId\)/);
    expect(PAIR_HELPER).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('VN.F.7 — session payload stamps linkedDepositId + linkedAppointmentId + branchId + sessionName', () => {
    // Find the sessionPayload object literal — bigger bound for full body.
    const block = PAIR_HELPER.match(
      /const\s+sessionPayload\s*=\s*\{[\s\S]{0,2000}?\};/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/linkedDepositId/);
    expect(block[0]).toMatch(/linkedAppointmentId/);
    expect(block[0]).toMatch(/branchId/);
    expect(block[0]).toMatch(/sessionName/);
    expect(block[0]).toMatch(/createdFromBackendBooking:\s*true/);
  });

  it('VN.F.8 — reverse-stamp object includes linkedOpdSessionId + opdLinkProvisionedAt + updatedAt', () => {
    const block = PAIR_HELPER.match(
      /const\s+reverseStamp\s*=\s*\{[\s\S]{0,300}?\};/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/linkedOpdSessionId:\s*sessionId/);
    expect(block[0]).toMatch(/opdLinkProvisionedAt:\s*now/);
    expect(block[0]).toMatch(/updatedAt:\s*now/);
  });

  it('VN.F.9 — helper return shape includes sessionId + url + alreadyProvisioned', () => {
    expect(PAIR_HELPER).toMatch(
      /return\s+\{\s*sessionId,\s*url,\s*alreadyProvisioned:\s*false\s*\}/,
    );
  });

  it('VN.F.10 — _buildOpdSessionUrl helper falls back to window.location.origin', () => {
    expect(PAIR_HELPER).toMatch(
      /function\s+_buildOpdSessionUrl\(sessionId,\s*origin/,
    );
    expect(PAIR_HELPER).toMatch(/window\.location\?\.origin/);
    expect(PAIR_HELPER).toMatch(/`\$\{resolvedOrigin\}\/\?session=\$\{sessionId\}`/);
  });

  it('VN.F.11 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-vicies-novies-provision-opd-link-for-booking-pair/,
    );
  });
});

// ─── G. SendCustomerLinkModal component ─────────────────────────────────────
describe('Phase 24.0-vicies-novies — SendCustomerLinkModal component', () => {
  it('VN.G.1 — component imports generateQrDataUrl from documentPrintEngine', () => {
    expect(SEND_MODAL).toMatch(
      /import\s+\{\s*generateQrDataUrl\s*\}\s*from\s+['"]\.\.\/\.\.\/lib\/documentPrintEngine\.js['"]/,
    );
  });

  it('VN.G.2 — component returns null when isOpen=false (gate)', () => {
    expect(SEND_MODAL).toMatch(/if\s*\(!isOpen\)\s+return\s+null/);
  });

  it('VN.G.3 — component renders URL input with read-only attribute', () => {
    expect(SEND_MODAL).toMatch(/readOnly/);
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-url"/);
  });

  it('VN.G.4 — component has copy-URL button with data-testid', () => {
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-copy-url"/);
    expect(SEND_MODAL).toMatch(/navigator\.clipboard\?\.writeText/);
  });

  it('VN.G.5 — component renders QR via generateQrDataUrl in useEffect', () => {
    expect(SEND_MODAL).toMatch(/useEffect/);
    expect(SEND_MODAL).toMatch(/await\s+generateQrDataUrl\(url/);
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-qr"/);
  });

  it('VN.G.6 — component has print-QR button + opens new window', () => {
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-print"/);
    expect(SEND_MODAL).toMatch(/window\.open\(['"]['"]\s*,\s*['"]_blank['"]/);
  });

  it('VN.G.7 — component shows session id (forensic display)', () => {
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-session-id"/);
  });

  it('VN.G.8 — component supports alreadyProvisioned distinct prompt', () => {
    expect(SEND_MODAL).toMatch(/alreadyProvisioned/);
    expect(SEND_MODAL).toMatch(/ลิ้งค์ที่ส่งไว้ก่อนหน้านี้/);
  });

  it('VN.G.9 — component cleanup-on-close fires onClose prop', () => {
    expect(SEND_MODAL).toMatch(/data-testid="send-customer-link-close"/);
    expect(SEND_MODAL).toMatch(/onClick=\{onClose\}/);
  });

  it('VN.G.10 — component esc-safe XSS in print-window via < > escaping', () => {
    // Print-window helper escapes < > to avoid HTML injection in sessionName/url.
    expect(SEND_MODAL).toMatch(/replace\(\/<\/g,\s*['"]&lt;['"]\)/);
    expect(SEND_MODAL).toMatch(/replace\(\/>\/g,\s*['"]&gt;['"]\)/);
  });
});

// ─── H. DepositPanel send-link button wiring ────────────────────────────────
describe('Phase 24.0-vicies-novies — DepositPanel send-link button wiring', () => {
  it('VN.H.1 — DepositPanel imports provisionOpdLinkForBookingPair', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /import\s+\{[\s\S]{0,500}?provisionOpdLinkForBookingPair/,
    );
  });

  it('VN.H.2 — DepositPanel imports SendCustomerLinkModal', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /import\s+SendCustomerLinkModal\s+from\s+['"]\.\/SendCustomerLinkModal\.jsx['"]/,
    );
  });

  it('VN.H.3 — DepositPanel state for sendLinkModal + sendLinkBusyId', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /const\s+\[sendLinkModal,\s*setSendLinkModal\]\s*=\s*useState\(null\)/,
    );
    expect(DEPOSIT_PANEL).toMatch(
      /const\s+\[sendLinkBusyId,\s*setSendLinkBusyId\]\s*=\s*useState\(['"]['"]\)/,
    );
  });

  it('VN.H.4 — Send-link button visible only on customer-later cards (!customerId + temp fields)', () => {
    // Button must live inside the !dep.customerId && (...Temp...) badge area.
    // Increased bound to {0,8000} — the badge block grew with the new button.
    const block = DEPOSIT_PANEL.match(
      /\{!dep\.customerId\s*&&\s*\(dep\.customerNameTemp\s*\|\|\s*dep\.customerPhoneTemp\)\s*&&\s*\([\s\S]{0,8000}?\)\}/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/data-testid="deposit-send-link-btn"/);
  });

  it('VN.H.5 — Send-link button onClick calls provisionOpdLinkForBookingPair with depositId + linkedAppointmentId', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /provisionOpdLinkForBookingPair\(\{\s*[\s\S]{0,400}?depositId:\s*depKey/,
    );
    expect(DEPOSIT_PANEL).toMatch(/appointmentId:\s*dep\.linkedAppointmentId\s*\|\|\s*['"]['"]/);
  });

  it('VN.H.6 — Send-link button label flips on linkedOpdSessionId presence', () => {
    expect(DEPOSIT_PANEL).toMatch(/dep\.linkedOpdSessionId\s*\?\s*\(/);
    expect(DEPOSIT_PANEL).toMatch(/ดูลิ้งค์ที่ส่งไป/);
    expect(DEPOSIT_PANEL).toMatch(/ส่งลิ้งค์ลูกค้า/);
  });

  it('VN.H.7 — DepositPanel renders SendCustomerLinkModal when sendLinkModal state set', () => {
    expect(DEPOSIT_PANEL).toMatch(
      /\{sendLinkModal\s*&&\s*\(\s*<SendCustomerLinkModal/,
    );
  });

  it('VN.H.8 — Modal close handler refreshes list (loadList) so badge flips on row', () => {
    const block = DEPOSIT_PANEL.match(
      /\{sendLinkModal\s*&&\s*\(\s*<SendCustomerLinkModal[\s\S]{0,1000}?\)\}/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/await\s+loadList\(\)/);
  });
});

// ─── I. AppointmentFormModal send-link button wiring (pickLater edit mode) ──
describe('Phase 24.0-vicies-novies — AppointmentFormModal send-link button wiring', () => {
  it('VN.I.1 — AppointmentFormModal imports provisionOpdLinkForBookingPair', () => {
    expect(APPT_MODAL).toMatch(
      /import\s+\{[\s\S]{0,400}?provisionOpdLinkForBookingPair/,
    );
  });

  it('VN.I.2 — AppointmentFormModal imports SendCustomerLinkModal', () => {
    expect(APPT_MODAL).toMatch(
      /import\s+SendCustomerLinkModal\s+from\s+['"]\.\/SendCustomerLinkModal\.jsx['"]/,
    );
  });

  it('VN.I.3 — Send-link state for sendLinkModal + sendLinkBusy', () => {
    expect(APPT_MODAL).toMatch(
      /const\s+\[sendLinkModal,\s*setSendLinkModal\]\s*=\s*useState\(null\)/,
    );
    expect(APPT_MODAL).toMatch(
      /const\s+\[sendLinkBusy,\s*setSendLinkBusy\]\s*=\s*useState\(false\)/,
    );
  });

  it('VN.I.4 — Send-link button visible ONLY in edit mode + appt has appointmentId', () => {
    expect(APPT_MODAL).toMatch(
      /\{mode\s*===\s*['"]edit['"]\s*&&\s*appt\s*&&\s*\(appt\.appointmentId\s*\|\|\s*appt\.id\)\s*&&\s*\(/,
    );
  });

  it('VN.I.5 — Send-link button has data-testid + onClick → provisionOpdLinkForBookingPair', () => {
    expect(APPT_MODAL).toMatch(/data-testid="appt-modal-send-link-btn"/);
    expect(APPT_MODAL).toMatch(
      /provisionOpdLinkForBookingPair\(\{\s*[\s\S]{0,400}?depositId:\s*appt\.linkedDepositId/,
    );
    expect(APPT_MODAL).toMatch(/appointmentId:\s*apptId/);
  });

  it('VN.I.6 — Send-link button label flips on appt.linkedOpdSessionId presence', () => {
    expect(APPT_MODAL).toMatch(/appt\.linkedOpdSessionId\s*\?[\s\S]{0,200}?ดูลิ้งค์ที่ส่งไป/);
    expect(APPT_MODAL).toMatch(/ส่งลิ้งค์ลูกค้ากรอก OPD/);
  });

  it('VN.I.7 — AppointmentFormModal renders SendCustomerLinkModal when sendLinkModal state set', () => {
    expect(APPT_MODAL).toMatch(
      /\{sendLinkModal\s*&&\s*\(\s*<SendCustomerLinkModal/,
    );
  });

  it('VN.I.8 — Send-link button is gated on pickLater branch (lives inside formData.pickLater ? (...) block)', () => {
    // The button must appear inside the pickLater rendering branch so it's
    // never accidentally shown to customers with already-attached customerId.
    // Bound bumped to {0,10000} — pickLater branch grew with the new button.
    const pickLaterBranch = APPT_MODAL.match(
      /\{formData\.pickLater\s*\?\s*\([\s\S]{0,10000}?\)\s*:\s*lockedCustomer/,
    );
    expect(pickLaterBranch).toBeTruthy();
    expect(pickLaterBranch[0]).toMatch(/data-testid="appt-modal-send-link-btn"/);
  });
});
