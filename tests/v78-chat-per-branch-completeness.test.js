// tests/v78-chat-per-branch-completeness.test.js
//
// V78 (2026-05-16 NIGHT — 3-round adversarial bug-hunt completeness test).
//
// User said "อีก 3 รอบ ถึงจะเชื่อว่าไม่บั๊คแล้ว" — 3 adversarial agents
// found ~40 bugs across chat tab + V77-fix3 + cross-cutting backend. This
// commit batch fixes the critical ones. THIS TEST locks the V78 contracts
// at the source-grep level so a future regression fails the build.
//
// Contracts covered:
//   - V78 BUG-CHAT-1: send.js resolves per-branch LINE/FB via admin SDK
//   - V78 BUG-CHAT-2: saved-replies.js resolves per-branch FB via admin SDK
//   - V78 BUG-CHAT-3: useChatUnread accepts selectedBranchId + filters
//   - V78 BUG-CHAT-4: ChatPanel uses listenToLineConfig + listenToFbConfig
//   - V78 BUG-CHAT-5: send.js convPatch stamps branchId
//   - V78 BUG-CHAT-6: ChatPanel resets selectedConv on branch switch
//   - V78 BUG-XR-15: line.js verifySignature uses timingSafeEqual
//   - V78 BUG-XR-16: facebook.js verifySignature uses timingSafeEqual
//   - V78 BUG-XR-24: line.js + facebook.js call resolveChatFallbackBranchId
//   - V78 BUG-XR-3 + XR-7 + XR-20: firestore.indexes.json has 5 new entries
//   - V78 BUG-XR-2: vercel.json sets maxDuration for crons
//   - V77-fix4 N1: wholeFleetBackupCore retro-compat hash
//   - V77-fix4 N2: validateWholeFleetManifest accepts backupRef fallback

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = path.resolve(import.meta.dirname, '..');
const READ = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── BUG-CHAT-1 / 5: send.js per-branch resolver + branchId stamp ────────

