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
    // (2026-06-03 V21-fixup, S2) the matching-attachment patch logic moved from
    // index.js's inline stampAttachment into helpers.patchOfficeAttachment, which
    // adds a bounded retry for the late-created message doc (a fast Office
    // conversion can run before the composer's post-upload setDoc). index.js now
    // routes through the helper; the join-by-fullPath + slice logic lives in it.
    const idx = R('functions/officeToPdf/index.js');
    expect(idx).toMatch(/patchOfficeAttachment\(/);
    const h = R('functions/officeToPdf/helpers.js');
    // The match key is `fullPath` — the V73 normalizer drops `id` but preserves
    // `fullPath`, so the patch joins by fullPath equality.
    expect(h).toMatch(/findIndex\(\(?a\)?\s*=>\s*a\s*&&\s*a\.fullPath\s*===\s*filePath\)/);
    // No naive whole-array overwrite (the attachments array is sliced + mutated by index)
    expect(h).toMatch(/\.attachments\.slice\(\)/);
  });

  it('OP-SG.7 — V73 pre-existing PDF branch retained (no regression)', () => {
    const c = R('src/components/staffchat/StaffChatAttachmentCard.jsx');
    expect(c).toMatch(/const isPdf\s*=\s*kind\s*===\s*['"]pdf['"]/);
    // The PDF branch still uses att.fullUrl (V73 contract).
    expect(c).toMatch(/onPreview\?\.\(\{\s*fileUrl:\s*att\.fullUrl/);
  });

  it('OP-SG.8 — firebase.json default codebase ignores functions/officeToPdf (deployed via gcloud-run, NOT firebase functions)', () => {
    // 2026-05-22 EOD+2 deploy lesson: Firebase Functions 2nd Gen with
    // `runtime: nodejs20` uses Cloud Build BUILDPACKS — ignores custom
    // Dockerfile. To deploy the Gotenberg-bundled container, the canonical
    // path is `gcloud run deploy --source functions/officeToPdf` + an
    // explicit Eventarc trigger (see scripts/deploy-office-to-pdf-cloud-run.sh).
    // Therefore firebase.json must NOT have an office-to-pdf codebase entry
    // (would cause `firebase deploy --only functions` to fail repeatedly), AND
    // the default codebase's ignore list must exclude the officeToPdf subdir.
    const c = R('firebase.json');
    const parsed = JSON.parse(c);
    expect(Array.isArray(parsed.functions)).toBe(true);
    const offCb = parsed.functions.find(f => f.codebase === 'office-to-pdf');
    expect(offCb).toBeUndefined();
    const defaultCb = parsed.functions.find(f => f.codebase === 'default');
    expect(defaultCb).toBeTruthy();
    expect(defaultCb.ignore).toContain('officeToPdf');
  });

  it('OP-SG.9 — Cloud Function helpers explicitly note the Rule-of-3 sanctioned duplication', () => {
    const c = R('functions/officeToPdf/helpers.js');
    expect(c).toMatch(/DUPLICATES|duplicates/);
    expect(c).toMatch(/staffChatOfficePreviewCore/);
    expect(c).toMatch(/lock-step/i);
  });

  // ─── Path B graceful timeout (2026-05-22 EOD+2) ───────────────────────────
  it('OP-SG.10 — buildMessageDoc stamps pdfPreviewStampedAt (raw Date.now millis) on Office attachments', () => {
    const c = R('src/lib/staffChatClient.js');
    expect(c).toMatch(/pdfPreviewStampedAt\s*=\s*Date\.now\(\)/);
  });

  it('OP-SG.11 — StaffChatAttachmentCard implements 60s timeout fallback (PENDING_TIMEOUT_MS + isPendingTimedOut + staff-chat-attach-pending-timeout testid)', () => {
    const c = R('src/components/staffchat/StaffChatAttachmentCard.jsx');
    expect(c).toMatch(/const PENDING_TIMEOUT_MS\s*=\s*60_000/);
    expect(c).toMatch(/isPendingTimedOut/);
    expect(c).toMatch(/staff-chat-attach-pending-timeout/);
    // Tooltip Thai copy locked
    expect(c).toMatch(/ใช้เวลานานเกินไป/);
    expect(c).toMatch(/ดาวน์โหลด/);
    // Pending render guarded by !isPendingTimedOut
    expect(c).toMatch(/officeState === 'pending' && !isPendingTimedOut/);
  });
});
