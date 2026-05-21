// tests/staff-chat-any-file.test.js
// (2026-05-22) Staff Chat ANY-FILE attachments (≤1GB) — unit + source-grep +
// Rule I flow-simulate. Mock/source-grep is code-shape ONLY per Rule Q; the REAL
// proof is the Rule Q L1 (Chrome MCP) + L2 (scripts/e2e-staff-chat-any-file.mjs)
// pass on real prod. These lock the pure logic + the render-by-kind + AV contracts.
//
// Decisions: Q1 allow-all type · Q2 cards + inline media · Q3 progress+cancel+retry
// · Q4 image ≤50MB / other ≤1GB. Polish: lightbox ✕/Esc-only (AV78) + grid-fits-bubble.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  attachmentKindFor, STAFF_CHAT_MAX_ATTACHMENTS, STAFF_CHAT_MAX_IMAGES,
} from '../src/lib/staffChatRetentionCore.js';
import {
  validateStaffChatFile, extForName,
  STAFF_CHAT_FILE_MAX_BYTES, STAFF_CHAT_MAX_BYTES,
} from '../src/lib/staffChatImageResize.js';
import { buildMessageDoc, newStaffChatMessageId } from '../src/lib/staffChatClient.js';

const read = (p) => readFileSync(p, 'utf8');
const GiB = 1024 * 1024 * 1024;
const MiB = 1024 * 1024;

describe('AF1 · attachmentKindFor matrix', () => {
  it('renderable images → image', () => {
    for (const m of ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'IMAGE/JPEG']) {
      expect(attachmentKindFor(m)).toBe('image');
    }
  });
  it('non-renderable images → file (no broken <img>)', () => {
    expect(attachmentKindFor('image/heic')).toBe('file');
    expect(attachmentKindFor('image/svg+xml')).toBe('file');
    expect(attachmentKindFor('image/avif')).toBe('file');
  });
  it('video/audio/pdf', () => {
    expect(attachmentKindFor('video/mp4')).toBe('video');
    expect(attachmentKindFor('video/quicktime')).toBe('video');
    expect(attachmentKindFor('audio/m4a')).toBe('audio');
    expect(attachmentKindFor('audio/mpeg')).toBe('audio');
    expect(attachmentKindFor('application/pdf')).toBe('pdf');
  });
  it('everything else → file', () => {
    for (const m of ['application/zip', 'application/octet-stream',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', '', null, undefined, 42, {}]) {
      expect(attachmentKindFor(m)).toBe('file');
    }
  });
  it('STAFF_CHAT_MAX_ATTACHMENTS alias of MAX_IMAGES (=10)', () => {
    expect(STAFF_CHAT_MAX_ATTACHMENTS).toBe(STAFF_CHAT_MAX_IMAGES);
    expect(STAFF_CHAT_MAX_ATTACHMENTS).toBe(10);
  });
});

describe('AF2 · validateStaffChatFile split caps (Q4) + allow-all (Q1)', () => {
  it('image/* ≤ 50MB; > 50MB → size reject', () => {
    expect(validateStaffChatFile({ type: 'image/jpeg', size: 49 * MiB }).ok).toBe(true);
    expect(validateStaffChatFile({ type: 'image/png', size: STAFF_CHAT_MAX_BYTES }).ok).toBe(true); // exact = ok
    const big = validateStaffChatFile({ type: 'image/jpeg', size: 51 * MiB });
    expect(big.ok).toBe(false); expect(big.reason).toBe('size');
  });
  it('non-image ≤ 1GB; > 1GB → size reject', () => {
    expect(validateStaffChatFile({ type: 'application/pdf', size: 51 * MiB }).ok).toBe(true);
    expect(validateStaffChatFile({ type: 'video/mp4', size: 900 * MiB }).ok).toBe(true);
    expect(validateStaffChatFile({ type: 'application/zip', size: STAFF_CHAT_FILE_MAX_BYTES }).ok).toBe(true); // exact = ok
    const big = validateStaffChatFile({ type: 'video/mp4', size: GiB + 1 });
    expect(big.ok).toBe(false); expect(big.reason).toBe('size');
    expect(STAFF_CHAT_FILE_MAX_BYTES).toBe(GiB);
  });
  it('allow-all type — exe / octet / empty-type accepted', () => {
    expect(validateStaffChatFile({ type: 'application/x-msdownload', size: 100 }).ok).toBe(true);
    expect(validateStaffChatFile({ type: 'application/octet-stream', size: 100 }).ok).toBe(true);
    expect(validateStaffChatFile({ type: '', size: 100 }).ok).toBe(true); // empty type → non-image bracket
  });
  it('malformed → type reject', () => {
    expect(validateStaffChatFile(null).ok).toBe(false);
    expect(validateStaffChatFile({ size: 100 }).ok).toBe(false); // no .type string
  });
  it('extForName: real ext / none / multi-dot / uppercase', () => {
    expect(extForName('report.pdf')).toBe('pdf');
    expect(extForName('UPPER.PNG')).toBe('png');
    expect(extForName('archive.tar.gz')).toBe('gz');
    expect(extForName('noext')).toBe('bin');
    expect(extForName('')).toBe('bin');
    expect(extForName(null)).toBe('bin');
  });
});

