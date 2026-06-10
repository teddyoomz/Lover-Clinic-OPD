// 2026-05-22 EOD+1 — Chart template persistence rewrite (per-doc + Storage)
// User report: "อัพรูปผ่าน Modal เพิ่ม chart แล้วอยู่ไม่ถาวร — เปิด TFP ใหม่ก็หาย
// + ขอปุ่มล็อคไม่ให้ลบ + เรียงลำดับเก็บใน cache เครื่องนั้นๆ".
//
// Root cause (pre-rewrite): wrote to `pc_chart_templates` (no firestore rule
// → default-deny → silent permission-denied) AND stored inline base64
// dataURLs in one JSON-stringified field (1MB doc-size cap after first real
// upload). Both bugs invisible because `.catch(() => {})` swallowed the error.
//
// Rewrite: per-template DOCS in `be_chart_templates` collection + Firebase
// Storage for image bytes + `locked` field + per-device localStorage sort.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const SRC = fs.readFileSync(
  path.join(process.cwd(), 'src/components/ChartTemplateSelector.jsx'),
  'utf8'
);
const FRULES = fs.readFileSync(path.join(process.cwd(), 'firestore.rules'), 'utf8');
const SRULES = fs.readFileSync(path.join(process.cwd(), 'storage.rules'), 'utf8');

