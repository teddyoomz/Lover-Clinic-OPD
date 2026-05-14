// Task 7 — webhook postback handler tests
// Verifies postbackActionToFlag pure helper that maps LINE postback action
// strings (confirm/reschedule/contact) → notifyMeta flag values.
//
// Full handlePostback flow (Firestore writes, reply emission, branch cross-check)
// is covered by Rule I flow-simulate (Task 18) + admin-SDK e2e (Task 19).
// This file locks the pure helper contract.

import { describe, it, expect } from 'vitest';
import { postbackActionToFlag } from '../api/webhook/line.js';

describe('T7 postbackActionToFlag', () => {
  it('T7.1 confirm → confirmed', () => {
    expect(postbackActionToFlag('confirm')).toBe('confirmed');
  });

  it('T7.2 reschedule → reschedule-requested', () => {
    expect(postbackActionToFlag('reschedule')).toBe('reschedule-requested');
  });

  it('T7.3 contact → contact-requested', () => {
    expect(postbackActionToFlag('contact')).toBe('contact-requested');
  });

  it('T7.4 unknown action → null', () => {
    expect(postbackActionToFlag('fakeaction')).toBe(null);
    expect(postbackActionToFlag('')).toBe(null);
    expect(postbackActionToFlag(null)).toBe(null);
    expect(postbackActionToFlag(undefined)).toBe(null);
  });
});
