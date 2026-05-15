// tests/v73-staff-chat-flow-simulate.test.jsx
// V73 Rule I full-flow simulate — chains the entire user journey through
// each feature using REAL helpers + mocked Firestore listener.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(),
  addStaffChatMessage: vi.fn(() => Promise.resolve('CHAT-x')),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-T' }),
}));
vi.mock('../src/firebase.js', () => ({
  db: {},
  auth: { currentUser: { uid: 'U1' } },
  appId: 'TEST-APP',
}));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { listenToStaffChatMessages, addStaffChatMessage } from '../src/lib/scopedDataLayer.js';

describe('V73.F1 Rule I — full base flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  });

  it('F1.1 mount → listener subscribes → incoming msg → unread badge increments when minimized', async () => {
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => { onChange = onC; return () => {}; });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();
    expect(listenToStaffChatMessages).toHaveBeenCalled();

    act(() => onChange([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'hi', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]));
    await waitFor(() => expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('1'));
  });
});

describe('V73.F2 Rule I — mention triggers auto-expand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  });

  it('F2.1 mention chip renders + widget auto-expands on mention regardless of state', async () => {
    localStorage.setItem('staffChatName', 'ดร.วี');
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => { onChange = onC; return () => {}; });

    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();

    act(() => onChange([{ id: 'CHAT-2', branchId: 'BR-T', displayName: 'admin', text: '@ดร.วี รอลูกค้า', deviceId: 'other', mentions: ['ดร.วี'], createdAt: { toMillis: () => Date.now() } }]));

    await waitFor(() => expect(screen.getByTestId('staff-chat-panel')).toBeInTheDocument());
    expect(screen.getByTestId('staff-chat-mention-chip-ดร.วี')).toBeInTheDocument();
  });
});

describe('V73.F3 Rule I — reply flow end-to-end', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  });

  it('F3.1 click reply → quote strip → send → message stored with replyTo', async () => {
    localStorage.setItem('staffChatName', 'me');
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => {
      onChange = onC;
      setTimeout(() => onC([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'รอลูกค้า', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]), 0);
      return () => {};
    });

    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));  // expand

    await waitFor(() => screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    fireEvent.click(screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    expect(screen.getByTestId('staff-chat-composer-quote-strip')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));

    await waitFor(() => expect(addStaffChatMessage).toHaveBeenCalled());
    const arg = addStaffChatMessage.mock.calls[0][0];
    expect(arg.replyTo).toMatchObject({ msgId: 'CHAT-1', displayName: 'ดร.วี' });
  });
});

describe('V73.F4 Rule I — auto-link render', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());
  });

  it('F4.1 LC- + BA- tokens render as clickable chips', async () => {
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => {
      onChange = onC;
      setTimeout(() => onC([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'admin', text: 'see LC-26000022 about BA-1778', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]), 0);
      return () => {};
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));
    await waitFor(() => screen.getByTestId('staff-chat-customer-link-LC-26000022'));
    expect(screen.getByTestId('staff-chat-appt-link-BA-1778')).toBeInTheDocument();
  });
});
