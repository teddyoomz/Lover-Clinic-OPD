// tests/v57-exam-room-kind.test.js
// V57 / AV30 (2026-05-08) — Exam room kind field schema completion.
//
// Phase 18.0 introduced be_exam_rooms but examRoomValidation.js never
// declared the `kind` field. V55 mapper + V56 modal/panel/handleGenScheduleLink
// all filtered `r.kind === 'doctor'` and silently excluded rooms with
// missing kind. Diagnostic (preview_eval 2026-05-08) confirmed all 6
// prod rooms had `kind: undefined`.
//
// V57 fix:
// - Schema: KIND_OPTIONS + emptyExamRoomForm default 'doctor' + validate enum + normalize coerce
// - UI: ExamRoomFormModal radio picker (ห้องแพทย์ / ห้องหัตถการทั่วไป)
// - 5 consumers: defensive `(r.kind ?? 'doctor') === 'doctor'` filter
// - Migration: scripts/v57-backfill-exam-rooms-kind.mjs (Rule M two-phase)
// - AV30 audit invariant locks the contract.

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import {
  KIND_OPTIONS,
  KIND_LABEL,
  emptyExamRoomForm,
  validateExamRoom,
  normalizeExamRoom,
} from '../src/lib/examRoomValidation.js';

describe('V57.K1 — schema layer (examRoomValidation.js)', () => {
  it('K1.1 KIND_OPTIONS frozen array with exactly 2 values', () => {
    expect(Object.isFrozen(KIND_OPTIONS)).toBe(true);
    expect([...KIND_OPTIONS].sort()).toEqual(['doctor', 'staff']);
  });

  it('K1.2 KIND_LABEL has Thai labels for both kinds', () => {
    expect(KIND_LABEL.doctor).toBe('ห้องแพทย์');
    expect(KIND_LABEL.staff).toBe('ห้องหัตถการทั่วไป');
  });

  it('K1.3 emptyExamRoomForm defaults kind to "doctor"', () => {
    const form = emptyExamRoomForm();
    expect(form.kind).toBe('doctor');
  });

  it('K1.4 validateExamRoom accepts valid kind enum', () => {
    expect(validateExamRoom({ name: 'A', kind: 'doctor' })).toBeNull();
    expect(validateExamRoom({ name: 'A', kind: 'staff' })).toBeNull();
  });

  it('K1.5 validateExamRoom rejects invalid kind value', () => {
    const fail = validateExamRoom({ name: 'A', kind: 'examination' });
    expect(fail).toEqual(['kind', 'ประเภทห้องไม่ถูกต้อง (doctor | staff)']);
  });

  it('K1.6 validateExamRoom permits missing/empty kind (legacy back-compat)', () => {
    expect(validateExamRoom({ name: 'A' })).toBeNull();
    expect(validateExamRoom({ name: 'A', kind: null })).toBeNull();
    expect(validateExamRoom({ name: 'A', kind: '' })).toBeNull();
  });

  it('K1.7 normalizeExamRoom preserves valid kind', () => {
    expect(normalizeExamRoom({ name: 'A', kind: 'doctor' }).kind).toBe('doctor');
    expect(normalizeExamRoom({ name: 'A', kind: 'staff' }).kind).toBe('staff');
  });

  it('K1.8 normalizeExamRoom coerces missing/invalid kind to "doctor"', () => {
    expect(normalizeExamRoom({ name: 'A' }).kind).toBe('doctor');
    expect(normalizeExamRoom({ name: 'A', kind: null }).kind).toBe('doctor');
    expect(normalizeExamRoom({ name: 'A', kind: 'examination' }).kind).toBe('doctor');
  });

  it('K1.9 normalizeExamRoom preserves all other fields', () => {
    const out = normalizeExamRoom({ name: ' a ', nameEn: ' b ', note: ' c ', kind: 'staff', sortOrder: 3 });
    expect(out.name).toBe('a');
    expect(out.nameEn).toBe('b');
    expect(out.note).toBe('c');
    expect(out.kind).toBe('staff');
    expect(out.sortOrder).toBe(3);
    expect(out.status).toBe('ใช้งาน');
  });
});

