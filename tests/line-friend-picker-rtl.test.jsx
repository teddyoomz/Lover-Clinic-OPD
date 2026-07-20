// ─── LINE Friend Picker (2026-07-20) — LineFriendPickerModal RTL (Task 7) ────
// P1 listeners+backfill · P2 real-time row appears mid-open · P3 search ·
// P4 pick mode · P5 bind mode confirm-first · P6 AV78 explicit-close ·
// P7 unsubscribe on unmount · P8 branch switch resubscribes · P9 empty state ·
// P10 unfollowed row dimmed. Mocks = code-shape coverage (Rule Q: behavior
// proof lives in scripts/e2e-line-friends-realtime.mjs + the Playwright spec).
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const ORIGINAL_FETCH = global.fetch;
let friendsCb = null;
let convsCb = null;
const unsubFriends = vi.fn();
const unsubConvs = vi.fn();
const mockListenFriends = vi.fn((opts, onChange) => { friendsCb = onChange; return unsubFriends; });
const mockListenConvs = vi.fn((opts, onChange) => { convsCb = onChange; return unsubConvs; });
const mockListBranches = vi.fn(async () => ([
  { id: 'BR-A', name: 'นครราชสีมา' },
  { id: 'BR-B', name: 'พระราม 3' },
]));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToLineFriendsByBranch: (...a) => mockListenFriends(...a),
  listenToChatConversationsByBranch: (...a) => mockListenConvs(...a),
  listBranches: (...a) => mockListBranches(...a),
  resolveSelectedBranchId: () => 'BR-A',
}));
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { getIdToken: async () => 'test-token' } },
}));

import LineFriendPickerModal from '../src/components/backend/LineFriendPickerModal.jsx';

const FRIEND = {
  id: 'BR-A_U-friend1', lineUserId: 'U-friend1', displayName: 'เพื่อนใหม่หนึ่ง',
  pictureUrl: '', branchId: 'BR-A', source: 'follow',
  followedAt: '2026-07-20T10:00:00.000Z', unfollowedAt: null, updatedAt: '2026-07-20T10:00:00.000Z',
};
const CONV = {
  id: 'line_U-chat1', platform: 'line', displayName: 'คุณแชทหนึ่ง',
  pictureUrl: 'https://p/c1.jpg', branchId: 'BR-A', lastMessageAt: '2026-07-20T11:00:00.000Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  friendsCb = null;
  convsCb = null;
  global.fetch = vi.fn(async () => ({ status: 200, json: async () => ({ followersApi: 'unavailable' }) }));
});
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

function openPicker(props = {}) {
  const onPick = vi.fn();
  const onClose = vi.fn();
  const utils = render(
    <LineFriendPickerModal open branchId="BR-A" mode="pick" onPick={onPick} onClose={onClose} {...props} />
  );
  return { onPick, onClose, ...utils };
}

describe('P1 — listeners + backfill wiring', () => {
  it('P1.1 mount subscribes BOTH listeners with explicit branchId + fires backfill once', async () => {
    openPicker();
    expect(mockListenFriends).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'BR-A' }), expect.any(Function), expect.any(Function));
    expect(mockListenConvs).toHaveBeenCalledWith(
      expect.objectContaining({ branchId: 'BR-A' }), expect.any(Function), expect.any(Function));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1));
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/admin/line-friends');
    expect(JSON.parse(opts.body)).toMatchObject({ action: 'list', branchId: 'BR-A' });
  });
});

describe('P2 — real-time rows (แอดปุ๊ป/ทักปุ๊ป โผล่ปั๊บ)', () => {
  it('P2.1 friend doc arriving mid-open renders WITHOUT any refresh action', async () => {
    openPicker();
    friendsCb([FRIEND]);
    expect(await screen.findByText('เพื่อนใหม่หนึ่ง')).toBeTruthy();
  });
  it('P2.2 chat conversation arriving mid-open renders too', async () => {
    openPicker();
    convsCb([CONV]);
    expect(await screen.findByText('คุณแชทหนึ่ง')).toBeTruthy();
  });
});

