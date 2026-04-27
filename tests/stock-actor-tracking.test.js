// Stock Actor Tracking — every state-flip emitting a movement records
// WHO performed it (force-pick: empty default + required).
//
// User directive 2026-04-27 (verbatim selection):
//   1. Picker scope: "ทุก state-flip ที่ emit movement"
//   2. Default: "Default = empty + บังคับเลือกทุกครั้ง"
//
// Sites covered (5 create modals + 6 state-flip handlers + log column):
//   - OrderPanel.OrderCreateForm + OrderPanel cancel-confirm modal
//   - StockAdjustPanel.AdjustCreateForm
//   - StockTransferPanel.TransferCreateForm + 4 transition confirms (1/2/3/4)
//   - StockWithdrawalPanel.WithdrawalCreateForm + 3 transition confirms (1/2/3)
//   - CentralStockOrderPanel.CentralOrderCreateForm + receive + cancel confirms
//   - MovementLogPanel: new "ผู้ทำ" column reads movement.user.userName
//
// Iron-clad mapping:
//   C1 (Rule of 3): ActorPicker + ActorConfirmModal shared by 5 panels = 11+ callers
//   C2: actor identity is required → cannot create stock movement anonymously
//   D: every bug → adversarial test + project-wide regression guard
//   V14: resolveActorUser returns null (NEVER undefined) on missing pick
//   V31: ActorConfirmModal does NOT silent-swallow — onConfirm error surfaces

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveActorUser } from '../src/components/backend/ActorPicker.jsx';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const pickerSrc = read('src/components/backend/ActorPicker.jsx');
const confirmSrc = read('src/components/backend/ActorConfirmModal.jsx');
const orderSrc = read('src/components/backend/OrderPanel.jsx');
const adjustSrc = read('src/components/backend/StockAdjustPanel.jsx');
const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');
const centralPoSrc = read('src/components/backend/CentralStockOrderPanel.jsx');
const logSrc = read('src/components/backend/MovementLogPanel.jsx');

// ────────────────────────────────────────────────────────────────────────
// A1 — resolveActorUser pure helper
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A1 — resolveActorUser', () => {
  const sellers = [
    { id: 'S-1', name: 'นางสาว A' },
    { id: 'S-2', name: 'นาย B' },
    { id: 'S-3', name: '   ' },                  // whitespace name
    { id: 'S-4' },                                 // missing name
  ];

  it('A1.1 returns {userId, userName} on valid pick', () => {
    expect(resolveActorUser('S-1', sellers)).toEqual({ userId: 'S-1', userName: 'นางสาว A' });
  });

  it('A1.2 trims whitespace from userName', () => {
    expect(resolveActorUser('X', [{ id: 'X', name: '  Jane  ' }])).toEqual({ userId: 'X', userName: 'Jane' });
  });

  it('A1.3 string-coerced id lookup', () => {
    expect(resolveActorUser('1', [{ id: 1, name: 'A' }])).toEqual({ userId: '1', userName: 'A' });
  });

  it('A1.4 returns null when actorId empty/null/undefined', () => {
    expect(resolveActorUser('', sellers)).toBeNull();
    expect(resolveActorUser(null, sellers)).toBeNull();
    expect(resolveActorUser(undefined, sellers)).toBeNull();
  });

  it('A1.5 returns null when sellers not loaded yet', () => {
    expect(resolveActorUser('S-1', null)).toBeNull();
    expect(resolveActorUser('S-1', undefined)).toBeNull();
    expect(resolveActorUser('S-1', [])).toBeNull();
  });

  it('A1.6 returns null when picked id not in lookup (race-safe)', () => {
    expect(resolveActorUser('S-99', sellers)).toBeNull();
  });

  it('A1.7 returns null when matched seller has whitespace-only name', () => {
    expect(resolveActorUser('S-3', sellers)).toBeNull();
  });

  it('A1.8 returns null when matched seller has missing name', () => {
    expect(resolveActorUser('S-4', sellers)).toBeNull();
  });

  it('A1.9 V14 LOCK — never returns undefined', () => {
    // Walk every path: undefined inputs, missing fields, whitespace.
    expect(resolveActorUser('S-1', sellers)).not.toBeUndefined();
    expect(resolveActorUser('', sellers)).not.toBeUndefined();
    expect(resolveActorUser(null, null)).not.toBeUndefined();
  });
});