describe('V57.K2 — defensive default in 5 consumer sites (source-grep)', () => {
  // Locks the V57 fix — every consumer of be_exam_rooms.kind filter MUST
  // use defensive default `(r.kind ?? 'doctor') === 'doctor'`. Future
  // refactor that strips the `?? 'doctor'` defensive default fails build.
  const SITES = [
    'src/lib/staffScheduleValidation.js',
    'src/components/backend/scheduling/ScheduleEntryFormModal.jsx',
    'src/components/backend/scheduling/TodaysDoctorsPanel.jsx',
    'src/pages/AdminDashboard.jsx',
  ];

  for (const path of SITES) {
    it(`K2.x ${path} uses defensive (kind ?? 'doctor') pattern`, () => {
      const src = readFileSync(path, 'utf8');
      // The defensive default pattern in some form
      expect(src).toMatch(/r\.kind\s*\?\?\s*['"]doctor['"]/);
    });
  }

  it('K2.5 NO bare `r.kind === "doctor"` strict filter remains in V55/V56 consumers (anti-regression)', () => {
    // Pre-V57 pattern — should NOT appear in any of these files anymore.
    // The filter MUST use ?? 'doctor' defensive default.
    for (const path of SITES) {
      const src = readFileSync(path, 'utf8');
      // Find lines where `r.kind === 'doctor'` or `r.kind === "doctor"` appears
      // WITHOUT `??` defensive default in the same line.
      const lines = src.split('\n');
      const violations = [];
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) return; // skip comments
        // Match `r.kind === 'doctor'` (or "doctor") that doesn't have `??` before it
        const hasStrict = /\br\.kind\s*===\s*['"]doctor['"]/.test(line);
        const hasDefensive = /r\.kind\s*\?\?\s*['"]doctor['"]/.test(line);
        if (hasStrict && !hasDefensive) {
          violations.push(`${path}:${idx + 1}: ${line.trim()}`);
        }
      });
      expect(
        violations,
        `Bare \`r.kind === 'doctor'\` strict filter violates AV30 in ${path}:\n${violations.join('\n')}`,
      ).toEqual([]);
    }
  });
});

describe('V57.K3 — ExamRoomFormModal renders kind picker', () => {
  const modalSrc = readFileSync('src/components/backend/ExamRoomFormModal.jsx', 'utf8');

  it('K3.1 imports KIND_OPTIONS + KIND_LABEL from examRoomValidation', () => {
    expect(modalSrc).toMatch(/import\s*\{[^}]*KIND_OPTIONS[^}]*\}\s*from\s*['"][^'"]+examRoomValidation\.js['"]/);
    expect(modalSrc).toMatch(/import\s*\{[^}]*KIND_LABEL[^}]*\}\s*from\s*['"][^'"]+examRoomValidation\.js['"]/);
  });

  it('K3.2 renders radio inputs for each KIND_OPTIONS value', () => {
    // Look for data-testid containing exam-room-kind-${k} template literal
    expect(modalSrc).toMatch(/exam-room-kind-/);
    expect(modalSrc).toMatch(/onChange=\{[^}]*update\(\{\s*kind:\s*k\s*\}\)/);
    expect(modalSrc).toMatch(/KIND_OPTIONS\.map/);
    // Each radio is gated on `(form.kind || 'doctor') === k` for default-doctor behavior
    expect(modalSrc).toMatch(/form\.kind\s*\|\|\s*['"]doctor['"]/);
  });

  it('K3.3 renders Thai label text via KIND_LABEL', () => {
    expect(modalSrc).toMatch(/KIND_LABEL\[k\]/);
  });

  it('K3.4 V57/AV30 marker present', () => {
    expect(modalSrc).toMatch(/V57\s*\/\s*AV30/);
  });
});

describe('V57.K4 — V57/AV30 markers + lessons-locked', () => {
  it('K4.1 examRoomValidation.js carries V57/AV30 marker comment', () => {
    const src = readFileSync('src/lib/examRoomValidation.js', 'utf8');
    expect(src).toMatch(/V57\s*\/\s*AV30/);
    // The header comment explains the schema-vs-consumer drift
    expect(src).toMatch(/Phase 18\.0/);
  });

  it('K4.2 backfill script exists at canonical path (Rule M)', () => {
    expect(existsSync('scripts/v57-backfill-exam-rooms-kind.mjs')).toBe(true);
  });

  it('K4.3 backfill script uses canonical artifacts path + admin SDK + dry-run guard', () => {
    const src = readFileSync('scripts/v57-backfill-exam-rooms-kind.mjs', 'utf8');
    // Rule M canonical artifacts path
    expect(src).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data\/be_exam_rooms/);
    // Two-phase --apply gate
    expect(src).toMatch(/--apply/);
    // Audit doc emit
    expect(src).toMatch(/be_admin_audit/);
    // PEM key conversion (Rule M canonical)
    expect(src).toMatch(/split\(['"]\\\\n['"]\)\.join\(['"]\\n['"]\)/);
    // Invocation guard
    expect(src).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath/);
  });

  it('K4.4 backfill script default value = "doctor" (matches schema default)', () => {
    const src = readFileSync('scripts/v57-backfill-exam-rooms-kind.mjs', 'utf8');
    expect(src).toMatch(/kind:\s*['"]doctor['"]/);
  });
});

describe('V57.K5 — adversarial inputs', () => {
  it('K5.1 normalizeExamRoom with non-string kind preserves coercion to "doctor"', () => {
    expect(normalizeExamRoom({ name: 'A', kind: 42 }).kind).toBe('doctor');
    expect(normalizeExamRoom({ name: 'A', kind: undefined }).kind).toBe('doctor');
    expect(normalizeExamRoom({ name: 'A', kind: true }).kind).toBe('doctor');
  });

  it('K5.2 emptyExamRoomForm + normalizeExamRoom round-trip preserves kind', () => {
    const empty = emptyExamRoomForm();
    const normalized = normalizeExamRoom(empty);
    expect(normalized.kind).toBe('doctor');
  });

  it('K5.3 admin flips kind from doctor → staff (legitimate edit path)', () => {
    // Seed an admin-filled form (name required by SS-1)
    const seed = { ...emptyExamRoomForm(), name: 'ห้องช็อคเวฟ' };
    expect(seed.kind).toBe('doctor'); // default
    const flipped = { ...seed, kind: 'staff' };
    expect(validateExamRoom(flipped)).toBeNull();
    expect(normalizeExamRoom(flipped).kind).toBe('staff');
  });

  it('K5.4 idempotent — normalize twice = same output', () => {
    const a = normalizeExamRoom({ name: 'A', kind: 'doctor' });
    const b = normalizeExamRoom(a);
    expect(b).toEqual(a);
  });
});
