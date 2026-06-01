// Task 1 — retire the duplicate Firebase staff-chat cleanup function.
// The Vercel cron `staff-chat-retention-sweep` (30d, orphan-aware) is the single
// source of truth for staff-chat retention; the V73 Firebase scheduled fn
// `cleanupOldStaffChatMessages` (7d) silently overrode it → retired 2026-06-02.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';

describe('Scheduled Tasks · retire duplicate Firebase staff-chat cleanup', () => {
  it('functions/cleanupStaffChat.js is deleted', () => {
    expect(existsSync('functions/cleanupStaffChat.js')).toBe(false);
  });

  it('functions/index.js no longer references the Firebase staff-chat fn', () => {
    const src = readFileSync('functions/index.js', 'utf8');
    expect(src).not.toMatch(/cleanupOldStaffChatMessages/);
    expect(src).not.toMatch(/require\(['"]\.\/cleanupStaffChat/);
  });

  it('only ONE scheduled deleter of be_staff_chat_messages remains (the Vercel cron)', () => {
    // The Vercel sweep keeps deleting; assert the Firebase duplicate source file is gone.
    expect(existsSync('api/cron/staff-chat-retention-sweep.js')).toBe(true);
    expect(existsSync('functions/cleanupStaffChat.js')).toBe(false);
  });
});
