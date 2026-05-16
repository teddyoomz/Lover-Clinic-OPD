// tests/v73-staff-chat-widget-rtl.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-TEST' }),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

// Helper to build mock return value
function mockChatState(overrides = {}) {
  return {
    messages: [],
    minimized: true,
    unreadCount: 0,
    deviceId: 'dev-1',
    error: null,
    namePickerOpen: false,
    setNamePickerOpen: vi.fn(),
    send: vi.fn(),
    confirmName: vi.fn(),
    expand: vi.fn(),
    minimize: vi.fn(),
    ...overrides,
  };
}

// W1: render gate
describe('V73.W1 StaffChatWidget render gate', () => {
  beforeEach(() => useStaffChat.mockReturnValue(mockChatState()));

  it('W1.1 renders bubble when minimized + has user + branch', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-panel')).toBeNull();
  });

  it('W1.2 hidden when user is null', () => {
    render(<StaffChatWidget user={null} needsPublicAuth={false} />);
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W1.3 hidden when needsPublicAuth is true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={true} />);
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W1.4 click bubble calls expand', () => {
    const expand = vi.fn();
    useStaffChat.mockReturnValue(mockChatState({ expand }));
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));
    expect(expand).toHaveBeenCalled();
  });

  it('W1.5 unread badge shows when count > 0', () => {
    useStaffChat.mockReturnValue(mockChatState({ unreadCount: 3 }));
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('3');
  });

  it('W1.6 unread badge shows 99+ when count > 99', () => {
    useStaffChat.mockReturnValue(mockChatState({ unreadCount: 150 }));
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('99+');
  });
});

// W2: panel + header
describe('V73.W2 StaffChatPanel + Header', () => {
  beforeEach(() => useStaffChat.mockReturnValue(mockChatState({ minimized: false })));

  it('W2.1 panel renders when not minimized', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W2.2 header shows branch name', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} branchName="ทดลอง 1" />);
    expect(screen.getByTestId('staff-chat-header')).toHaveTextContent('ทดลอง 1');
  });

  it('W2.3 click minimize button → minimize()', () => {
    const minimize = vi.fn();
    useStaffChat.mockReturnValue(mockChatState({ minimized: false, minimize }));
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-header-minimize'));
    expect(minimize).toHaveBeenCalled();
  });

  it('W2.4 mute toggle present', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-header-mute')).toBeInTheDocument();
  });
});

// W3: message list
describe('V73.W3 StaffChatMessageList', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue(mockChatState({
      minimized: false,
      messages: [
        { id: 'CHAT-1', branchId: 'BR-TEST', displayName: 'ดร.วี', text: 'รอลูกค้า', createdAt: { toMillis: () => Date.now() }, deviceId: 'other' },
        { id: 'CHAT-2', branchId: 'BR-TEST', displayName: 'admin',  text: 'ok',       createdAt: { toMillis: () => Date.now() }, deviceId: 'dev-1' },
      ],
    }));
  });

  it('W3.1 renders all messages', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByText('รอลูกค้า')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('W3.2 own message gets data-own=true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const own = screen.getByText('ok').closest('[data-testid="staff-chat-message"]');
    expect(own).toHaveAttribute('data-own', 'true');
  });

  it('W3.3 other message gets data-own=false + shows displayName', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const other = screen.getByText('รอลูกค้า').closest('[data-testid="staff-chat-message"]');
    expect(other).toHaveAttribute('data-own', 'false');
    expect(other).toHaveTextContent('ดร.วี');
  });

  it('W3.4 empty state shows when no messages', () => {
    useStaffChat.mockReturnValue(mockChatState({ minimized: false }));
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-empty')).toBeInTheDocument();
  });
});

// W4: composer
describe('V73.W4 StaffChatComposer', () => {
  let sendMock;
  beforeEach(() => {
    sendMock = vi.fn();
    useStaffChat.mockReturnValue(mockChatState({ minimized: false, send: sendMock }));
  });

  it('W4.1 textarea + send button rendered', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-input')).toBeInTheDocument();
    expect(screen.getByTestId('staff-chat-composer-send')).toBeInTheDocument();
  });

  it('W4.2 send button disabled when textarea empty', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-send')).toBeDisabled();
  });

  it('W4.3 typing enables send button', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'hello' } });
    expect(screen.getByTestId('staff-chat-composer-send')).toBeEnabled();
  });

  it('W4.4 click send calls chat.send(text) + clears textarea', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('hello', expect.anything());
    expect(input.value).toBe('');
  });

  it('W4.5 Enter without shift submits', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(sendMock).toHaveBeenCalledWith('hi', expect.anything());
  });

  it('W4.6 Shift+Enter inserts newline (does NOT submit)', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('W4.7 char counter visible at 400+ chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'x'.repeat(420) } });
    expect(screen.getByTestId('staff-chat-composer-counter')).toHaveTextContent('420 / 500');
  });

  it('W4.8 send disabled at 501 chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'x'.repeat(501) } });
    expect(screen.getByTestId('staff-chat-composer-send')).toBeDisabled();
  });
});

// W5: name picker
describe('V73.W5 StaffChatNamePicker', () => {
  let confirmName;
  beforeEach(() => {
    confirmName = vi.fn();
    useStaffChat.mockReturnValue(mockChatState({
      minimized: false,
      namePickerOpen: true,
      confirmName,
    }));
  });

  it('W5.1 modal renders when namePickerOpen=true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-name-picker')).toBeInTheDocument();
  });

  it('W5.2 save button disabled when input invalid', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-name-picker-save')).toBeDisabled();
  });

  it('W5.3 save enabled when ≥2 chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-name-picker-input'), { target: { value: 'ดร.วี' } });
    expect(screen.getByTestId('staff-chat-name-picker-save')).toBeEnabled();
  });

  it('W5.4 click save calls confirmName(name, color) — V73 color-picker 2026-05-18 extended signature', () => {
    // Pre-color-picker: confirmName(name).
    // Post-color-picker (2026-05-18): confirmName(name, color) — second arg is sender hex
    // from native <input type="color"> default value (initialColor || '#E11D48').
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-name-picker-input'), { target: { value: 'ดร.วี' } });
    fireEvent.click(screen.getByTestId('staff-chat-name-picker-save'));
    expect(confirmName).toHaveBeenCalledWith('ดร.วี', expect.stringMatching(/^#[0-9a-fA-F]{6}$/));
  });
});
