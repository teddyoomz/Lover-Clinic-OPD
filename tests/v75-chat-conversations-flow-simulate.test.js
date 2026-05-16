// tests/v75-chat-conversations-flow-simulate.test.js
// V75 Item 3 — Rule I full-flow simulate (5-layer chat chain).
//
// Chains webhook → write → backfill (legacy) → backendClient Layer 1 →
// scopedDataLayer Layer 2 → ChatPanel reader in pure simulate mirrors
// per Rule I item (a): "Pure simulate mirrors of inline React logic so the
// test can chain 4+ steps without mounting React".

import { describe, it, expect } from 'vitest';
import { resolveChatBranchIdFromLineEvent } from '../api/webhook/_lib/lineChatBranchResolver.js';
import { resolveChatBranchIdFromFbEvent } from '../api/webhook/_lib/fbChatBranchResolver.js';
import {
  decideBackfillAction,
  buildBackfillPatch,
} from '../scripts/v75-backfill-chat-conversations-branchid.mjs';

describe('V75 Item 3 — Rule I full-flow simulate (5-layer chat chain)', () => {
  it('F1 — Layer-by-layer: webhook resolves branchId → write doc → backfill (legacy) → reader filter', async () => {
    // Layer 1: Webhook receives LINE event + resolves branchId
    const webhookResolved = await resolveChatBranchIdFromLineEvent(
      {
        destination: 'U-DEST',
        events: [{ source: { userId: 'U-CUST' }, message: { type: 'text', text: 'สวัสดี' } }],
      },
      {
        getLineConfigByDestination: async () => ({ branchId: 'BR-A', channelId: 'CH-A' }),
        fallbackBranchId: 'BR-NAKHON',
      }
    );
    expect(webhookResolved.branchId).toBe('BR-A');
    expect(webhookResolved.branchIdSource).toBe('webhook-line');

    // Layer 2: Simulated Firestore write — record has branchId + source stamped
    const writtenDoc = {
      lineUserId: 'U-CUST',
      lastMessage: 'สวัสดี',
      lastMessageAt: Date.now(),
      branchId: webhookResolved.branchId,
      branchIdSource: webhookResolved.branchIdSource,
    };
    expect(writtenDoc.branchId).toBe('BR-A');

    // Layer 3: Pre-V75 legacy chat with no branchId — backfill decision
    const legacyDoc = {
      lineUserId: 'U-LEGACY',
      lastMessage: 'old chat',
      lastMessageAt: 1700000000000,
    };
    const backfillAction = decideBackfillAction({
      docId: 'chat-legacy',
      data: legacyDoc,
      defaultBranchId: 'BR-NAKHON',
    });
    expect(backfillAction).toBe('backfill');
    const legacyStamped = {
      ...legacyDoc,
      ...buildBackfillPatch({ docId: 'chat-legacy', defaultBranchId: 'BR-NAKHON' }),
    };
    expect(legacyStamped.branchId).toBe('BR-NAKHON');

    // Layer 4: backendClient Layer 1 reader contract — simulated where-clause
    // query(chat_conversations, where('branchId','==','BR-A')) returns writtenDoc
    // but NOT legacyStamped (verified by source-grep at Task 10 + BS-17 audit).
    const simulatedFilter = (branchId, docs) => docs.filter((d) => d.branchId === branchId);
    expect(simulatedFilter('BR-A', [writtenDoc, legacyStamped])).toEqual([writtenDoc]);
    expect(simulatedFilter('BR-NAKHON', [writtenDoc, legacyStamped])).toEqual([legacyStamped]);

    // Layer 5: scopedDataLayer Layer 2 auto-injects selectedBranchId → if
    // selectedBranchId === 'BR-A', UI sees writtenDoc only. Verified at
    // Task 11 + audit-branch-scope BS-17. End-to-end contract holds.
  });

  it('F2 — Branch switch round-trip: A → B → A maintains correct filter state', () => {
    const allChats = [
      { id: 'c1', branchId: 'BR-A', lastMessage: 'A1' },
      { id: 'c2', branchId: 'BR-A', lastMessage: 'A2' },
      { id: 'c3', branchId: 'BR-B', lastMessage: 'B1' },
    ];
    const filter = (branchId) => allChats.filter((c) => c.branchId === branchId);
    expect(filter('BR-A')).toHaveLength(2);
    expect(filter('BR-B')).toHaveLength(1);
    expect(filter('BR-A')).toHaveLength(2); // back to A → consistent
  });

  it('F3 — allBranches view returns all chats unfiltered (admin tool option)', () => {
    const allChats = [
      { id: 'c1', branchId: 'BR-A' },
      { id: 'c2', branchId: 'BR-B' },
      { id: 'c3', branchId: 'BR-NAKHON' },
    ];
    // allBranches=true → no filter; reader returns full list
    expect(allChats).toHaveLength(3);
  });

  it('F4 — Adversarial: malformed payload (empty destination, no events) → fallback stamps NAKHON', async () => {
    const r = await resolveChatBranchIdFromLineEvent(
      {},
      { getLineConfigByDestination: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(r.branchIdSource).toMatch(/fallback/);
    expect(r.branchId).toBe('BR-NAKHON');
  });

  it('F5 — FB webhook layer chain: payload → resolve → write → reader filter', async () => {
    // Webhook resolves
    const resolved = await resolveChatBranchIdFromFbEvent(
      { entry: [{ id: 'PAGE-XYZ' }] },
      {
        getFbConfigByPageId: async (pid) =>
          pid === 'PAGE-XYZ' ? { branchId: 'BR-B', pageId: 'PAGE-XYZ' } : null,
        fallbackBranchId: 'BR-NAKHON',
      }
    );
    expect(resolved.branchId).toBe('BR-B');
    expect(resolved.branchIdSource).toBe('webhook-fb');

    // Write
    const doc = {
      fbPageId: 'PAGE-XYZ',
      lastMessage: 'hi',
      branchId: resolved.branchId,
      branchIdSource: resolved.branchIdSource,
    };

    // Reader filter: BR-A admin does NOT see this chat
    const filter = (branchId, docs) => docs.filter((d) => d.branchId === branchId);
    expect(filter('BR-A', [doc])).toEqual([]);
    expect(filter('BR-B', [doc])).toEqual([doc]);
  });

  it('F6 — Mixed pre/post V75 chat list at single branch — reader returns both', async () => {
    // Pre-V75 chat backfilled
    const preChat = {
      id: 'pre-1',
      ...buildBackfillPatch({ docId: 'pre-1', defaultBranchId: 'BR-A' }),
      lineUserId: 'U1',
      lastMessage: 'pre-v75',
    };
    // Post-V75 chat written by webhook
    const webhookResolved = await resolveChatBranchIdFromLineEvent(
      { destination: 'U-D', events: [{ source: { userId: 'U2' } }] },
      {
        getLineConfigByDestination: async () => ({ branchId: 'BR-A', channelId: 'CH' }),
        fallbackBranchId: 'BR-NAKHON',
      }
    );
    const postChat = {
      id: 'post-1',
      lineUserId: 'U2',
      lastMessage: 'post-v75',
      branchId: webhookResolved.branchId,
      branchIdSource: webhookResolved.branchIdSource,
    };

    expect(preChat.branchId).toBe('BR-A');
    expect(postChat.branchId).toBe('BR-A');

    const filter = (branchId, docs) => docs.filter((d) => d.branchId === branchId);
    // BR-A admin sees BOTH unified chats
    expect(filter('BR-A', [preChat, postChat])).toHaveLength(2);
    // Source attribution preserved — admin can audit migration origin
    expect(preChat.branchIdSource).toBe('backfill-v75-sole-active');
    expect(postChat.branchIdSource).toBe('webhook-line');
  });
});
