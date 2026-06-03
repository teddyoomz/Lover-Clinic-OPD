// Regression: import-order surfaces must display the stored creator
// (be_stock_orders / be_central_stock_orders store the actor as `createdBy`,
// NOT `user` — adjust/transfer store `user`). V47-class display gap + a
// field-name mismatch (central modal had been reading `order.user` → '-').
//
// Root cause (systematic-debugging 2026-06-03 EOD+5):
//   - createStockOrder / createCentralStockOrder stamp `createdBy: {userId,userName}`
//     (backendClient.js) and the create call-sites pass {user} via a REQUIRED
//     ActorPicker → 29/29 prod branch orders have createdBy.userName populated.
//   - But OrderPanel table + OrderDetailModal never rendered it; the central
//     table never rendered it; and CentralOrderDetailModal read `order.user`
//     (wrong field) → always showed '-'.
// Fix: all 4 import-order surfaces read `createdBy?.userName || user?.userName || '-'`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const ORDER_PANEL = 'src/components/backend/OrderPanel.jsx';
const ORDER_MODAL = 'src/components/backend/OrderDetailModal.jsx';
const CENTRAL_PANEL = 'src/components/backend/CentralStockOrderPanel.jsx';
const CENTRAL_MODAL = 'src/components/backend/CentralOrderDetailModal.jsx';
const ADJUST_MODAL = 'src/components/backend/AdjustDetailModal.jsx';
const TRANSFER_MODAL = 'src/components/backend/TransferDetailModal.jsx';

describe('order-creator-display — branch import-order (table + modal)', () => {
  const panel = read(ORDER_PANEL);
  const modal = read(ORDER_MODAL);
  it('A1 table has a ผู้ทำรายการ column header', () => {
    expect(panel).toContain('ผู้ทำรายการ');
  });
  it('A2 table row reads createdBy?.userName (with user fallback)', () => {
    expect(panel).toMatch(/o\.createdBy\?\.userName \|\| o\.user\?\.userName/);
  });
  it('A3 table row exposes order-row-actor testid', () => {
    expect(panel).toContain('order-row-actor');
  });
  it('B1 detail modal has ผู้ทำรายการ field', () => {
    expect(modal).toContain('ผู้ทำรายการ');
  });
  it('B2 detail modal reads order.createdBy?.userName (with user fallback)', () => {
    expect(modal).toMatch(/order\.createdBy\?\.userName \|\| order\.user\?\.userName/);
  });
  it('B3 detail modal exposes order-detail-actor testid', () => {
    expect(modal).toContain('order-detail-actor');
  });
});

describe('order-creator-display — central import-order (table + modal, Rule P same class)', () => {
  const panel = read(CENTRAL_PANEL);
  const modal = read(CENTRAL_MODAL);
  it('C1 central table has a ผู้ทำรายการ column header', () => {
    expect(panel).toContain('ผู้ทำรายการ');
  });
  it('C2 central table row reads createdBy?.userName (with user fallback)', () => {
    expect(panel).toMatch(/o\.createdBy\?\.userName \|\| o\.user\?\.userName/);
  });
  it('D1 central modal reads order.createdBy?.userName (latent-bug fix)', () => {
    expect(modal).toMatch(/order\.createdBy\?\.userName \|\| order\.user\?\.userName/);
  });
  it('D2 central modal no longer reads ONLY order.user for the actor (anti-regression)', () => {
    // The actor display must include createdBy; reading only `order.user?.userName` was the bug.
    expect(modal).not.toMatch(/central-detail-actor[^]*?\{order\.user\?\.userName \|\| '-'\}/);
  });
});

describe('order-creator-display — class boundary: adjust/transfer correctly use `user`', () => {
  it('E1 AdjustDetailModal reads data.user?.userName (adjust stores `user`, not `createdBy`)', () => {
    expect(read(ADJUST_MODAL)).toMatch(/data\.user\?\.userName/);
  });
  it('E2 TransferDetailModal reads data.user?.userName', () => {
    expect(read(TRANSFER_MODAL)).toMatch(/data\.user\?\.userName/);
  });
});
