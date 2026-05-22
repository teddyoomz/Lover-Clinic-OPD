// tests/v109-office-preview-canonical-path.test.js
//
// V109 (2026-05-23 EOD+1) — REGRESSION LOCK for the canonical Firestore path
// in the officeToPdf Cloud Function + every L2 test script that writes
// staff-chat message fixtures.
//
// Root bug (V109): the Cloud Function read/wrote to bare `be_staff_chat_messages`
// while the client wrote to `artifacts/${APP_ID}/public/data/be_staff_chat_messages`.
// Result: Cloud Function ran successfully + cached the PDF in Storage at the
// correct path, but its Firestore patch landed in a different (empty) collection
// → status stayed 'pending' forever → 60s Path B → ⚠ ⚠ ⚠.
//
// V66 mirror anti-pattern: the L2 verify script + e2e + deploy-verify scripts
// ALL wrote their test fixtures at the SAME wrong bare path → they agreed with
// the function's bug → all reported "verified" while real-prod user uploads
// stuck pending. Classic test-vs-code shared-wrong-assumption.
//
// AV109 (NEW): every Cloud Function and every admin-SDK test fixture that
// touches `be_staff_chat_messages` MUST use the Rule M canonical path.

import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { join, resolve } from 'path';

const ROOT = resolve(process.cwd());
function read(rel) {
  return readFileSync(join(ROOT, rel), 'utf-8');
}

// The canonical Rule M path format. Accepts:
//   - literal: artifacts/loverclinic-opd-4c39b/public/data/be_staff_chat_messages
//   - template var: artifacts/${APP_ID}/public/data/be_staff_chat_messages
//   - template var: artifacts/${projectId}/public/data/be_staff_chat_messages
//   - template var: artifacts/${PROJECT_ID}/public/data/be_staff_chat_messages
const CANONICAL_PATH_PATTERN = /artifacts\/(?:\$\{[A-Za-z_][A-Za-z0-9_]*\}|loverclinic-opd-4c39b)\/public\/data\/be_staff_chat_messages/;

// The FORBIDDEN bare-collection pattern. `db.collection('be_staff_chat_messages')`
// returns the wrong root and silently no-ops on every real-data lookup.
// Note: matches only when the literal string is used WITHOUT canonical prefix.
const BARE_COLLECTION_PATTERN = /db\.collection\(['"`]be_staff_chat_messages['"`]\)|db\.doc\(['"`]be_staff_chat_messages\//;

describe('V109 — canonical Firestore path for be_staff_chat_messages (AV109)', () => {
  describe('Cloud Function (functions/officeToPdf/index.js)', () => {
    const src = read('functions/officeToPdf/index.js');

    it('V109.A1 references the canonical artifacts/${APP_ID}/public/data path', () => {
      expect(src).toMatch(CANONICAL_PATH_PATTERN);
    });

    it('V109.A2 does NOT use the forbidden bare collection name', () => {
      expect(src).not.toMatch(BARE_COLLECTION_PATTERN);
    });

    it('V109.A3 has the V109 fix marker comment for institutional memory', () => {
      expect(src).toMatch(/V109/);
    });

    it('V109.A4 sets MESSAGES_COLLECTION_PATH via the canonical template (NOT bare)', () => {
      // The constant name itself ends with _PATH (not _COLLECTION) to signal
      // a doc-path, not a collection-name. Loose check on the assignment line.
      expect(src).toMatch(/MESSAGES_COLLECTION_PATH\s*=\s*`artifacts\/\$\{[A-Z_]+\}\/public\/data\/be_staff_chat_messages`/);
    });
  });

  describe('L2 verify scripts (test fixtures must use canonical path too)', () => {
    const fixtures = [
      'scripts/diag-office-preview-comprehensive.mjs',
      'scripts/diag-office-preview-deploy-verify.mjs',
      'scripts/e2e-staff-chat-office-preview.mjs',
    ];

    fixtures.forEach((path, i) => {
      const label = `V109.B${i + 1}`;
      it(`${label} ${path} uses canonical Rule M path (no V66 mirror)`, () => {
        const src = read(path);
        expect(src).toMatch(CANONICAL_PATH_PATTERN);
        expect(src).not.toMatch(BARE_COLLECTION_PATTERN);
      });
    });
  });

  describe('Class-of-bug sweep (no bare path anywhere in functions/ or test fixtures)', () => {
    it('V109.C1 functions/officeToPdf has no bare be_staff_chat_messages collection or doc', () => {
      const src = read('functions/officeToPdf/index.js');
      const matches = src.match(BARE_COLLECTION_PATTERN);
      expect(matches).toBeNull();
    });

    it('V109.C2 pre-existing functions/index.js still uses BASE_PATH (sanity)', () => {
      const src = read('functions/index.js');
      expect(src).toMatch(/BASE_PATH\s*=\s*`artifacts\/\$\{APP_ID\}\/public\/data`/);
    });

    it('V109.C3 client backendClient still uses canonical staffChatCol (sanity)', () => {
      const src = read('src/lib/backendClient.js');
      expect(src).toMatch(/artifacts\/\$\{appId\}\/public\/data\/be_staff_chat_messages/);
    });
  });
});
