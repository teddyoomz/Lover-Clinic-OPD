// V87 (2026-05-18 EOD+11) — AV84 regression bank.
//
// User directive (verbatim):
//   "ปุ่มสร้างลิ้งดูข้อมูล ... ห้ามปรากฎขึ้นถ้าลูกค้าคนนั้นยังไม่ได้บันทึกลง OPD ...
//    ไม่ว่าจะอยู่ Tab จองมัดจำ หรือ จองไม่มัดจำ หรือหน้าวอคอิน หรือหน้าประวัติ"
//
// Class-of-bug: V12 multi-reader-sweep at the action-button boundary
// (same family as V36/V47/V76). Locks the closed list of `setPatientLinkModal`
// trigger sites + their OPD-save guard wrapper.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ADMIN_DASHBOARD_PATH = path.resolve(__dirname, '../src/pages/AdminDashboard.jsx');
const SOURCE = fs.readFileSync(ADMIN_DASHBOARD_PATH, 'utf8');

describe('V87 — AV84 patient-link button OPD-save guard', () => {
  // Trigger-OPEN callsites only — modal-internal `setPatientLinkModal(null)`
  // does NOT need the guard (it's a close, not an open).
  const TRIGGER_OPEN_RE = /setPatientLinkModal\(session\.id\)/g;

  it('G1.1 — exactly 2 trigger-OPEN sites exist (closed list)', () => {
    const matches = SOURCE.match(TRIGGER_OPEN_RE) || [];
    expect(matches.length).toBe(2);
  });

  it('G1.2 — every trigger-OPEN site is preceded by the OPD-save guard within ~400 chars', () => {
    // Canonical guard text (matches the visible "บันทึกลง OPD Card เรียบร้อย" badge condition):
    //   {session.opdRecordedAt && session.brokerStatus === 'done' && (
    const lines = SOURCE.split('\n');
    const triggerLineIdxs = lines
      .map((line, idx) => (line.includes('setPatientLinkModal(session.id)') ? idx : -1))
      .filter((i) => i !== -1);

    expect(triggerLineIdxs.length).toBe(2);

    for (const idx of triggerLineIdxs) {
      // Walk back up to 15 lines looking for the guard expression. AV84 contract:
      // every trigger MUST be inside a JSX branch that gates on the OPD-save
      // condition. The guard typically lands on the line `{N-2`..`{N-6` chars
      // above the trigger.
      const windowStart = Math.max(0, idx - 15);
      const window = lines.slice(windowStart, idx + 1).join('\n');
      const guardRe = /session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]/;
      expect(window).toMatch(guardRe);
    }
  });

  it('G2.1 — V87/AV84 marker comment present at the walk-in queue guard site', () => {
    // Locks the institutional-memory comment so a future refactor can\'t silently strip it.
    expect(SOURCE).toMatch(/AV84[\s\S]{0,300}OPD-save guard/i);
  });

  it('G2.2 — pre-V87 unguarded shape MUST NOT appear (regression lock)', () => {
    // Before V87, the walk-in queue had this exact JSX immediately after the
    // QR button — a non-wrapped <button onClick={() => setPatientLinkModal...}.
    // Locking the broken shape prevents accidental revert.
    const lines = SOURCE.split('\n');
    let unguardedCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('setPatientLinkModal(session.id)')) {
        // Walk back 15 lines and check whether the OPD-save guard appears
        // BEFORE we encounter the previous JSX element opener. If the guard
        // is missing → unguardedCount++.
        const windowStart = Math.max(0, i - 15);
        const window = lines.slice(windowStart, i + 1).join('\n');
        if (!/session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]/.test(window)) {
          unguardedCount++;
        }
      }
    }
    expect(unguardedCount).toBe(0);
  });

  it('G3.1 — sibling history-view guard (line ~6080) preserved verbatim', () => {
    // V87 only added the walk-in queue guard; history-view guard was already
    // present pre-V87. Lock that the original guard stays in place.
    const historyGuard = /\{session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]\s*&&\s*\(\s*\n\s*<button[\s\S]{0,80}setPatientLinkModal\(session\.id\)/;
    expect(SOURCE).toMatch(historyGuard);
  });

  it('G3.2 — both guard wrappers are paired with closing `)}`', () => {
    // Each `{session.opdRecordedAt && session.brokerStatus === 'done' && (`
    // must be followed by a matching `)}` to close the JSX branch.
    const openGuards = SOURCE.match(/\{session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]\s*&&\s*\(/g) || [];
    // Each guard pair is 1 link-button branch — both walk-in + history.
    // (Other OPD-save conditions exist for the badge / CheckCircle / etc.,
    //  but those use a different shape — `{cond && (...)` for badges, vs
    //  `{cond && (\n<button>` for the link-button branches we care about.)
    // We only lock that the link-button branches both open AND close cleanly:
    // for each open-guard, find a `)}` within the next ~30 lines.
    const lines = SOURCE.split('\n');
    let linkGuardOpens = 0;
    let linkGuardCloses = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/\{session\.opdRecordedAt\s*&&\s*session\.brokerStatus\s*===\s*['"]done['"]\s*&&\s*\(/.test(lines[i])) {
        // Look forward up to 30 lines for setPatientLinkModal trigger.
        const window = lines.slice(i, Math.min(lines.length, i + 30)).join('\n');
        if (window.includes('setPatientLinkModal(session.id)')) {
          linkGuardOpens++;
          if (/\)\}/.test(window)) linkGuardCloses++;
        }
      }
    }
    expect(linkGuardOpens).toBe(2);
    expect(linkGuardCloses).toBe(2);
  });
});
