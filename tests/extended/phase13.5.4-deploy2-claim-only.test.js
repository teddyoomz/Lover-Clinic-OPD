// ─── Phase 13.5.4 Deploy 2 (V26) — firestore.rules isClinicStaff() claim-only ─
//
// Locks the rule shape after Deploy 2 — `isClinicStaff()` helper checks
// Firebase Auth custom claims (admin OR isClinicStaff) instead of email
// regex. Closes the security gap where any @loverclinic.com email user
// could bypass Phase 13.5.1-3 soft-gate via direct Firestore SDK access.
//
// Test pairing (V21 lesson — source-grep + runtime):
// - Source-grep below locks the rule shape.
// - Rule B post-deploy probes (opd_sessions anon-update) verify the V23
//   whitelist path still works (isSignedIn() AND hasOnly).
// - Negative-path verification (anon user reads be_customers → 403)
//   captured manually post-deploy.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const RULES = READ('firestore.rules');

describe('Phase 13.5.4 Deploy 2 (V26) — firestore.rules isClinicStaff() claim-only', () => {

  describe('D1: isClinicStaff() helper checks custom claims, NOT email', () => {
    it('D1.1: isClinicStaff() helper exists', () => {
      expect(RULES).toMatch(/function\s+isClinicStaff\s*\(\s*\)\s*\{/);
    });

    it('D1.2: helper checks request.auth.token.isClinicStaff custom claim', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      expect(fn).toBeTruthy();
      expect(fn[0]).toMatch(/request\.auth\.token\.isClinicStaff\s*==\s*true/);
    });

    it('D1.3: helper checks request.auth.token.admin custom claim (defense-in-depth)', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      expect(fn[0]).toMatch(/request\.auth\.token\.admin\s*==\s*true/);
    });

    it('D1.4: helper REQUIRES isSignedIn() (anon users without claims fail)', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      expect(fn[0]).toMatch(/isSignedIn\(\)\s*&&/);
    });

    it('D1.5: ANTI-REGRESSION — email regex check REMOVED from helper body', () => {
      // The legacy email-regex must NOT remain in the helper body. Comments
      // are allowed (institutional memory). Strip comments before checking.
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      const noCommentBody = fn[0]
        .split('\n')
        .filter((line) => !line.trim().startsWith('//'))
        .join('\n');
      expect(noCommentBody).not.toMatch(/\.matches\(['"`]\.\*@loverclinic/);
      expect(noCommentBody).not.toMatch(/request\.auth\.token\.email/);
    });

    it('D1.6: helper has either OR (||) joining the two claim checks', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      expect(fn[0]).toMatch(/isClinicStaff\s*==\s*true[\s\S]*?\|\|[\s\S]*?admin\s*==\s*true/);
    });
  });

  describe('D2: V23 opd_sessions anon-update path still works (regression)', () => {
    it('D2.1: opd_sessions update rule still has isClinicStaff() OR isSignedIn() branches', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block).toBeTruthy();
      const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
      expect(updateMatch[0]).toMatch(/isClinicStaff\(\)/);
      expect(updateMatch[0]).toMatch(/isSignedIn\(\)/);
      expect(updateMatch[0]).toMatch(/affectedKeys\(\)[\s\S]{0,40}\.hasOnly\(/);
    });

    it('D2.2: opd_sessions create + delete + get/list rules (WS1 C1 split)', () => {
      // 2026-07-19 repoint: WS1 C1 (2026-06-10) split `allow read` into
      // get (isSignedIn — anon get-by-crypto-id) + list (isClinicStaff —
      // kills anon mass-PII enumeration).
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block[0]).toMatch(/allow\s+get:\s*if\s+isSignedIn\(\)/);
      expect(block[0]).toMatch(/allow\s+list:\s*if\s+isClinicStaff\(\)/);
      expect(block[0]).toMatch(/allow\s+create:\s*if\s+true/);
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+isClinicStaff\(\)/);
    });
  });

  describe('D3: V26 entry + comment trail in rules + V-entry log', () => {
    it('D3.1: rules file has V26 marker comment in isClinicStaff()', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      expect(fn[0]).toMatch(/V26/);
      expect(fn[0]).toMatch(/Phase\s+13\.5\.4\s+Deploy\s+2/);
    });

    it('D3.2: comment trail explains migration prerequisites', () => {
      const fn = RULES.match(/function\s+isClinicStaff[\s\S]*?\n\s+\}/);
      // Should reference setPermission OR bootstrap-self OR migration button
      expect(fn[0]).toMatch(/setPermission|bootstrap-self|Sync ทุก staff/);
    });

    it('D3.3: V26 entry lives in the v-log archive (compact table in 00-session-start)', () => {
      // 2026-07-19 repoint: the V-log was compacted — verbose `### V26` entries
      // moved to .claude/rules/v-log-archive.md; 00-session-start.md keeps a
      // one-line table row.
      const ARCHIVE = READ('.claude/rules/v-log-archive.md');
      expect(ARCHIVE).toMatch(/^### V26 —/m);
      expect(ARCHIVE).toMatch(/Phase 13\.5\.4 Deploy 2/);
      const RULE_00 = READ('.claude/rules/00-session-start.md');
      expect(RULE_00).toMatch(/\|\s*V26\s*\|/);
    });
  });

  describe('D4: successor contracts for the old anon-write paths', () => {
    it('D4.1: chat_conversations create/update tightened to isClinicStaff (WS1 H1)', () => {
      // 2026-07-19 repoint: WS1 H1 (2026-06-10) — webhooks now write via the
      // firebase-admin SDK (bypasses rules), so the anon `if true` was
      // tightened to isClinicStaff(). A `if true` here would be a REGRESSION.
      const block = RULES.match(/match\s+\/chat_conversations\/\{convId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/allow\s+create,\s*update:\s*if\s+isClinicStaff\(\)/);
      expect(block[0]).not.toMatch(/allow\s+create,\s*update:\s*if\s+true/);
    });

    // 2026-07-19: D4.2 (pc_appointments `if true`) + D4.3
    // (clinic_settings/proclinic_session* open for cookie-relay) DELETED —
    // the pc_* mirrors + proclinic_session docs + cookie-relay extension were
    // all removed by the V50 ProClinic strip; their rule blocks were dropped
    // in V50-followup (default-deny is the intended state now).
    it('D4.2: pc_* + proclinic_session rule blocks are GONE (V50 default-deny)', () => {
      expect(RULES).not.toMatch(/match\s+\/pc_appointments\//);
      expect(RULES).not.toMatch(/match\s+\/clinic_settings\/proclinic_session/);
    });
  });
});
