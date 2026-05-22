// tests/staff-chat-office-card-rtl.test.jsx
//
// T3 — StaffChatAttachmentCard renders 4 states for Office attachments:
//   pending → ⏳ disabled, NO 👁; ⬇ works
//   ready   → 👁 (opens overlay with pdfPreviewUrl); ⬇ works
//   failed  → ⚠ + tooltip = pdfPreviewError; NO 👁; ⬇ works
//   unsupported → NO preview affordance at all; just ⬇
// Pre-existing PDF behaviour (V73) unchanged.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import { StaffChatAttachmentCard } from '../src/components/staffchat/StaffChatAttachmentCard.jsx';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const baseAtt = (overrides = {}) => ({
  name: 'test.docx',
  mimeType: DOCX_MIME,
  size: 12345,
  fullUrl: 'gs://orig-url',
  fullPath: 'staff-chat-attachments/BR/M/test.docx',
  ...overrides,
});

describe('OP-T3 — StaffChatAttachmentCard for Office attachments', () => {
  it('OP-T3.1 — pending: ⏳ shown, NO 👁, ⬇ present', () => {
    render(<StaffChatAttachmentCard att={baseAtt({ pdfPreviewStatus: 'pending', pdfPreviewUrl: null, pdfPreviewError: null })} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-pending')).toBeTruthy();
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.2 — ready: 👁 present, clicking calls onPreview with pdfPreviewUrl, ⬇ present', () => {
    const onPreview = vi.fn();
    render(<StaffChatAttachmentCard att={baseAtt({ pdfPreviewStatus: 'ready', pdfPreviewUrl: 'https://pdf-url', pdfPreviewError: null })} onPreview={onPreview} />);
    const preview = screen.getByTestId('staff-chat-attach-preview');
    expect(preview).toBeTruthy();
    fireEvent.click(preview);
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({
      fileUrl: 'https://pdf-url',
      name: 'test.docx',
    }));
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.3 — failed: ⚠ tooltip from pdfPreviewError; NO 👁; ⬇ present', () => {
    render(<StaffChatAttachmentCard att={baseAtt({
      pdfPreviewStatus: 'failed',
      pdfPreviewUrl: null,
      pdfPreviewError: 'แปลงไฟล์ไม่ได้ — ไฟล์อาจเสียหายหรือต้องใช้รหัสผ่าน',
    })} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    const failed = screen.getByTestId('staff-chat-attach-failed');
    expect(failed.getAttribute('title')).toContain('แปลงไฟล์ไม่ได้');
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.4 — unsupported: NO preview affordance, just ⬇', () => {
    render(<StaffChatAttachmentCard att={baseAtt({ pdfPreviewStatus: 'unsupported', pdfPreviewUrl: null, pdfPreviewError: null })} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.queryByTestId('staff-chat-attach-pending')).toBeNull();
    expect(screen.queryByTestId('staff-chat-attach-failed')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.5 — pre-existing PDF behaviour unchanged (👁 still opens overlay)', () => {
    const onPreview = vi.fn();
    render(<StaffChatAttachmentCard att={{ name: 'doc.pdf', mimeType: 'application/pdf', size: 100, fullUrl: 'https://pdf' }} onPreview={onPreview} />);
    const preview = screen.getByTestId('staff-chat-attach-preview');
    fireEvent.click(preview);
    expect(onPreview).toHaveBeenCalledWith(expect.objectContaining({ fileUrl: 'https://pdf', name: 'doc.pdf' }));
    cleanup();
  });

  it('OP-T3.6 — non-Office non-PDF (.zip): just ⬇, no preview affordance', () => {
    render(<StaffChatAttachmentCard att={{ name: 'a.zip', mimeType: 'application/zip', size: 100, fullUrl: 'https://zip' }} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-download')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.7 — Office without explicit pdfPreviewStatus → treated as pending (legacy/inflight)', () => {
    render(<StaffChatAttachmentCard att={baseAtt({})} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-pending')).toBeTruthy();
    cleanup();
  });

  it('OP-T3.8 — ready WITHOUT pdfPreviewUrl → defensive fallback to pending', () => {
    render(<StaffChatAttachmentCard att={baseAtt({ pdfPreviewStatus: 'ready', pdfPreviewUrl: '', pdfPreviewError: null })} onPreview={vi.fn()} />);
    expect(screen.queryByTestId('staff-chat-attach-preview')).toBeNull();
    expect(screen.getByTestId('staff-chat-attach-pending')).toBeTruthy();
    cleanup();
  });
});
