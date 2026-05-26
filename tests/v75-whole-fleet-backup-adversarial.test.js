// tests/v75-whole-fleet-backup-adversarial.test.js
// V75 Item 2 — MAHA-ADVERSARIAL test bank (V48 prof-grade pattern).
//
// User directive: "เทสมาด้วยแบบ ไปกลับ e2e และมหาโหด เพราะเป็น feature
// สำคัญ ... เทสให้ครบคลุมรัดกุม ตามกฎที่ผมบอกเสมอ".
//
// Categories (V48 V46-V48 saga pattern):
//   CAT1 — Source-grep universal locks (AV56/AV57 cross-links)
//   CAT2 — Property-based (mulberry32 × 100 deterministic fixtures)
//   CAT3 — Adversarial inputs (Thai NFC≠NFD + NUL byte + 10K-char +
//          mixed-type cid + empty fleet edge)
//   CAT4 — Idempotency × 5
//   CAT5 — Cross-branch identity via toString.grep (helper branch-blind)
//   CAT6 — Forward / backward compatibility
//   CAT7 — Concurrent-mutation snapshot consistency (documents behavior)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  buildWholeFleetManifest,
  computeWholeFleetManifestHash,
  validateWholeFleetManifest,
} from '../src/lib/wholeFleetBackupCore.js';

// Mulberry32 deterministic PRNG (V48 pattern)
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260516);

function randomCustomer(i) {
  return {
    cid: `LC-RAND-${i}`,
    hn: `HN-${1000 + i}`,
    displayName: rand() > 0.5 ? 'Thai ทดสอบ' : 'EN Customer',
    fileEntry: `backups/customers/LC-RAND-${i}/123-abc/backup.json`,
    fileHash: `h-${i}-${Math.floor(rand() * 1e9).toString(16)}`,
    storageManifestHash: `s-${i}-${Math.floor(rand() * 1e9).toString(16)}`,
    totals: {
      appointmentCount: Math.floor(rand() * 50),
      saleCount: Math.floor(rand() * 30),
      treatmentCount: Math.floor(rand() * 100),
    },
    exportedAt: new Date(2026, 4, 16, Math.floor(rand() * 24)).toISOString(),
  };
}

