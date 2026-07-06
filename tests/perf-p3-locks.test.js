// perf P3 (2026-07-06) — source-grep locks for the data-loading fixes.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('P3.23 — AppointmentHubView change-signal debounce', () => {
  const src = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf8');
  it('all 3 change-signal effects go through scheduleSilentReload (one refetch per burst)', () => {
    expect(src).toMatch(/perf P3\.23/);
    expect((src.match(/scheduleSilentReload\(\)/g) || []).length).toBeGreaterThanOrEqual(3);
    // trailing debounce + cancel-on-loadAll-change (stale-branch fetch guard)
    expect(src).toMatch(/setTimeout\(\(\) => \{\s*silentReloadTimer\.current = null;\s*loadAll\(\{ silent: true \}\);\s*\}, 800\)/);
    expect(src).toMatch(/\}, \[loadAll\]\);\s*\n\s*\/\/ V64-fix7/);
  });
  it('manual reconcile sites stay DIRECT loadAll (user-facing immediacy)', () => {
    expect((src.match(/loadAll\(\{ silent: true \}\)/g) || []).length).toBeGreaterThanOrEqual(3); // debounce body + manual sites
  });
});

describe('P3.24 — chat_history client delete stays out of the listener', () => {
  it('ChatPanel history listener has NO deleteDoc (cron owns deletion)', () => {
    const src = readFileSync('src/components/ChatPanel.jsx', 'utf8');
    expect(src).toMatch(/perf P3\.24/);
    // the messages-subcollection delete (line ~178) is the SANCTIONED remaining one
    // (no cron covers that subcollection yet — documented in docs/perf/punchlist.md)
    const historyBlock = src.slice(src.indexOf('listenToChatHistoryByBranch('), src.indexOf('handleResolve'));
    expect(historyBlock).not.toMatch(/deleteDoc/);
  });
});
