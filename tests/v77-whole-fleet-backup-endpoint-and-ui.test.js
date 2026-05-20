// tests/v77-whole-fleet-backup-endpoint-and-ui.test.js
// V77 (2026-05-16 EOD+1) — Whole-fleet customer backup endpoint + UI
// source-grep regression bank.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const mockVerifyAdminToken = vi.fn();
vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminToken: mockVerifyAdminToken,
}));

beforeEach(() => vi.clearAllMocks());

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

describe('V77 — /api/admin/whole-fleet-customer-backup-export endpoint', () => {
  it('WFE1.1 — rejects non-admin (verifyAdminToken returns null)', async () => {
    mockVerifyAdminToken.mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return null;
    });
    const { default: handler } = await import('../api/admin/whole-fleet-customer-backup-export.js');
    const req = { method: 'POST', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('WFE1.2 — non-POST → 405', async () => {
    const { default: handler } = await import('../api/admin/whole-fleet-customer-backup-export.js');
    const req = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('WFE1.3 — source has per-customer failure isolation (try/catch in loop)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    expect(src).toMatch(/for\s*\(\s*const\s+customer\s+of\s+scoped\s*\)/);
    expect(src).toMatch(/failedCustomers/);
    // try inside the loop
    const loopBody = src.match(/for\s*\(\s*const\s+customer\s+of\s+scoped[\s\S]{0,2000}/);
    expect(loopBody[0]).toMatch(/try\s*\{[\s\S]{0,1000}?catch\s*\(\s*err/);
  });

  it('WFE1.4 — manifestHash via shared computeWholeFleetManifestHash (AV56)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    expect(src).toMatch(/computeWholeFleetManifestHash/);
    expect(src).toMatch(/buildWholeFleetManifest/);
  });

  it('WFE1.5 — branchId filter optional (where branchId == X when provided)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    expect(src).toMatch(/branchIdFilter/);
    expect(src).toMatch(/\.where\(['"]branchId['"],\s*['"]==['"]/);
  });

  it('WFE1.6 — emits audit doc + signed URL', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    expect(src).toMatch(/be_admin_audit/);
    expect(src).toMatch(/whole-fleet-backup-export/);
    expect(src).toMatch(/getSignedUrl/);
  });

  it('WFE1.7 — pre-fetches ALL chat_conversations ONCE (no N+1)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    // Single get() on chat_conversations OUTSIDE the loop
    const pre = src.match(/Pre-fetch ALL chat_conversations[\s\S]{0,500}?chatSnap/);
    expect(pre).not.toBeNull();
  });

  it('WFE1.8 — V77 marker present', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-backup-export.js', 'utf8');
    expect(src).toMatch(/V77 \(2026-05-16/);
  });

  it('WFE1.9 — vercel.json bumps maxDuration to 300', () => {
    const vc = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
    expect(vc.functions['api/admin/whole-fleet-customer-backup-export.js']).toBeTruthy();
    expect(vc.functions['api/admin/whole-fleet-customer-backup-export.js'].maxDuration).toBe(300);
  });
});

describe('V77 — WholeFleetBackupModal UI', () => {
  const src = fs.readFileSync('src/components/backend/WholeFleetBackupModal.jsx', 'utf8');

  it('WFM1.1 — exports default React component', () => {
    expect(src).toMatch(/export default function WholeFleetBackupModal/);
  });

  it('WFM1.2 — calls /api/admin/whole-fleet-customer-backup-export', () => {
    expect(src).toMatch(/\/api\/admin\/whole-fleet-customer-backup-export/);
  });

  it('WFM1.3 — sends userNote + branchId in body', () => {
    expect(src).toMatch(/userNote/);
    expect(src).toMatch(/branchId/);
  });

  it('WFM1.4 — displays manifestRef + manifestHash + downloadUrl on success', () => {
    expect(src).toMatch(/manifestRef/);
    expect(src).toMatch(/manifestHash/);
    expect(src).toMatch(/downloadUrl/);
  });

  it('WFM1.5 — shows failedCustomers warning when failed > 0', () => {
    expect(src).toMatch(/failedCustomers/);
    expect(src).toMatch(/result\.failed/);
  });

  it('WFM1.6 — V77 marker comment', () => {
    expect(src).toMatch(/V77 \(2026-05-16/);
  });

  it('WFM1.7 — data-testid anchors for E2E', () => {
    expect(src).toMatch(/data-testid="whole-fleet-backup-modal"/);
    expect(src).toMatch(/data-testid="whole-fleet-start-btn"/);
    expect(src).toMatch(/data-testid="whole-fleet-result"/);
  });
});

describe('V77 — BackupManagerTab 📦 button wire', () => {
  const src = fs.readFileSync('src/components/backend/BackupManagerTab.jsx', 'utf8');

  it('BMT1.1 — imports WholeFleetBackupModal', () => {
    expect(src).toMatch(/import\s+WholeFleetBackupModal\s+from/);
  });

  // BMT1.2/1.3/1.4 removed 2026-05-20 (were .skip tombstones — the V77
  // WholeFleetBackupModal wire was deleted from BackupManagerTab in V81-fix4,
  // superseded by the V81 WholeSystem backup section + V81-fix6 customer-only
  // backups). BMT1.1/1.5 still lock the remaining contract.

  it('BMT1.5 — V77 marker', () => {
    expect(src).toMatch(/V77 \(2026-05-16/);
  });
});

describe('V77 — ChatPanel legacy ConnectionSettings removal verification', () => {
  const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');

  it('V77a.1 — ConnectionSettings function deleted (no callable function definition)', () => {
    // Acceptable: marker comments may mention it; what must NOT exist is an
    // active `function ConnectionSettings(` definition.
    expect(src).not.toMatch(/^function ConnectionSettings\(/m);
    expect(src).not.toMatch(/^export function ConnectionSettings\(/m);
  });

  it('V77a.2 — showSettings state removed', () => {
    expect(src).not.toMatch(/const\s+\[\s*showSettings\s*,\s*setShowSettings\s*\]/);
  });

  it('V77a.3 — setShowSettings(true) invocations removed', () => {
    expect(src).not.toMatch(/setShowSettings\(true\)/);
  });

  it('V77a.4 — <ConnectionSettings...> JSX usage removed', () => {
    expect(src).not.toMatch(/<ConnectionSettings\s/);
  });

  it('V77a.5 — empty-state CTA points to Backend tabs (not legacy modal)', () => {
    expect(src).toMatch(/ตั้งค่า LINE OA|ตั้งค่า FB Page/);
  });

  it('V77a.6 — V77 removal marker present', () => {
    expect(src).toMatch(/V77 \(2026-05-16[\s\S]{0,200}(REMOVED|ConnectionSettings|sub-panel)/);
  });
});