describe('P3 — search', () => {
  it('P3.1 filters by name', async () => {
    openPicker();
    friendsCb([FRIEND]);
    convsCb([CONV]);
    await screen.findByText('คุณแชทหนึ่ง');
    fireEvent.change(screen.getByTestId('lf-search'), { target: { value: 'แชท' } });
    expect(screen.queryByText('เพื่อนใหม่หนึ่ง')).toBe(null);
    expect(screen.getByText('คุณแชทหนึ่ง')).toBeTruthy();
  });
});

describe('P4 — pick mode', () => {
  it('P4.1 เลือก → onPick(row) with lineUserId + displayName, then closes', async () => {
    const { onPick, onClose } = openPicker();
    friendsCb([FRIEND]);
    fireEvent.click(await screen.findByTestId('lf-pick-U-friend1'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({
      lineUserId: 'U-friend1', displayName: 'เพื่อนใหม่หนึ่ง',
    }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('P5 — bind mode: confirm-first', () => {
  it('P5.1 เลือก → confirm dialog shows LINE name + customer name/HN; ยืนยัน → onPick', async () => {
    const { onPick } = openPicker({
      mode: 'bind',
      customer: { id: 'CUST-1', customerName: 'แพรพร พรแพร', customerHN: '000004' },
    });
    friendsCb([FRIEND]);
    fireEvent.click(await screen.findByTestId('lf-pick-U-friend1'));
    expect(onPick).not.toHaveBeenCalled(); // confirm gate first
    const dialog = screen.getByTestId('lf-confirm-bind');
    expect(dialog.textContent).toContain('เพื่อนใหม่หนึ่ง');
    expect(dialog.textContent).toContain('แพรพร พรแพร');
    fireEvent.click(screen.getByTestId('lf-confirm-bind-btn'));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ lineUserId: 'U-friend1' }));
  });
  it('P5.2 ยกเลิกใน confirm → no onPick, list still open', async () => {
    const { onPick, onClose } = openPicker({
      mode: 'bind', customer: { id: 'CUST-1', customerName: 'แพรพร', customerHN: '000004' },
    });
    friendsCb([FRIEND]);
    fireEvent.click(await screen.findByTestId('lf-pick-U-friend1'));
    fireEvent.click(screen.getByTestId('lf-confirm-cancel-btn'));
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('line-friend-picker-modal')).toBeTruthy();
  });
});

describe('P6 — AV78 explicit-close', () => {
  it('P6.1 backdrop click does NOT close; X closes', () => {
    const { onClose } = openPicker();
    fireEvent.click(screen.getByTestId('line-friend-picker-modal')); // backdrop
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText('ปิด'));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('P7 — listener lifecycle', () => {
  it('P7.1 unmount unsubscribes both listeners (leak guard)', () => {
    const { unmount } = openPicker();
    unmount();
    expect(unsubFriends).toHaveBeenCalled();
    expect(unsubConvs).toHaveBeenCalled();
  });
});

describe('P8 — branch switch', () => {
  it('P8.1 changing branch resubscribes with the new branchId', async () => {
    openPicker();
    await screen.findByTestId('lf-branch-select');
    fireEvent.change(screen.getByTestId('lf-branch-select'), { target: { value: 'BR-B' } });
    await waitFor(() => {
      expect(mockListenFriends).toHaveBeenCalledWith(
        expect.objectContaining({ branchId: 'BR-B' }), expect.any(Function), expect.any(Function));
    });
    expect(unsubFriends).toHaveBeenCalled(); // old subscription released
  });
});

describe('P9 — empty state', () => {
  it('P9.1 no rows → Thai guidance copy', async () => {
    openPicker();
    friendsCb([]);
    convsCb([]);
    expect(await screen.findByTestId('lf-empty')).toBeTruthy();
    expect(screen.getByTestId('lf-empty').textContent).toContain('ยังไม่มีรายชื่อ');
  });
});

describe('P10 — unfollowed row', () => {
  it('P10.1 dimmed + "เลิกติดตาม" badge but still selectable', async () => {
    openPicker();
    friendsCb([{ ...FRIEND, unfollowedAt: '2026-07-20T12:00:00.000Z' }]);
    const row = await screen.findByTestId('lf-row-U-friend1');
    expect(row.className).toContain('opacity-');
    expect(row.textContent).toContain('เลิกติดตาม');
    expect(screen.getByTestId('lf-pick-U-friend1')).toBeTruthy();
  });
});
