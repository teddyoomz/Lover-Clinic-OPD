// tests/v73-staff-chat-image.test.js
// V73 Feature F (2026-05-16) — Helper unit tests for staffChatImageResize.
// IM1.1 + IM1.2 lock the isImageFile MIME gate (positive + negative).
import { describe, it, expect } from 'vitest';
import { isImageFile } from '../src/lib/staffChatImageResize.js';

describe('V73.IM1 image helpers', () => {
  it('IM1.1 isImageFile accepts JPEG/PNG/WEBP/GIF', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/webp' })).toBe(true);
    expect(isImageFile({ type: 'image/gif' })).toBe(true);
  });
  it('IM1.2 isImageFile rejects PDF/doc/video', () => {
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isImageFile({ type: 'text/plain' })).toBe(false);
  });
});
