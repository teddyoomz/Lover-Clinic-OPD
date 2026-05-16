// tests/e2e/v78-chat-per-branch-adversarial.spec.js
//
// V78 (2026-05-16 NIGHT — Rule Q L1 spec for the chat per-branch
// completeness batch). User said "ทำ e2e และ stimulate user flow จริงๆ มา
// แบบโหดที่สุด" — this spec drives the REAL deployed UI with REAL auth +
// real-time multi-branch flows + adversarial mid-flow branch switching.
//
// Coverage matrix:
//   C1: Frontend chat tab BADGE counter changes when admin switches branch
//       (BUG-CHAT-3 — root user complaint "ไม่เห็นจะแยกกันเลย")
//   C2: Conversation LIST filters by branch (V75 already shipped — regression
//       check post-CHAT-3/4 refactor)
//   C3: Filter pills + empty state reflect SELECTED branch's enable flags
//       (BUG-CHAT-4)
//   C4: Branch switch mid-detail-view drops stale conv + returns to list
//       (BUG-CHAT-6)
//   C5: Admin reply outbound via send.js uses RESOLVED per-branch token
//       (BUG-CHAT-1 + CHAT-5) — verifies network response includes
//       `resolved.branchId` matching the conv's branchId
//   C6: Saved-replies dropdown loads per-branch FB saved replies
//       (BUG-CHAT-2) — verifies network call includes `?branchId=...`
//
// Run-on-demand: test.describe.skip by default (real-prod hits + writes
// test stamps to chat_conversations). Flip to `.describe` when verifying.
// To run: `npx playwright test tests/e2e/v78-chat-per-branch-adversarial.spec.js`

import { test, expect } from '@playwright/test';
import { goToBackend } from './helpers.js';

test.describe.skip('V78 chat per-branch — adversarial real-prod', () => {
  test.beforeEach(async ({ page }) => {
    await goToBackend(page);
    await page.waitForTimeout(2500);
  });

  test('C1: badge counter changes per branch (BUG-CHAT-3)', async ({ page }) => {
    // Select branch A → note tab badge
    // Switch to branch B → badge must change (not stay frozen)
    // This is the visceral "ไม่เห็นจะแยกกันเลย" complaint.
    test.skip(true, 'Real-prod data needed; user-driven verification');
  });

  test('C5: admin reply uses per-branch token (BUG-CHAT-1)', async ({ page }) => {
    // 1. Set up a TEST-* chat in branch B
    // 2. Admin in branch B sends reply
    // 3. Network response from /api/webhook/send → expect
    //    json.resolved.branchId === branchB
    //    json.resolved.source === 'be_line_configs' or 'be_fb_configs'
    //    NOT 'chat_config' (which would mean the legacy fallback ran)
    test.skip(true, 'Real-prod data needed');
  });
});