describe('ChartTemplateSelector — persistence rewrite (per-doc + Storage)', () => {
  it('S1.1 canonical path = be_chart_templates (NOT pc_chart_templates — broken pre-fix)', () => {
    expect(SRC).toMatch(/be_chart_templates/);
    // Anti-regression: the broken path must NOT appear as a write target.
    // The broken path used a constant `FIRESTORE_DOC = 'pc_chart_templates'`.
    expect(SRC).not.toMatch(/FIRESTORE_DOC\s*=\s*['"]pc_chart_templates['"]/);
    expect(SRC).not.toMatch(/['"]pc_chart_templates['"]/);
  });

  it('S1.2 per-doc collection write — NOT single-doc JSON.stringify (1MB-cap broken pre-fix)', () => {
    // Pre-fix: setDoc(...managed, { templates: JSON.stringify(list) })
    // Post-fix: setDoc per template id, no JSON.stringify of the whole list.
    expect(SRC).not.toMatch(/JSON\.stringify\s*\(\s*(list|templates|updated)\s*\)/);
    // Must use writeBatch for seed + per-doc setDoc for uploads
    expect(SRC).toMatch(/writeBatch/);
    expect(SRC).toMatch(/setDoc/);
  });

  it('S1.3 Storage upload path = chart-templates/{id}.{ext} (universal — no branchId)', () => {
    expect(SRC).toMatch(/chart-templates\/\$\{id\}\.\$\{ext\}/);
    expect(SRC).toMatch(/uploadBytes/);
    expect(SRC).toMatch(/getDownloadURL/);
    // No branchId in the storage path → universal, matches user
    // "ไม่ต้องเก็บแยกสาขา" requirement.
    const storagePathLine = SRC.match(/chart-templates\/[^`'";\n]+/g) || [];
    storagePathLine.forEach(line => {
      expect(line).not.toMatch(/branchId|branch_id|selectedBranch/);
    });
  });

  it('S1.4 NO silent error swallow on writes (was .catch(() => {}))', () => {
    // Pre-fix: setDoc(...).catch(() => {}) — bug invisible.
    // Post-fix: errors logged via debugLog + visible to user via alert.
    expect(SRC).not.toMatch(/setDoc\([^)]*\)[\s\S]{0,200}\.catch\(\(\) => \{\s*\}\)/);
    expect(SRC).toMatch(/debugLog/);
    expect(SRC).toMatch(/alert\(/);
  });

  it('S2.1 lock field on every template doc', () => {
    expect(SRC).toMatch(/locked:\s*true/);  // built-ins default-locked
    expect(SRC).toMatch(/locked:\s*false/); // uploads default-unlocked
    expect(SRC).toMatch(/toggleLock/);
  });

  it('S2.2 lock UI — Lock + Unlock icons + dedicated test-id', () => {
    expect(SRC).toMatch(/import\s*\{[^}]*Lock[^}]*Unlock[^}]*\}\s*from\s*['"]lucide-react['"]/);
    expect(SRC).toMatch(/data-testid="chart-template-lock-btn"/);
    expect(SRC).toMatch(/data-testid="chart-template-lock-badge"/);
  });

  it('S2.3 delete blocked when locked (button disabled + alert on click)', () => {
    // The deleteTemplate function must check tmpl.locked and refuse.
    expect(SRC).toMatch(/if\s*\(\s*tmpl\.locked\s*\)/);
    // The delete button must have disabled binding on locked.
    expect(SRC).toMatch(/disabled=\{tmpl\.locked\s*\|\|\s*busy\}/);
    // Confirm dialog on UNlocked delete prevents one-click wipe.
    expect(SRC).toMatch(/window\.confirm\(/);
  });

  it('S2.4 built-ins seeded locked=true so they cannot be one-clicked away', () => {
    // seedDefaults batch.set must write locked:true for built-ins.
    expect(SRC).toMatch(/seedDefaults[\s\S]{0,1500}locked:\s*true/);
  });

  it('S3.1 per-device sort uses localStorage (NOT Firestore)', () => {
    expect(SRC).toMatch(/localStorage/);
    expect(SRC).toMatch(/lover-chart-template-order-v1/);
    // moveTemplate must NOT call setDoc/updateDoc — it's local-only.
    const moveBody = SRC.match(/function moveTemplate[\s\S]*?\n  \}/);
    expect(moveBody).toBeTruthy();
    expect(moveBody[0]).not.toMatch(/setDoc|updateDoc|writeBatch/);
    expect(moveBody[0]).toMatch(/writeLocalOrder/);
  });

  it('S3.2 sort helper survives unknown ids (new uploads fall to bottom)', () => {
    expect(SRC).toMatch(/applyLocalOrder/);
    // Must handle ids not in the localStorage list (Infinity sentinel +
    // _sortFallback for stable secondary sort).
    expect(SRC).toMatch(/Infinity/);
    expect(SRC).toMatch(/_sortFallback/);
  });

  it('S3.3 reorder write is debug-safe — no Firestore mutation, no shared state drift', () => {
    expect(SRC).toMatch(/writeLocalOrder/);
    // localStorage write helper exists + handles invalid JSON gracefully.
    expect(SRC).toMatch(/function readLocalOrder/);
    expect(SRC).toMatch(/function writeLocalOrder/);
  });

  it('R1 firestore.rules has be_chart_templates block (writes were silent-denied pre-fix)', () => {
    expect(FRULES).toMatch(/match \/be_chart_templates\/\{templateId\}/);
    // Patients reach via TFP — read on isSignedIn (incl. anon-auth patients).
    // WS1 (2026-06-10) — window widened 200 -> 700 to accommodate the WS1 M2
    // doc-comment block explaining why be_chart_templates KEEPS signed-in read
    // (ChartTemplateSelector lists it; low-PII residual). Behavior unchanged:
    // read = isSignedIn(), write = isClinicStaff() — the assertions still lock that.
    expect(FRULES).toMatch(/match \/be_chart_templates[\s\S]{0,700}allow read:\s*if isSignedIn\(\)/);
    expect(FRULES).toMatch(/match \/be_chart_templates[\s\S]{0,700}allow write:\s*if isClinicStaff\(\)/);
  });

  it('R2 storage.rules has chart-templates/{file=**} block (image-only, 10MB, staff-write)', () => {
    expect(SRULES).toMatch(/match \/chart-templates\/\{file=\*\*\}/);
    expect(SRULES).toMatch(/match \/chart-templates[\s\S]{0,500}allow read:\s*if request\.auth != null/);
    expect(SRULES).toMatch(/match \/chart-templates[\s\S]{0,500}isClinicStaff\(\)/);
    expect(SRULES).toMatch(/match \/chart-templates[\s\S]{0,500}10 \* 1024 \* 1024/);
    expect(SRULES).toMatch(/match \/chart-templates[\s\S]{0,500}contentType\.matches\('image\/\.\*'\)/);
  });

  it('R3 default-deny remains intact (no new permissive holes)', () => {
    expect(SRULES).toMatch(/match \/\{allPaths=\*\*\}[\s\S]{0,100}allow read, write:\s*if false/);
    expect(FRULES).toMatch(/match \/\{document=\*\*\}[\s\S]{0,100}allow read, write:\s*if false/);
  });
});
