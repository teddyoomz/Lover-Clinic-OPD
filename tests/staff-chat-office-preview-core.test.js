// tests/staff-chat-office-preview-core.test.js
//
// T1 unit tests for the pure-JS Office preview core + attachmentKindFor
// extension. Locked by source-grep regression (OP-SG in T8).
//
// Q3=C scope: Word + Excel + PowerPoint + CSV (7 canonical MIME strings).
import { describe, it, expect } from 'vitest';
import {
  OFFICE_CONVERTIBLE_MIMES,
  isOfficeConvertible,
  OfficePreviewStatus,
  pdfPreviewStateOf,
} from '../src/lib/staffChatOfficePreviewCore.js';
import { attachmentKindFor } from '../src/lib/staffChatRetentionCore.js';

describe('OP1 — MIME whitelist (Q3=C: Word + Excel + PPT + CSV)', () => {
  it('OP1.1 — includes the 7 canonical Office MIMEs', () => {
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/msword')).toBe(true); // .doc
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe(true); // .docx
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.ms-excel')).toBe(true); // .xls
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe(true); // .xlsx
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.ms-powerpoint')).toBe(true); // .ppt
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe(true); // .pptx
    expect(OFFICE_CONVERTIBLE_MIMES.has('text/csv')).toBe(true);
  });
  it('OP1.2 — excludes unsupported / non-convertible MIMEs', () => {
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/pdf')).toBe(false);
    expect(OFFICE_CONVERTIBLE_MIMES.has('image/png')).toBe(false);
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/vnd.oasis.opendocument.text')).toBe(false); // .odt — unsupported per Q3=C
    expect(OFFICE_CONVERTIBLE_MIMES.has('application/x-iwork-pages-sffpages')).toBe(false); // .pages
  });
  it('OP1.3 — Set size is exactly 7 (closed list)', () => {
    expect(OFFICE_CONVERTIBLE_MIMES.size).toBe(7);
  });
  it('OP1.4 — isOfficeConvertible() — case-insensitive, trims, handles null/undefined', () => {
    expect(isOfficeConvertible('APPLICATION/MSWORD')).toBe(true);
    expect(isOfficeConvertible(' application/pdf ')).toBe(false);
    expect(isOfficeConvertible(null)).toBe(false);
    expect(isOfficeConvertible(undefined)).toBe(false);
    expect(isOfficeConvertible('')).toBe(false);
    expect(isOfficeConvertible(123)).toBe(false);
    expect(isOfficeConvertible(' Application/Vnd.Ms-Excel ')).toBe(true);
  });
});

describe('OP2 — OfficePreviewStatus constants (frozen)', () => {
  it('OP2.1 — exposes the 4 state strings', () => {
    expect(OfficePreviewStatus.PENDING).toBe('pending');
    expect(OfficePreviewStatus.READY).toBe('ready');
    expect(OfficePreviewStatus.FAILED).toBe('failed');
    expect(OfficePreviewStatus.UNSUPPORTED).toBe('unsupported');
  });
  it('OP2.2 — frozen object', () => {
    expect(Object.isFrozen(OfficePreviewStatus)).toBe(true);
  });
});

describe('OP3 — pdfPreviewStateOf(att) state derivation', () => {
  it('OP3.1 — null/undefined attachment → na', () => {
    expect(pdfPreviewStateOf(null)).toBe('na');
    expect(pdfPreviewStateOf(undefined)).toBe('na');
  });
  it('OP3.2 — non-convertible MIME (image/pdf/etc) → na (no Office preview affordance)', () => {
    expect(pdfPreviewStateOf({ mimeType: 'image/png' })).toBe('na');
    expect(pdfPreviewStateOf({ mimeType: 'application/pdf' })).toBe('na');
    expect(pdfPreviewStateOf({ mimeType: 'application/zip' })).toBe('na');
  });
  it('OP3.3 — Office MIME without pdfPreviewStatus → pending (legacy / inflight)', () => {
    expect(pdfPreviewStateOf({ mimeType: 'application/msword' })).toBe('pending');
  });
  it('OP3.4 — explicit status fields are respected', () => {
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'pending' })).toBe('pending');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'ready', pdfPreviewUrl: 'https://...' })).toBe('ready');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'failed' })).toBe('failed');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'unsupported' })).toBe('unsupported');
  });
  it('OP3.5 — ready status without URL falls back to pending (defensive)', () => {
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'ready' })).toBe('pending');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'ready', pdfPreviewUrl: '' })).toBe('pending');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'ready', pdfPreviewUrl: null })).toBe('pending');
  });
  it('OP3.6 — unknown status value falls back to pending', () => {
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 'garbage' })).toBe('pending');
    expect(pdfPreviewStateOf({ mimeType: 'application/msword', pdfPreviewStatus: 123 })).toBe('pending');
  });
});

describe('OP4 — attachmentKindFor returns "office" for convertible MIMEs', () => {
  it('OP4.1 — returns "office" for all 7 convertible MIMEs', () => {
    expect(attachmentKindFor('application/msword')).toBe('office');
    expect(attachmentKindFor('application/vnd.openxmlformats-officedocument.wordprocessingml.document')).toBe('office');
    expect(attachmentKindFor('application/vnd.ms-excel')).toBe('office');
    expect(attachmentKindFor('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')).toBe('office');
    expect(attachmentKindFor('application/vnd.ms-powerpoint')).toBe('office');
    expect(attachmentKindFor('application/vnd.openxmlformats-officedocument.presentationml.presentation')).toBe('office');
    expect(attachmentKindFor('text/csv')).toBe('office');
  });
  it('OP4.2 — pre-existing branches unchanged: image/video/audio/pdf/file', () => {
    expect(attachmentKindFor('image/png')).toBe('image');
    expect(attachmentKindFor('image/jpeg')).toBe('image');
    expect(attachmentKindFor('image/webp')).toBe('image');
    expect(attachmentKindFor('image/gif')).toBe('image');
    expect(attachmentKindFor('video/mp4')).toBe('video');
    expect(attachmentKindFor('audio/mpeg')).toBe('audio');
    expect(attachmentKindFor('application/pdf')).toBe('pdf');
    expect(attachmentKindFor('application/zip')).toBe('file');
    expect(attachmentKindFor('application/vnd.oasis.opendocument.text')).toBe('file'); // .odt → file (unsupported)
    expect(attachmentKindFor('text/plain')).toBe('file');
  });
  it('OP4.3 — case-insensitive matching (mime can arrive uppercase)', () => {
    expect(attachmentKindFor('APPLICATION/MSWORD')).toBe('office');
    expect(attachmentKindFor('Application/Vnd.Ms-Excel')).toBe('office');
  });
});
