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

const ROOT = path.resolve(__dirname, '..');
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

    it('D2.2: opd_sessions create + delete + read rules unchanged', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block[0]).toMatch(/allow\s+read:\s*if\s+isSignedIn\(\)/);
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

    it('D3.3: 00-session-start.md contains V26 entry', () => {
      const RULE_00 = READ('.claude/rules/00-session-start.md');
      expect(RULE_00).toMatch(/^### V26 —/m);
      expect(RULE_00).toMatch(/Phase 13\.5\.4 Deploy 2/);
    });
  });

  describe('D4: chat_conversations + pc_* + opd_sessions anon paths still work', () => {
    // These rules use `if true` (chat_conversations + pc_*) or hasOnly path
    // (opd_sessions whitelist) — they do NOT depend on isClinicStaff().
    // The V26 change should not affect them. This test validates that
    // assumption by asserting the rules still match expected patterns.
    it('D4.1: chat_conversations create/update still `if true`', () => {
      const block = RULES.match(/match\s+\/chat_conversations\/\{convId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/allow\s+create,\s*update:\s*if\s+true/);
    });

    it('D4.2: pc_appointments write still `if true`', () => {
      const block = RULES.match(/match\s+\/pc_appointments\/\{docId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/allow\s+write:\s*if\s+true/);
    });

    it('D4.3: clinic_settings/proclinic_session* still open for cookie-relay', () => {
      expect(RULES).toMatch(/match\s+\/clinic_settings\/proclinic_session\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+true/);
      expect(RULES).toMatch(/match\s+\/clinic_settings\/proclinic_session_trial\s*\{[\s\S]*?allow\s+read,\s*write:\s*if\s+true/);
    });
  });
});
