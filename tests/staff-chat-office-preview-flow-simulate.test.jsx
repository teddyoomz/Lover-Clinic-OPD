// tests/staff-chat-office-preview-flow-simulate.test.js
//
// T6 — Rule I full-flow simulate. Chains the WHOLE pipeline a real user
// exercises (V13/V14 lesson — helper-output tests are necessary but not
// sufficient; chain the whole flow):
//
//   1. Client `buildMessageDoc` stamps pdfPreviewStatus='pending'
//   2. `attachmentKindFor` returns 'office'
//   3. `pdfPreviewStateOf` derives 'pending'
//   4. Card renders ⏳, no 👁
//   5. Cloud Function patches → ready (or failed); we simulate the patch
//      locally with the SAME shape the real Cloud Function writes
//   6. `pdfPreviewStateOf` derives 'ready' (or 'failed')
//   7. Card re-renders → 👁 (or ⚠ with tooltip)
//   8. Click 👁 → onPreview called with pdfPreviewUrl (NOT original fullUrl)
//
// 4 flows: ready / failed / unsupported (.odt fall-through) / PDF V73 baseline.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';
import { attachmentKindFor } from '../src/lib/staffChatRetentionCore.js';
import { pdfPreviewStateOf, OfficePreviewStatus } from '../src/lib/staffChatOfficePreviewCore.js';
import { StaffChatAttachmentCard } from '../src/components/staffchat/StaffChatAttachmentCard.jsx';

const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const ODT = 'application/vnd.oasis.opendocument.text';

// Mirror of what the real Cloud Function (functions/officeToPdf/index.js)
// does in stampAttachment: find the attachment by fullPath and merge the patch.
// This is the canonical race-safe pattern — match by fullPath because the
// V73 normalizer drops `id` but preserves `fullPath`.
function simulateCloudFunctionPatch(messageDoc, filePath, patch) {
  const atts = messageDoc.attachments.slice();
  const idx = atts.findIndex(a => a && a.fullPath === filePath);
  if (idx === -1) return messageDoc;
  atts[idx] = { ...atts[idx], ...patch };
  return { ...messageDoc, attachments: atts };
}

function basePayload(overrides = {}) {
  return { branchId: 'BR1', displayName: 'นพ. ก', deviceId: 'd1', text: '', ...overrides };
}

describe('OP-F1 — pending → ready → 👁 click opens PDF overlay', () => {
  it('chains client-stamp → Cloud Function patch → card render', () => {
    const filePath = 'staff-chat-attachments/BR1/M1/report.docx';

    // (1) Client side: composer builds doc, stamps pending
    const initial = buildMessageDoc(basePayload({
      attachments: [{ name: 'report.docx', mimeType: DOCX, size: 1024, fullUrl: 'gs://orig', fullPath: filePath }],
    }));
    expect(initial.attachments[0].pdfPreviewStatus).toBe('pending');
    expect(initial.attachments[0].pdfPreviewUrl).toBeNull();

    // (2 + 3) attachmentKindFor + pdfPreviewStateOf agree on pending Office state
    expect(attachmentKindFor(DOCX)).toBe('office');
    expect(pdfPreviewStateOf(initial.attachments[0])).toBe('pending');

    // (4) Render card in pending → ⏳ shown, NO 👁
    let view = render(<StaffChatAttachmentCard att={initial.attachments[0]} onPreview={vi.fn()} />);
    expect(screen.getByTestId('staff-chat-attach-pending')).toBeTruthy();
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    view.unmount();

    // (5) Cloud Function patches to ready (race-safe by fullPath match)
    const ready = simulateCloudFunctionPatch(initial, filePath, {
      pdfPreviewStatus: OfficePreviewStatus.READY,
      pdfPreviewUrl: 'https://firebasestorage.googleapis.com/v0/b/proj.firebasestorage.app/o/staff-chat-attachments%2FBR1%2FM1%2Freport.docx.pdf?alt=media&token=abc123',
      pdfPreviewError: null,
    });
    expect(pdfPreviewStateOf(ready.attachments[0])).toBe('ready');

    // (6 + 7) Card re-renders in ready → 👁 shown
    const onPreview = vi.fn();
    view = render(<StaffChatAttachmentCard att={ready.attachments[0]} onPreview={onPreview} />);
    const btn = screen.getByTestId('staff-chat-attach-preview');
    expect(btn).toBeTruthy();

    // (8) Click 👁 → onPreview called with pdfPreviewUrl (NOT the original fullUrl)
    fireEvent.click(btn);
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      fileUrl: ready.attachments[0].pdfPreviewUrl,
      name: 'report.docx',
    }));
    expect(onPreview).not.toHaveBeenCalledWith(expect.objectContaining({ fileUrl: 'gs://orig' }));
    view.unmount();
    cleanup();
  });
});

