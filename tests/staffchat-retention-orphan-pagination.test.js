// tests/staffchat-retention-orphan-pagination.test.js
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), server S1. Pass B (orphan-sweep,
// the "ลบจริงหายจริง / no-orphan" backstop) listed Storage files with
// `maxResults: limit*4` (=2000) and never paginated → in a clinic whose 30-day
// window holds >2000 attachment files, orphan folders BEYOND the first 2000 (by
// name) were never examined → the no-orphan guarantee silently failed. The
// per-folder doc-existence checks were also sequential (N round-trips → timeout
// risk once paginated).
//
// Fix: paginate the FULL file list (pageToken loop, no cap) + bounded-parallel
// the doc checks (mapBounded).
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sweepStaffChatRetention } from '../api/cron/staff-chat-retention-sweep.js';

const ROOT = 'staff-chat-attachments';
const oldIso = new Date(Date.now() - 5 * 86400000).toISOString(); // 5 days old (> 1-day grace)
const mkFile = (name) => ({ name, metadata: { timeCreated: oldIso }, delete: vi.fn(() => Promise.resolve()) });

// Pass A is a no-op (no aged-out message docs); only Pass B runs.
function makeDb(docExists) {
  return {
    collection: () => ({
      where: () => ({ limit: () => ({ get: async () => ({ size: 0, docs: [] }) }) }),
      doc: (id) => ({ get: async () => ({ exists: !!docExists[id] }) }),
    }),
  };
}

describe('S1 — retention Pass B paginates all files (orphans beyond the first page are swept)', () => {
  it('S1.1 a 2nd page (folder C) IS examined + swept (the cap bug is gone)', async () => {
    // page 1 = folders A (has doc) + B (orphan); page 2 = folder C (orphan, beyond cap)
    const page1 = [mkFile(`${ROOT}/BR1/A/f.png`), mkFile(`${ROOT}/BR1/B/f.png`)];
    const page2 = [mkFile(`${ROOT}/BR1/C/f.png`)];
    let call = 0;
    const storage = {
      getFiles: vi.fn(async () => {
        call += 1;
        if (call === 1) return [page1, { prefix: `${ROOT}/`, pageToken: 't', autoPaginate: false }];
        return [page2, null]; // last page → loop ends
      }),
    };
    const r = await sweepStaffChatRetention({ db: makeDb({ A: true, B: false, C: false }), storage, now: Date.now(), apply: true });
    expect(storage.getFiles.mock.calls.length).toBe(2);   // paginated (both pages fetched)
    expect(r.orphanFolders).toBe(2);                       // B (page 1) + C (page 2 — was unreachable)
    expect(r.orphanFiles).toBe(2);
    expect(page1[0].delete).not.toHaveBeenCalled();        // A → doc exists → kept
    expect(page1[1].delete).toHaveBeenCalled();            // B → orphan → deleted
    expect(page2[0].delete).toHaveBeenCalled();            // C → orphan beyond page 1 → deleted
  });

  it('S1.2 a folder whose message doc EXISTS is never swept (no false delete)', async () => {
    const page = [mkFile(`${ROOT}/BR1/LIVE/f.png`)];
    const storage = { getFiles: vi.fn(async () => [page, null]) };
    const r = await sweepStaffChatRetention({ db: makeDb({ LIVE: true }), storage, now: Date.now(), apply: true });
    expect(r.orphanFolders).toBe(0);
    expect(page[0].delete).not.toHaveBeenCalled();
  });

  it('S1.3 dry-run (apply=false) deletes nothing but still counts orphans', async () => {
    const page = [mkFile(`${ROOT}/BR1/ORPH/f.png`)];
    const storage = { getFiles: vi.fn(async () => [page, null]) };
    const r = await sweepStaffChatRetention({ db: makeDb({ ORPH: false }), storage, now: Date.now(), apply: false });
    expect(r.orphanFolders).toBe(1);
    expect(page[0].delete).not.toHaveBeenCalled();
  });
});

describe('S1-SG — source-grep regression lock', () => {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'api/cron/staff-chat-retention-sweep.js'), 'utf8');
  it('SG1 Pass B paginates (pageToken loop, no maxResults cap on the orphan listing)', () => {
    expect(src).toMatch(/autoPaginate:\s*false/);
    expect(src).not.toMatch(/maxResults:\s*limit\s*\*\s*4/);  // the cap is gone
  });
  it('SG2 doc-existence checks run bounded-parallel (mapBounded), not a bare sequential await-in-loop', () => {
    expect(src).toMatch(/mapBounded\(/);
  });
});
