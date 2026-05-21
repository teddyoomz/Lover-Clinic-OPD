// ─── V83 — Modal explicit-close-only Rule I flow-simulate (AV78) ─────
// EOD8 (2026-05-18). REAL DOM event dispatch (not source-grep).
// 6 close-vector scenarios × generic modal shape mirror.
//
// Rule Q V66 note: this is a CONTRACT test (RTL on jsdom). It proves
// the canonical post-V83 shape works correctly under React render +
// event dispatch. Rule Q L1/L2 (real browser / real client SDK) lives
// in separate Playwright spec + admin SDK script.

import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
import React from 'react';

// Generic shape mirroring the canonical post-V83 modal
function StrippedModal({ onClose, children, testId = 'v83-test-modal' }) {
  return (
    /* AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC) */
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      data-testid={testId}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      tabIndex={-1}
    >
      <div
        className="bg-white rounded-2xl p-4"
        onClick={(e) => e.stopPropagation()}
        data-testid={`${testId}-content`}
      >
        <button onClick={onClose} aria-label="ปิด" data-testid={`${testId}-x`}>X</button>
        <div data-testid={`${testId}-form-content`}>{children || 'form content'}</div>
        <button onClick={onClose} data-testid={`${testId}-cancel`}>ยกเลิก</button>
      </div>
    </div>
  );
}

describe('V83 — Modal explicit-close-only flow-simulate (AV78)', () => {
  describe('F1 — Click on backdrop does NOT close', () => {
    it('F1.1 — single click on backdrop → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-test-modal'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('F1.2 — 20 rapid clicks on backdrop → onClose NEVER called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      const backdrop = getByTestId('v83-test-modal');
      for (let i = 0; i < 20; i++) fireEvent.click(backdrop);
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F2 — Click on content does NOT close', () => {
    it('F2.1 — click on content div → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-test-modal-content'));
      expect(onClose).not.toHaveBeenCalled();
    });

    it('F2.2 — click on form-content div → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-test-modal-form-content'));
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F3 — X button closes', () => {
    it('F3.1 — click X button → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-test-modal-x'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('F4 — Cancel button closes', () => {
    it('F4.1 — click Cancel button → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-test-modal-cancel'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('F5 — ESC key closes', () => {
    it('F5.1 — keydown Escape on backdrop → onClose called once', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.keyDown(getByTestId('v83-test-modal'), { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('F5.2 — keydown non-Escape (Enter) → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.keyDown(getByTestId('v83-test-modal'), { key: 'Enter' });
      expect(onClose).not.toHaveBeenCalled();
    });

    it('F5.3 — keydown ArrowDown → onClose NOT called', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<StrippedModal onClose={onClose} />);
      fireEvent.keyDown(getByTestId('v83-test-modal'), { key: 'ArrowDown' });
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('F6 — Sanctioned lightbox EXCEPTION (TreatmentReadOnlyMirror inner-lightbox shape)', () => {
    // Mirror the remaining sanctioned lightbox shape — click backdrop CLOSES.
    // (StaffChatImageLightbox left the closed list 2026-05-22 → it's now a normal
    //  modal: ✕/Esc only. This abstract shape still covers TreatmentReadOnlyMirror.)
    function LightboxModal({ onClose }) {
      return (
        // audit-anti-vibe-code: AV78 lightbox-explicit-exception
        <div
          data-testid="v83-lightbox"
          onClick={onClose}
          className="fixed inset-0 bg-black/90 cursor-pointer"
        >
          <img src="data:image/png;base64,xxx" alt="test" />
        </div>
      );
    }

    it('F6.1 — backdrop click on lightbox CLOSES (sanctioned exception)', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(<LightboxModal onClose={onClose} />);
      fireEvent.click(getByTestId('v83-lightbox'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('F7 — Mixed interaction sequence (real user flow)', () => {
    it('F7.1 — fill form → accidentally click backdrop → modal stays → click X → modal closes', () => {
      const onClose = vi.fn();
      const { getByTestId } = render(
        <StrippedModal onClose={onClose}>
          <input data-testid="v83-form-input" />
        </StrippedModal>
      );

      // Step 1: fill form
      const input = getByTestId('v83-form-input');
      fireEvent.change(input, { target: { value: 'important data' } });

      // Step 2: accidentally click backdrop (the user pain scenario)
      fireEvent.click(getByTestId('v83-test-modal'));
      expect(onClose).not.toHaveBeenCalled(); // modal stays
      expect(input.value).toBe('important data'); // data preserved

      // Step 3: click X explicitly
      fireEvent.click(getByTestId('v83-test-modal-x'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