describe('AF3 · normalizeStaffChatAttachment (via buildMessageDoc): name + any mime', () => {
  const base = { branchId: 'BR-1', displayName: 'หมอ A', deviceId: 'DEV-1' };
  it('keeps name + non-image mime; omits thumb/w/h for files (Firestore-undefined-safe)', () => {
    const pdf = { name: 'รายงาน.pdf', mimeType: 'application/pdf', size: 2516582, fullUrl: 'f', fullPath: 'p' };
    const doc = buildMessageDoc({ ...base, id: 'CHAT-X', attachments: [pdf] });
    const a0 = doc.attachments[0];
    expect(a0.name).toBe('รายงาน.pdf');
    expect(a0.mimeType).toBe('application/pdf');
    expect('thumbUrl' in a0).toBe(false);
    expect('thumbPath' in a0).toBe(false);
    expect('w' in a0).toBe(false);
    for (const v of Object.values(a0)) expect(v).not.toBeUndefined();
  });
  it('image record keeps thumb + dims', () => {
    const img = { name: 'pic.jpg', mimeType: 'image/jpeg', size: 999, fullUrl: 'f', fullPath: 'p', thumbUrl: 't', thumbPath: 'tp', w: 800, h: 600 };
    const a0 = buildMessageDoc({ ...base, attachments: [img] }).attachments[0];
    expect(a0).toMatchObject({ name: 'pic.jpg', thumbUrl: 't', w: 800, h: 600 });
  });
  it('missing mimeType → application/octet-stream default (NOT image/jpeg)', () => {
    const a0 = buildMessageDoc({ ...base, attachments: [{ fullUrl: 'f' }] }).attachments[0];
    expect(a0.mimeType).toBe('application/octet-stream');
    expect(a0.name).toBe('');
  });
  it('caps at STAFF_CHAT_MAX_ATTACHMENTS', () => {
    const many = Array.from({ length: 13 }, (_, i) => ({ name: `f${i}`, mimeType: 'application/pdf', size: 1, fullUrl: 'f', fullPath: 'p' }));
    expect(buildMessageDoc({ ...base, attachments: many }).attachments).toHaveLength(STAFF_CHAT_MAX_ATTACHMENTS);
  });
});