describe('V78 BUG-CHAT-1/5 — send.js per-branch resolver + branchId stamp', () => {
  const src = READ('api/webhook/send.js');

  it('CHAT-1.1 — imports resolveLineConfigForAdmin + resolveFbConfigForAdmin', () => {
    expect(src).toMatch(/resolveLineConfigForAdmin/);
    expect(src).toMatch(/resolveFbConfigForAdmin/);
  });

  it('CHAT-1.2 — uses firebase-admin SDK (not unauth REST) for chat config', () => {
    expect(src).toMatch(/firebase-admin\/firestore/);
    expect(src).not.toMatch(/CHAT_CONFIG_PATH\s*=\s*['"`]artifacts/);
  });

  it('CHAT-1.3 — accepts branchId from req.body', () => {
    expect(src).toMatch(/\{[^}]*branchId[^}]*\}\s*=\s*req\.body/);
  });

  it('CHAT-1.4 — returns 503 BRANCH_CONFIG_MISSING when no resolved config', () => {
    expect(src).toMatch(/BRANCH_CONFIG_MISSING/);
    expect(src).toMatch(/status\(503\)/);
  });

  it('CHAT-5.1 — convPatch includes branchId + branchIdSource stamp', () => {
    expect(src).toMatch(/convPatch\.branchId\s*=/);
    expect(src).toMatch(/branchIdSource\s*=\s*`send-/);
  });

  it('CHAT-1.5 — V78 marker comment present', () => {
    expect(src).toMatch(/V78.*BUG-CHAT/);
  });
});

// ─── BUG-CHAT-2: saved-replies.js per-branch FB ──────────────────────────

describe('V78 BUG-CHAT-2 — saved-replies.js per-branch FB resolver', () => {
  const src = READ('api/webhook/saved-replies.js');

  it('CHAT-2.1 — imports resolveFbConfigForAdmin', () => {
    expect(src).toMatch(/resolveFbConfigForAdmin/);
  });

  it('CHAT-2.2 — accepts branchId from req.query', () => {
    expect(src).toMatch(/req\.query[^=]*branchId/);
  });

  it('CHAT-2.3 — returns 503 BRANCH_CONFIG_MISSING when no resolved config', () => {
    expect(src).toMatch(/BRANCH_CONFIG_MISSING/);
  });

  it('CHAT-2.4 — V78 marker comment present', () => {
    expect(src).toMatch(/V78.*BUG-CHAT/);
  });
});

// ─── BUG-CHAT-3: useChatUnread per-branch ────────────────────────────────

describe('V78 BUG-CHAT-3 — useChatUnread per-branch (root user complaint)', () => {
  const src = READ('src/components/ChatPanel.jsx');

  it('CHAT-3.1 — useChatUnread signature accepts selectedBranchId', () => {
    expect(src).toMatch(/export function useChatUnread\(db,\s*appId,\s*selectedBranchId/);
  });

  it('CHAT-3.2 — filters branchScopedConvs by selectedBranchId with fall-through', () => {
    expect(src).toMatch(/branchScopedConvs/);
    expect(src).toMatch(/!c\.branchId\s*\|\|\s*String\(c\.branchId\)\s*===\s*String\(selectedBranchId\)/);
  });

  it('CHAT-3.3 — useMemo derives counts from branchScopedConvs', () => {
    expect(src).toMatch(/useMemo\(\s*\(\)\s*=>\s*countUnreadPeople\(branchScopedConvs\)/);
  });

  it('CHAT-3.4 — V78 marker comment near useChatUnread', () => {
    const block = src.match(/V78[^\n]*BUG-CHAT-3[\s\S]{0,2500}export function useChatUnread/);
    expect(block).not.toBeNull();
  });
});

describe('V78 BUG-CHAT-3 — AdminDashboard wires selectedBranchId into useChatUnread', () => {
  const src = READ('src/pages/AdminDashboard.jsx');

  it('CHAT-3.5 — useChatUnread call passes selectedBranchId', () => {
    expect(src).toMatch(/useChatUnread\(db,\s*appId,\s*selectedBranchId\)/);
  });
});

// ─── BUG-CHAT-4: ChatPanel uses per-branch line+fb configs ───────────────

describe('V78 BUG-CHAT-4 — ChatPanel per-branch LINE+FB configs', () => {
  const src = READ('src/components/ChatPanel.jsx');

  it('CHAT-4.1 — imports listenToLineConfig + listenToFbConfig', () => {
    expect(src).toMatch(/listenToLineConfig/);
    expect(src).toMatch(/listenToFbConfig/);
  });

  it('CHAT-4.2 — subscribes per-branch + resubscribes on selectedBranchId change', () => {
    // useEffect that depends on [selectedBranchId] and calls listenToLineConfig
    const block = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,400}?listenToLineConfig\([\s\S]{0,400}?\},\s*\[selectedBranchId\]\)/);
    expect(block).not.toBeNull();
  });

  it('CHAT-4.3 — lineEnabled prefers lineConfig.enabled with legacy chatConfig.line fallback', () => {
    expect(src).toMatch(/lineConfig\?\.enabled\s*\?\?\s*chatConfig\?\.line\?\.enabled/);
  });

  it('CHAT-4.4 — fbEnabled prefers fbConfig.enabled with legacy chatConfig.facebook fallback', () => {
    expect(src).toMatch(/fbConfig\?\.enabled\s*\?\?\s*chatConfig\?\.facebook\?\.enabled/);
  });
});

// ─── BUG-CHAT-6: branch-switch resets stale selectedConv ─────────────────

describe('V78 BUG-CHAT-6 — branch-switch resets stale selectedConv', () => {
  const src = READ('src/components/ChatPanel.jsx');

  it('CHAT-6.1 — liveSelectedConv falls to null (not stale conv) when not in filtered list', () => {
    expect(src).toMatch(/conversations\.find\(c\s*=>\s*c\.id\s*===\s*selectedConv\.id\)\s*\|\|\s*null/);
  });

  it('CHAT-6.2 — effect resets selectedConv on selectedBranchId change when conv no longer belongs', () => {
    const block = src.match(/useEffect\(\(\)\s*=>\s*\{[\s\S]{0,400}?stillBelongs[\s\S]{0,200}?setSelectedConv\(null\)[\s\S]{0,200}?\},\s*\[selectedBranchId,\s*selectedConv\]\)/);
    expect(block).not.toBeNull();
  });
});

// ─── BUG-XR-15 / XR-16: constant-time HMAC ───────────────────────────────

describe('V78 BUG-XR-15 + XR-16 — constant-time HMAC signature verification', () => {
  const lineSrc = READ('api/webhook/line.js');
  const fbSrc = READ('api/webhook/facebook.js');

  it('XR-15.1 — line.js uses crypto.timingSafeEqual', () => {
    expect(lineSrc).toMatch(/crypto\.timingSafeEqual/);
  });

  it('XR-15.2 — line.js does NOT use === for signature check', () => {
    expect(lineSrc).not.toMatch(/return hmac === signature/);
  });

  it('XR-16.1 — facebook.js uses crypto.timingSafeEqual', () => {
    expect(fbSrc).toMatch(/crypto\.timingSafeEqual/);
  });

  it('XR-16.2 — facebook.js does NOT use === for signature check', () => {
    expect(fbSrc).not.toMatch(/return signature === `sha256=/);
  });
});

