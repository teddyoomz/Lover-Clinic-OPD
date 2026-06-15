// Task 1 — shared debounced reconnectFirestore() (mobile-load reliability, 2026-06-16)
import { describe, it, expect, vi, beforeEach } from 'vitest';

const disableNetwork = vi.fn(() => Promise.resolve());
const enableNetwork = vi.fn(() => Promise.resolve());
vi.mock('firebase/firestore', () => ({
  disableNetwork: (...a) => disableNetwork(...a),
  enableNetwork: (...a) => enableNetwork(...a),
}));
vi.mock('../src/firebase.js', () => ({ db: { __mock: true } }));

import { reconnectFirestore, __resetReconnectDebounceForTest } from '../src/lib/firestoreReconnect.js';

describe('reconnectFirestore — shared debounced network toggle', () => {
  beforeEach(() => {
    disableNetwork.mockClear();
    enableNetwork.mockClear();
    disableNetwork.mockImplementation(() => Promise.resolve());
    enableNetwork.mockImplementation(() => Promise.resolve());
    __resetReconnectDebounceForTest();
  });

  it('toggles disableNetwork then enableNetwork', async () => {
    await reconnectFirestore();
    expect(disableNetwork).toHaveBeenCalledTimes(1);
    expect(enableNetwork).toHaveBeenCalledTimes(1);
  });

  it('debounces concurrent calls into ONE toggle (toggling guard)', async () => {
    const p1 = reconnectFirestore();
    const p2 = reconnectFirestore(); // sees toggling=true → returns
    await Promise.all([p1, p2]);
    expect(disableNetwork).toHaveBeenCalledTimes(1);
  });

  it('debounces rapid sequential calls within the 1500ms window', async () => {
    await reconnectFirestore();
    await reconnectFirestore(); // within window → time debounce
    expect(disableNetwork).toHaveBeenCalledTimes(1);
  });

  it('toggles again after the debounce is reset', async () => {
    await reconnectFirestore();
    __resetReconnectDebounceForTest();
    await reconnectFirestore();
    expect(disableNetwork).toHaveBeenCalledTimes(2);
  });

  it('swallows a toggle failure (non-fatal) and never throws', async () => {
    disableNetwork.mockRejectedValueOnce(new Error('boom'));
    await expect(reconnectFirestore()).resolves.toBeUndefined();
  });
});
