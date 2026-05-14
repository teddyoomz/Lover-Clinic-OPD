import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import MakeFreshModal from '../src/components/backend/MakeFreshModal.jsx';
import { BUCKETS, bucketDefaultsForUI } from '../src/lib/branchBackupBuckets.js';

// Mock firebase auth — auth.currentUser.getIdToken returns a fake token
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'mock-id-token' } },
  db: {},
}));

const SAMPLE_BRANCH = { branchId: 'BR-A', branchName: 'นครราชสีมา' };

describe('F1 MakeFreshModal — Rule I full-flow simulate', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('F1.1 — opens with Q4-B default: 6 checked + customerActivity unchecked', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    const defaults = bucketDefaultsForUI();
    for (const id of Object.keys(BUCKETS)) {
      const checkbox = screen.getByTestId(`bucket-${id}`);
      expect(checkbox.checked, `bucket-${id}`).toBe(defaults[id]);
    }
  });

  it('F1.2 — preview button disabled when zero buckets ticked', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    // Untick all 6 default-checked buckets
    for (const id of Object.keys(BUCKETS)) {
      const cb = screen.getByTestId(`bucket-${id}`);
      if (cb.checked) fireEvent.click(cb);
    }
    const previewBtn = screen.getByTestId('preview-btn');
    expect(previewBtn.disabled).toBe(true);
  });

  it('F1.3 — preview flow displays per-bucket counts from dryRun response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        dryRun: true,
        scopeMode: 'buckets',
        perBucket: {
          appointments: { docs: 145, subDocs: 12, sizeBytes: 24567 },
          treatments: { docs: 89, subDocs: 89, sizeBytes: 15000 },
          sales: { docs: 60, subDocs: 60, sizeBytes: 12000 },
          stock: { docs: 234, subDocs: 0, sizeBytes: 50000 },
          finance: { docs: 30, subDocs: 5, sizeBytes: 5000 },
          lineLink: { docs: 5, subDocs: 0, sizeBytes: 500 },
        },
        totalDocs: 729,
        estSizeBytes: 107067,
      }),
    });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => expect(screen.getByTestId('impact-panel')).toBeInTheDocument());
    expect(screen.getByText(/145/)).toBeInTheDocument();
    expect(screen.getByText(/729/)).toBeInTheDocument();
  });

  it('F1.4 — confirm requires typed branch-name match', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true, dryRun: true,
        perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
        totalDocs: 5, estSizeBytes: 100,
      }),
    });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));

    const confirmBtn = screen.getByTestId('confirm-btn');
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'wrong-name' } });
    expect(confirmBtn.disabled).toBe(true);

    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it('F1.5 — full success flow: preview → confirm → backup → wipe → done', async () => {
    fetchMock
      .mockResolvedValueOnce({ // dryRun preview
        ok: true,
        json: async () => ({
          ok: true, dryRun: true,
          perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
          totalDocs: 5, estSizeBytes: 100,
        }),
      })
      .mockResolvedValueOnce({ // auto-backup
        ok: true,
        json: async () => ({
          ok: true,
          storagePath: 'backups/BR-A/auto-pre-fresh-1700-abc.json',
          bodyHash: 'a'.repeat(64),
        }),
      })
      .mockResolvedValueOnce({ // make-fresh
        ok: true,
        json: async () => ({
          ok: true,
          deletedCounts: { be_appointments: 5 },
          bodyHash: 'a'.repeat(64),
          auditId: 'branch-make-fresh-1700-xyz',
        }),
      });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));
    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    fireEvent.click(screen.getByTestId('confirm-btn'));

    await waitFor(() => expect(screen.getByText(/เสร็จสิ้น/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/branch-make-fresh-1700-xyz/)).toBeInTheDocument();
  });

  it('F1.6 — error path: BACKUP_INTEGRITY_FAIL shows error + preserves backup path', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true, dryRun: true,
          perBucket: { appointments: { docs: 5, subDocs: 0, sizeBytes: 100 } },
          totalDocs: 5, estSizeBytes: 100,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          storagePath: 'backups/BR-A/auto-pre-fresh-1700-abc.json',
          bodyHash: 'a'.repeat(64),
        }),
      })
      .mockResolvedValueOnce({ // make-fresh — hash mismatch
        ok: false,
        json: async () => ({ ok: false, error: 'BACKUP_INTEGRITY_FAIL' }),
      });

    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('preview-btn'));
    await waitFor(() => screen.getByTestId('continue-btn'));
    fireEvent.click(screen.getByTestId('continue-btn'));
    fireEvent.change(screen.getByTestId('confirm-input'), { target: { value: 'นครราชสีมา' } });
    fireEvent.click(screen.getByTestId('confirm-btn'));

    await waitFor(() => expect(screen.getByText(/BACKUP_INTEGRITY_FAIL/)).toBeInTheDocument(), { timeout: 3000 });
    expect(screen.getByText(/backups\/BR-A\/auto-pre-fresh-1700-abc\.json/)).toBeInTheDocument();
  });

  it('F1.7 — advanced toggle reveals collection list per bucket', () => {
    render(<MakeFreshModal branch={SAMPLE_BRANCH} onClose={() => {}} />);
    fireEvent.click(screen.getByTestId('advanced-toggle'));
    // After toggle, "collections:" labels should appear inside each bucket card
    expect(screen.getAllByText(/collections:/).length).toBeGreaterThan(0);
  });
});