// ────────────────────────────────────────────────────────────────────────
// A2 — ActorPicker + ActorConfirmModal shared component contract
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A2 — shared components', () => {
  it('A2.1 ActorPicker default-exports a function', () => {
    expect(pickerSrc).toMatch(/^export default function ActorPicker\(/m);
  });

  it('A2.2 ActorPicker exports resolveActorUser helper', () => {
    expect(pickerSrc).toMatch(/^export function resolveActorUser\(/m);
  });

  it('A2.3 ActorPicker placeholder defaults to "— เลือกผู้ทำรายการ —"', () => {
    expect(pickerSrc).toContain('— เลือกผู้ทำรายการ —');
  });

  it('A2.4 ActorPicker required default is true (force-pick UX)', () => {
    expect(pickerSrc).toMatch(/required\s*=\s*true/);
  });

  it('A2.5 ActorConfirmModal default-exports a function', () => {
    expect(confirmSrc).toMatch(/^export default function ActorConfirmModal\(/m);
  });

  it('A2.6 ActorConfirmModal embeds ActorPicker (required pick before submit)', () => {
    expect(confirmSrc).toContain('<ActorPicker');
  });

  it('A2.7 ActorConfirmModal canConfirm gate requires actor', () => {
    expect(confirmSrc).toMatch(/canConfirm\s*=\s*!!actor/);
  });

  it('A2.8 ActorConfirmModal V31 — does NOT silent-swallow continuing pattern', () => {
    expect(confirmSrc).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('A2.9 ActorConfirmModal surfaces error from onConfirm (V31 — no swallow)', () => {
    // The catch block sets error state instead of swallowing.
    expect(confirmSrc).toMatch(/setError\(e\?\.message/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// A3 — All 5 panels load sellers + use ActorPicker in create form
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A3 — 5 panels wired', () => {
  const PANELS = [
    ['OrderPanel', orderSrc, 'order-create-actor'],
    ['StockAdjustPanel', adjustSrc, 'adjust-create-actor'],
    ['StockTransferPanel', transferSrc, 'transfer-create-actor'],
    ['StockWithdrawalPanel', withdrawalSrc, 'withdrawal-create-actor'],
    ['CentralStockOrderPanel', centralPoSrc, 'central-po-create-actor'],
  ];

  for (const [name, src, testId] of PANELS) {
    it(`A3.${name} imports listAllSellers + ActorPicker + resolveActorUser`, () => {
      expect(src).toMatch(/listAllSellers/);
      expect(src).toMatch(/import\s+ActorPicker.*resolveActorUser.*ActorPicker\.jsx/);
    });

    it(`A3.${name} eager-loads sellers via useEffect on mount`, () => {
      expect(src).toMatch(/setSellers\(/);
      expect(src).toMatch(/listAllSellers\(\)/);
    });

    it(`A3.${name} renders ActorPicker with testId="${testId}"`, () => {
      expect(src).toContain(`testId="${testId}"`);
    });

    it(`A3.${name} canSave includes actorUser gate (force-pick)`, () => {
      expect(src).toMatch(/!!actorUser|&&\s*actorUser/);
    });

    it(`A3.${name} writer call passes user: actorUser (NOT currentAuditUser)`, () => {
      // strip comments — we don't care about commentary referring to old code
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*\n/g, '\n');
      // Every {user: ...} call inside the create handlers should pass actorUser
      // (not currentAuditUser). Test allows other code paths (e.g. transitions
      // via ActorConfirmModal) to also use actorUser via {user: actor}.
      expect(stripped).toMatch(/user:\s*actorUser|user:\s*actor[\s,}]/);
    });
  }
});

// ────────────────────────────────────────────────────────────────────────
// A4 — Action confirmations use ActorConfirmModal (no native confirm()/prompt())
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A4 — state-flip confirmations', () => {
  it('A4.1 OrderPanel handleCancel opens ActorConfirmModal (no raw confirm())', () => {
    // strip comments
    const stripped = orderSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    // Old `confirm(msg)` pattern in handleCancel must be gone — outer
    // search: `if (!confirm(`. This used to live INSIDE handleCancel.
    const handleStart = stripped.indexOf('const handleCancel');
    expect(handleStart).toBeGreaterThan(0);
    const after = stripped.slice(handleStart, handleStart + 300);
    expect(after).not.toMatch(/if\s*\(\s*!confirm\(/);
    expect(after).toContain('setCancelTarget');
    // Modal element rendered somewhere in the file
    expect(stripped).toContain('<ActorConfirmModal');
  });

  it('A4.2 StockTransferPanel handleTransition opens ActorConfirmModal (no raw confirm()/prompt())', () => {
    const stripped = transferSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    const handleStart = stripped.indexOf('const handleTransition');
    expect(handleStart).toBeGreaterThan(0);
    const after = stripped.slice(handleStart, handleStart + 200);
    expect(after).not.toMatch(/if\s*\(\s*!confirm\(/);
    expect(after).not.toMatch(/prompt\(/);
    expect(after).toContain('setPendingAction');
    expect(stripped).toContain('<ActorConfirmModal');
  });

  it('A4.3 StockWithdrawalPanel handleTransition opens ActorConfirmModal', () => {
    const stripped = withdrawalSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    const handleStart = stripped.indexOf('const handleTransition');
    expect(handleStart).toBeGreaterThan(0);
    const after = stripped.slice(handleStart, handleStart + 200);
    expect(after).not.toMatch(/if\s*\(\s*!confirm\(/);
    expect(after).not.toMatch(/prompt\(/);
    expect(after).toContain('setPendingAction');
    expect(stripped).toContain('<ActorConfirmModal');
  });

  it('A4.4 CentralStockOrderPanel handleReceive + handleCancel open ActorConfirmModal', () => {
    const stripped = centralPoSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    const recvStart = stripped.indexOf('const handleReceive');
    const cancStart = stripped.indexOf('const handleCancel');
    expect(recvStart).toBeGreaterThan(0);
    expect(cancStart).toBeGreaterThan(0);
    // Neither uses raw confirm()/prompt() anymore
    const recvBlock = stripped.slice(recvStart, recvStart + 400);
    const cancBlock = stripped.slice(cancStart, cancStart + 200);
    expect(recvBlock).not.toMatch(/if\s*\(\s*!confirm\(/);
    expect(cancBlock).not.toMatch(/prompt\(/);
    expect(recvBlock).toContain('setPendingAction');
    expect(cancBlock).toContain('setPendingAction');
    expect(stripped).toContain('<ActorConfirmModal');
  });
});

// ────────────────────────────────────────────────────────────────────────
// A5 — MovementLogPanel renders new ผู้ทำ column
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A5 — MovementLogPanel ผู้ทำ column', () => {
  it('A5.1 thead has new "ผู้ทำ" column header', () => {
    // 8 columns now: date, type, product, qty, before, after, ผู้ทำ, link/note
    const tr = logSrc.match(/<tr>[\s\S]+?<\/tr>/);
    expect(tr).toBeTruthy();
    expect(tr[0]).toContain('ผู้ทำ');
  });

  it('A5.2 tbody td renders user.userName via testid', () => {
    expect(logSrc).toContain('data-testid="movement-actor"');
  });

  it('A5.3 user.userName falls back to "-" when missing (V14)', () => {
    expect(logSrc).toMatch(/typeof m\.user\?\.userName\s*===\s*'string'/);
    expect(logSrc).toMatch(/\?\s*m\.user\.userName\s*:\s*'-'/);
  });

  it('A5.4 NEVER displays raw userId (V22 lock generalized to actor)', () => {
    // strip comments
    const stripped = logSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    // The actor cell must read userName, never userId
    const cell = stripped.match(/data-testid="movement-actor"[\s\S]{0,300}/);
    expect(cell).toBeTruthy();
    expect(cell[0]).not.toMatch(/m\.user\?\.userId|m\.user\.userId/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// A6 — Iron-clad project-wide guards
// ────────────────────────────────────────────────────────────────────────
describe('actor-tracking A6 — iron-clad guards', () => {
  const PANELS = [
    ['OrderPanel.jsx', orderSrc],
    ['StockAdjustPanel.jsx', adjustSrc],
    ['StockTransferPanel.jsx', transferSrc],
    ['StockWithdrawalPanel.jsx', withdrawalSrc],
    ['CentralStockOrderPanel.jsx', centralPoSrc],
  ];

  for (const [file, src] of PANELS) {
    it(`A6.${file} — Rule E: no brokerClient import`, () => {
      expect(src).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
      expect(src).not.toMatch(/from\s+['"][^'"]*brokerClient/);
    });

    it(`A6.${file} — V31: no silent-swallow continuing pattern in actor-load catch`, () => {
      // listAllSellers catch should log error, NOT swallow with 'continuing'
      const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '');
      const block = stripped.match(/listAllSellers\(\)[\s\S]{0,500}/);
      if (block) {
        expect(block[0]).not.toMatch(/console\.warn\([^)]*continuing/i);
      }
    });
  }

  it('A6.commit-marker — actor tracking commit cited in panels (institutional memory)', () => {
    for (const [, src] of PANELS) {
      expect(src).toContain('actor tracking');
    }
  });
});
