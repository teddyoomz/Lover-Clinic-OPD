import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock listStaff + listDoctors (scopedDataLayer) BEFORE importing modal
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listStaff: vi.fn(() => Promise.resolve([
    { id: 'staff-1', name: 'ปุ๊ก', branchIds: ['BR-A'] },
    { id: 'staff-2', name: 'แอน', branchIds: ['BR-B'] },
  ])),
  listDoctors: vi.fn(() => Promise.resolve([
    { id: 'doc-1', name: 'หมอมายด์', position: 'แพทย์', branchIds: ['BR-A'] },
    { id: 'doc-2', name: 'พี่อร', position: 'ผู้ช่วยแพทย์', branchIds: ['BR-A'] },
    { id: 'doc-3', name: 'หมอบี', position: 'แพทย์', branchIds: ['BR-B'] },
  ])),
}));

// Mock BranchContext
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A' }),
}));

import EditAttributionModal from '../src/components/backend/EditAttributionModal.jsx';

describe('Phase 26.1 — EditAttributionModal RTL', () => {
  it('E1 — modal renders only when isOpen=true', () => {
    const { rerender } = render(
      <EditAttributionModal isOpen={false} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    expect(screen.queryByTestId('edit-attribution-modal')).toBeNull();

    rerender(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    expect(screen.queryByTestId('edit-attribution-modal')).toBeInTheDocument();
  });

  it('E2 — picker lists staff + doctors + assistants filtered by branch BR-A', async () => {
    render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => {
      const picker = screen.getByTestId('edit-attribution-picker');
      expect(picker).toBeInTheDocument();
      const options = picker.querySelectorAll('option');
      // 1 placeholder + 3 BR-A people (doc-1, doc-2 assistant, staff-1) — doc-3 + staff-2 are BR-B
      expect(options.length).toBeGreaterThanOrEqual(4);
      const texts = Array.from(options).map(o => o.textContent || '');
      expect(texts.some(t => t.includes('หมอมายด์'))).toBe(true);
      expect(texts.some(t => t.includes('พี่อร'))).toBe(true);
      expect(texts.some(t => t.includes('ปุ๊ก'))).toBe(true);
      // BR-B people should NOT appear
      expect(texts.some(t => t.includes('แอน'))).toBe(false);
      expect(texts.some(t => t.includes('หมอบี'))).toBe(false);
    });
  });

  it('E3 — role labels rendered inline ("Name · แพทย์ / · ผู้ช่วย / · พนักงาน")', async () => {
    render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => {
      const picker = screen.getByTestId('edit-attribution-picker');
      const texts = Array.from(picker.querySelectorAll('option')).map(o => o.textContent || '');
      // หมอมายด์ (position='แพทย์') → "หมอมายด์ · แพทย์"
      expect(texts.some(t => /หมอมายด์.*แพทย์/.test(t))).toBe(true);
      // พี่อร (position='ผู้ช่วยแพทย์') → "พี่อร · ผู้ช่วย"
      expect(texts.some(t => /พี่อร.*ผู้ช่วย/.test(t))).toBe(true);
      // ปุ๊ก (staff) → "ปุ๊ก · พนักงาน"
      expect(texts.some(t => /ปุ๊ก.*พนักงาน/.test(t))).toBe(true);
    });
  });

  it('E4 — "บันทึก" disabled until selection; calls onConfirm with {uid, name, role}', async () => {
    const onConfirm = vi.fn();
    render(
      <EditAttributionModal isOpen={true} onConfirm={onConfirm} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => screen.getByTestId('edit-attribution-picker'));

    const confirmBtn = screen.getByTestId('edit-attribution-confirm');
    expect(confirmBtn).toBeDisabled();

    const picker = screen.getByTestId('edit-attribution-picker');
    fireEvent.change(picker, { target: { value: 'doc-1' } });

    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      uid: 'doc-1',
      name: 'หมอมายด์',
      role: 'doctor',
    });
  });

  it('E5 — "ยกเลิก" + backdrop click → onCancel', async () => {
    const onCancel = vi.fn();
    const { container } = render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={onCancel} isDark={false} />
    );
    await waitFor(() => screen.getByTestId('edit-attribution-picker'));

    const cancelBtn = screen.getByTestId('edit-attribution-cancel');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Backdrop click
    onCancel.mockClear();
    const backdrop = screen.getByTestId('edit-attribution-modal');
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
