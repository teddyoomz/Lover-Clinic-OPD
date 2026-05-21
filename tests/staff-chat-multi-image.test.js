// tests/staff-chat-multi-image.test.js
// (2026-05-22) Staff Chat multi-image attachments — unit + Rule I flow-simulate
// + AV108 source-grep. The REAL UI + upload + delete proof is the Rule Q L1/L2
// pass in scripts/e2e-staff-chat-image-retention.mjs + Chrome MCP (mock RTL is
// code-shape only per Rule Q). These cover the pure logic + contract locks.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RETENTION_DAYS, ORPHAN_GRACE_MS, STAFF_CHAT_STORAGE_ROOT, STAFF_CHAT_MAX_IMAGES,
  storagePrefixForMessage, storagePrefixForBranch,
  isExpired, extractStoragePathFromUrl, isOrphanFolder, gridLayoutFor,
} from '../src/lib/staffChatRetentionCore.js';
import {
  validateStaffChatImage, extForMime, staffChatImagePaths,
  STAFF_CHAT_MAX_BYTES, STAFF_CHAT_ALLOWED_TYPES,
} from '../src/lib/staffChatImageResize.js';
import { buildMessageDoc, newStaffChatMessageId } from '../src/lib/staffChatClient.js';

const NOW = 1_800_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

describe('G1 · retention core (pure)', () => {
  it('storagePrefixForMessage = per-message folder', () => {
    expect(storagePrefixForMessage('BR-1', 'CHAT-9')).toBe('staff-chat-attachments/BR-1/CHAT-9/');
    expect(storagePrefixForBranch('BR-1')).toBe('staff-chat-attachments/BR-1/');
  });
  it('isExpired: >30d true, <30d false, bad input false', () => {
    expect(isExpired(NOW - 31 * DAY, NOW)).toBe(true);
    expect(isExpired(NOW - 29 * DAY, NOW)).toBe(false);
    expect(isExpired(NOW, NOW)).toBe(false);
    expect(isExpired(null, NOW)).toBe(false);
    expect(isExpired(undefined, NOW)).toBe(false);
    expect(isExpired('x', NOW)).toBe(false);
    expect(isExpired(NOW - 31 * DAY, NaN)).toBe(false);
    expect(RETENTION_DAYS).toBe(30);
    expect(ORPHAN_GRACE_MS).toBe(DAY);
  });
  it('extractStoragePathFromUrl: decodes /o/<path> from a download URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x.app/o/staff-chat-attachments%2FBR-1%2F123-ab.jpg?alt=media&token=zz';
    expect(extractStoragePathFromUrl(url)).toBe('staff-chat-attachments/BR-1/123-ab.jpg');
    expect(extractStoragePathFromUrl('not-a-url')).toBe(null);
    expect(extractStoragePathFromUrl(null)).toBe(null);
    expect(extractStoragePathFromUrl(42)).toBe(null);
  });
  it('isOrphanFolder: docExists→false; no doc + old→true; no doc + fresh→false; unknown age→true', () => {
    expect(isOrphanFolder({ docExists: true, folderCreatedMs: 0, nowMs: NOW })).toBe(false);
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: NOW - 2 * DAY, nowMs: NOW })).toBe(true);
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: NOW - 60_000, nowMs: NOW })).toBe(false);
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: undefined, nowMs: NOW })).toBe(true);
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: NaN, nowMs: NOW })).toBe(true);
  });
  it('gridLayoutFor: 0/1/2/3/4/6 → correct descriptor + overflow', () => {
    expect(gridLayoutFor(0)).toMatchObject({ show: 0, overflow: 0 });
    expect(gridLayoutFor(1)).toMatchObject({ show: 1, overflow: 0, cols: '1fr', firstBig: false });
    expect(gridLayoutFor(2)).toMatchObject({ show: 2, overflow: 0, cols: '1fr 1fr' });
    expect(gridLayoutFor(3)).toMatchObject({ show: 3, overflow: 0, firstBig: true, rows: '1fr 1fr' });
    expect(gridLayoutFor(4)).toMatchObject({ show: 4, overflow: 0 });
    expect(gridLayoutFor(6)).toMatchObject({ show: 4, overflow: 2 });
    expect(gridLayoutFor(10)).toMatchObject({ show: 4, overflow: 6 });
    // adversarial
    expect(gridLayoutFor(-3)).toMatchObject({ show: 0 });
    expect(gridLayoutFor('5')).toMatchObject({ show: 4, overflow: 1 });
  });
});