describe('AF4 · Rule I flow-simulate (pick → validate → kind-split → doc → render-kind)', () => {
  it('mixed message: image + pdf + video + zip', () => {
    const files = [
      { type: 'image/jpeg', size: 3 * MiB, name: 'pic.jpg' },
      { type: 'application/pdf', size: 2 * MiB, name: 'report.pdf' },
      { type: 'video/mp4', size: 200 * MiB, name: 'vdo.mp4' },
      { type: 'application/zip', size: 180 * MiB, name: 'cases.zip' },
    ];
    files.forEach(f => expect(validateStaffChatFile(f).ok).toBe(true));
    const messageId = newStaffChatMessageId();
    // simulate uploadStaffChatFile output (image gets thumb+dims; others don't)
    const attachments = files.map((f, i) => {
      const isImg = attachmentKindFor(f.type) === 'image';
      const rec = { name: f.name, mimeType: f.type, size: f.size, fullUrl: `f${i}`, fullPath: `staff-chat-attachments/BR-1/${messageId}/id${i}-o` };
      if (isImg) Object.assign(rec, { thumbUrl: `t${i}`, thumbPath: `tp${i}`, w: 1000, h: 800 });
      return rec;
    });
    const doc = buildMessageDoc({ branchId: 'BR-1', displayName: 'A', deviceId: 'D', id: messageId, attachments });
    expect(doc.attachments).toHaveLength(4);
    // render-by-kind split (mirror StaffChatMessage)
    const imageAtts = doc.attachments.filter(a => attachmentKindFor(a.mimeType) === 'image');
    const otherAtts = doc.attachments.filter(a => attachmentKindFor(a.mimeType) !== 'image');
    expect(imageAtts.map(a => a.name)).toEqual(['pic.jpg']);
    expect(otherAtts.map(a => attachmentKindFor(a.mimeType))).toEqual(['pdf', 'video', 'file']);
    // names + order preserved within otherAtts
    expect(otherAtts.map(a => a.name)).toEqual(['report.pdf', 'vdo.mp4', 'cases.zip']);
    // image carries thumb; non-image does not
    expect(imageAtts[0].thumbUrl).toBeTruthy();
    otherAtts.forEach(a => expect('thumbUrl' in a).toBe(false));
  });
  it('legacy multi-image record (image/* mime, no name) → image kind', () => {
    const legacy = { mimeType: 'image/jpeg', thumbUrl: 't', fullUrl: 'f', fullPath: 'p', w: 1, h: 1 };
    expect(attachmentKindFor(legacy.mimeType)).toBe('image');
  });
  it('all-cancelled (empty attachments) + no text → buildMessageDoc throws EMPTY', () => {
    expect(() => buildMessageDoc({ branchId: 'BR-1', displayName: 'A', deviceId: 'D', attachments: [] })).toThrow(/EMPTY/);
  });
});

