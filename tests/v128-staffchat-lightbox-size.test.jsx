// V128.lb (2026-05-28) — StaffChat image preview was capped at max-w-4xl
// (896px) → tiny on a 2K screen. Now viewport-relative (maxWidth 96vw +
// maxHeight 100dvh minus chrome), matching the shared ImageLightbox pro
// reference. AV146.
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import StaffChatImageLightbox from '../src/components/staffchat/StaffChatImageLightbox.jsx';

// The lightbox preloads each image via fetch() on mount; jsdom has none, and
// the component's try/catch falls back to the original URL. Stub it to a clean
// reject + restore (AV41 global.fetch isolation).
const ORIGINAL_FETCH = global.fetch;
beforeAll(() => { global.fetch = () => Promise.reject(new Error('test-no-net')); });
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });
beforeEach(() => cleanup());

describe('V128.lb StaffChatImageLightbox — viewport-relative (pro) sizing', () => {
  it('LB1: single image — FILL SCREEN: width 100% + height 100% of the full-viewport wrapper (upscales small imgs)', () => {
    render(<StaffChatImageLightbox src="blob:single" onClose={() => {}} />);
    const img = screen.getByTestId('staff-chat-lightbox-image');
    // 100% (NOT max-*) so object-contain UPSCALES a small image to fill; 100% (NOT
    // 100vw) avoids the scrollbar gutter.
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
  });

  it('LB2: multi image — ALSO full screen (100% × 100%); chrome overlays the edges', () => {
    render(
      <StaffChatImageLightbox
        images={[{ fullUrl: 'blob:a', thumbUrl: 'blob:a' }, { fullUrl: 'blob:b', thumbUrl: 'blob:b' }]}
        onClose={() => {}}
      />,
    );
    const img = screen.getByTestId('staff-chat-lightbox-image');
    expect(img.style.width).toBe('100%');
    expect(img.style.height).toBe('100%');
  });

  it('LB3: img is NOT constrained by a small fixed max-w cap', () => {
    render(<StaffChatImageLightbox src="blob:x" onClose={() => {}} />);
    const img = screen.getByTestId('staff-chat-lightbox-image');
    expect(img.className).not.toMatch(/max-w-(xs|sm|md|lg|xl|\dxl)/);
    expect(img.className).toContain('object-contain');
  });
});

describe('V128.lb source-grep (AV146)', () => {
  const lb = readFileSync('src/components/staffchat/StaffChatImageLightbox.jsx', 'utf8');
  const av = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

  it('SG1: no small fixed max-w cap on the fullscreen image lightbox', () => {
    expect(lb).not.toMatch(/max-w-4xl/);
    expect(lb).not.toMatch(/max-w-3xl/);
    expect(lb).not.toMatch(/h-\[78vh\]/);
  });
  it('SG2: FILL-SCREEN sizing — width:100% height:100% of a w-full h-full wrapper (upscales, no gutter)', () => {
    expect(lb).toMatch(/width: '100%'/);
    expect(lb).toMatch(/height: '100%'/);
    expect(lb).toMatch(/relative w-full h-full flex/);   // wrapper fills the viewport
    // must NOT regress to max-* (caps, never upscales) or 100vw (scrollbar gutter)
    expect(lb).not.toMatch(/maxWidth: '100vw'/);
    expect(lb).not.toMatch(/width: '100vw'/);
  });
  it('SG3: AV146 invariant present', () => {
    expect(av).toMatch(/### AV146 —/);
    expect(av).toMatch(/StaffChatImageLightbox/);
  });

  it('SG4: pro pan-zoom — drag-to-pan + wheel-zoom + clamped translate transform (V128.lb2)', () => {
    expect(lb).toMatch(/const \[pan, setPan\] = useState/);
    expect(lb).toMatch(/const clampPan = /);
    expect(lb).toMatch(/onWheel=\{onImageWheel\}/);
    expect(lb).toMatch(/onPointerDown=\{onImagePointerDown\}/);
    expect(lb).toMatch(/onPointerMove=\{onImagePointerMove\}/);
    expect(lb).toMatch(/setPointerCapture/);
    // pan applied in screen px before scale; transition off while dragging
    expect(lb).toMatch(/transform: `translate\(\$\{pan\.x\}px, \$\{pan\.y\}px\) scale\(\$\{zoom\}\)`/);
    expect(lb).toMatch(/touchAction: zoom > 1 \? 'none' : 'auto'/);
  });
});
