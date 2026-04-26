// ─── V31 (2026-04-26) — Firebase Auth Orphan Recovery Test Bank ─────────
//
// User report (verbatim): "เจอบั๊ค ลบพนักงานทิ้งไป แล้วอีเมลยัง login ได้
// และลองมาสร้างพนักงานใหม่ใช้อีเมลเดิม มันบอกว่ามีเมลอยู่ในระบบแล้ว".
//
// Bug: StaffTab.handleDelete + DoctorsTab.handleDelete silently swallowed
// Firebase Auth deletion errors via try/catch. When deleteAdminUser failed
// (transient network blip, race, etc.), Firestore was still deleted — leaving
// an orphaned Firebase Auth account. Email kept logging in, blocked re-create.
//
// Fix surfaces:
//   1. api/admin/_lib/orphanRecovery.js — pure decision helper (testable)
//   2. api/admin/users.js handleCreate — catches auth/email-already-exists,
//      cross-references be_staff/be_doctors, recovers orphan when safe
//   3. api/admin/users.js handleDelete — tolerates auth/user-not-found
//   4. src/components/backend/StaffTab.jsx + DoctorsTab.jsx — surface
//      non-not-found errors instead of swallowing
//
// Test groups (Rule I full-flow simulate per § I + V13/V14/V21 lessons):
//   V31.A — Pure decideOrphanRecovery branch coverage
//   V31.B — decisionToErrorMessage Thai copy
//   V31.C — Full simulator: createUser → email-exists → cross-ref → decide
//   V31.D — Adversarial inputs (empty/null/case/whitespace)
//   V31.E — Source-grep regression guards (server-side fix shape)
//   V31.F — Source-grep regression guards (client-side surfacing)
//   V31.G — Cross-list sync drift (OWNER_EMAILS in 3 files)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  decideOrphanRecovery,
  decisionToErrorMessage,
} from '../api/admin/_lib/orphanRecovery.js';

const ROOT = join(__dirname, '..');
const orphanRecoveryFile = readFileSync(join(ROOT, 'api/admin/_lib/orphanRecovery.js'), 'utf8');
const usersFile = readFileSync(join(ROOT, 'api/admin/users.js'), 'utf8');
const staffTabFile = readFileSync(join(ROOT, 'src/components/backend/StaffTab.jsx'), 'utf8');
const doctorsTabFile = readFileSync(join(ROOT, 'src/components/backend/DoctorsTab.jsx'), 'utf8');
const ownerEmailsFile = readFileSync(join(ROOT, 'src/lib/ownerEmails.js'), 'utf8');
const bootstrapSelfFile = readFileSync(join(ROOT, 'api/admin/bootstrap-self.js'), 'utf8');

const OWNERS = ['oomz.peerapat@gmail.com'];
const CLINIC_RE = /@loverclinic\.com$/i;