describe('OP-F2 — pending → failed → ⚠ tooltip from server', () => {
  it('chains client-stamp → Cloud Function patch (failed) → ⚠ tooltip', () => {
    const filePath = 'staff-chat-attachments/BR1/M2/locked.docx';
    const initial = buildMessageDoc(basePayload({
      attachments: [{ name: 'locked.docx', mimeType: DOCX, size: 500, fullUrl: 'gs://locked', fullPath: filePath }],
    }));
    const failed = simulateCloudFunctionPatch(initial, filePath, {
      pdfPreviewStatus: OfficePreviewStatus.FAILED,
      pdfPreviewUrl: null,
      pdfPreviewError: 'แปลงไฟล์ไม่ได้ — ไฟล์มีรหัสผ่าน',
    });
    expect(pdfPreviewStateOf(failed.attachments[0])).toBe('failed');
    render(<StaffChatAttachmentCard att={failed.attachments[0]} onPreview={vi.fn()} />);
    const warn = screen.getByTestId('staff-chat-attach-failed');
    expect(warn.getAttribute('title')).toContain('รหัสผ่าน');
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });
});

describe('OP-F3 — unsupported MIME (.odt) → never stamped → download-only card', () => {
  it('client doesn\'t stamp Office fields; attachmentKindFor returns "file"; card shows ⬇ only', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'notes.odt', mimeType: ODT, size: 100, fullUrl: 'gs://odt', fullPath: 'staff-chat-attachments/BR1/M3/notes.odt' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBeUndefined();
    expect(attachmentKindFor(ODT)).toBe('file');
    expect(pdfPreviewStateOf(doc.attachments[0])).toBe('na');
    render(<StaffChatAttachmentCard att={doc.attachments[0]} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.queryByTestId('staff-chat-attach-pending')).toBeNull();
    expect(screen.queryByTestId('staff-chat-attach-failed')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });
});

describe('OP-F4 — pre-existing PDF (V73 baseline) untouched', () => {
  it('PDF attachment renders 👁 + ⬇ as before, no Office state machine', () => {
    const doc = buildMessageDoc(basePayload({
      attachments: [{ name: 'x.pdf', mimeType: 'application/pdf', size: 100, fullUrl: 'https://pdf', fullPath: 'p/q/r/x.pdf' }],
    }));
    expect(doc.attachments[0].pdfPreviewStatus).toBeUndefined();
    expect(attachmentKindFor('application/pdf')).toBe('pdf');
    const onPreview = vi.fn();
    render(<StaffChatAttachmentCard att={doc.attachments[0]} onPreview={onPreview} />);
    fireEvent.click(screen.getByTestId('staff-chat-attach-preview'));
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: 'https://pdf' }));
    cleanup();
  });
});

describe('OP-F5 — race-safe attachment match (V73 normalizer drops id; Cloud Function matches by fullPath)', () => {
  it('mixed-attachments message — Cloud Function patches ONLY the matching slot, not the whole array', () => {
    const docxPath = 'staff-chat-attachments/BR1/M5/doc.docx';
    const initial = buildMessageDoc(basePayload({
      attachments: [
        { name: 'photo.png', mimeType: 'image/png', size: 100, fullUrl: 'gs://x', fullPath: 'p/q/r/photo.png' },
        { name: 'doc.docx', mimeType: DOCX, size: 200, fullUrl: 'gs://y', fullPath: docxPath },
        { name: 'file.pdf', mimeType: 'application/pdf', size: 300, fullUrl: 'gs://z', fullPath: 'p/q/r/file.pdf' },
      ],
    }));
    // Only the .docx has pending status
    expect(initial.attachments[0].pdfPreviewStatus).toBeUndefined();
    expect(initial.attachments[1].pdfPreviewStatus).toBe('pending');
    expect(initial.attachments[2].pdfPreviewStatus).toBeUndefined();

    // Cloud Function patches by fullPath — neighbors untouched
    const ready = simulateCloudFunctionPatch(initial, docxPath, {
      pdfPreviewStatus: OfficePreviewStatus.READY,
      pdfPreviewUrl: 'https://pdf-cache',
      pdfPreviewError: null,
    });
    expect(ready.attachments[0]).toEqual(initial.attachments[0]); // image untouched
    expect(ready.attachments[1].pdfPreviewStatus).toBe('ready');  // .docx patched
    expect(ready.attachments[1].pdfPreviewUrl).toBe('https://pdf-cache');
    expect(ready.attachments[2]).toEqual(initial.attachments[2]); // PDF untouched
  });
});
