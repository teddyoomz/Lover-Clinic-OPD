// tests/staff-chat-office-preview-source-grep.test.js
//
// T8 — Source-grep regression locks for the Office preview shipment.
// Locks the canonical patterns from T1-T6 so future churn fails the build
// instead of silently breaking the state machine or the AV108 contract.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const R = (p) => readFileSync(join(process.cwd(), p), 'utf8');

describe('OP-SG — source-grep regression for Office preview contracts', () => {
  it('OP-SG.1 — attachmentKindFor places "office" BEFORE the "file" fallback', () => {
    const c = R('src/lib/staffChatRetentionCore.js');
    const officeIdx = c.search(/return 'office'/);
    const fileIdx = c.search(/return 'file'/);
    expect(officeIdx).toBeGreaterThan(-1);
    expect(fileIdx).toBeGreaterThan(-1);
    expect(officeIdx).toBeLessThan(fileIdx);
  });

  it('OP-SG.2 — staffChatOfficePreviewCore exports the 4 required surface symbols', () => {
    const c = R('src/lib/staffChatOfficePreviewCore.js');
    expect(c).toMatch(/export const OFFICE_CONVERTIBLE_MIMES/);
    expect(c).toMatch(/export function isOfficeConvertible/);
    expect(c).toMatch(/export const OfficePreviewStatus/);
    expect(c).toMatch(/export function pdfPreviewStateOf/);
  });

  it('OP-SG.3 — staffChatClient.js imports + uses isOfficeConvertible to stamp pending', () => {
    const c = R('src/lib/staffChatClient.js');
    expect(c).toMatch(/from\s+['"]\.\/staffChatOfficePreviewCore\.js['"]/);
    expect(c).toMatch(/isOfficeConvertible\(/);
    // Assignment style: `o.pdfPreviewStatus = OfficePreviewStatus.PENDING;`
    expect(c).toMatch(/pdfPreviewStatus\s*=\s*OfficePreviewStatus\.PENDING/);
  });

  it('OP-SG.4 — StaffChatAttachmentCard uses pdfPreviewStateOf + carries 4 distinct testids', () => {
    const c = R('src/components/staffchat/StaffChatAttachmentCard.jsx');
    expect(c).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/staffChatOfficePreviewCore\.js['"]/);
    expect(c).toMatch(/pdfPreviewStateOf\(/);
    expect(c).toMatch(/staff-chat-attach-pending/);
    expect(c).toMatch(/staff-chat-attach-failed/);
    expect(c).toMatch(/staff-chat-attach-preview/);
    expect(c).toMatch(/staff-chat-attach-download/);
  });

  it('OP-SG.5 — Cloud Function uses bundled Gotenberg ONLY (localhost:3000)', () => {
    const c = R('functions/officeToPdf/index.js');
    expect(c).toMatch(/http:\/\/localhost:3000\/forms\/libreoffice\/convert/);
    expect(c).not.toMatch(/officeapps|docs\.google\.com/);
    expect(c).not.toMatch(/(aspose|cloudconvert|convertapi)\.com/);
    expect(c).not.toMatch(/graph\.microsoft\.com/);
  });

  it('OP-SG.6 — Cloud Function patches the matching attachment ONLY (race-safe, NOT whole-array clobber)', () => {
    const c = R('functions/officeToPdf/index.js');
    // The match key is `fullPath` — the V73 normalizer drops `id` but preserves
    // `fullPath`, so the Cloud Function joins by fullPath equality.
    expect(c).toMatch(/findIndex\(a\s*=>\s*a\s*&&\s*a\.fullPath\s*===\s*filePath\)/);
    // No naive whole-array overwrite (the attachments array is sliced + mutated by index)
    expect(c).toMatch(/\.attachments\.slice\(\)/);
  });

  it('OP-SG.7 — V73 pre-existing PDF branch retained (no regression)', () => {
    const c = R('src/components/staffchat/StaffChatAttachmentCard.jsx');
    expect(c).toMatch(/const isPdf\s*=\s*kind\s*===\s*['"]pdf['"]/);
    // The PDF branch still uses att.fullUrl (V73 contract).
    expect(c).toMatch(/onPreview\?\.\(\{\s*fileUrl:\s*att\.fullUrl/);
  });

  it('OP-SG.8 — firebase.json wires the office-to-pdf codebase + ignores it from the default codebase', () => {
    const c = R('firebase.json');
    const parsed = JSON.parse(c);
    expect(Array.isArray(parsed.functions)).toBe(true);
    const offCb = parsed.functions.find(f => f.codebase === 'office-to-pdf');
    expect(offCb).toBeTruthy();
    expect(offCb.source).toBe('functions/officeToPdf');
    expect(offCb.runtime).toBe('nodejs20');
    const defaultCb = parsed.functions.find(f => f.codebase === 'default');
    expect(defaultCb).toBeTruthy();
    expect(defaultCb.ignore).toContain('officeToPdf'); // default codebase MUST exclude the Docker subdir
  });

  it('OP-SG.9 — Cloud Function helpers explicitly note the Rule-of-3 sanctioned duplication', () => {
    const c = R('functions/officeToPdf/helpers.js');
    expect(c).toMatch(/DUPLICATES|duplicates/);
    expect(c).toMatch(/staffChatOfficePreviewCore/);
    expect(c).toMatch(/lock-step/i);
  });
});