// ─── V31.A — decideOrphanRecovery branch coverage ──────────────────────
describe('V31.A — decideOrphanRecovery (5 branches)', () => {
  it('A.1 — no existing user → "no-existing"', () => {
    expect(
      decideOrphanRecovery({
        email: 'new@example.com',
        existingUid: null,
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('no-existing');
  });

  it('A.2 — existing uid + owner email → "block-owner"', () => {
    expect(
      decideOrphanRecovery({
        email: 'oomz.peerapat@gmail.com',
        existingUid: 'uid-owner',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-owner');
  });

  it('A.3 — existing uid + @loverclinic.com → "block-clinic"', () => {
    expect(
      decideOrphanRecovery({
        email: 'admin@loverclinic.com',
        existingUid: 'uid-clinic',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-clinic');
  });

  it('A.4 — existing uid + cross-ref staff → "block-cross-ref"', () => {
    expect(
      decideOrphanRecovery({
        email: 'jane@gmail.com',
        existingUid: 'uid-jane',
        crossRef: { role: 'staff', id: 'STF-001' },
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-cross-ref');
  });

  it('A.5 — existing uid + cross-ref doctor → "block-cross-ref"', () => {
    expect(
      decideOrphanRecovery({
        email: 'doc@gmail.com',
        existingUid: 'uid-doc',
        crossRef: { role: 'doctor', id: 'DR-005' },
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-cross-ref');
  });

  it('A.6 — existing uid + no cross-ref + non-owner gmail → "recover"', () => {
    expect(
      decideOrphanRecovery({
        email: 'orphan@gmail.com',
        existingUid: 'uid-orphan',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('A.7 — existing uid + no cross-ref + outlook email → "recover"', () => {
    expect(
      decideOrphanRecovery({
        email: 'orphan@outlook.com',
        existingUid: 'uid-out',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('A.8 — owner takes precedence over @loverclinic.com if both match', () => {
    // Hypothetical: an owner email that's ALSO @loverclinic.com.
    // Owner allowlist comes first → "block-owner".
    expect(
      decideOrphanRecovery({
        email: 'someone@loverclinic.com',
        existingUid: 'uid-bridge',
        crossRef: null,
        ownerEmails: ['someone@loverclinic.com'],
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-owner');
  });
});

// ─── V31.B — decisionToErrorMessage ────────────────────────────────────
describe('V31.B — decisionToErrorMessage (Thai copy)', () => {
  it('B.1 — block-owner returns Thai owner-account message', () => {
    const m = decisionToErrorMessage('block-owner', { email: 'oomz.peerapat@gmail.com' });
    expect(m).toContain('oomz.peerapat@gmail.com');
    expect(m).toMatch(/เจ้าของ/);
  });

  it('B.2 — block-clinic returns Thai @loverclinic.com message', () => {
    const m = decisionToErrorMessage('block-clinic', { email: 'admin@loverclinic.com' });
    expect(m).toContain('admin@loverclinic.com');
    expect(m).toMatch(/loverclinic\.com/);
  });

  it('B.3 — block-cross-ref staff returns พนักงาน + id', () => {
    const m = decisionToErrorMessage('block-cross-ref', {
      email: 'jane@gmail.com',
      crossRef: { role: 'staff', id: 'STF-001' },
    });
    expect(m).toContain('พนักงาน');
    expect(m).toContain('STF-001');
    expect(m).toMatch(/กดแก้ไขบนรายการเดิม/);
  });

  it('B.4 — block-cross-ref doctor returns แพทย์ + id', () => {
    const m = decisionToErrorMessage('block-cross-ref', {
      email: 'doc@gmail.com',
      crossRef: { role: 'doctor', id: 'DR-005' },
    });
    expect(m).toContain('แพทย์');
    expect(m).toContain('DR-005');
  });

  it('B.5 — recover returns null (no error)', () => {
    expect(decisionToErrorMessage('recover')).toBe(null);
  });

  it('B.6 — no-existing returns null (proceed with retry)', () => {
    expect(decisionToErrorMessage('no-existing')).toBe(null);
  });
});

// ─── V31.C — full-flow simulator ────────────────────────────────────────
// Mirrors handleCreate's recovery branch logic. Wires:
//   createUser → throws auth/email-already-exists
//   getUserByEmail → returns existing user
//   findStaffOrDoctorByFirebaseUid → returns crossRef or null
//   decideOrphanRecovery → produces decision
//   recover → deleteUser + retry create OR throw with Thai message
describe('V31.C — handleCreate orphan recovery flow simulator', () => {
  function simulateHandleCreate({ email, existingUid, crossRef, ownerEmails = OWNERS, clinicEmailRegex = CLINIC_RE }) {
    // Step 1: createUser throws email-already-exists (assumed precondition)
    // Step 2: getUserByEmail returns existing or null
    // Step 3: cross-reference check
    // Step 4: decision
    if (!existingUid) {
      // Race: vanished. Caller retries create. Return as if successful.
      return { recovered: false, retried: true, action: 'create' };
    }
    const decision = decideOrphanRecovery({
      email, existingUid, crossRef, ownerEmails, clinicEmailRegex,
    });
    if (decision === 'recover') {
      // Caller deletes existing then re-creates
      return { recovered: true, action: 'delete-then-create', decision };
    }
    // Caller throws with Thai message
    const message = decisionToErrorMessage(decision, { email, crossRef });
    return { recovered: false, action: 'throw', decision, message };
  }

  it('C.1 — orphan email: deletes existing then re-creates', () => {
    const result = simulateHandleCreate({
      email: 'orphan@gmail.com',
      existingUid: 'uid-orphan',
      crossRef: null,
    });
    expect(result.action).toBe('delete-then-create');
    expect(result.decision).toBe('recover');
    expect(result.recovered).toBe(true);
  });

  it('C.2 — race condition: existing gone, retry create', () => {
    const result = simulateHandleCreate({
      email: 'gone@gmail.com',
      existingUid: null,
      crossRef: null,
    });
    expect(result.action).toBe('create');
    expect(result.retried).toBe(true);
  });

  it('C.3 — cross-ref staff: throw with STF-id', () => {
    const result = simulateHandleCreate({
      email: 'staff@gmail.com',
      existingUid: 'uid-staff',
      crossRef: { role: 'staff', id: 'STF-007' },
    });
    expect(result.action).toBe('throw');
    expect(result.message).toContain('STF-007');
    expect(result.message).toContain('พนักงาน');
  });

  it('C.4 — cross-ref doctor: throw with DR-id', () => {
    const result = simulateHandleCreate({
      email: 'doc@gmail.com',
      existingUid: 'uid-doc',
      crossRef: { role: 'doctor', id: 'DR-003' },
    });
    expect(result.action).toBe('throw');
    expect(result.message).toContain('DR-003');
    expect(result.message).toContain('แพทย์');
  });

  it('C.5 — owner email: throw with owner message', () => {
    const result = simulateHandleCreate({
      email: 'oomz.peerapat@gmail.com',
      existingUid: 'uid-owner',
      crossRef: null,
    });
    expect(result.action).toBe('throw');
    expect(result.decision).toBe('block-owner');
    expect(result.message).toMatch(/เจ้าของ/);
  });

  it('C.6 — clinic email: throw with @loverclinic message', () => {
    const result = simulateHandleCreate({
      email: 'staff1@loverclinic.com',
      existingUid: 'uid-clinic',
      crossRef: null,
    });
    expect(result.action).toBe('throw');
    expect(result.decision).toBe('block-clinic');
    expect(result.message).toContain('loverclinic.com');
  });
});

// ─── V31.D — adversarial inputs ─────────────────────────────────────────
describe('V31.D — adversarial inputs', () => {
  it('D.1 — empty email + existing uid → not owner, not clinic, not cross-ref → "recover"', () => {
    expect(
      decideOrphanRecovery({
        email: '',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('D.2 — null email → "recover" (defensive: server validates upstream)', () => {
    expect(
      decideOrphanRecovery({
        email: null,
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('D.3 — uppercase OWNER email → matched (case-insensitive)', () => {
    expect(
      decideOrphanRecovery({
        email: 'OOMZ.PEERAPAT@GMAIL.COM',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-owner');
  });

  it('D.4 — mixed-case @LoverClinic.COM → matched (regex /i flag)', () => {
    expect(
      decideOrphanRecovery({
        email: 'Admin@LoverClinic.COM',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-clinic');
  });

  it('D.5 — whitespace email → trimmed for OWNER match', () => {
    expect(
      decideOrphanRecovery({
        email: '  oomz.peerapat@gmail.com  ',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-owner');
  });

  it('D.6 — empty crossRef object {} → falsy, reaches "recover"', () => {
    expect(
      decideOrphanRecovery({
        email: 'orphan@gmail.com',
        existingUid: 'uid',
        crossRef: {},
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('D.7 — crossRef with only role (id missing) → still blocks', () => {
    expect(
      decideOrphanRecovery({
        email: 'staff@gmail.com',
        existingUid: 'uid',
        crossRef: { role: 'staff' },
        ownerEmails: OWNERS,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('block-cross-ref');
  });

  it('D.8 — empty ownerEmails array → no owner matches', () => {
    expect(
      decideOrphanRecovery({
        email: 'oomz.peerapat@gmail.com',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: [],
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });

  it('D.9 — null ownerEmails → no owner matches (defensive)', () => {
    expect(
      decideOrphanRecovery({
        email: 'oomz.peerapat@gmail.com',
        existingUid: 'uid',
        crossRef: null,
        ownerEmails: null,
        clinicEmailRegex: CLINIC_RE,
      }),
    ).toBe('recover');
  });
});

// ─── V31.E — server-side source-grep regression guards ──────────────────
describe('V31.E — handleCreate orphan recovery shape (api/admin/users.js)', () => {
  it('E.1 — imports decideOrphanRecovery + decisionToErrorMessage', () => {
    expect(usersFile).toMatch(/from '\.\/_lib\/orphanRecovery\.js'/);
    expect(usersFile).toContain('decideOrphanRecovery');
    expect(usersFile).toContain('decisionToErrorMessage');
  });

  it('E.2 — declares OWNER_EMAILS array', () => {
    expect(usersFile).toMatch(/const\s+OWNER_EMAILS\s*=\s*\[/);
    expect(usersFile).toContain('oomz.peerapat@gmail.com');
  });

  it('E.3 — declares LOVERCLINIC_EMAIL_RE regex with /i flag', () => {
    expect(usersFile).toMatch(/const\s+LOVERCLINIC_EMAIL_RE\s*=\s*\/@loverclinic\\\.com\$\/i/);
  });

  it('E.4 — handleCreate has try/catch on createUser call', () => {
    // The createUser call inside handleCreate must be inside a try block
    expect(usersFile).toMatch(/try\s*\{[^}]*await\s+auth\.createUser/);
  });

  it('E.5 — catch block tests for auth/email-already-exists', () => {
    expect(usersFile).toContain("err?.code !== 'auth/email-already-exists'");
  });

  it('E.6 — recovery branch calls auth.getUserByEmail', () => {
    expect(usersFile).toMatch(/auth\.getUserByEmail\s*\(\s*email\s*\)/);
  });

  it('E.7 — recovery branch calls findStaffOrDoctorByFirebaseUid', () => {
    expect(usersFile).toContain('findStaffOrDoctorByFirebaseUid');
  });

  it('E.8 — findStaffOrDoctorByFirebaseUid queries both be_staff AND be_doctors', () => {
    const helperBlock = usersFile.match(/async function findStaffOrDoctorByFirebaseUid[\s\S]*?^\}/m)?.[0] || '';
    expect(helperBlock).toContain("'be_staff'");
    expect(helperBlock).toContain("'be_doctors'");
    expect(helperBlock).toMatch(/where\s*\(\s*'firebaseUid'\s*,\s*'==',\s*uid\s*\)/);
    expect(helperBlock).toContain('limit(1)');
  });

  it('E.9 — recover decision deletes existing uid before retry', () => {
    expect(usersFile).toMatch(/auth\.deleteUser\s*\(\s*existing\.uid\s*\)/);
  });

  it('E.10 — handleDelete tolerates auth/user-not-found', () => {
    const deleteBlock = usersFile.match(/async function handleDelete[\s\S]*?^\}/m)?.[0] || '';
    expect(deleteBlock).toContain("err?.code === 'auth/user-not-found'");
    expect(deleteBlock).toContain('alreadyGone');
  });

  it('E.11 — handleDelete still throws non-not-found errors', () => {
    const deleteBlock = usersFile.match(/async function handleDelete[\s\S]*?^\}/m)?.[0] || '';
    expect(deleteBlock).toMatch(/throw\s+err/);
  });

  it('E.12 — V31 marker present (institutional memory grep)', () => {
    expect(usersFile).toContain('V31');
  });
});

// ─── V31.F — client-side source-grep regression guards ──────────────────
describe('V31.F — StaffTab + DoctorsTab handleDelete error surfacing', () => {
  it('F.1 — StaffTab no longer silently swallows generic Firebase errors', () => {
    // Anti-pattern: `catch (e) { console.warn(...); }` with no rethrow.
    // We require: "alreadyGone" classification + throw on other errors.
    expect(staffTabFile).toContain('alreadyGone');
    expect(staffTabFile).toMatch(/user-not-found/);
    expect(staffTabFile).toMatch(/throw\s+new\s+Error/);
  });

  it('F.2 — DoctorsTab no longer silently swallows generic Firebase errors', () => {
    expect(doctorsTabFile).toContain('alreadyGone');
    expect(doctorsTabFile).toMatch(/user-not-found/);
    expect(doctorsTabFile).toMatch(/throw\s+new\s+Error/);
  });

  it('F.3 — StaffTab handleDelete surfaces errors via Thai message', () => {
    expect(staffTabFile).toMatch(/ลบ Firebase account ล้มเหลว/);
  });

  it('F.4 — DoctorsTab handleDelete surfaces errors via Thai message', () => {
    expect(doctorsTabFile).toMatch(/ลบ Firebase account ล้มเหลว/);
  });

  it('F.5 — StaffTab V31 marker', () => {
    expect(staffTabFile).toContain('V31');
  });

  it('F.6 — DoctorsTab V31 marker', () => {
    expect(doctorsTabFile).toContain('V31');
  });

  it('F.7 — anti-regression: NO bare `console.warn` ... continuing pattern in StaffTab', () => {
    // Old buggy pattern: `console.warn('[StaffTab] Firebase delete failed (continuing with Firestore delete)`
    // V31 explicitly removes "continuing" word from the warn — the new path
    // logs "already gone — proceeding" only when the user is actually gone.
    expect(staffTabFile).not.toContain('continuing with Firestore delete');
  });

  it('F.8 — anti-regression: NO bare continuing-with-delete pattern in DoctorsTab', () => {
    expect(doctorsTabFile).not.toContain('continuing with Firestore delete');
  });
});

// ─── V31.G — OWNER_EMAILS dual-list sync drift catcher ──────────────────
// V28 P6 already covers src/lib/ownerEmails.js ↔ api/admin/bootstrap-self.js.
// V31 introduces a THIRD list in api/admin/users.js. Audit grep:
//   `grep -n "OWNER_EMAILS" src/lib/ownerEmails.js api/admin/bootstrap-self.js api/admin/users.js`
describe('V31.G — OWNER_EMAILS three-list sync', () => {
  function extractOwnerEmails(source) {
    // Grab the array literal between `OWNER_EMAILS = [` and `]`
    const m = source.match(/OWNER_EMAILS\s*=\s*\[([\s\S]*?)\]/);
    if (!m) return null;
    return m[1]
      .split(/[,\n]/)
      .map(s => s.trim().replace(/^['"`]|['"`]$/g, ''))
      .filter(s => s && !s.startsWith('//'));
  }

  it('G.1 — src/lib/ownerEmails.js list extracted', () => {
    const emails = extractOwnerEmails(ownerEmailsFile);
    expect(emails).not.toBeNull();
    expect(emails.length).toBeGreaterThan(0);
  });

  it('G.2 — api/admin/bootstrap-self.js list extracted + matches src/', () => {
    const a = extractOwnerEmails(ownerEmailsFile);
    const b = extractOwnerEmails(bootstrapSelfFile);
    expect(b).not.toBeNull();
    expect(new Set(b)).toEqual(new Set(a));
  });

  it('G.3 — api/admin/users.js list extracted + matches src/ (V31 new)', () => {
    const a = extractOwnerEmails(ownerEmailsFile);
    const c = extractOwnerEmails(usersFile);
    expect(c).not.toBeNull();
    expect(new Set(c)).toEqual(new Set(a));
  });

  it('G.4 — V31 audit-grep comment in api/admin/users.js', () => {
    // Grep should mention all three files for the dual-list sync drift catch
    expect(usersFile).toMatch(/grep.*OWNER_EMAILS.*ownerEmails\.js.*bootstrap-self\.js.*users\.js/);
  });

  it('G.5 — orphanRecovery.js exists (helper file)', () => {
    expect(orphanRecoveryFile.length).toBeGreaterThan(0);
    expect(orphanRecoveryFile).toContain('decideOrphanRecovery');
    expect(orphanRecoveryFile).toContain('decisionToErrorMessage');
  });
});

// ─── V31.H — handleUpdate orphan recovery on email change ──────────────
// User directive: "เวลามีการเปลี่ยน id ในพนักงานคนเดิม id เดิม ก็ต้อง
// ใช้ไม่ได้" — when admin changes a staff's email, the OLD email must
// stop working AND the new email change must succeed even if the new
// email collides with an orphan Firebase Auth user.
describe('V31.H — handleUpdate orphan recovery on email change', () => {
  it('H.1 — handleUpdate has try/catch around updateUser call', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toMatch(/try\s*\{[^}]*await\s+auth\.updateUser/);
  });

  it('H.2 — handleUpdate handles auth/email-already-exists code', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain("'auth/email-already-exists'");
  });

  it('H.3 — handleUpdate calls findStaffOrDoctorByFirebaseUid for collision check', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain('findStaffOrDoctorByFirebaseUid');
  });

  it('H.4 — handleUpdate uses decideOrphanRecovery with same OWNER_EMAILS list', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain('decideOrphanRecovery');
    expect(updateBlock).toContain('OWNER_EMAILS');
    expect(updateBlock).toContain('LOVERCLINIC_EMAIL_RE');
  });

  it('H.5 — handleUpdate skips orphan path if existing.uid === uid (self-collision)', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toMatch(/existing\.uid\s*===\s*uid/);
  });

  it('H.6 — handleUpdate tolerates auth/user-not-found with helpful Thai error', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain("'auth/user-not-found'");
    expect(updateBlock).toMatch(/firebaseUid/);
  });

  it('H.7 — handleUpdate deletes orphan before retry update', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toMatch(/auth\.deleteUser\s*\(\s*existing\.uid\s*\)/);
  });

  it('H.8 — handleUpdate V31 marker', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain('V31');
  });
});

// ─── V31.I — Token revocation on credential changes ────────────────────
// User directive: "การเปลี่ยนรหัส หรือแก้ไขอื่นๆก็ต้องรองรับและทำงาน
// ได้สมบูรณ์ด้วย" — password change must invalidate existing sessions.
describe('V31.I — credential-change revoke refresh tokens', () => {
  it('I.1 — handleUpdate calls revokeRefreshTokens', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain('revokeRefreshTokens');
  });

  it('I.2 — handleUpdate computes credentialsChanged flag', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toContain('credentialsChanged');
  });

  it('I.3 — credentialsChanged covers email + password + disabled', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    // The credentialsChanged predicate must check all three update keys
    expect(updateBlock).toMatch(/update\.email\s*!==\s*undefined/);
    expect(updateBlock).toMatch(/update\.password\s*!==\s*undefined/);
    expect(updateBlock).toMatch(/update\.disabled\s*!==\s*undefined/);
  });

  it('I.4 — revoke gated on credentialsChanged (not on every update)', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(updateBlock).toMatch(/if\s*\(\s*credentialsChanged\s*\)\s*\{[^}]*revokeRefreshTokens/s);
  });

  it('I.5 — revoke happens AFTER updateUser succeeds', () => {
    const updateBlock = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    const updateIdx = updateBlock.indexOf('auth.updateUser(uid, update)');
    const revokeIdx = updateBlock.lastIndexOf('revokeRefreshTokens');
    expect(updateIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(-1);
    // The final revokeRefreshTokens call must come AFTER updateUser
    expect(revokeIdx).toBeGreaterThan(updateIdx);
  });
});

// ─── V31.J — Token revocation on permission/admin changes ──────────────
// Aligns with user directive — when access is REMOVED or CHANGED, old
// claims must stop working immediately, not after 1h token TTL.
describe('V31.J — admin/permission claim changes revoke refresh tokens', () => {
  it('J.1 — handleRevokeAdmin calls revokeRefreshTokens', () => {
    const block = usersFile.match(/async function handleRevokeAdmin[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('revokeRefreshTokens');
  });

  it('J.2 — handleClearPermission calls revokeRefreshTokens', () => {
    const block = usersFile.match(/async function handleClearPermission[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('revokeRefreshTokens');
  });

  it('J.3 — handleSetPermission calls revokeRefreshTokens', () => {
    // setPermission can DOWNGRADE a user from admin → frontdesk; revoke
    // forces the new permissionGroupId to take effect within 1h.
    const block = usersFile.match(/async function handleSetPermission[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('revokeRefreshTokens');
  });

  it('J.4 — revokeRefreshTokens called AFTER setCustomUserClaims (revokeAdmin)', () => {
    const block = usersFile.match(/async function handleRevokeAdmin[\s\S]*?^\}/m)?.[0] || '';
    const setIdx = block.indexOf('setCustomUserClaims');
    const revokeIdx = block.indexOf('revokeRefreshTokens');
    expect(setIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(setIdx);
  });

  it('J.5 — revokeRefreshTokens called AFTER setCustomUserClaims (clearPermission)', () => {
    const block = usersFile.match(/async function handleClearPermission[\s\S]*?^\}/m)?.[0] || '';
    const setIdx = block.indexOf('setCustomUserClaims');
    const revokeIdx = block.indexOf('revokeRefreshTokens');
    expect(setIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(setIdx);
  });

  it('J.6 — revokeRefreshTokens called AFTER setCustomUserClaims (setPermission)', () => {
    const block = usersFile.match(/async function handleSetPermission[\s\S]*?^\}/m)?.[0] || '';
    const setIdx = block.indexOf('setCustomUserClaims');
    const revokeIdx = block.indexOf('revokeRefreshTokens');
    expect(setIdx).toBeGreaterThan(-1);
    expect(revokeIdx).toBeGreaterThan(setIdx);
  });

  it('J.7 — handleGrantAdmin does NOT revoke (granting access — no urgency)', () => {
    // Granting admin shouldn't kick the user out — they keep their session.
    // Token will be refreshed naturally and pick up admin:true within 1h.
    const block = usersFile.match(/async function handleGrantAdmin[\s\S]*?^\}/m)?.[0] || '';
    // grantAdmin block should not call revokeRefreshTokens
    expect(block).not.toContain('revokeRefreshTokens');
  });
});

// ─── V31.K — Full delete-id-then-login-fails simulator ─────────────────
// User directive: "ทำแล้วเทสเรื่องลบ id มาด้วยนะ อย่าให้พลาดอีก".
// Proves that after deleteAdminUser succeeds, the email no longer logs in.
describe('V31.K — delete-id flow: delete → login fails → re-create works', () => {
  // Simulator state: in-memory Firebase Auth + Firestore
  function makeSimulator() {
    const fbUsers = new Map(); // uid → { uid, email, password, refreshTokensValidAfter }
    const beStaff = new Map(); // staffId → { firebaseUid, email, ... }
    const beDoctors = new Map();

    function createUser({ email, password }) {
      // Check email collision
      for (const u of fbUsers.values()) {
        if (u.email === email) {
          const e = new Error('email already in use');
          e.code = 'auth/email-already-exists';
          throw e;
        }
      }
      const uid = `uid-${Math.random().toString(36).slice(2, 10)}`;
      const user = { uid, email, password, refreshTokensValidAfter: 0 };
      fbUsers.set(uid, user);
      return user;
    }
    function deleteUser(uid) {
      if (!fbUsers.has(uid)) {
        const e = new Error('not found');
        e.code = 'auth/user-not-found';
        throw e;
      }
      fbUsers.delete(uid);
      return true;
    }
    function getUserByEmail(email) {
      for (const u of fbUsers.values()) {
        if (u.email === email) return u;
      }
      const e = new Error('not found');
      e.code = 'auth/user-not-found';
      throw e;
    }
    function login({ email, password }) {
      for (const u of fbUsers.values()) {
        if (u.email === email && u.password === password) {
          return { uid: u.uid, token: `tok-${u.uid}-${Date.now()}` };
        }
      }
      const e = new Error('login failed');
      e.code = 'auth/wrong-password-or-not-found';
      throw e;
    }
    function setStaff(staffId, firebaseUid, data = {}) {
      beStaff.set(staffId, { staffId, firebaseUid, ...data });
    }
    function deleteStaff(staffId) {
      beStaff.delete(staffId);
    }
    function findByFirebaseUid(uid) {
      for (const s of beStaff.values()) {
        if (s.firebaseUid === uid) return { role: 'staff', id: s.staffId };
      }
      for (const d of beDoctors.values()) {
        if (d.firebaseUid === uid) return { role: 'doctor', id: d.doctorId };
      }
      return null;
    }
    return { fbUsers, beStaff, createUser, deleteUser, getUserByEmail, login, setStaff, deleteStaff, findByFirebaseUid };
  }

  it('K.1 — happy path: create staff → login works', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    sim.setStaff('STF-001', u.uid, { email: 'mymild.tn@gmail.com' });

    const session = sim.login({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    expect(session.uid).toBe(u.uid);
  });

  it('K.2 — V31 fix: delete staff → Firebase Auth gone → login fails', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    sim.setStaff('STF-001', u.uid, { email: 'mymild.tn@gmail.com' });

    // Simulate StaffTab.handleDelete — V31 path: deleteAdminUser BEFORE deleteStaff
    sim.deleteUser(u.uid);
    sim.deleteStaff('STF-001');

    // Login should now fail
    expect(() => sim.login({ email: 'mymild.tn@gmail.com', password: 'pw123456' }))
      .toThrow(/login failed/);
  });

  it('K.3 — V31 fix: delete + recreate same email works (was the user-reported bug)', () => {
    const sim = makeSimulator();
    const u1 = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    sim.setStaff('STF-001', u1.uid, { email: 'mymild.tn@gmail.com' });

    sim.deleteUser(u1.uid);
    sim.deleteStaff('STF-001');

    // Re-creating with same email succeeds (no orphan in fbUsers anymore)
    const u2 = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'newpw777' });
    expect(u2.uid).not.toBe(u1.uid);
    expect(u2.email).toBe('mymild.tn@gmail.com');
  });

  it('K.4 — pre-V31 BUG REPRO: silent-swallow path leaves orphan + blocks recreate', () => {
    // This documents the pre-V31 buggy behaviour. Future regression of the
    // silent-swallow pattern would re-introduce it.
    const sim = makeSimulator();
    const u1 = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    sim.setStaff('STF-001', u1.uid, { email: 'mymild.tn@gmail.com' });

    // Old buggy path: deleteAdminUser fails silently → only Firestore cleaned
    // (the BUG): admin proceeds with deleteStaff while orphan persists
    sim.deleteStaff('STF-001');
    // ... (deleteUser intentionally NOT called, simulating swallow)

    // BUG REPRODUCED: login still works
    const session = sim.login({ email: 'mymild.tn@gmail.com', password: 'pw123456' });
    expect(session).toBeDefined();
    // BUG REPRODUCED: re-create blocked
    expect(() => sim.createUser({ email: 'mymild.tn@gmail.com', password: 'newpw' }))
      .toThrow(/email already in use/);
  });

  it('K.5 — V31 orphan recovery on create: orphan exists + no cross-ref → recover', () => {
    const sim = makeSimulator();
    const orphan = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'old-pw' });
    // No be_staff/be_doctors references orphan.uid (simulating the bug state)

    // Simulate handleCreate's orphan recovery
    expect(() => sim.createUser({ email: 'mymild.tn@gmail.com', password: 'new-pw' }))
      .toThrow(/email already in use/);

    // Recovery branch: lookup, cross-ref check, decide, delete + retry
    const existing = sim.getUserByEmail('mymild.tn@gmail.com');
    const crossRef = sim.findByFirebaseUid(existing.uid);
    const decision = decideOrphanRecovery({
      email: 'mymild.tn@gmail.com',
      existingUid: existing.uid,
      crossRef,
      ownerEmails: OWNERS,
      clinicEmailRegex: CLINIC_RE,
    });
    expect(decision).toBe('recover');

    sim.deleteUser(existing.uid);
    const fresh = sim.createUser({ email: 'mymild.tn@gmail.com', password: 'new-pw' });
    expect(fresh.uid).not.toBe(orphan.uid);
  });

  it('K.6 — V31 orphan recovery refuses if cross-ref exists', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'jane@gmail.com', password: 'pw' });
    sim.setStaff('STF-077', u.uid, { email: 'jane@gmail.com' });

    const existing = sim.getUserByEmail('jane@gmail.com');
    const crossRef = sim.findByFirebaseUid(existing.uid);
    const decision = decideOrphanRecovery({
      email: 'jane@gmail.com',
      existingUid: existing.uid,
      crossRef,
      ownerEmails: OWNERS,
      clinicEmailRegex: CLINIC_RE,
    });
    expect(decision).toBe('block-cross-ref');
    expect(crossRef).toEqual({ role: 'staff', id: 'STF-077' });
  });
});

// ─── V31.L — Full credential-change flow simulator ─────────────────────
// User directive: "เวลามีการเปลี่ยน id ในพนักงานคนเดิม id เดิม ก็ต้อง
// ใช้ไม่ได้" — when admin changes email/password, OLD email/password
// must stop working.
describe('V31.L — credential-change flow: change → old credentials fail', () => {
  function makeSimulator() {
    const fbUsers = new Map();
    function createUser({ email, password }) {
      const uid = `uid-${Math.random().toString(36).slice(2, 10)}`;
      const user = { uid, email, password, refreshTokensValidAfter: 0 };
      fbUsers.set(uid, user);
      return user;
    }
    function updateUser(uid, update) {
      if (!fbUsers.has(uid)) {
        const e = new Error('not found');
        e.code = 'auth/user-not-found';
        throw e;
      }
      // Email collision check
      if (update.email !== undefined) {
        for (const [otherUid, u] of fbUsers.entries()) {
          if (otherUid !== uid && u.email === update.email) {
            const e = new Error('email already in use');
            e.code = 'auth/email-already-exists';
            throw e;
          }
        }
      }
      const u = fbUsers.get(uid);
      Object.assign(u, update);
      return u;
    }
    function revokeRefreshTokens(uid) {
      const u = fbUsers.get(uid);
      if (u) u.refreshTokensValidAfter = Date.now();
    }
    function login({ email, password, tokenIssuedAt }) {
      for (const u of fbUsers.values()) {
        if (u.email === email && u.password === password) {
          // Reject if existing token issued before revoke timestamp
          if (tokenIssuedAt !== undefined && tokenIssuedAt < u.refreshTokensValidAfter) {
            const e = new Error('id-token-revoked');
            e.code = 'auth/id-token-revoked';
            throw e;
          }
          return { uid: u.uid, token: `tok-${u.uid}-${Date.now()}` };
        }
      }
      const e = new Error('login failed');
      e.code = 'auth/wrong-password-or-not-found';
      throw e;
    }
    return { fbUsers, createUser, updateUser, revokeRefreshTokens, login };
  }

  it('L.1 — change email: old email login fails immediately', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'old@gmail.com', password: 'pw1234' });

    // Admin changes email
    sim.updateUser(u.uid, { email: 'new@gmail.com' });
    sim.revokeRefreshTokens(u.uid); // V31 revoke

    // OLD email login FAILS
    expect(() => sim.login({ email: 'old@gmail.com', password: 'pw1234' }))
      .toThrow(/login failed/);

    // NEW email login WORKS
    const session = sim.login({ email: 'new@gmail.com', password: 'pw1234' });
    expect(session.uid).toBe(u.uid);
  });

  it('L.2 — change password: old password login fails immediately', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'jane@gmail.com', password: 'oldpw1234' });

    sim.updateUser(u.uid, { password: 'newpw5678' });
    sim.revokeRefreshTokens(u.uid);

    // OLD password fails
    expect(() => sim.login({ email: 'jane@gmail.com', password: 'oldpw1234' }))
      .toThrow(/login failed/);

    // NEW password works
    const session = sim.login({ email: 'jane@gmail.com', password: 'newpw5678' });
    expect(session.uid).toBe(u.uid);
  });

  it('L.3 — disable account: existing tokens revoked', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'staff@gmail.com', password: 'pw1234' });
    const oldTokenIssuedAt = Date.now() - 1000; // token issued 1s ago

    sim.updateUser(u.uid, { disabled: true });
    sim.revokeRefreshTokens(u.uid);

    // Existing token from before revoke is rejected
    expect(() => sim.login({ email: 'staff@gmail.com', password: 'pw1234', tokenIssuedAt: oldTokenIssuedAt }))
      .toThrow(/id-token-revoked/);
  });

  it('L.4 — change email + password together: both flows work', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'old@gmail.com', password: 'oldpw1234' });

    sim.updateUser(u.uid, { email: 'new@gmail.com', password: 'newpw5678' });
    sim.revokeRefreshTokens(u.uid);

    // Old combo fails
    expect(() => sim.login({ email: 'old@gmail.com', password: 'oldpw1234' }))
      .toThrow(/login failed/);
    // Old email + new password fails
    expect(() => sim.login({ email: 'old@gmail.com', password: 'newpw5678' }))
      .toThrow(/login failed/);
    // New email + old password fails
    expect(() => sim.login({ email: 'new@gmail.com', password: 'oldpw1234' }))
      .toThrow(/login failed/);
    // New combo works
    const session = sim.login({ email: 'new@gmail.com', password: 'newpw5678' });
    expect(session.uid).toBe(u.uid);
  });

  it('L.5 — orphan recovery on email change: target email is orphaned → succeed', () => {
    const sim = makeSimulator();
    // Create orphan (left over from buggy delete)
    const orphan = sim.createUser({ email: 'taken@gmail.com', password: 'orphan-pw' });
    // Create real staff
    const realStaff = sim.createUser({ email: 'jane@gmail.com', password: 'pw' });

    // Admin tries to change realStaff email to 'taken@gmail.com' (orphan email)
    expect(() => sim.updateUser(realStaff.uid, { email: 'taken@gmail.com' }))
      .toThrow(/email already in use/);

    // V31 recovery branch: detect orphan, delete it, retry update
    const existing = Array.from(sim.fbUsers.values()).find(u => u.email === 'taken@gmail.com');
    expect(existing.uid).toBe(orphan.uid);
    expect(existing.uid).not.toBe(realStaff.uid);
    // No cross-ref (orphan)
    const crossRef = null;
    const decision = decideOrphanRecovery({
      email: 'taken@gmail.com',
      existingUid: existing.uid,
      crossRef,
      ownerEmails: OWNERS,
      clinicEmailRegex: CLINIC_RE,
    });
    expect(decision).toBe('recover');

    // Delete orphan + retry
    sim.fbUsers.delete(existing.uid);
    sim.updateUser(realStaff.uid, { email: 'taken@gmail.com' });
    sim.revokeRefreshTokens(realStaff.uid);

    const session = sim.login({ email: 'taken@gmail.com', password: 'pw' });
    expect(session.uid).toBe(realStaff.uid);
  });

  it('L.6 — change displayName only: tokens NOT revoked (non-credential change)', () => {
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'staff@gmail.com', password: 'pw1234' });
    const oldTokenIssuedAt = Date.now() - 1000;

    // Pure displayName change should NOT trigger revoke per V31 spec
    sim.updateUser(u.uid, { displayName: 'Jane Smith' });
    // Note: revokeRefreshTokens is NOT called because credentialsChanged = false

    // Existing token still valid
    const session = sim.login({ email: 'staff@gmail.com', password: 'pw1234', tokenIssuedAt: oldTokenIssuedAt });
    expect(session.uid).toBe(u.uid);
  });

  it('L.7 — anti-regression: pre-V31 missing-revoke leaves window of vulnerability', () => {
    // Document the pre-V31 vulnerability — without revokeRefreshTokens, an
    // admin who reset a stolen account's password would still leave existing
    // attacker sessions valid for ~1h.
    const sim = makeSimulator();
    const u = sim.createUser({ email: 'compromised@gmail.com', password: 'stolen' });
    const attackerTokenIssuedAt = Date.now() - 1000;

    // Admin resets password but DOESN'T revoke (pre-V31 path)
    sim.updateUser(u.uid, { password: 'admin-reset' });
    // ... revokeRefreshTokens NOT called

    // Attacker's existing session continues to work
    const session = sim.login({
      email: 'compromised@gmail.com',
      password: 'admin-reset', // attacker doesn't even know new password — but their token is still valid
      tokenIssuedAt: attackerTokenIssuedAt,
    });
    // VULNERABILITY: token was issued before the password change, but without
    // revokeRefreshTokens the simulator doesn't reject it
    expect(session.uid).toBe(u.uid);
  });
});

// ─── V31.M — Source-grep: full surface coverage ─────────────────────────
describe('V31.M — V31 marker + comment audit (institutional memory)', () => {
  it('M.1 — orphanRecovery.js documents user-report verbatim', () => {
    expect(orphanRecoveryFile).toMatch(/เจอบั๊ค ลบพนักงาน/);
  });

  it('M.2 — users.js handleCreate has V31 marker + reason comment', () => {
    const block = usersFile.match(/async function handleCreate[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('V31');
    expect(block).toMatch(/orphan/i);
  });

  it('M.3 — users.js handleUpdate has V31 marker + reason comment', () => {
    const block = usersFile.match(/async function handleUpdate[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('V31');
    expect(block).toMatch(/credential|revoke/i);
  });

  it('M.4 — users.js handleDelete has V31 marker + reason comment', () => {
    const block = usersFile.match(/async function handleDelete[\s\S]*?^\}/m)?.[0] || '';
    expect(block).toContain('V31');
    expect(block).toMatch(/already-gone|user-not-found/i);
  });

  it('M.5 — StaffTab.jsx handleDelete documents V31 (no silent-swallow)', () => {
    expect(staffTabFile).toMatch(/V31/);
    expect(staffTabFile).toMatch(/silently/i);
  });

  it('M.6 — DoctorsTab.jsx handleDelete documents V31 (no silent-swallow)', () => {
    expect(doctorsTabFile).toMatch(/V31/);
    expect(doctorsTabFile).toMatch(/silently/i);
  });
});

// ─── V31.N — Self-delete protection (3-layer defense) ──────────────────
// User directive: "และไม่อนุญาติให้ไอดีตัวเองลบพนักงานที่เป็นไอดีตัวเองได้
// คือห้ามลบตัวเองนั่นแหละ ป้องกันปัญหา".
//
// Defense in depth — three layers protect against self-delete:
//   Layer 1 (UX): button is disabled + tooltip "ไม่สามารถลบบัญชีของตัวเองได้"
//   Layer 2 (Client guard): handleDelete early-returns with Thai error
//                           (covers programmatic / keyboard activation)
//   Layer 3 (Server): handleDelete throws "cannot delete own account"
//                     (covers direct API curl bypass)
describe('V31.N — self-delete protection', () => {
  // ─── Layer 1: button-disabled markup ──────────────────────────────
  it('N.1 — StaffTab imports auth from firebase.js', () => {
    expect(staffTabFile).toMatch(/import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*'\.\.\/\.\.\/firebase\.js'/);
  });

  it('N.2 — DoctorsTab imports auth from firebase.js', () => {
    expect(doctorsTabFile).toMatch(/import\s*\{[^}]*\bauth\b[^}]*\}\s*from\s*'\.\.\/\.\.\/firebase\.js'/);
  });

  it('N.3 — StaffTab computes isSelfRow per row', () => {
    expect(staffTabFile).toContain('isSelfRow');
    expect(staffTabFile).toMatch(/auth\?\.currentUser\?\.uid/);
    expect(staffTabFile).toMatch(/s\.firebaseUid\s*===\s*currentUid/);
  });

  it('N.4 — DoctorsTab computes isSelfRow per row', () => {
    expect(doctorsTabFile).toContain('isSelfRow');
    expect(doctorsTabFile).toMatch(/d\.firebaseUid\s*===\s*currentUid/);
  });

  it('N.5 — StaffTab delete button disabled when isSelfRow', () => {
    expect(staffTabFile).toMatch(/disabled\s*=\s*\{[^}]*isSelfRow/);
  });

  it('N.6 — DoctorsTab delete button disabled when isSelfRow', () => {
    expect(doctorsTabFile).toMatch(/disabled\s*=\s*\{[^}]*isSelfRow/);
  });

  it('N.7 — StaffTab delete button has self-row data attribute', () => {
    expect(staffTabFile).toMatch(/data-self-row/);
  });

  it('N.8 — DoctorsTab delete button has self-row data attribute', () => {
    expect(doctorsTabFile).toMatch(/data-self-row/);
  });

  it('N.9 — StaffTab tooltip explains "ไม่สามารถลบบัญชีของตัวเองได้"', () => {
    expect(staffTabFile).toContain('ไม่สามารถลบบัญชีของตัวเองได้');
  });

  it('N.10 — DoctorsTab tooltip explains "ไม่สามารถลบบัญชีของตัวเองได้"', () => {
    expect(doctorsTabFile).toContain('ไม่สามารถลบบัญชีของตัวเองได้');
  });

  // ─── Layer 2: handleDelete client guard ───────────────────────────
  it('N.11 — StaffTab handleDelete early-returns when self-row', () => {
    const handleBlock = staffTabFile.match(/const handleDelete[\s\S]*?\n  \};/m)?.[0] || '';
    // Must check identity BEFORE any destructive op + return early
    expect(handleBlock).toMatch(/auth\?\.currentUser\?\.uid/);
    expect(handleBlock).toMatch(/s\.firebaseUid\s*===\s*currentUid/);
    expect(handleBlock).toMatch(/setError\s*\([^)]*ลบบัญชีของตัวเอง/);
    expect(handleBlock).toMatch(/return\s*;/);
  });

  it('N.12 — DoctorsTab handleDelete early-returns when self-row', () => {
    const handleBlock = doctorsTabFile.match(/const handleDelete[\s\S]*?\n  \};/m)?.[0] || '';
    expect(handleBlock).toMatch(/auth\?\.currentUser\?\.uid/);
    expect(handleBlock).toMatch(/d\.firebaseUid\s*===\s*currentUid/);
    expect(handleBlock).toMatch(/setError\s*\([^)]*ลบบัญชีของตัวเอง/);
    expect(handleBlock).toMatch(/return\s*;/);
  });

  it('N.13 — Self-delete block runs BEFORE the confirm() prompt', () => {
    // The order is critical: identity check → setError + return → THEN confirm.
    // Otherwise a user typing Enter would see a confusing dialog before
    // the error.
    const handleBlock = staffTabFile.match(/const handleDelete[\s\S]*?\n  \};/m)?.[0] || '';
    const selfCheckIdx = handleBlock.search(/s\.firebaseUid\s*===\s*currentUid/);
    const confirmIdx = handleBlock.search(/window\.confirm/);
    expect(selfCheckIdx).toBeGreaterThan(-1);
    expect(confirmIdx).toBeGreaterThan(selfCheckIdx);
  });

  // ─── Layer 3: server-side guard (existing — locked by E.10/E.11) ──
  it('N.14 — server handleDelete still has self-protection (defense in depth)', () => {
    const deleteBlock = usersFile.match(/async function handleDelete[\s\S]*?^\}/m)?.[0] || '';
    expect(deleteBlock).toMatch(/uid\s*===\s*caller\.uid/);
    expect(deleteBlock).toContain('cannot delete own account');
  });

  // ─── Functional simulator ─────────────────────────────────────────
  it('N.15 — simulator: self-delete attempt sets error + does NOT touch backend', () => {
    let backendDeleteCalled = false;
    let firebaseDeleteCalled = false;
    let errorMessage = '';

    function simHandleDelete({ staff, currentUid, deleteFb, deleteStaff: deleteStaffFn, setErrorFn }) {
      const hasFbUser = !!staff.firebaseUid;
      if (hasFbUser && currentUid && staff.firebaseUid === currentUid) {
        setErrorFn('ไม่สามารถลบบัญชีของตัวเองได้ — ป้องกันการล็อคตัวเองออกจากระบบ');
        return;
      }
      // (rest of the flow — would call deleteFb + deleteStaffFn)
      if (hasFbUser) deleteFb(staff.firebaseUid);
      deleteStaffFn(staff.staffId);
    }

    simHandleDelete({
      staff: { staffId: 'STF-self', firebaseUid: 'uid-me' },
      currentUid: 'uid-me',
      deleteFb: () => { firebaseDeleteCalled = true; },
      deleteStaff: () => { backendDeleteCalled = true; },
      setErrorFn: (m) => { errorMessage = m; },
    });

    expect(errorMessage).toContain('ไม่สามารถลบบัญชีของตัวเองได้');
    expect(firebaseDeleteCalled).toBe(false);
    expect(backendDeleteCalled).toBe(false);
  });

  it('N.16 — simulator: deleting OTHER staff still works for admin', () => {
    let backendDeleteCalled = false;
    let firebaseDeleteCalled = false;
    let errorMessage = '';

    function simHandleDelete({ staff, currentUid, deleteFb, deleteStaff: deleteStaffFn, setErrorFn }) {
      const hasFbUser = !!staff.firebaseUid;
      if (hasFbUser && currentUid && staff.firebaseUid === currentUid) {
        setErrorFn('ไม่สามารถลบบัญชีของตัวเองได้');
        return;
      }
      if (hasFbUser) deleteFb(staff.firebaseUid);
      deleteStaffFn(staff.staffId);
    }

    simHandleDelete({
      staff: { staffId: 'STF-other', firebaseUid: 'uid-other' },
      currentUid: 'uid-me',
      deleteFb: () => { firebaseDeleteCalled = true; },
      deleteStaff: () => { backendDeleteCalled = true; },
      setErrorFn: (m) => { errorMessage = m; },
    });

    expect(errorMessage).toBe('');
    expect(firebaseDeleteCalled).toBe(true);
    expect(backendDeleteCalled).toBe(true);
  });

  it('N.17 — simulator: anon caller (no currentUid) cannot self-block — server still guards', () => {
    // If somehow auth.currentUser is null (race during signOut), client
    // won't false-positive on self-row. But server still has caller.uid
    // check so a real anon REST call would still be 401 anyway.
    let backendDeleteCalled = false;

    function simHandleDelete({ staff, currentUid, deleteStaff: deleteStaffFn }) {
      const hasFbUser = !!staff.firebaseUid;
      if (hasFbUser && currentUid && staff.firebaseUid === currentUid) {
        return;
      }
      deleteStaffFn(staff.staffId);
    }

    simHandleDelete({
      staff: { staffId: 'STF-other', firebaseUid: 'uid-other' },
      currentUid: '', // signed out / race
      deleteStaff: () => { backendDeleteCalled = true; },
    });

    expect(backendDeleteCalled).toBe(true);
    // Note: in production this would still hit the server's verifyAdminToken
    // gate and be rejected with 401 — this is just a unit test of the
    // client-side flow.
  });

  it('N.18 — simulator: staff without firebaseUid (Firestore-only) → no self-block applies', () => {
    let backendDeleteCalled = false;

    function simHandleDelete({ staff, currentUid, deleteStaff: deleteStaffFn }) {
      const hasFbUser = !!staff.firebaseUid;
      if (hasFbUser && currentUid && staff.firebaseUid === currentUid) {
        return;
      }
      deleteStaffFn(staff.staffId);
    }

    simHandleDelete({
      staff: { staffId: 'STF-fs-only', firebaseUid: '' },
      currentUid: 'uid-me',
      deleteStaff: () => { backendDeleteCalled = true; },
    });

    expect(backendDeleteCalled).toBe(true);
  });
});
