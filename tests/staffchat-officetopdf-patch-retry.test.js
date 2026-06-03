// tests/staffchat-officetopdf-patch-retry.test.js
// (2026-06-03 EOD+4) — Bug hunt (Rule P loop), server S2. The officeToPdf Cloud
// Function patched the message doc's attachment in a runTransaction, but on
// !snap.exists it just warned + returned (no retry). The message doc is created
// only AFTER every upload in the batch finishes (the composer awaits all uploads,
// then setDoc), so a fast Office conversion sent ALONGSIDE a large file could
// patch BEFORE the doc existed → the status patch was lost → the attachment stayed
// 'pending' → ⚠ (PDF cached, but 👁 never appears).
//
// Fix: patchOfficeAttachment retries the tx (bounded, ~6×/2s) on 'no-doc' so the
// patch lands once the late setDoc completes. 'no-attachment' (doc exists w/o
// this attachment) does NOT retry.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { patchOfficeAttachment } from '../functions/officeToPdf/helpers.js';

// Mock db whose runTransaction runs the inner fn against a scripted snap sequence.
function makeDb(snapSequence) {
  let call = 0;
  const updates = [];
  const tx = {
    get: () => Promise.resolve(snapSequence[Math.min(call, snapSequence.length - 1)]),
    update: (_ref, data) => { updates.push(data); },
  };
  const db = {
    runTransaction: async (fn) => { const r = await fn(tx); call += 1; return r; },
    _updates: updates,
    get _calls() { return call; },
  };
  return db;
}
const docExistsWith = (fullPath) => ({ exists: true, data: () => ({ attachments: [{ fullPath, name: 'x.docx' }] }) });
const noDoc = { exists: false };

describe('S2 — patchOfficeAttachment retries until the late-created doc appears', () => {
  it('R1 retries on no-doc, then patches when the doc + attachment appear', async () => {
    const db = makeDb([noDoc, noDoc, docExistsWith('p/o.docx')]);
    const sleeps = [];
    const outcome = await patchOfficeAttachment({
      db, messageRef: {}, filePath: 'p/o.docx', patch: { pdfPreviewStatus: 'ready', pdfPreviewUrl: 'u' },
      sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); }, now: () => 'T',
    });
    expect(outcome).toBe('ok');
    expect(db._calls).toBe(3);            // retried twice, succeeded on the 3rd
    expect(sleeps).toEqual([2000, 2000]); // one wait between each retry
    expect(db._updates).toHaveLength(1);
    expect(db._updates[0].attachments[0]).toMatchObject({ pdfPreviewStatus: 'ready', pdfPreviewUrl: 'u', pdfPreviewedAt: 'T' });
  });

  it('R2 patches immediately when the doc already exists (no sleep)', async () => {
    const db = makeDb([docExistsWith('p/o.docx')]);
    const sleeps = [];
    const outcome = await patchOfficeAttachment({ db, messageRef: {}, filePath: 'p/o.docx', patch: { pdfPreviewStatus: 'ready' }, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(outcome).toBe('ok');
    expect(db._calls).toBe(1);
    expect(sleeps).toEqual([]);
  });

  it('R3 doc exists but the attachment is not in it → no-attachment, no retry', async () => {
    const db = makeDb([docExistsWith('OTHER/path.docx')]);
    const sleeps = [];
    const outcome = await patchOfficeAttachment({ db, messageRef: {}, filePath: 'p/o.docx', patch: {}, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(outcome).toBe('no-attachment');
    expect(db._calls).toBe(1);            // did NOT retry
    expect(sleeps).toEqual([]);
  });

  it('R4 doc never appears → exhausts the window → no-doc-timeout', async () => {
    const db = makeDb([noDoc]);
    const sleeps = [];
    const outcome = await patchOfficeAttachment({ db, messageRef: {}, filePath: 'p/o.docx', patch: {}, maxAttempts: 4, delayMs: 1000, sleep: (ms) => { sleeps.push(ms); return Promise.resolve(); } });
    expect(outcome).toBe('no-doc-timeout');
    expect(db._calls).toBe(4);            // tried maxAttempts times
    expect(sleeps).toEqual([1000, 1000, 1000]); // slept between each (maxAttempts-1)
    expect(db._updates).toHaveLength(0);
  });
});

describe('S2-SG — source-grep regression lock', () => {
  const idx = fs.readFileSync(path.resolve(process.cwd(), 'functions/officeToPdf/index.js'), 'utf8');
  const hlp = fs.readFileSync(path.resolve(process.cwd(), 'functions/officeToPdf/helpers.js'), 'utf8');
  it('SG1 index.js routes stampAttachment through patchOfficeAttachment (no inline bare-return tx)', () => {
    expect(idx).toMatch(/patchOfficeAttachment\(\{\s*db,\s*messageRef,\s*filePath,\s*patch\s*\}\)/);
    // the pre-fix bare "message not found → return" is gone
    expect(idx).not.toMatch(/console\.warn\('\[officeToPdf\] message not found'/);
  });
  it('SG2 helpers.patchOfficeAttachment has the bounded retry on no-doc', () => {
    expect(hlp).toMatch(/export async function patchOfficeAttachment/);
    expect(hlp).toMatch(/return 'no-doc'/);
    expect(hlp).toMatch(/return 'no-doc-timeout'/);
    expect(hlp).toMatch(/maxAttempts/);
  });
});
