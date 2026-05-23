// V114 (2026-05-23 EOD+1 LATE+2) — Receipt-info toggle in preview header.
//
// Test layers:
//   H1-H6   — useReceiptInfoToggle hook unit (default OFF, localStorage R/W,
//             cross-tab storage event, type coercion, private-mode graceful)
//   SG1-SG6 — Source-grep regression locks at SalePrintView + QuotationPrintView
//   R1-R10  — RTL render: switch toggle, compact HN+phone, block conditional,
//             no-phone edge, a11y (role=switch + aria-checked)
//   F1-F3   — Rule I cross-view flow-simulate: Sale ↔ Quotation shared state
//             via single localStorage key (Q5=A)
//
// Spec: docs/superpowers/specs/2026-05-23-receipt-info-toggle-design.html
// Plan: docs/superpowers/plans/2026-05-23-receipt-info-toggle.html
// Parent: V111 + V112-A + V113 + V113-C (AV111 + AV112 + AV113 all stay valid;
// V114 is additive UI over V113-C).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { useReceiptInfoToggle } from '../src/hooks/useReceiptInfoToggle.js';

const STORAGE_KEY = 'lover_receipt_show_address';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ───────────────────────────────────────────────────────────────────────────
// V114.H — useReceiptInfoToggle hook unit tests
// ───────────────────────────────────────────────────────────────────────────

describe('V114.H — useReceiptInfoToggle hook', () => {
  beforeEach(() => {
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
  });

  it('H1: defaults to false when localStorage empty (Q3=B PDPA-friendly)', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H2: reads existing "true" from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(true);
  });

  it('H2b: reads existing "false" from localStorage on mount', () => {
    localStorage.setItem(STORAGE_KEY, 'false');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H3: setShowAddress(true) persists "true" to localStorage', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(true));
    expect(result.current.showAddress).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('H3b: setShowAddress(false) persists "false" to localStorage', () => {
    localStorage.setItem(STORAGE_KEY, 'true');
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(false));
    expect(result.current.showAddress).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('H4: cross-tab storage event updates state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
    act(() => {
      localStorage.setItem(STORAGE_KEY, 'true');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'true' }));
    });
    expect(result.current.showAddress).toBe(true);
  });

  it('H4b: storage event for UNRELATED key does NOT affect state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'some_other_key', newValue: 'whatever' }));
    });
    expect(result.current.showAddress).toBe(false);
  });

  it('H5: invalid localStorage value falls back to default false', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    const { result } = renderHook(() => useReceiptInfoToggle());
    expect(result.current.showAddress).toBe(false);
  });

  it('H6: setShowAddress coerces truthy non-bool to boolean true', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(1));
    expect(result.current.showAddress).toBe(true);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('true');
  });

  it('H6b: setShowAddress coerces falsy to boolean false', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    act(() => result.current.setShowAddress(true));
    act(() => result.current.setShowAddress(null));
    expect(result.current.showAddress).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe('false');
  });

  it('H6c: localStorage throw (private mode) — set still updates in-memory state', () => {
    const { result } = renderHook(() => useReceiptInfoToggle());
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); };
    try {
      act(() => result.current.setShowAddress(true));
      expect(result.current.showAddress).toBe(true); // in-memory state still updated
    } finally {
      Storage.prototype.setItem = origSet;
    }
  });
});
