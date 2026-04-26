// ─── V23 — opd_sessions anon-patient-update rule + writer↔rule contract ────
//
// Bug 2026-04-26 (verbatim user report): "ตอนนี้กดส่งข้อมูลคนไข้ผ่านลิ้งหรือ
// QR code แล้วขึ้นผิดพลาดตลอดส่งไม่ได้" + "กรอก patientform แล้วกดส่งแล้ว
// ผิดพลาด เกิดอะไรขึ้น ทำไมไม่เทสและทดสอบให้ผ่าน หลุดไปได้ยังไง" + "ดูที่อื่น
// ที่หน้าจะพังเหมือนกันนี้ หรือคล้ายๆกันมาด้วย" + "เช็คให้หมดทั้ง frontend แบบ
// 100% จริงๆ ว่าจะไม่มีบั๊คแบบนี้หรือใกล้เคียงกับแบบนี้อีกแล้ว".
//
// Root cause: firestore.rules opd_sessions had `allow update: if isClinicStaff()`
// since INITIAL commit (`554506b`, 2026-03-23). Patients reach the form via
// `signInAnonymously` (App.jsx:89) — anon users have no `@loverclinic.com`
// email → `isClinicStaff()` returns false → PERMISSION_DENIED → catch shows
// alert. Plus 2 silent-fail course-refresh writes on PatientDashboard.
//
// Fix: narrow `allow update` to `isClinicStaff()` OR (isSignedIn() AND
// `affectedKeys().hasOnly([11-field whitelist])`). Mirrors V19 pattern.
//
// This test bank is the source-grep regression guard. Per Rule I + V21:
// pair source-grep with runtime (e2e fill+submit + preview_eval).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const RULES = READ('firestore.rules');
const PATIENT_FORM = READ('src/pages/PatientForm.jsx');
const PATIENT_DASHBOARD = READ('src/pages/PatientDashboard.jsx');
const RULE_01 = READ('.claude/rules/01-iron-clad.md');
const RULE_00 = READ('.claude/rules/00-session-start.md');
const HANDOFF = READ('SESSION_HANDOFF.md');

// The 11 fields anon clients legitimately write. Keep this list in lockstep
// with the rule + the writers — adding a new one in the writer requires
// adding it here AND to the rule.
const WHITELIST = [
  'status', 'patientData', 'submittedAt', 'updatedAt', 'isUnread',
  'lastCoursesAutoFetch', 'coursesRefreshRequest',
  'brokerStatus', 'brokerError', 'brokerJob', 'latestCourses',
];

// Fields that MUST stay staff-only — adding any of these to the whitelist
// = security regression. Probed by A4 group.
const STAFF_ONLY_FIELDS = [
  'isArchived', 'formType', 'sessionName', 'customTemplate', 'createdAt',
  'brokerProClinicId', 'patientLinkToken',
];