describe('AF5 · source-grep contracts (render-by-kind · split cap · cancel/retry · polish)', () => {
  it('composer: any-file (no accept=image) + multiple + cancel/retry + filename below thumb box', () => {
    const s = read('src/components/staffchat/StaffChatComposer.jsx');
    expect(s).not.toMatch(/accept="image/);
    expect(s).toMatch(/validateStaffChatFile/);
    expect(s).toMatch(/STAFF_CHAT_MAX_ATTACHMENTS/);
    expect(s).toMatch(/cancelRef/);
    expect(s).toMatch(/taskRefs/);
    expect(s).toMatch(/\.cancel\(\)/);     // per-file cancel
    expect(s).toMatch(/failed/);           // retry path
    // (2026-05-22 fix) progress bar lives in a FIXED 64px thumb box so it cannot
    // overlap the filename label rendered BELOW that box.
    expect(s).toMatch(/relative w-16 h-16/);
  });
  it('hook: prepareAndUpload uses uploadStaffChatFile + returns failed[]', () => {
    const s = read('src/hooks/useStaffChat.js');
    expect(s).toMatch(/uploadStaffChatFile/);
    expect(s).toMatch(/registerTask/);
    expect(s).toMatch(/cancelRef/);
    expect(s).toMatch(/failed/);
    expect(s).not.toMatch(/uploadStaffChatImage\(/); // no longer CALLS the image-only fn
  });
  it('message: splits by attachmentKindFor + inline video/audio + card + overlay', () => {
    const s = read('src/components/staffchat/StaffChatMessage.jsx');
    expect(s).toMatch(/attachmentKindFor/);
    expect(s).toMatch(/imageAtts/);
    expect(s).toMatch(/otherAtts/);
    expect(s).toMatch(/<video[\s\S]*?preload="metadata"/);
    expect(s).toMatch(/<audio[\s\S]*?preload="metadata"/);
    expect(s).toMatch(/StaffChatAttachmentCard/);
    expect(s).toMatch(/StaffChatPdfOverlay/);
    // grid fits the bubble (polish #2): no fixed width:240, uses maxWidth
    expect(s).toMatch(/width: '100%', maxWidth: 240/);
  });
  it('lightbox: backdrop does NOT close (✕/Esc only) — AV78 polish #1', () => {
    const s = read('src/components/staffchat/StaffChatImageLightbox.jsx');
    expect(s).not.toMatch(/cursor-pointer/);
    expect(s).toMatch(/backdrop does NOT close|backdrop click does NOT close/);
    // the backdrop root no longer has onClick={onClose} directly before onTouchStart
    expect(s).not.toMatch(/onClick=\{onClose\}\s*\n\s*onTouchStart/);
  });
  it('attachment card: download + preview (pdf direct + office via MS viewer)', () => {
    const s = read('src/components/staffchat/StaffChatAttachmentCard.jsx');
    expect(s).toMatch(/attachmentKindFor/);
    expect(s).toMatch(/downloadUrlAsFile/);
    expect(s).toMatch(/onPreview/);
    expect(s).toMatch(/staff-chat-attach-download/);
    // (2026-05-22) office preview (Word/Excel/PPT) via Microsoft Office Online embed
    expect(s).toMatch(/previewInfoFor/);
    expect(s).toMatch(/OFFICE_EXT/);
    expect(s).toMatch(/view\.officeapps\.live\.com\/op\/embed\.aspx/);
    expect(s).toMatch(/'docx'|"docx"/);
    expect(s).toMatch(/'xlsx'|"xlsx"/);
    expect(s).toMatch(/'pptx'|"pptx"/);
  });
  it('file-viewer overlay: iframe(viewerUrl) + download(fileUrl) + Esc, NO backdrop close', () => {
    const s = read('src/components/staffchat/StaffChatPdfOverlay.jsx');
    expect(s).toMatch(/<iframe/);
    expect(s).toMatch(/src=\{viewerUrl\}/);
    expect(s).toMatch(/downloadUrlAsFile\(fileUrl/);
    expect(s).toMatch(/staff-chat-pdf-close/);
    expect(s).toMatch(/Escape/);
    expect(s).not.toMatch(/staff-chat-pdf-overlay"[\s\S]{0,140}onClick=\{onClose\}/);
  });
  it('shared download helper (Rule of 3) + large-file new-tab fallback', () => {
    const s = read('src/lib/staffChatDownload.js');
    expect(s).toMatch(/downloadUrlAsFile/);
    expect(s).toMatch(/window\.open/);          // large-file fallback
    expect(s).toMatch(/a\.download/);            // small-file blob download
  });
  it('storage.rules: split cap image<50MB || other<1GB', () => {
    const s = read('storage.rules');
    expect(s).toMatch(/contentType\.matches\('image\/\.\*'\)\s*&&\s*request\.resource\.size < 50 \* 1024 \* 1024/);
    expect(s).toMatch(/!request\.resource\.contentType\.matches\('image\/\.\*'\)\s*&&\s*request\.resource\.size < 1024 \* 1024 \* 1024/);
    expect(s).toMatch(/allow update, delete: if false/);
  });
  it('lib re-exports + no client deleteObject in staff-chat surfaces', () => {
    const s = read('src/lib/staffChatImageResize.js');
    expect(s).toMatch(/uploadStaffChatFile/);
    expect(s).toMatch(/STAFF_CHAT_FILE_MAX_BYTES/);
    expect(s).toMatch(/1024 \* 1024 \* 1024/);
    for (const f of [
      'src/components/staffchat/StaffChatComposer.jsx',
      'src/components/staffchat/StaffChatMessage.jsx',
      'src/components/staffchat/StaffChatAttachmentCard.jsx',
      'src/components/staffchat/StaffChatPdfOverlay.jsx',
      'src/lib/staffChatDownload.js',
      'src/hooks/useStaffChat.js',
    ]) {
      expect(read(f)).not.toMatch(/deleteObject/);
    }
  });
});
