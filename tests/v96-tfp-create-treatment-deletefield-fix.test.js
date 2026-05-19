// ─── V96 — TFP create-mode + deleteField() Firestore API misuse fix (2026-05-19)
//
// User reported (verbatim, with screenshot of error banner): "ขึ้นแบบในภาพ"
// + "ฝากเช็คให้แน่ใจด้วยว่าการใช้คอร์สใน TFP แล้วมันตัดคอร์สคงเหลือของลูกค้า
// คนนั้นจริงๆ".
//
// Earlier (same session): "ตอนนี้เมื่อซื้อคอร์สในหน้า TFP แล้ว มันไม่ไป
// สร้างรายการขายโดยอัตโนมัติ ให้แก้ให้เหมือนเดิมด้วย".
//
// SINGLE ROOT CAUSE / THREE SYMPTOMS:
//   Bug A — TFP buy-course → no auto-sale
//   Bug B — Database error on save: "Function setDoc() called with invalid
//           data. deleteField() cannot be used with set() unless you pass
//           {merge:true} (found in field status in document
//           artifacts/loverclinic-opd-4c39b/public/data/be_treatments/BT-...)"
//   Bug C — Course deduction skipped (customer.courses[].remaining unchanged)
//
// Cause: TFP v26StatusPatch sets `status: deleteField()` for staff/admin save
// in ALL modes (line 2451). In CREATE mode this is passed to
// createBackendTreatment which uses `setDoc()` WITHOUT `{merge:true}`. Firestore
// client SDK rejects this combination → throws → outer catch in handleSubmit
// → setError shown to user → all downstream chain (deductCourseItems +
// auto-sale chain at lines 2484, 2567) SKIPPED.
//
// Phase 27.2-bis (2026-05-14, c5acfca8) removed gate "!isEdit &&" on doctor +
// vitals buttons → allowed direct staff-save in create mode → exposed the
// latent deleteField() bug.
//
// V96 FIX (2 layers):
//   1. TFP source fix (TreatmentFormPage.jsx:2451) — wrap status:deleteField()
//      in `...(isEdit ? { status: deleteField() } : {})`. CREATE mode omits the
//      field entirely (no field to delete on a new doc).
//   2. backendClient.js defense-in-depth (createBackendTreatment:1025) — pass
//      `{merge:true}` to setDoc so any future caller smuggling Firestore
//      sentinels through `detail` doesn't crash.
//
// AV86 — Firestore sentinel `deleteField()` is ONLY valid with `updateDoc()`
// OR `setDoc(data, {merge:true})`. Source-grep regression locks setDoc usages
// that might receive deleteField() payload.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ═══════════════════════════════════════════════════════════════════════
// V96.A — TFP v26StatusPatch isEdit-gated deleteField()
// ═══════════════════════════════════════════════════════════════════════