describe('V23 — opd_sessions anon-patient-update rule (source-grep)', () => {

  describe('A1: opd_sessions rule shape', () => {
    it('A1.1: opd_sessions block exists in firestore.rules', () => {
      expect(RULES).toMatch(/match\s+\/opd_sessions\/\{sessionId\}\s*\{/);
    });

    it('A1.2: allow create: if true preserved (anon can create new sessions)', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/allow\s+create:\s*if\s+true/);
    });

    it('A1.3: allow delete: if isClinicStaff() preserved + V27-tris anon test-probe self-cleanup', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      // Staff path preserved
      expect(block[0]).toMatch(/allow\s+delete:\s*if\s+isClinicStaff\(\)/);
      // V27-tris: anon can self-delete docs whose ID starts with test-probe-anon-
      expect(block[0]).toMatch(/sessionId\.matches\(['"]\^test-probe-anon-/);
      expect(block[0]).toMatch(/isSignedIn\(\)\s*&&\s*sessionId\.matches/);
    });

    it('A1.3-bis: V27-tris anon-delete is restricted to test-probe-anon prefix (cannot delete real session IDs)', () => {
      // Real session ID prefixes: DEP-, QR-, IMP- — they MUST NOT match
      // the anon-delete branch. The regex `^test-probe-anon-.*$` must
      // not be relaxed to something like `^.*-anon-` etc.
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      // The regex MUST start with `^test-probe-anon-` (not just contain it)
      expect(block[0]).toMatch(/sessionId\.matches\(['"]\^test-probe-anon-/);
      // Must NOT have an over-permissive variant
      expect(block[0]).not.toMatch(/sessionId\.matches\(['"]\.\*['"]/);
      expect(block[0]).not.toMatch(/sessionId\.matches\(['"]\^DEP-/);
    });

    it('A1.4: update rule has staff path (isClinicStaff)', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
      expect(updateMatch).toBeTruthy();
      expect(updateMatch[0]).toMatch(/isClinicStaff\(\)/);
    });

    it('A1.5: update rule has anon-auth path (isSignedIn + affectedKeys hasOnly)', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
      expect(updateMatch[0]).toMatch(/isSignedIn\(\)/);
      // affectedKeys() and .hasOnly( may be on different lines (formatted rule)
      expect(updateMatch[0]).toMatch(/affectedKeys\(\)[\s\S]{0,40}\.hasOnly\(/);
      expect(updateMatch[0]).toMatch(/diff\(resource\.data\)/);
    });

    it('A1.6: whitelist contains ALL 11 fields verbatim', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
      const ruleStr = updateMatch[0];
      for (const field of WHITELIST) {
        expect(ruleStr.includes(`'${field}'`),
          `whitelist must include '${field}'`).toBe(true);
      }
    });
  });

  describe('A2: writer ↔ rule whitelist contract', () => {
    it('A2.1: PatientForm.jsx handleSubmit updateDoc payload keys are all in whitelist', () => {
      // PatientForm.jsx:372 writes: status, patientData, submittedAt|updatedAt, isUnread
      const handleSubmitArea = PATIENT_FORM.match(/await\s+updateDoc\([\s\S]*?\}\)/);
      expect(handleSubmitArea, 'PatientForm handleSubmit updateDoc not found').toBeTruthy();
      const payload = handleSubmitArea[0];
      // Extract field names that appear before colons in the payload object
      const fieldMatches = [...payload.matchAll(/(\w+)\s*:/g)];
      const keys = fieldMatches.map(m => m[1]).filter(k =>
        // Filter out method-call-like patterns (e.g. doc(), serverTimestamp())
        !['doc', 'updateDoc', 'serverTimestamp'].includes(k)
      );
      // PatientForm uses computed keys — `[isEditing ? 'updatedAt' : 'submittedAt']`
      // — so we additionally accept the literal token names in the source.
      const hasComputedKey = payload.includes("'updatedAt'") || payload.includes("'submittedAt'");
      expect(hasComputedKey).toBe(true);
      // Plain keys present
      const expectedPlainKeys = ['status', 'patientData', 'isUnread'];
      for (const k of expectedPlainKeys) {
        expect(keys.includes(k), `PatientForm payload should write '${k}'`).toBe(true);
        expect(WHITELIST.includes(k), `whitelist must contain '${k}'`).toBe(true);
      }
    });

    it('A2.2: PatientDashboard.jsx fire-and-forget updateDoc keys in whitelist (line ~403)', () => {
      // Line 403: updateDoc(ref, { lastCoursesAutoFetch, coursesRefreshRequest }).catch(...)
      const fireForget = PATIENT_DASHBOARD.match(/updateDoc\(ref,\s*\{[^}]*lastCoursesAutoFetch[^}]*\}\)\.catch/);
      expect(fireForget, 'PatientDashboard fire-and-forget updateDoc not found').toBeTruthy();
      const payload = fireForget[0];
      expect(payload).toMatch(/lastCoursesAutoFetch/);
      expect(payload).toMatch(/coursesRefreshRequest/);
      expect(WHITELIST.includes('lastCoursesAutoFetch')).toBe(true);
      expect(WHITELIST.includes('coursesRefreshRequest')).toBe(true);
    });

    it('A2.3: PatientDashboard.jsx awaited updateDoc keys in whitelist (line ~410)', () => {
      // Line 410-417: await updateDoc(ref, { brokerStatus, brokerError, brokerJob, latestCourses })
      const awaited = PATIENT_DASHBOARD.match(/await\s+updateDoc\(ref,\s*\{[\s\S]*?brokerStatus[\s\S]*?\}\)/);
      expect(awaited, 'PatientDashboard awaited updateDoc not found').toBeTruthy();
      const payload = awaited[0];
      const expectedKeys = ['brokerStatus', 'brokerError', 'brokerJob', 'latestCourses'];
      for (const k of expectedKeys) {
        expect(payload.includes(k), `PatientDashboard awaited payload should write '${k}'`).toBe(true);
        expect(WHITELIST.includes(k), `whitelist must contain '${k}'`).toBe(true);
      }
    });

    it('A2.4: regression guard — no NEW updateDoc target on opd_sessions outside known sites', () => {
      // Anon-reachable files. Any updateDoc hit on opd_sessions outside the
      // 3 known sites (PatientForm:372, PatientDashboard:403, PatientDashboard:410)
      // requires this test to be updated AND the rule whitelist reviewed.
      const KNOWN_FILES = ['src/pages/PatientForm.jsx', 'src/pages/PatientDashboard.jsx'];
      // Other anon-reachable file
      const ALSO_CHECK = ['src/pages/ClinicSchedule.jsx'];
      for (const f of [...KNOWN_FILES, ...ALSO_CHECK]) {
        const src = READ(f);
        const updateDocCount = (src.match(/updateDoc\s*\(/g) || []).length;
        // PatientForm = 1 (line 372)
        // PatientDashboard = 2 (lines 403 + 410)
        // ClinicSchedule = 0 (read-only)
        const expected = {
          'src/pages/PatientForm.jsx': 1,
          'src/pages/PatientDashboard.jsx': 2,
          'src/pages/ClinicSchedule.jsx': 0,
        }[f];
        expect(updateDocCount, `${f} should have ${expected} updateDoc calls (V23 sweep)`).toBe(expected);
      }
    });
  });

  describe('A3: Rule B probe-list extension (5 endpoints)', () => {
    it('A3.1: Rule B in 01-iron-clad.md lists opd_sessions as a probe endpoint', () => {
      expect(RULE_01).toMatch(/opd_sessions/);
      expect(RULE_01).toMatch(/V23/);
    });

    it('A3.2: Rule B documents the 5th probe with anon-auth flow', () => {
      // The 5th probe needs an ANON_TOKEN via identitytoolkit signUp
      expect(RULE_01).toMatch(/identitytoolkit/);
      expect(RULE_01).toMatch(/signUp\?key=\$FIREBASE_API_KEY/);
      expect(RULE_01).toMatch(/Authorization:\s*Bearer\s*\$ANON_TOKEN/);
    });

    it('A3.3: V1 + V9 + V23 anti-examples enumerated', () => {
      expect(RULE_01).toMatch(/V1\s*\+\s*V9\s*\+\s*V23\s+anti-examples/);
    });
  });

  describe('A4: forbidden-field bypass guards (security)', () => {
    // The rule whitelist must NOT include any of these — staff-only fields
    for (const field of STAFF_ONLY_FIELDS) {
      it(`A4.${field}: staff-only field '${field}' must NOT appear in opd_sessions update whitelist`, () => {
        const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
        const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
        const ruleStr = updateMatch[0];
        // The hasOnly() whitelist line must NOT contain the staff-only field
        const whitelistLine = ruleStr.match(/hasOnly\(\[([\s\S]*?)\]\)/);
        expect(whitelistLine, 'hasOnly whitelist not found in rule').toBeTruthy();
        expect(whitelistLine[1].includes(`'${field}'`),
          `hasOnly whitelist must NOT include '${field}' (staff-only)`).toBe(false);
      });
    }

    it('A4.proto: __proto__ and constructor not allowed via prototype pollution', () => {
      const block = RULES.match(/match\s+\/opd_sessions\/\{sessionId\}\s*\{[\s\S]*?\n\s+\}/);
      const updateMatch = block[0].match(/allow\s+update:[\s\S]*?(?=allow\s+(?:delete|read|create|write)|\n\s+\})/);
      const ruleStr = updateMatch[0];
      expect(ruleStr.includes("'__proto__'")).toBe(false);
      expect(ruleStr.includes("'constructor'")).toBe(false);
      expect(ruleStr.includes("'prototype'")).toBe(false);
    });
  });

  describe('A5: V-entry + handoff updated', () => {
    // Helper: extract the V23 section. Use index-based slice instead of a
    // single regex with lookahead — the multiline `$` lookahead in earlier
    // iterations stopped at the first end-of-line.
    function getV23Section() {
      const startMatch = RULE_00.match(/^### V23 —/m);
      if (!startMatch) return null;
      const start = startMatch.index;
      // End at the next V-entry header OR the next `\n---\n` separator
      const tail = RULE_00.slice(start + 10);
      const nextHeaderRel = tail.search(/\n### V\d/);
      const nextSepRel = tail.search(/\n---\n/);
      const candidates = [nextHeaderRel, nextSepRel].filter((i) => i >= 0);
      const endRel = candidates.length ? Math.min(...candidates) : tail.length;
      return RULE_00.slice(start, start + 10 + endRel);
    }

    it('A5.1: 00-session-start.md contains V23 entry with the user verbatim quote', () => {
      expect(RULE_00).toMatch(/^### V23 —/m);
      expect(RULE_00).toMatch(/ตอนนี้กดส่งข้อมูลคนไข้ผ่านลิ้ง/);
    });

    it('A5.2: 00-session-start.md V23 entry references the 11-field whitelist', () => {
      const section = getV23Section();
      expect(section, 'V23 section not extractable').toBeTruthy();
      expect(section).toMatch(/11[\s\S]{0,30}field/i);
    });

    it('A5.3: 00-session-start.md V23 lists 3 anon-reachable Firestore write sites', () => {
      const section = getV23Section();
      expect(section).toMatch(/PatientForm\.jsx:372/);
      expect(section).toMatch(/PatientDashboard\.jsx:403/);
      expect(section).toMatch(/PatientDashboard\.jsx:410/);
    });
  });
});
