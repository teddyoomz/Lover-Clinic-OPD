// V75 Item 3 — Rule I full-flow simulator: webhook branchId resolution.
// Pure helper tests for lineChatBranchResolver + fbChatBranchResolver.

import { describe, it, expect, vi } from 'vitest';
import { resolveChatBranchIdFromLineEvent } from '../api/webhook/_lib/lineChatBranchResolver.js';
import { resolveChatBranchIdFromFbEvent } from '../api/webhook/_lib/fbChatBranchResolver.js';

describe('V75 AV57 — LINE webhook branchId resolver', () => {
  it('LW1.1 — happy path: destination matches be_line_configs → stamps webhook-line', async () => {
    const result = await resolveChatBranchIdFromLineEvent(
      { destination: 'U-NAKHON-CHANNEL', events: [{ source: { userId: 'U-customer' } }] },
      {
        getLineConfigByDestination: async () => ({ branchId: 'BR-NAKHON', channelId: 'CH-1' }),
        fallbackBranchId: 'BR-NAKHON',
      }
    );
    expect(result.branchId).toBe('BR-NAKHON');
    expect(result.branchIdSource).toBe('webhook-line');
  });

  it('LW1.2 — fallback: destination matches NO be_line_configs → falls back', async () => {
    const result = await resolveChatBranchIdFromLineEvent(
      { destination: 'U-UNKNOWN', events: [] },
      { getLineConfigByDestination: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(result.branchId).toBe('BR-NAKHON');
    expect(result.branchIdSource).toBe('webhook-line-fallback-nakhonratchasima');
  });

  it('LW1.3 — adversarial: empty destination → fallback', async () => {
    const result = await resolveChatBranchIdFromLineEvent(
      { destination: '', events: [] },
      { getLineConfigByDestination: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(result.branchIdSource).toMatch(/fallback/);
  });

  it('LW1.4 — adversarial: lookup throws → fallback + onError invoked', async () => {
    const warns = [];
    const result = await resolveChatBranchIdFromLineEvent(
      { destination: 'U1234', events: [] },
      {
        getLineConfigByDestination: async () => { throw new Error('Firestore unavailable'); },
        fallbackBranchId: 'BR-NAKHON',
        onError: (e) => warns.push(e.message),
      }
    );
    expect(result.branchIdSource).toMatch(/fallback/);
    expect(warns).toContain('Firestore unavailable');
  });

  it('LW1.5 — empty fallbackBranchId → webhook-line-fallback-empty (no nakhonratchasima label)', async () => {
    const result = await resolveChatBranchIdFromLineEvent(
      { destination: '', events: [] },
      { getLineConfigByDestination: async () => null, fallbackBranchId: '' }
    );
    expect(result.branchId).toBe('');
    expect(result.branchIdSource).toBe('webhook-line-fallback-empty');
  });

  it('LW1.6 — line.js source contains V75 marker comment near chat_conversations stamp', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/webhook/line.js', 'utf8');
    expect(src).toMatch(/V75 Item 3.*chat_conversations|chat_conversations.*V75 Item 3/);
  });

  it('LW1.7 — line.js convFields includes branchId + branchIdSource (AV57 stamp)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/webhook/line.js', 'utf8');
    expect(src).toMatch(/branchId:\s*\{\s*stringValue:\s*chatBranchId\s*\}/);
    expect(src).toMatch(/branchIdSource:\s*\{\s*stringValue:\s*chatBranchIdSource\s*\}/);
  });
});

describe('V75 AV57 — FB webhook branchId resolver', () => {
  it('FW1.1 — happy path: Page ID matches be_fb_configs → stamps webhook-fb', async () => {
    const result = await resolveChatBranchIdFromFbEvent(
      { entry: [{ id: '12345' }] },
      {
        getFbConfigByPageId: async () => ({ branchId: 'BR-A', pageId: '12345' }),
        fallbackBranchId: 'BR-NAKHON',
      }
    );
    expect(result.branchId).toBe('BR-A');
    expect(result.branchIdSource).toBe('webhook-fb');
  });

  it('FW1.2 — fallback: Page ID not in be_fb_configs → falls back to legacy', async () => {
    const result = await resolveChatBranchIdFromFbEvent(
      { entry: [{ id: '99999' }] },
      { getFbConfigByPageId: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(result.branchId).toBe('BR-NAKHON');
    expect(result.branchIdSource).toBe('webhook-fb-fallback-legacy');
  });

  it('FW1.3 — adversarial: empty entry array → fallback', async () => {
    const r = await resolveChatBranchIdFromFbEvent(
      { entry: [] },
      { getFbConfigByPageId: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(r.branchIdSource).toMatch(/fallback/);
  });

  it('FW1.4 — adversarial: missing entry field → fallback', async () => {
    const r = await resolveChatBranchIdFromFbEvent(
      {},
      { getFbConfigByPageId: async () => null, fallbackBranchId: 'BR-NAKHON' }
    );
    expect(r.branchIdSource).toMatch(/fallback/);
  });

  it('FW1.5 — adversarial: getFbConfigByPageId throws → fallback + onError invoked', async () => {
    const warns = [];
    const r = await resolveChatBranchIdFromFbEvent(
      { entry: [{ id: '12345' }] },
      {
        getFbConfigByPageId: async () => { throw new Error('Firestore unavailable'); },
        fallbackBranchId: 'BR-NAKHON',
        onError: (e) => warns.push(e.message),
      }
    );
    expect(r.branchIdSource).toMatch(/fallback/);
    expect(warns).toContain('Firestore unavailable');
  });

  it('FW1.6 — empty fallback → webhook-fb-fallback-empty label', async () => {
    const r = await resolveChatBranchIdFromFbEvent(
      { entry: [{ id: '12345' }] },
      { getFbConfigByPageId: async () => null, fallbackBranchId: '' }
    );
    expect(r.branchId).toBe('');
    expect(r.branchIdSource).toBe('webhook-fb-fallback-empty');
  });

  it('FW1.7 — facebook.js source contains V75 marker comment near chat_conversations stamp', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/webhook/facebook.js', 'utf8');
    expect(src).toMatch(/V75 Item 3.*chat_conversations|chat_conversations.*V75 Item 3|V75 Item 3.*branchId|branchId.*V75 Item 3/);
  });

  it('FW1.8 — facebook.js convFields includes branchId + branchIdSource (AV57 stamp)', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/webhook/facebook.js', 'utf8');
    expect(src).toMatch(/branchId:\s*\{\s*stringValue:\s*chatBranchId\s*\}/);
    expect(src).toMatch(/branchIdSource:\s*\{\s*stringValue:\s*chatBranchIdSource\s*\}/);
  });

  it('FW1.9 — facebook.js main handler calls resolveChatBranchIdFromFbEvent', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/webhook/facebook.js', 'utf8');
    expect(src).toMatch(/resolveChatBranchIdFromFbEvent/);
  });
});