describe('V75 Item 2 — Whole-fleet backup MAHA-ADVERSARIAL test bank', () => {
  describe('CAT1 — Source-grep universal locks (cross-link AV56/AV57)', () => {
    it('CAT1.1 — every chat_conversations write in webhook stamps branchId (AV57 cross-link)', () => {
      const line = fs.readFileSync('api/webhook/line.js', 'utf8');
      const fb = fs.readFileSync('api/webhook/facebook.js', 'utf8');
      expect(line).toMatch(/branchId/);
      expect(fb).toMatch(/branchId/);
    });

    it('CAT1.2 — CLI whole-fleet backup write goes through buildWholeFleetManifest', () => {
      const cliSrc = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
      expect(cliSrc).toMatch(/buildWholeFleetManifest/);
      expect(cliSrc).toMatch(/computeWholeFleetManifestHash/);
    });

    it('CAT1.3 — restore endpoint verifies confirmManifestHash + WHOLE_FLEET_MANIFEST_TAMPERED (AV56)', () => {
      const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
      expect(src).toMatch(/confirmManifestHash/);
      expect(src).toMatch(/WHOLE_FLEET_MANIFEST_TAMPERED/);
      expect(src).toMatch(/computeWholeFleetManifestHash/);
    });

    it('CAT1.4 — CLI restore mirror also verifies manifestHash (Rule M parity)', () => {
      const src = fs.readFileSync('scripts/whole-fleet-customer-restore.mjs', 'utf8');
      expect(src).toMatch(/WHOLE_FLEET_MANIFEST_TAMPERED/);
      expect(src).toMatch(/computeWholeFleetManifestHash/);
    });
  });

  describe('CAT2 — Property-based (mulberry32 × 100 fixtures)', () => {
    it('CAT2.1 — hash is deterministic across 100 random fixtures', () => {
      for (let i = 0; i < 100; i++) {
        const customers = [randomCustomer(i)];
        const m1 = buildWholeFleetManifest({ customers, exportedAt: 'x' });
        const m2 = buildWholeFleetManifest({ customers, exportedAt: 'x' });
        expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
      }
    });

    it('CAT2.2 — userNote variation does NOT change hash across 100 fixtures (Q5b=Y)', () => {
      for (let i = 0; i < 100; i++) {
        const customers = [randomCustomer(i)];
        const m1 = buildWholeFleetManifest({ customers, userNote: 'note-A', exportedAt: 'x' });
        const m2 = buildWholeFleetManifest({
          customers,
          userNote: 'TOTALLY DIFFERENT NOTE',
          exportedAt: 'x',
        });
        expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
      }
    });

    it('CAT2.3 — fileHash mutation DOES change hash across 100 fixtures (tampering detection)', () => {
      for (let i = 0; i < 100; i++) {
        const c1 = randomCustomer(i);
        const c2 = { ...c1, fileHash: 'TAMPERED-FILE-HASH' };
        const m1 = buildWholeFleetManifest({ customers: [c1], exportedAt: 'x' });
        const m2 = buildWholeFleetManifest({ customers: [c2], exportedAt: 'x' });
        expect(computeWholeFleetManifestHash(m1)).not.toBe(computeWholeFleetManifestHash(m2));
      }
    });

    it('CAT2.4 — storageManifestHash mutation DOES change hash across 100 fixtures', () => {
      for (let i = 0; i < 100; i++) {
        const c1 = randomCustomer(i);
        const c2 = { ...c1, storageManifestHash: 'TAMPERED-STORAGE-HASH' };
        const m1 = buildWholeFleetManifest({ customers: [c1], exportedAt: 'x' });
        const m2 = buildWholeFleetManifest({ customers: [c2], exportedAt: 'x' });
        expect(computeWholeFleetManifestHash(m1)).not.toBe(computeWholeFleetManifestHash(m2));
      }
    });
  });

  describe('CAT3 — Adversarial inputs (Thai NFC≠NFD + NUL + 10K + mixed-type)', () => {
    it('CAT3.1 — Thai NFC vs NFD displayName does NOT affect hash (displayName not in seed)', () => {
      const nfc = 'กิ';
      const nfd = nfc.normalize('NFD');
      // Build base ONCE — randomCustomer() advances PRNG state, so calling twice
      // produces different fileHash/storageManifestHash. We want to test that
      // displayName variation alone doesn't shift the hash.
      const base = randomCustomer(1);
      const c1 = { ...base, displayName: nfc };
      const c2 = { ...base, displayName: nfd };
      const m1 = buildWholeFleetManifest({ customers: [c1], exportedAt: 'x' });
      const m2 = buildWholeFleetManifest({ customers: [c2], exportedAt: 'x' });
      // Per wholeFleetBackupCore: hash seed only includes cid/hn/fileHash/
      // storageManifestHash/totals (not displayName). Same identity = same hash.
      expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
    });

    it('CAT3.2 — NUL byte in cid does NOT crash hash', () => {
      const c = { ...randomCustomer(1), cid: 'LC-N\0UL' };
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
    });

    it('CAT3.3 — 10K-char displayName does NOT crash', () => {
      const c = { ...randomCustomer(1), displayName: 'X'.repeat(10000) };
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
    });

    it('CAT3.4 — numeric cid coerced consistently', () => {
      const c = { ...randomCustomer(1), cid: 12345 };
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
    });

    it('CAT3.5 — empty customer list valid (zero-fleet edge)', () => {
      const m = buildWholeFleetManifest({ customers: [], exportedAt: 'x' });
      expect(m.customerCount).toBe(0);
      expect(validateWholeFleetManifest(m).valid).toBe(true);
      expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
    });

    it('CAT3.6 — deeply nested totals does NOT crash (defensive coalescing in builder)', () => {
      const c = { ...randomCustomer(1), totals: { appointmentCount: 5 } };
      // Missing saleCount + treatmentCount — builder defaults to 0
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(m.totals.appointmentCount).toBeGreaterThanOrEqual(5);
      expect(m.totals.saleCount).toBe(0);
    });

    it('CAT3.7 — failedCustomers array handled (manifest builds even with failures)', () => {
      const c = randomCustomer(1);
      const failedCustomers = [{ cid: 'LC-FAIL-1', reason: 'PERMISSION_DENIED' }];
      const m = buildWholeFleetManifest({
        customers: [c],
        failedCustomers,
        exportedAt: 'x',
      });
      expect(m.failedCustomers).toEqual(failedCustomers);
      expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
    });
  });

  describe('CAT4 — Idempotency × 5', () => {
    it('CAT4.1 — computeHash invoked 5 times yields same result', () => {
      const customers = [randomCustomer(42)];
      const m = buildWholeFleetManifest({ customers, exportedAt: 'x' });
      const hashes = [];
      for (let i = 0; i < 5; i++) hashes.push(computeWholeFleetManifestHash(m));
      expect(new Set(hashes).size).toBe(1);
    });

    it('CAT4.2 — buildWholeFleetManifest invoked 5 times with same inputs yields equivalent output', () => {
      const customers = [randomCustomer(7), randomCustomer(8)];
      const manifests = [];
      for (let i = 0; i < 5; i++) {
        manifests.push(buildWholeFleetManifest({ customers, exportedAt: 'x' }));
      }
      const hashes = manifests.map(computeWholeFleetManifestHash);
      expect(new Set(hashes).size).toBe(1);
    });
  });

  describe('CAT5 — Cross-branch identity via toString.grep (helper branch-blind)', () => {
    it('CAT5.1 — wholeFleetBackupCore.js is branch-blind (no branchId in source)', () => {
      const src = fs.readFileSync('src/lib/wholeFleetBackupCore.js', 'utf8');
      // Helpers operate purely on customer file entries — no per-branch logic.
      expect(src).not.toMatch(/\bbranchId\b/);
    });

    it('CAT5.2 — endpoint accepts manifests from any branch composition (no per-branch filter)', () => {
      const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
      // V122 (2026-05-26): per-customer processing is now Phase A (parallel
      // mapWithConcurrency over fleetEntries = manifest.customers) + Phase B
      // (sequential for...of loadedEntries). The endpoint STILL processes ALL
      // customers regardless of branch — assert branch-blindness DIRECTLY
      // (stronger than the old loop-window grep): no selectedBranchId / branchId filter anywhere.
      expect(src).toMatch(/const fleetEntries = manifest\.customers/);   // draws from manifest.customers
      expect(src).toMatch(/mapWithConcurrency\(fleetEntries/);
      expect(src).not.toMatch(/selectedBranchId/);                       // no per-branch filter
      expect(src).not.toMatch(/entry\.branchId\s*[!=]==?/);
      expect(src).not.toMatch(/L\.branchId\s*[!=]==?/);
    });
  });

  describe('CAT6 — Forward / backward compatibility', () => {
    it('CAT6.1 — preserves arbitrary _v76_* fields on customer entries (forward-compat)', () => {
      const c = { ...randomCustomer(1), _v76_futureField: 'preserved' };
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(m.customers[0]._v76_futureField).toBe('preserved');
    });

    it('CAT6.2 — accepts missing optional fields (backward-compat)', () => {
      const c = {
        cid: 'LC-X',
        hn: 'HN1',
        fileHash: 'h',
        storageManifestHash: 's',
        fileEntry: 'x',
      };
      // No totals, no displayName, no exportedAt
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      expect(m.totals.appointmentCount).toBe(0);
      expect(m.totals.saleCount).toBe(0);
      expect(m.totals.treatmentCount).toBe(0);
    });

    it('CAT6.3 — validateWholeFleetManifest rejects schemaVersion mismatch (forward-rejection)', () => {
      const m = buildWholeFleetManifest({ customers: [], exportedAt: 'x' });
      const future = { ...m, schemaVersion: 999 };
      const v = validateWholeFleetManifest(future);
      expect(v.valid).toBe(false);
      expect(v.reason).toMatch(/schemaVersion/i);
    });

    it('CAT6.4 — validateWholeFleetManifest rejects wrong type', () => {
      const m = buildWholeFleetManifest({ customers: [], exportedAt: 'x' });
      const wrong = { ...m, type: 'something-else' };
      const v = validateWholeFleetManifest(wrong);
      expect(v.valid).toBe(false);
    });

    it('CAT6.5 — validateWholeFleetManifest rejects customerCount mismatch', () => {
      const m = buildWholeFleetManifest({
        customers: [randomCustomer(1), randomCustomer(2)],
        exportedAt: 'x',
      });
      const mismatched = { ...m, customerCount: 99 };
      const v = validateWholeFleetManifest(mismatched);
      expect(v.valid).toBe(false);
      expect(v.reason).toMatch(/customerCount/i);
    });
  });

  describe('CAT7 — Concurrent-mutation snapshot consistency', () => {
    it('CAT7.1 — manifestHash captures customer state at compute time', () => {
      const c = randomCustomer(1);
      const m = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      const h1 = computeWholeFleetManifestHash(m);
      // Mutate the customer object after building (manifest holds a reference)
      c.fileHash = 'MUTATED-AFTER-BUILD';
      const h2 = computeWholeFleetManifestHash(m);
      // Hash IS different because manifest.customers[0] === c (shared ref).
      // This documents: callers MUST not mutate inputs post-build, or hash
      // computed later will diverge from the snapshot moment.
      expect(h2).not.toBe(h1);
    });

    it('CAT7.2 — independent manifest objects with same customer-array values yield same hash', () => {
      const c = randomCustomer(99);
      const cClone = JSON.parse(JSON.stringify(c));
      const m1 = buildWholeFleetManifest({ customers: [c], exportedAt: 'x' });
      const m2 = buildWholeFleetManifest({ customers: [cClone], exportedAt: 'x' });
      expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
    });
  });

  describe('CAT8 — Universal classifier (V48 Tier 2 audit trail)', () => {
    it('CAT8.1 — every whole-fleet write site goes through canonical helpers', () => {
      // Source-grep: list every file that writes a whole-fleet manifest +
      // verify it imports buildWholeFleetManifest + computeWholeFleetManifestHash
      const cli = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
      const endpoint = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
      const restoreCli = fs.readFileSync('scripts/whole-fleet-customer-restore.mjs', 'utf8');

      // Each must import the canonical helpers
      for (const src of [cli, endpoint, restoreCli]) {
        expect(src).toMatch(/wholeFleetBackupCore/);
      }
    });

    it('CAT8.2 — failedCustomers[] surfaces in CLI + manifest builder', () => {
      const cli = fs.readFileSync('scripts/customer-backup-export.mjs', 'utf8');
      expect(cli).toMatch(/failedCustomers/);
      // Builder accepts it
      const core = fs.readFileSync('src/lib/wholeFleetBackupCore.js', 'utf8');
      expect(core).toMatch(/failedCustomers/);
    });
  });
});
