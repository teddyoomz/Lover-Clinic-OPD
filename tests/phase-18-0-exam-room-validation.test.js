// ─── Phase 18.0 Task 1 — examRoomValidation pure helpers ────────────────
// Mirrors branchValidation/holidayValidation shape. Used by ExamRoomFormModal
// + saveExamRoom + migration script.

import { describe, it, expect } from 'vitest';
import {
  validateExamRoom,
  emptyExamRoomForm,
  normalizeExamRoom,
  STATUS_OPTIONS,
  NAME_MAX_LENGTH,
  NOTE_MAX_LENGTH,
} from '../src/lib/examRoomValidation.js';

describe('Phase 18.0 — examRoomValidation pure helpers', () => {
  describe('V1 emptyExamRoomForm', () => {
    it('V1.1 returns shape with all fields defaulted', () => {
      const f = emptyExamRoomForm();
      expect(f).toEqual({ name: '', nameEn: '', note: '', status: 'ใช้งาน', sortOrder: 0 });
    });
    it('V1.2 returns a fresh object each call (no shared ref)', () => {
      const a = emptyExamRoomForm();
      const b = emptyExamRoomForm();
      a.name = 'mut';
      expect(b.name).toBe('');
    });
  });

  describe('V2 STATUS_OPTIONS', () => {
    it('V2.1 frozen array of two values', () => {
      expect(STATUS_OPTIONS).toEqual(['ใช้งาน', 'พักใช้งาน']);
      expect(Object.isFrozen(STATUS_OPTIONS)).toBe(true);
    });
  });

  describe('V3 validateExamRoom — name required', () => {
    it('V3.1 missing form returns error', () => {
      expect(validateExamRoom(null)).toEqual(['form', 'missing form']);
      expect(validateExamRoom(undefined)).toEqual(['form', 'missing form']);
      expect(validateExamRoom([])).toEqual(['form', 'missing form']);
      expect(validateExamRoom('str')).toEqual(['form', 'missing form']);
    });
    it('V3.2 missing name returns ["name", ...]', () => {
      expect(validateExamRoom({})).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: '' })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: '   ' })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
      expect(validateExamRoom({ name: 123 })).toEqual(['name', 'กรุณากรอกชื่อห้องตรวจ']);
    });
    it(`V3.3 name longer than ${NAME_MAX_LENGTH} chars rejected`, () => {
      const long = 'ก'.repeat(NAME_MAX_LENGTH + 1);
      expect(validateExamRoom({ name: long })).toEqual(['name', `ชื่อห้องไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`]);
    });
    it('V3.4 valid name passes (no other fields needed)', () => {
      expect(validateExamRoom({ name: 'ห้องดริป' })).toBeNull();
    });
  });

  describe('V4 validateExamRoom — nameEn / note bounds', () => {
    it('V4.1 nameEn longer than NAME_MAX_LENGTH rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', nameEn: 'a'.repeat(NAME_MAX_LENGTH + 1) }))
        .toEqual(['nameEn', `ชื่อ (EN) ไม่เกิน ${NAME_MAX_LENGTH} ตัวอักษร`]);
    });
    it(`V4.2 note longer than ${NOTE_MAX_LENGTH} rejected`, () => {
      expect(validateExamRoom({ name: 'ห้อง', note: 'x'.repeat(NOTE_MAX_LENGTH + 1) }))
        .toEqual(['note', `note เกิน ${NOTE_MAX_LENGTH} ตัวอักษร`]);
    });
  });

  describe('V5 validateExamRoom — status enum', () => {
    it('V5.1 invalid status rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: 'X' })).toEqual(['status', 'สถานะไม่ถูกต้อง']);
    });
    it('V5.2 valid statuses accepted', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: 'ใช้งาน' })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', status: 'พักใช้งาน' })).toBeNull();
    });
    it('V5.3 status null/undefined ignored (treated as default)', () => {
      expect(validateExamRoom({ name: 'ห้อง', status: null })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', status: undefined })).toBeNull();
    });
  });

  describe('V6 validateExamRoom — sortOrder integer ≥ 0', () => {
    it('V6.1 negative rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: -1 })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
    });
    it('V6.2 non-integer rejected', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 1.5 })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 'abc' })).toEqual(['sortOrder', 'sortOrder ต้องเป็นจำนวนเต็มไม่ติดลบ']);
    });
    it('V6.3 zero and positive integers accepted (incl. string-numeric)', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 0 })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: 5 })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: '3' })).toBeNull();
    });
    it('V6.4 null/undefined sortOrder ignored', () => {
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: null })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: undefined })).toBeNull();
      expect(validateExamRoom({ name: 'ห้อง', sortOrder: '' })).toBeNull();
    });
  });

  describe('V7 normalizeExamRoom', () => {
    it('V7.1 trims strings + defaults status + coerces sortOrder', () => {
      const out = normalizeExamRoom({
        name: '  ห้องดริป  ', nameEn: ' Drip ', note: ' line ', status: '', sortOrder: '4',
      });
      expect(out).toEqual({ name: 'ห้องดริป', nameEn: 'Drip', note: 'line', status: 'ใช้งาน', sortOrder: 4 });
    });
    it('V7.2 sortOrder unparseable falls back to 0', () => {
      const out = normalizeExamRoom({ name: 'X', sortOrder: 'abc' });
      expect(out.sortOrder).toBe(0);
    });
    it('V7.3 keeps non-trimmable falsy fields as ""', () => {
      const out = normalizeExamRoom({ name: 'X', nameEn: null, note: undefined });
      expect(out.nameEn).toBe('');
      expect(out.note).toBe('');
    });
  });
});
