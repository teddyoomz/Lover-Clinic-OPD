// tests/staff-chat-office-pending-stamp.test.js
//
// T2 — buildMessageDoc stamps pdfPreviewStatus='pending' on Office attachments
// at send time. The officeToPdf Cloud Function patches to 'ready'/'failed'
// after conversion. Non-Office attachments preserve V73 shape exactly (no
// pdfPreview* fields → V14 Firestore-undefined-safe).
import { describe, it, expect } from 'vitest';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const PPTX_MIME = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';

function basePayload(overrides = {}) {
  return {
    branchId: 'BR-TEST',
    displayName: 'นพ. ก',
    deviceId: 'd1',
    text: '',
    ...overrides,
  };
}

describe('OP-T2 — pending-stamp on Office attachments at send time', () => {
  it('OP-T2.1 — Office .docx upload → attachments[0].pdfPreviewStatus = "pending"', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'test.docx', mimeType: DOCX_MIME, size: 1024, fullUrl: 'gs://orig', fullPath: 'staff-chat-attachments/BR/M/test.docx' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBe('pending');
    expect(doc.attachments[0].pdfPreviewUrl).toBeNull();
    expect(doc.attachments[0].pdfPreviewError).toBeNull();
  });

  it('OP-T2.2 — image upload → NO pdfPreviewStatus field (V73 shape preserved)', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'photo.png', mimeType: 'image/png', size: 1024, fullUrl: 'gs://orig', fullPath: 'p' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBeUndefined();
    expect(doc.attachments[0].pdfPreviewUrl).toBeUndefined();
    expect(doc.attachments[0].pdfPreviewError).toBeUndefined();
  });

  it('OP-T2.3 — text/csv → pending (CSV is in Q3=C scope)', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'data.csv', mimeType: 'text/csv', size: 200, fullUrl: 'gs://orig', fullPath: 'p' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBe('pending');
  });

  it('OP-T2.4 — .pptx → pending (PowerPoint is in Q3=C scope)', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'deck.pptx', mimeType: PPTX_MIME, size: 4096, fullUrl: 'gs://orig', fullPath: 'p' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBe('pending');
  });

  it('OP-T2.5 — .odt → NO stamp (unsupported by Q3=C MIME whitelist; falls to download-only)', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'notes.odt', mimeType: 'application/vnd.oasis.opendocument.text', size: 100, fullUrl: 'gs://orig', fullPath: 'p' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBeUndefined();
  });

  it('OP-T2.6 — multiple mixed attachments — only Office MIMEs get the stamp', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [
        { name: 'photo.png', mimeType: 'image/png', size: 100, fullUrl: 'gs://x', fullPath: 'a' },
        { name: 'doc.docx', mimeType: DOCX_MIME, size: 200, fullUrl: 'gs://y', fullPath: 'b' },
        { name: 'file.pdf', mimeType: 'application/pdf', size: 300, fullUrl: 'gs://z', fullPath: 'c' },
      ],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBeUndefined();
    expect(doc.attachments[1].pdfPreviewStatus).toBe('pending');
    expect(doc.attachments[2].pdfPreviewStatus).toBeUndefined();
  });

  it('OP-T2.7 — case-insensitive MIME — uppercase still stamped', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'a.docx', mimeType: DOCX_MIME.toUpperCase(), size: 100, fullUrl: 'gs://x', fullPath: 'a' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBe('pending');
  });
});
