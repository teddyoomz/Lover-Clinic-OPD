// tests/v81-fix4-auth-preserve-and-size.test.js
//
// V81-fix4 (2026-05-17 EOD+2) regression bank:
//
//   AV68 — Whole-System Replace mode MUST preserve Auth by default
//          (replaceAuthFromBackup=false default; ack-gate only fires when true)
//          User directive: "ถ้าเป็น vercel เดิมจะไม่ศุนย์เสีย รหัส หรือ email
//          login ไป แม้แต่อันเดียว"
//
//   AV69 — Whole-System backups list MUST display real folder size on disk
//          (totalBytes from summed file metadata, NOT the misleading
//          stats.totalStorageBytes which is 0 when no patient photos uploaded)
//
//   AV70 — Per-customer backup model deprecated; BackupManagerTab MUST NOT
//          import WholeFleetBackupModal + MUST NOT render the
//          "📦 สำรองลูกค้าทุกคน" trigger (V77 removed); CustomerDetailView
//          MUST NOT render "💾 สำรอง" button (V74 removed). Use V81
//          whole-system backup as the canonical replacement.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');

function read(p) {
  return readFileSync(resolve(REPO_ROOT, p), 'utf8');
}

describe('V81-fix4 AV68 — Whole-System Replace mode preserves Auth by default', () => {
  const exec = read('api/admin/_lib/wholeSystemRestoreExecutor.js');
  const endpoint = read('api/admin/whole-system-restore.js');
  const modal = read('src/components/backend/WholeSystemRestoreModal.jsx');

  it('AV68.1 — executor accepts replaceAuthFromBackup param with default false', () => {
    expect(exec).toMatch(/replaceAuthFromBackup\s*=\s*false/);
  });

  it('AV68.2 — wipeFirebase accepts wipeAuth option (default false)', () => {
    expect(exec).toMatch(/wipeAuth\s*=\s*false/);
    expect(exec).toMatch(/wipeAuth\s*:\s*replaceAuthFromBackup/);
  });

  it('AV68.3 — Auth wipe is gated by wipeAuth flag (NOT unconditional)', () => {
    // V81-fix6 updated to `if (wipeAuth && scope !== 'customer-only')` — wipeAuth still gating
    expect(exec).toMatch(/if\s*\(\s*wipeAuth\s*(?:&&|\))/);
  });

  it('AV68.4 — Auth restore is skipped when replaceAuthFromBackup=false', () => {
    expect(exec).toMatch(/skipped:\s*true/);
    expect(exec).toMatch(/skippedReason:.*replaceAuthFromBackup=false/);
  });

  it('AV68.5 — ack-gate only fires when replaceAuthFromBackup=true', () => {
    expect(exec).toMatch(/mode\s*===\s*['"]replace['"]\s*&&\s*replaceAuthFromBackup\s*&&\s*ackPasswordResetRequired/);
  });

  it('AV68.6 — endpoint forwards replaceAuthFromBackup to executor', () => {
    expect(endpoint).toMatch(/replaceAuthFromBackup/);
    expect(endpoint).toMatch(/replaceAuthFromBackup,?\s*\/\/.*forwarded to executor|replaceAuthFromBackup\s*,/);
  });

  it('AV68.7 — endpoint ack-gate only fires when caller opts INTO Auth wipe', () => {
    expect(endpoint).toMatch(/mode\s*===\s*['"]replace['"]\s*&&\s*replaceAuthFromBackup\s*&&\s*ackPasswordResetRequired/);
  });

  it('AV68.8 — modal defaults replaceAuthFromBackup to false', () => {
    expect(modal).toMatch(/useState\(false\)\)?\s*;?\s*\n[^\n]*(?:\/\/.*)?\s*const \[stage|const \[stage|\/\/[^\n]*V81-fix4/);
    // Stronger: find the explicit replaceAuthFromBackup state with default false
    expect(modal).toMatch(/setReplaceAuthFromBackup\]\s*=\s*useState\(false\)/);
  });

  it('AV68.9 — modal forwards replaceAuthFromBackup in POST body', () => {
    expect(modal).toMatch(/replaceAuthFromBackup,?\s*\n/);
  });

  it('AV68.10 — modal ack checkbox is conditionally rendered (only when replaceAuthFromBackup=true)', () => {
    expect(modal).toMatch(/{replaceAuthFromBackup\s*&&/);
  });

  it('AV68.11 — V81-fix4 marker comment present in executor', () => {
    expect(exec).toMatch(/V81-fix4/);
  });
});

describe('V81-fix4 AV69 — Whole-System backups list returns real folder size', () => {
  const listEndpoint = read('api/admin/whole-system-backups-list.js');
  const ui = read('src/components/backend/BackupManagerTab.jsx');

  it('AV69.1 — list endpoint groups files by folder and sums sizes', () => {
    expect(listEndpoint).toMatch(/folderFiles\s*=\s*new\s+Map/);
    expect(listEndpoint).toMatch(/entry\.totalBytes\s*\+=\s*sizeBytes/);
  });

  it('AV69.2 — list endpoint emits totalBytes per backup', () => {
    expect(listEndpoint).toMatch(/totalBytes:\s*entry\.totalBytes/);
  });

  it('AV69.3 — list endpoint emits fileCount per backup', () => {
    expect(listEndpoint).toMatch(/fileCount:\s*entry\.fileCount/);
  });

  it('AV69.4 — UI prefers totalBytes over legacy totalStorageBytes', () => {
    expect(ui).toMatch(/b\.totalBytes/);
    expect(ui).toMatch(/V81-fix4 Bug A2/);
  });

  it('AV69.5 — UI formats bytes in MB/KB/B based on size', () => {
    expect(ui).toMatch(/bytes\s*>=\s*1024\s*\*\s*1024/);
    expect(ui).toMatch(/bytes\s*>=\s*1024/);
  });
});

describe('V81-fix4 AV70 — Per-customer backup UI removed', () => {
  const backupManagerTab = read('src/components/backend/BackupManagerTab.jsx');
  const customerDetailView = read('src/components/backend/CustomerDetailView.jsx');

  it('AV70.1 — BackupManagerTab does NOT import WholeFleetBackupModal as active code', () => {
    // The import line must be commented out or removed
    expect(backupManagerTab).not.toMatch(/^import WholeFleetBackupModal/m);
  });

  it('AV70.2 — BackupManagerTab does NOT render whole-fleet trigger', () => {
    expect(backupManagerTab).not.toMatch(/data-testid="whole-fleet-backup-trigger"/);
  });

  it('AV70.3 — TYPE_LABELS does NOT include customer', () => {
    // Find the TYPE_LABELS object definition + assert customer is not a key
    const match = backupManagerTab.match(/const TYPE_LABELS = \{([^}]+)\}/);
    expect(match, 'TYPE_LABELS not found in BackupManagerTab').toBeTruthy();
    expect(match[1]).not.toMatch(/customer:/);
  });

  it('AV70.4 — typeFilter default does NOT include customer', () => {
    expect(backupManagerTab).toMatch(/useState\(\{\s*branch:\s*true,\s*['"]central-stock['"]:\s*true\s*\}\)/);
  });

  it('AV70.5 — CustomerDetailView does NOT render the per-customer backup button (data-testid gone)', () => {
    // The literal "💾 สำรอง" may appear in deprecation comments — that's intentional
    // institutional memory. The actual button (identified by data-testid) MUST be absent.
    expect(customerDetailView).not.toMatch(/data-testid="customer-detail-backup-button"/);
  });

  it('AV70.6 — V81-fix4 deprecation marker present in BackupManagerTab', () => {
    expect(backupManagerTab).toMatch(/V81-fix4/);
  });

  it('AV70.7 — V81-fix4 deprecation marker present in CustomerDetailView', () => {
    expect(customerDetailView).toMatch(/V81-fix4/);
  });
});

describe('V81-fix4 Feature D — Purge script exports + invocation guard', () => {
  const script = read('scripts/v81-fix4-purge-customer-backups.mjs');

  it('FD.1 — script has Rule M invocation guard', () => {
    expect(script).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath\(import\.meta\.url\)/);
  });

  it('FD.2 — script defaults to dry-run; requires --apply for writes', () => {
    expect(script).toMatch(/APPLY\s*=\s*args\.includes\(['"]--apply['"]\)/);
    expect(script).toMatch(/DRY-RUN/);
  });

  it('FD.3 — script scopes purge to per-customer backup prefixes ONLY', () => {
    expect(script).toMatch(/backups\/customers\//);
    expect(script).toMatch(/backups\/whole-fleet-customers\//);
  });

  it('FD.4 — script does NOT touch whole-system or branch or central-stock paths', () => {
    // The PURGE_PREFIXES array must contain ONLY the deprecated paths
    const match = script.match(/PURGE_PREFIXES\s*=\s*\[([^\]]+)\]/);
    expect(match).toBeTruthy();
    const list = match[1];
    expect(list).not.toMatch(/backups\/whole-system/);
    expect(list).not.toMatch(/backups\/central-stock/);
    // BR-* branch backups are at backups/BR-... — must not be matched
    expect(list).not.toMatch(/backups\/BR/);
  });

  it('FD.5 — script writes audit doc to be_admin_audit', () => {
    expect(script).toMatch(/be_admin_audit/);
    expect(script).toMatch(/v81-fix4-purge-customer-backups/);
  });

  it('FD.6 — script uses crypto-secure random id (per Rule C2)', () => {
    expect(script).toMatch(/randomBytes\(\d+\)\.toString\(['"]hex['"]\)/);
  });

  it('FD.7 — script uses canonical artifacts path per Rule M', () => {
    expect(script).toMatch(/artifacts\/\$\{APP_ID\}\/public\/data/);
  });
});