describe('G2 · image lib pure (validate / ext / paths)', () => {
  it('validateStaffChatImage: type + 50MB gate', () => {
    expect(validateStaffChatImage({ type: 'image/jpeg', size: 1000 }).ok).toBe(true);
    expect(validateStaffChatImage({ type: 'image/png', size: STAFF_CHAT_MAX_BYTES }).ok).toBe(true);
    expect(validateStaffChatImage({ type: 'image/webp', size: 1 }).ok).toBe(true);
    expect(validateStaffChatImage({ type: 'image/gif', size: 1 }).ok).toBe(true);
    const heic = validateStaffChatImage({ type: 'image/heic', size: 1 });
    expect(heic.ok).toBe(false); expect(heic.reason).toBe('type');
    const big = validateStaffChatImage({ type: 'image/jpeg', size: STAFF_CHAT_MAX_BYTES + 1 });
    expect(big.ok).toBe(false); expect(big.reason).toBe('size');
    expect(validateStaffChatImage(null).ok).toBe(false);
    expect(validateStaffChatImage({}).ok).toBe(false);
    expect(STAFF_CHAT_MAX_BYTES).toBe(50 * 1024 * 1024);
    expect(STAFF_CHAT_ALLOWED_TYPES).toContain('image/jpeg');
  });
  it('extForMime', () => {
    expect(extForMime('image/jpeg')).toBe('jpg');
    expect(extForMime('image/png')).toBe('png');
    expect(extForMime('image/webp')).toBe('webp');
    expect(extForMime('image/gif')).toBe('gif');
    expect(extForMime('image/heic')).toBe('jpg'); // fallback
  });
  it('staffChatImagePaths: per-message folder, thumb=jpg, original keeps ext', () => {
    const p = staffChatImagePaths('BR-1', 'CHAT-9', 'ab12', 'png');
    expect(p.thumbPath).toBe('staff-chat-attachments/BR-1/CHAT-9/ab12-t.jpg');
    expect(p.fullPath).toBe('staff-chat-attachments/BR-1/CHAT-9/ab12-o.png');
    // path root matches the shared constant + the cron's prefix
    expect(p.thumbPath.startsWith(`${STAFF_CHAT_STORAGE_ROOT}/`)).toBe(true);
    expect(p.fullPath.startsWith(storagePrefixForMessage('BR-1', 'CHAT-9'))).toBe(true);
  });
});

describe('G3 · buildMessageDoc + newStaffChatMessageId', () => {
  const base = { branchId: 'BR-1', displayName: 'หมอ A', deviceId: 'DEV-1' };
  const att = { thumbUrl: 't', fullUrl: 'f', thumbPath: 'tp', fullPath: 'fp', size: 999, mimeType: 'image/png', w: 800, h: 600 };
  it('newStaffChatMessageId → CHAT-<ts>-<hex>, unique', () => {
    const a = newStaffChatMessageId(), b = newStaffChatMessageId();
    expect(a).toMatch(/^CHAT-\d+-[0-9a-f]{8}$/);
    expect(a).not.toBe(b);
  });
  it('accepts attachments[] as content (no text needed) + caller-minted id', () => {
    const doc = buildMessageDoc({ ...base, id: 'CHAT-X', attachments: [att] });
    expect(doc.id).toBe('CHAT-X');
    expect(doc.attachments).toHaveLength(1);
    expect(doc.attachments[0]).toMatchObject({ thumbUrl: 't', fullUrl: 'f', thumbPath: 'tp', fullPath: 'fp', size: 999, mimeType: 'image/png', w: 800, h: 600 });
  });
  it('normalizes attachments — NO undefined leaves (V14), caps at 10', () => {
    const dirty = [{ thumbUrl: 't', fullUrl: 'f' }]; // missing fields
    const doc = buildMessageDoc({ ...base, attachments: dirty });
    const a0 = doc.attachments[0];
    for (const v of Object.values(a0)) expect(v).not.toBeUndefined();
    expect(a0.size).toBe(0);
    expect(a0.mimeType).toBe('image/jpeg');
    expect('w' in a0).toBe(false); // w/h omitted when not finite
    const eleven = Array.from({ length: 11 }, () => att);
    expect(buildMessageDoc({ ...base, attachments: eleven }).attachments).toHaveLength(STAFF_CHAT_MAX_IMAGES);
  });
  it('empty (no text, no attachmentUrl, no attachments) → throws', () => {
    expect(() => buildMessageDoc({ ...base })).toThrow(/EMPTY/);
    expect(() => buildMessageDoc({ ...base, attachments: [] })).toThrow(/EMPTY/);
  });
  it('legacy attachmentUrl still works', () => {
    const doc = buildMessageDoc({ ...base, attachmentUrl: 'https://x/o/y.jpg', attachmentSize: 5 });
    expect(doc.attachmentUrl).toBe('https://x/o/y.jpg');
    expect(doc.attachments).toBeUndefined();
  });
});