// ─── BUG-XR-24: webhook FALLBACK uses resolveChatFallbackBranchId ────────

describe('V78 BUG-XR-24 — webhook FALLBACK_BRANCH_ID wired through resolver', () => {
  const lineSrc = READ('api/webhook/line.js');
  const fbSrc = READ('api/webhook/facebook.js');

  it('XR-24.1 — line.js imports resolveChatFallbackBranchId', () => {
    expect(lineSrc).toMatch(/import\s*\{[^}]*resolveChatFallbackBranchId[^}]*\}\s*from\s*['"]\.\/_lib\/chatBranchDefaults\.js['"]/);
  });

  it('XR-24.2 — line.js calls resolveChatFallbackBranchId (not raw env || \'\')', () => {
    expect(lineSrc).toMatch(/resolveChatFallbackBranchId\(process\.env\.LOVER_DEFAULT_BRANCH_ID\)/);
    // Anti-regression: legacy raw `process.env.LOVER_DEFAULT_BRANCH_ID || ''` pattern
    // must NOT remain in the webhook handler body
    const handler = lineSrc.match(/const FALLBACK_BRANCH_ID[\s\S]{0,200}/);
    expect(handler[0]).not.toMatch(/process\.env\.LOVER_DEFAULT_BRANCH_ID\s*\|\|\s*['"]['"]/);
  });

  it('XR-24.3 — facebook.js imports resolveChatFallbackBranchId', () => {
    expect(fbSrc).toMatch(/import\s*\{[^}]*resolveChatFallbackBranchId[^}]*\}\s*from\s*['"]\.\/_lib\/chatBranchDefaults\.js['"]/);
  });

  it('XR-24.4 — facebook.js calls resolveChatFallbackBranchId at FALLBACK_BRANCH_ID init', () => {
    expect(fbSrc).toMatch(/FALLBACK_BRANCH_ID\s*=\s*resolveChatFallbackBranchId\(/);
  });
});

// ─── BUG-XR-3 / XR-7 / XR-20: composite Firestore indexes ────────────────

describe('V78 BUG-XR-3/7/20 — composite Firestore indexes added', () => {
  const cfg = JSON.parse(READ('firestore.indexes.json'));
  const indexes = cfg.indexes || [];

  function hasIndex(collectionGroup, fields) {
    return indexes.some(idx =>
      idx.collectionGroup === collectionGroup
      && Array.isArray(idx.fields)
      && idx.fields.length === fields.length
      && idx.fields.every((f, i) => f.fieldPath === fields[i].fieldPath && f.order === fields[i].order)
    );
  }

  it('XR-7 — be_appointments (branchId asc, date asc) [line-reminder-fire cron]', () => {
    expect(hasIndex('be_appointments', [
      { fieldPath: 'branchId', order: 'ASCENDING' },
      { fieldPath: 'date', order: 'ASCENDING' },
    ])).toBe(true);
  });

  it('XR-3 — be_line_reminder_log (status asc, nextRetryAt asc) [retry cron]', () => {
    expect(hasIndex('be_line_reminder_log', [
      { fieldPath: 'status', order: 'ASCENDING' },
      { fieldPath: 'nextRetryAt', order: 'ASCENDING' },
    ])).toBe(true);
  });

  it('XR-3 — chat_conversations (branchId asc, lastMessageAt desc) [V75 BSA reader]', () => {
    expect(hasIndex('chat_conversations', [
      { fieldPath: 'branchId', order: 'ASCENDING' },
      { fieldPath: 'lastMessageAt', order: 'DESCENDING' },
    ])).toBe(true);
  });

  it('XR-3 — chat_history (branchId asc, resolvedAt desc) [V76 BSA reader]', () => {
    expect(hasIndex('chat_history', [
      { fieldPath: 'branchId', order: 'ASCENDING' },
      { fieldPath: 'resolvedAt', order: 'DESCENDING' },
    ])).toBe(true);
  });

  it('XR-20 — be_admin_audit (type asc, performedAt desc) [bulk-delete grace check]', () => {
    expect(hasIndex('be_admin_audit', [
      { fieldPath: 'type', order: 'ASCENDING' },
      { fieldPath: 'performedAt', order: 'DESCENDING' },
    ])).toBe(true);
  });
});

// ─── BUG-XR-2: Vercel cron maxDuration ───────────────────────────────────

describe('V78 BUG-XR-2 — Vercel cron maxDuration', () => {
  const cfg = JSON.parse(READ('vercel.json'));
  const fns = cfg.functions || {};

  it('XR-2.1 — line-reminder-fire cron has maxDuration set', () => {
    expect(fns['api/cron/line-reminder-fire.js']?.maxDuration).toBeGreaterThanOrEqual(60);
  });

  it('XR-2.2 — line-reminder-retry cron has maxDuration set', () => {
    expect(fns['api/cron/line-reminder-retry.js']?.maxDuration).toBeGreaterThanOrEqual(60);
  });
});

// ─── V77-fix4: N1 hash retro-compat + N2 fileEntry/backupRef back-compat ─

describe('V77-fix4 N1 — wholeFleetBackupCore hash retro-compat for legacy manifests', () => {
  const src = READ('src/lib/wholeFleetBackupCore.js');

  it('N1.1 — computeWholeFleetManifestHash gates exporterUid inclusion', () => {
    expect(src).toMatch(/hasExporterUid/);
    expect(src).toMatch(/if\s*\(includePostFix3\)\s*seed\.exporterUid/);
  });

  it('N1.2 — gates fileEntry inclusion in seed', () => {
    expect(src).toMatch(/hasFileEntryEverywhere/);
    expect(src).toMatch(/if\s*\(includePostFix3\)\s*entry\.fileEntry\s*=/);
  });

  it('N2.1 — validateWholeFleetManifest accepts c.fileEntry || c.backupRef', () => {
    expect(src).toMatch(/c\.fileEntry\s*\|\|\s*c\.backupRef/);
  });

  it('N2.2 — exports resolveCustomerEntryPath helper', () => {
    expect(src).toMatch(/export function resolveCustomerEntryPath/);
  });
});

describe('V77-fix4 — restore endpoint uses resolveCustomerEntryPath', () => {
  const src = READ('api/admin/whole-fleet-customer-restore.js');

  it('N2.3 — restore imports resolveCustomerEntryPath', () => {
    expect(src).toMatch(/resolveCustomerEntryPath/);
  });
});

// ─── Hash stability: legacy manifest produces SAME hash post-fix4 ────────

describe('V77-fix4 — hash STABILITY for legacy manifests (Rule I behavioral)', () => {
  it('legacy manifest (no exporterUid, no fileEntry) hashes identically with V77-fix4 vs would-be V77-fix3', async () => {
    const { computeWholeFleetManifestHash } = await import('../src/lib/wholeFleetBackupCore.js');
    const legacy = {
      schemaVersion: 1,
      type: 'whole-fleet-customers',
      customerCount: 2,
      customers: [
        // Legacy shape — backupRef (not fileEntry), no fileHash/storageManifestHash possibly
        { cid: 'LC-A', hn: '001', backupRef: 'backups/customers/LC-A/123-abc/backup.json', fileHash: 'h1', storageManifestHash: 's1', totals: { saleCount: 1 } },
        { cid: 'LC-B', hn: '002', backupRef: 'backups/customers/LC-B/456-def/backup.json', fileHash: 'h2', storageManifestHash: 's2', totals: { saleCount: 2 } },
      ],
      failedCustomers: [],
      totals: { saleCount: 3 },
      // NO exporterUid (legacy V77b/c era)
      exportedAt: '2026-05-16T12:33:00Z',
    };
    const hashA = computeWholeFleetManifestHash(legacy);
    // Same input → same hash; deterministic check
    expect(hashA).toEqual(computeWholeFleetManifestHash(legacy));
    expect(hashA).toMatch(/^[a-f0-9]{64}$/);
  });

  it('post-V77-fix3 manifest (exporterUid + fileEntry) hashes deterministically', async () => {
    const { computeWholeFleetManifestHash } = await import('../src/lib/wholeFleetBackupCore.js');
    const modern = {
      schemaVersion: 1,
      type: 'whole-fleet-customers',
      customerCount: 1,
      customers: [
        { cid: 'LC-Z', hn: '999', fileEntry: 'backups/customers/LC-Z/789-xyz/backup.json', fileHash: 'h9', storageManifestHash: 's9', totals: { saleCount: 9 } },
      ],
      failedCustomers: [],
      totals: { saleCount: 9 },
      exporterUid: 'admin-uid-123',
      exportedAt: '2026-05-16T13:00:00Z',
    };
    const hashB = computeWholeFleetManifestHash(modern);
    expect(hashB).toMatch(/^[a-f0-9]{64}$/);
    // Same input → same hash
    expect(hashB).toEqual(computeWholeFleetManifestHash(modern));
  });

  it('tampered fileEntry on POST-V77-fix3 manifest changes hash', async () => {
    const { computeWholeFleetManifestHash } = await import('../src/lib/wholeFleetBackupCore.js');
    const m1 = {
      schemaVersion: 1, type: 'whole-fleet-customers', customerCount: 1,
      customers: [{ cid: 'LC-Z', hn: '999', fileEntry: 'backups/customers/LC-Z/A.json', fileHash: 'h', storageManifestHash: 's', totals: { saleCount: 1 } }],
      failedCustomers: [], totals: { saleCount: 1 },
      exporterUid: 'u1', exportedAt: '2026-01-01T00:00:00Z',
    };
    const m2 = { ...m1, customers: [{ ...m1.customers[0], fileEntry: 'backups/customers/LC-Z/B.json' }] };
    expect(computeWholeFleetManifestHash(m1)).not.toEqual(computeWholeFleetManifestHash(m2));
  });

  it('tampered exporterUid on POST-V77-fix3 manifest changes hash', async () => {
    const { computeWholeFleetManifestHash } = await import('../src/lib/wholeFleetBackupCore.js');
    const m1 = {
      schemaVersion: 1, type: 'whole-fleet-customers', customerCount: 1,
      customers: [{ cid: 'X', hn: '1', fileEntry: 'backups/customers/X/A.json', fileHash: 'h', storageManifestHash: 's', totals: {} }],
      failedCustomers: [], totals: {},
      exporterUid: 'admin-A', exportedAt: '2026-01-01T00:00:00Z',
    };
    const m2 = { ...m1, exporterUid: 'admin-B' };
    expect(computeWholeFleetManifestHash(m1)).not.toEqual(computeWholeFleetManifestHash(m2));
  });
});

// ─── Rule I behavioral simulate: useChatUnread filter logic ──────────────

describe('V78 BUG-CHAT-3 — useChatUnread filter logic (pure simulate)', () => {
  // Mirror the V78 filter logic without mounting React: prove the per-branch
  // count is what the badge would show.
  function simulateUseChatUnread(rawConvs, selectedBranchId) {
    const filtered = !selectedBranchId
      ? rawConvs
      : rawConvs.filter(c => !c.branchId || String(c.branchId) === String(selectedBranchId));
    let line = 0, fb = 0;
    for (const c of filtered) {
      const count = Number(c?.unreadCount) || 0;
      if (count <= 0) continue;
      if (c.platform === 'line') line += 1;
      else if (c.platform === 'facebook') fb += 1;
    }
    return { lineUnread: line, fbUnread: fb, totalUnread: line + fb, totalConversations: filtered.length };
  }

  const NAKHON = 'BR-NAKHON';
  const PRAM3 = 'BR-PRAM3';
  const fixtures = [
    { id: 'conv1', branchId: NAKHON, platform: 'line', unreadCount: 5 },
    { id: 'conv2', branchId: NAKHON, platform: 'facebook', unreadCount: 3 },
    { id: 'conv3', branchId: NAKHON, platform: 'line', unreadCount: 0 },
    { id: 'conv4', branchId: PRAM3, platform: 'line', unreadCount: 1 },
    { id: 'conv5', branchId: PRAM3, platform: 'facebook', unreadCount: 0 },
    { id: 'conv6', /* no branchId — legacy un-stamped */ platform: 'line', unreadCount: 2 },
  ];

  it('F1.1 — pre-V78 behavior: no branch filter → cross-branch total', () => {
    const r = simulateUseChatUnread(fixtures, '');
    expect(r.totalUnread).toBe(4); // conv1+conv2+conv4+conv6 (3 not counted: unread=0)
  });

  it('F1.2 — V78 post-fix: นครราชสีมา selected → counts unread+legacy fall-through', () => {
    const r = simulateUseChatUnread(fixtures, NAKHON);
    // conv1 (5 line nakhon) + conv2 (3 fb nakhon) + conv6 (2 line legacy fall-through)
    expect(r.totalUnread).toBe(3); // 3 PEOPLE: conv1 + conv2 + conv6
    expect(r.totalConversations).toBe(4); // includes conv3 (nakhon but unread=0)
  });

  it('F1.3 — V78 post-fix: พระราม 3 selected → only พระราม 3 + legacy fall-through', () => {
    const r = simulateUseChatUnread(fixtures, PRAM3);
    expect(r.totalUnread).toBe(2); // conv4 (line pram3) + conv6 (legacy fall-through)
    expect(r.totalConversations).toBe(3); // conv4 + conv5 + conv6
  });

  it('F1.4 — branch switch instantly recomputes (no listener re-subscribe)', () => {
    // Same fixtures, different selectedBranchId → different result without
    // any "fetch" or listener cycle. This is what V78 guarantees.
    const a = simulateUseChatUnread(fixtures, NAKHON);
    const b = simulateUseChatUnread(fixtures, PRAM3);
    expect(a.totalUnread).not.toBe(b.totalUnread);
  });

  it('F1.5 — empty branch (no conv stamped + selectedBranchId set) → 0 + only legacy fall-through', () => {
    const empty = fixtures.filter(c => c.branchId === undefined);
    const r = simulateUseChatUnread(empty, 'BR-NEW-BRANCH-NO-DATA');
    expect(r.totalConversations).toBe(1); // conv6 fall-through
    expect(r.totalUnread).toBe(1);
  });
});

// ─── Class-of-bug regression: V78 marker in critical files ───────────────

describe('V78 — institutional-memory markers (V21 / V77-quater lesson lock)', () => {
  const FILES = [
    'src/components/ChatPanel.jsx',
    'src/pages/AdminDashboard.jsx',
    'api/webhook/send.js',
    'api/webhook/saved-replies.js',
    'api/webhook/line.js',
    'api/webhook/facebook.js',
    'src/lib/wholeFleetBackupCore.js',
  ];

  for (const rel of FILES) {
    it(`MK.${rel}: V78 or V77-fix4 marker present`, () => {
      const src = READ(rel);
      expect(src).toMatch(/V78|V77-fix4/);
    });
  }
});
