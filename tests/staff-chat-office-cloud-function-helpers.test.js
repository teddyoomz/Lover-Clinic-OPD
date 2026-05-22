// tests/staff-chat-office-cloud-function-helpers.test.js
//
// T4 — Pure-logic helpers in the Cloud Function. Integration is verified
// via the Rule Q L2 e2e script (gated on deploy; NOT run by vitest).
import { describe, it, expect } from 'vitest';
import {
  OFFICE_CONVERTIBLE_MIMES,
  isOfficeConvertible,
  OfficePreviewStatus,
  deriveOutputPath,
  extensionForMime,
  deriveFailureReason,
  classifyGotenbergError,
} from '../functions/officeToPdf/helpers.js';

describe('CF1 — Cloud Function MIME whitelist (duplicated from src/lib/staffChatOfficePreviewCore.js at the deploy boundary)', () => {
  it('CF1.1 — same 7 canonical MIMEs as the client side', () => {
    expect(OFFICE_CONVERTIBLE_MIMES.size).toBe(7);
    for (const m of [
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
    ]) {
      expect(OFFICE_CONVERTIBLE_MIMES.has(m)).toBe(true);
    }
  });
  it('CF1.2 — isOfficeConvertible: case-insensitive + null-safe', () => {
    expect(isOfficeConvertible('APPLICATION/MSWORD')).toBe(true);
    expect(isOfficeConvertible(null)).toBe(false);
    expect(isOfficeConvertible('image/png')).toBe(false);
  });
  it('CF1.3 — OfficePreviewStatus frozen, mirrors client', () => {
    expect(OfficePreviewStatus.PENDING).toBe('pending');
    expect(OfficePreviewStatus.READY).toBe('ready');
    expect(OfficePreviewStatus.FAILED).toBe('failed');
    expect(OfficePreviewStatus.UNSUPPORTED).toBe('unsupported');
    expect(Object.isFrozen(OfficePreviewStatus)).toBe(true);
  });
});

describe('CF2 — Path + extension helpers', () => {
  it('CF2.1 — deriveOutputPath appends ".pdf" to the same prefix', () => {
    expect(deriveOutputPath('staff-chat-attachments/br1/m1/foo.docx')).toBe('staff-chat-attachments/br1/m1/foo.docx.pdf');
    expect(deriveOutputPath('staff-chat-attachments/br1/m1/Untitled.xlsx')).toBe('staff-chat-attachments/br1/m1/Untitled.xlsx.pdf');
    expect(deriveOutputPath('a/b/c/data.csv')).toBe('a/b/c/data.csv.pdf');
  });
  it('CF2.2 — deriveOutputPath throws on bad input (defensive)', () => {
    expect(() => deriveOutputPath(null)).toThrow();
    expect(() => deriveOutputPath(123)).toThrow();
  });
  it('CF2.3 — extensionForMime returns the canonical extension', () => {
    expect(extensionForMime('application/msword')).toBe('doc');
    expect(extensionForMime('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('docx');
    expect(extensionForMime('application/vnd.ms-excel')).toBe('xls');
    expect(extensionForMime('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('xlsx');
    expect(extensionForMime('application/vnd.ms-powerpoint')).toBe('ppt');
    expect(extensionForMime('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('pptx');
    expect(extensionForMime('text/csv')).toBe('csv');
  });
  it('CF2.4 — extensionForMime handles unknown MIMEs gracefully', () => {
    expect(extensionForMime('image/png')).toBe('bin');
    expect(extensionForMime('')).toBe('bin');
    expect(extensionForMime(null)).toBe('bin');
  });
});

describe('CF3 — Failure-reason Thai copy', () => {
  it('CF3.1 — deriveFailureReason returns Thai text per error class', () => {
    expect(deriveFailureReason({ kind: 'password-protected' })).toMatch(/รหัสผ่าน/);
    expect(deriveFailureReason({ kind: 'corrupt' })).toMatch(/เสีย/);
    expect(deriveFailureReason({ kind: 'timeout' })).toMatch(/นาน/);
    expect(deriveFailureReason({ kind: 'unsupported-format' })).toMatch(/รองรับ/);
    expect(deriveFailureReason({ kind: 'unknown' })).toMatch(/แปลงไฟล์ไม่ได้/);
  });
  it('CF3.2 — missing kind returns the generic Thai reason', () => {
    expect(deriveFailureReason({})).toMatch(/แปลงไฟล์ไม่ได้/);
    expect(deriveFailureReason()).toMatch(/แปลงไฟล์ไม่ได้/);
  });
});

describe('CF4 — Gotenberg error classifier', () => {
  it('CF4.1 — password-protected DOCX (LibreOffice-specific text)', () => {
    expect(classifyGotenbergError('cannot open: file is encrypted')).toBe('password-protected');
    expect(classifyGotenbergError('Document is PASSWORD protected')).toBe('password-protected');
  });
  it('CF4.2 — corrupt / malformed', () => {
    expect(classifyGotenbergError('Invalid file format')).toBe('corrupt');
    expect(classifyGotenbergError('document is malformed')).toBe('corrupt');
    expect(classifyGotenbergError('file is corrupt')).toBe('corrupt');
  });
  it('CF4.3 — timeout', () => {
    expect(classifyGotenbergError('conversion timeout exceeded')).toBe('timeout');
  });
  it('CF4.4 — default to "unknown" for anything unclassified', () => {
    expect(classifyGotenbergError('something else went wrong')).toBe('unknown');
    expect(classifyGotenbergError(null)).toBe('unknown');
    expect(classifyGotenbergError('')).toBe('unknown');
  });
});