describe('G4 · Rule I flow-simulate (pick → upload → doc → grid → retention)', () => {
  it('3-image happy path: validate → attachments → doc → grid descriptor', () => {
    const files = [
      { type: 'image/jpeg', size: 2_000_000 },
      { type: 'image/png', size: 40_000_000 },
      { type: 'image/webp', size: 500_000 },
    ];
    files.forEach(f => expect(validateStaffChatImage(f).ok).toBe(true));
    const messageId = newStaffChatMessageId();
    // simulate uploadStaffChatImage output per file
    const attachments = files.map((f, i) => {
      const ext = extForMime(f.type);
      const { thumbPath, fullPath } = staffChatImagePaths('BR-1', messageId, `id${i}`, ext);
      return { thumbUrl: `t${i}`, fullUrl: `f${i}`, thumbPath, fullPath, size: f.size, mimeType: f.type, w: 1000, h: 800 };
    });
    const doc = buildMessageDoc({ branchId: 'BR-1', displayName: 'A', deviceId: 'D', id: messageId, attachments });
    expect(doc.attachments).toHaveLength(3);
    // every file landed under the same per-message folder (prefix-sweep ready)
    doc.attachments.forEach(a => expect(a.fullPath.startsWith(storagePrefixForMessage('BR-1', messageId))).toBe(true));
    const layout = gridLayoutFor(doc.attachments.length);
    expect(layout).toMatchObject({ show: 3, firstBig: true });
  });
  it('retention chain: aged message → prefix → all files deleted by sweep', () => {
    const messageId = 'CHAT-AGED';
    const prefix = storagePrefixForMessage('BR-1', messageId);
    expect(isExpired(NOW - 31 * DAY, NOW)).toBe(true);
    // a fake bucket listing under the prefix
    const files = [`${prefix}a-t.jpg`, `${prefix}a-o.png`, `${prefix}b-t.jpg`, `${prefix}b-o.jpg`];
    const surviving = files.filter(f => !f.startsWith(prefix)); // sweep deletes all under prefix
    expect(surviving).toHaveLength(0); // ลบเกลี้ยง
  });
  it('orphan chain: folder with no doc + old → swept; fresh → kept', () => {
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: NOW - 2 * DAY, nowMs: NOW })).toBe(true);
    expect(isOrphanFolder({ docExists: false, folderCreatedMs: NOW - 10_000, nowMs: NOW })).toBe(false);
  });
  it('legacy single-image renders as 1-item lightbox set', () => {
    const doc = buildMessageDoc({ branchId: 'BR-1', displayName: 'A', deviceId: 'D', attachmentUrl: 'u' });
    const lightboxImages = doc.attachments?.length ? doc.attachments : [{ fullUrl: doc.attachmentUrl, thumbUrl: doc.attachmentUrl }];
    expect(lightboxImages).toHaveLength(1);
    expect(lightboxImages[0].fullUrl).toBe('u');
  });
});

describe('G5 · AV108 source-grep (per-message folder + cron prefix-sweep + locked deletes)', () => {
  const read = (p) => readFileSync(p, 'utf8');
  it('image lib stores under {branchId}/{messageId}/ folder', () => {
    const s = read('src/lib/staffChatImageResize.js');
    // per-message folder (root comes from the shared STAFF_CHAT_STORAGE_ROOT constant)
    expect(s).toMatch(/\$\{branchId\}\/\$\{messageId\}\//);
    expect(s).toMatch(/STAFF_CHAT_STORAGE_ROOT/);
    expect(s).toMatch(/uploadBytesResumable/); // progress
    expect(s).toMatch(/50 \* 1024 \* 1024/);   // 50MB gate
  });
  it('cron does prefix-sweep + orphan-sweep + CRON_SECRET + admin SDK', () => {
    const s = read('api/cron/staff-chat-retention-sweep.js');
    expect(s).toMatch(/getFiles\(\{\s*prefix/);
    expect(s).toMatch(/storagePrefixForMessage/);
    expect(s).toMatch(/isOrphanFolder/);
    expect(s).toMatch(/CRON_SECRET/);
    expect(s).toMatch(/firebase-admin/);
    expect(s).toMatch(/extractStoragePathFromUrl/); // legacy scalar cleanup
  });
  it('CLI reuses the cron sweep (Rule of 3) + dry-run/apply', () => {
    const s = read('scripts/staff-chat-retention-sweep.mjs');
    expect(s).toMatch(/sweepStaffChatRetention/);
    expect(s).toMatch(/--apply/);
    expect(s).toMatch(/\.env\.local\.prod/);
  });
  it('storage.rules: 50MB cap + client delete locked', () => {
    const s = read('storage.rules');
    expect(s).toMatch(/staff-chat-attachments\/\{branchId\}\/\{file=\*\*\}/);
    expect(s).toMatch(/request\.resource\.size < 50 \* 1024 \* 1024/);
    expect(s).toMatch(/allow update, delete: if false/);
  });
  it('firestore.rules: attachments[] (≤10) accepted as content', () => {
    const s = read('firestore.rules');
    expect(s).toMatch(/get\('attachments', \[\]\) is list/);
    expect(s).toMatch(/get\('attachments', \[\]\)\.size\(\) <= 10/);
  });
  it('NO client-side staff-chat Storage delete (admin SDK only)', () => {
    // composer/message/hook must not call deleteObject on staff-chat-attachments
    for (const f of [
      'src/components/staffchat/StaffChatComposer.jsx',
      'src/components/staffchat/StaffChatMessage.jsx',
      'src/hooks/useStaffChat.js',
      'src/lib/staffChatImageResize.js',
    ]) {
      expect(read(f)).not.toMatch(/deleteObject/);
    }
  });
});