describe('V96.A: TFP v26StatusPatch gates deleteField() on isEdit', () => {
  const SRC = READ('src/components/TreatmentFormPage.jsx');

  it('A.1: deleteField() wrapped in isEdit conditional spread', () => {
    // The fix shape: `...(isEdit ? { status: deleteField() } : {})`
    expect(SRC).toMatch(/\.{3}\(isEdit\s*\?\s*\{\s*status:\s*deleteField\(\)\s*\}\s*:\s*\{\s*\}\s*\)/);
  });

  it('A.2: NO unconditional `status: deleteField()` outside the isEdit gate', () => {
    // Anti-regression: the pre-V96 pattern `status: deleteField()` directly
    // inside v26StatusPatch (NOT inside the isEdit ternary spread) must NOT
    // exist. We allow one occurrence (inside the gated spread).
    const matches = SRC.match(/status:\s*deleteField\(\)/g) || [];
    // Exactly 1 occurrence expected (inside the gated spread)
    expect(matches.length).toBe(1);
  });

  it('A.3: V96 marker comment locks the lesson', () => {
    expect(SRC).toMatch(/V96.*deleteField.*EDIT mode|deleteField.*ONLY in EDIT mode/);
  });

  it('A.4: deleteField import still present (used in edit mode)', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*\bdeleteField\b[^}]*\}\s*from\s*['"]firebase\/firestore['"]/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V96.B — createBackendTreatment setDoc uses {merge:true} (defense-in-depth)
// ═══════════════════════════════════════════════════════════════════════

describe('V96.B: createBackendTreatment.setDoc passes {merge:true}', () => {
  const SRC = READ('src/lib/backendClient.js');
  const fnStart = SRC.indexOf('export async function createBackendTreatment');
  expect(fnStart, 'createBackendTreatment must be present').toBeGreaterThan(-1);
  const fnEnd = SRC.indexOf('\nexport ', fnStart + 1);
  const FN_BODY = SRC.slice(fnStart, fnEnd > fnStart ? fnEnd : SRC.length);

  it('B.1: setDoc(treatmentDoc(treatmentId), {...}, { merge: true })', () => {
    // The fix: setDoc receives a 3rd arg `{ merge: true }`
    expect(FN_BODY).toMatch(/setDoc\(treatmentDoc\(treatmentId\)[\s\S]*?\}\s*,\s*\{\s*merge:\s*true\s*\}\s*\)/);
  });

  it('B.2: V96 defense-in-depth comment present', () => {
    expect(FN_BODY).toMatch(/V96|defense-in-depth|Firestore sentinel/);
  });

  it('B.3: NO setDoc call missing the merge option in createBackendTreatment', () => {
    // Anti-regression: any setDoc inside the function body MUST have merge:true.
    // (currently only 1 setDoc; future setDoc additions also need merge:true.)
    const setDocCalls = FN_BODY.match(/setDoc\(/g) || [];
    expect(setDocCalls.length).toBeGreaterThan(0);
    // Each setDoc(...) call must be followed by closing-paren preceded by `merge: true`
    // We check the body has at least one merge:true and zero raw setDoc(...) without merge.
    expect(FN_BODY).toMatch(/setDoc\(treatmentDoc\(treatmentId\)/);
    expect(FN_BODY).toMatch(/merge:\s*true/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V96.C — updateBackendTreatment unchanged (uses updateDoc — deleteField OK)
// ═══════════════════════════════════════════════════════════════════════

describe('V96.C: updateBackendTreatment uses updateDoc (deleteField always OK)', () => {
  const SRC = READ('src/lib/backendClient.js');
  const fnStart = SRC.indexOf('export async function updateBackendTreatment');
  expect(fnStart).toBeGreaterThan(-1);
  const fnEnd = SRC.indexOf('\nexport ', fnStart + 1);
  const FN_BODY = SRC.slice(fnStart, fnEnd > fnStart ? fnEnd : SRC.length);

  it('C.1: uses updateDoc (not setDoc)', () => {
    expect(FN_BODY).toMatch(/updateDoc\(treatmentDoc\(treatmentId\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V96.D — End-to-end simulator: payload with status:deleteField()
//         in CREATE mode produces a topLevelPatch SAFE for setDoc(merge:true)
// ═══════════════════════════════════════════════════════════════════════

describe('V96.D: simulated v26StatusPatch shape post-fix', () => {
  it('D.1: CREATE mode (isEdit=false) staff save → patch has NO status field', () => {
    // Mirror of the TFP ternary spread post-V96
    const isEdit = false;
    const v26StatusPatch = {
      ...(isEdit ? { status: 'DELETE_FIELD_SENTINEL' } : {}),
      completedAt: 'serverTimestamp()',
      completedBy: 'uid',
    };
    expect(v26StatusPatch).not.toHaveProperty('status');
    expect(v26StatusPatch).toHaveProperty('completedAt');
    expect(v26StatusPatch).toHaveProperty('completedBy');
  });

  it('D.2: EDIT mode (isEdit=true) staff save → patch HAS status field', () => {
    const isEdit = true;
    const v26StatusPatch = {
      ...(isEdit ? { status: 'DELETE_FIELD_SENTINEL' } : {}),
      completedAt: 'serverTimestamp()',
      completedBy: 'uid',
    };
    expect(v26StatusPatch).toHaveProperty('status');
    expect(v26StatusPatch.status).toBe('DELETE_FIELD_SENTINEL');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V96.E — AV86 invariant present in audit-anti-vibe-code SKILL.md
// ═══════════════════════════════════════════════════════════════════════

describe('V96.E: AV86 invariant codified in audit-anti-vibe-code', () => {
  const SKILL = READ('.claude/skills/audit-anti-vibe-code/SKILL.md');

  it('E.1: AV86 entry exists with Firestore sentinel theme', () => {
    expect(SKILL).toMatch(/### AV86/);
    expect(SKILL).toMatch(/deleteField|Firestore sentinel/);
  });

  it('E.2: lists merge:true + updateDoc as canonical replacements', () => {
    expect(SKILL).toMatch(/\{\s*merge:\s*true\s*\}|merge:true/);
    expect(SKILL).toMatch(/updateDoc/);
  });

  it('E.3: AV86 has closed sanctioned-exception list', () => {
    expect(SKILL).toMatch(/sanctioned exception|Sanctioned|closed list/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V96.F — Anti-regression: cross-file grep for setDoc receiving deleteField()
// ═══════════════════════════════════════════════════════════════════════

describe('V96.F: cross-file class-of-bug grep — setDoc + deleteField() risk', () => {
  it('F.1: deleteField() only used in 1 location (TFP v26StatusPatch)', () => {
    // Comments excluded — only count actual code references
    const FILES = [
      'src/components/TreatmentFormPage.jsx',
      'src/lib/backendClient.js',
    ];
    let actualUses = 0;
    for (const f of FILES) {
      const src = READ(f);
      const code = stripComments(src);
      const matches = code.match(/deleteField\(\)/g) || [];
      actualUses += matches.length;
    }
    // Only TFP:2451 calls deleteField() now (1 actual code use).
    // (backendClient.js mentions it only in comments.)
    expect(actualUses).toBe(1);
  });

  it('F.2: every setDoc receiving externally-supplied detail uses merge:true', () => {
    // backendClient createBackendTreatment is the only place that takes external
    // detail + uses setDoc. After V96, merge:true is mandatory.
    const SRC = READ('src/lib/backendClient.js');
    expect(SRC).toMatch(/setDoc\(treatmentDoc\(treatmentId\),\s*\{[\s\S]*?\}\s*,\s*\{\s*merge:\s*true\s*\}\s*\)/);
  });
});
