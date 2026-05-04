// ProfileDropdown — top-right backend toolbar (2026-05-04 user directive).
// Verifies: render gating, avatar fallback, menu open/close, logout call.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const signOutMock = vi.fn();
vi.mock('firebase/auth', () => ({
  signOut: (...a) => signOutMock(...a),
}));
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'u-1', email: 'admin@loverclinic.com' } },
}));

// Default user fixture; tests can override per case via setUser().
let mockUser = { uid: 'u-1', email: 'admin@loverclinic.com', displayName: 'Admin', photoURL: '' };
let mockGroup = 'เจ้าของกิจการ (bootstrap)';
vi.mock('../src/contexts/UserPermissionContext.jsx', () => ({
  useUserPermission: () => ({
    user: mockUser,
    groupName: mockGroup,
    isAdmin: true,
    permissions: {},
    loaded: true,
    bootstrap: true,
    hasPermission: () => true,
  }),
}));

import ProfileDropdown from '../src/components/backend/ProfileDropdown.jsx';

beforeEach(() => {
  signOutMock.mockReset().mockResolvedValue(undefined);
  mockUser = { uid: 'u-1', email: 'admin@loverclinic.com', displayName: 'Admin', photoURL: '' };
  mockGroup = 'เจ้าของกิจการ (bootstrap)';
});

describe('PD1 — render gating', () => {
  test('PD1.1 renders nothing when no user', () => {
    mockUser = null;
    const { container } = render(<ProfileDropdown />);
    expect(container.firstChild).toBeNull();
  });

  test('PD1.2 renders avatar trigger when user signed in', () => {
    render(<ProfileDropdown />);
    expect(screen.getByTestId('profile-dropdown')).toBeInTheDocument();
    expect(screen.getByTestId('profile-dropdown-trigger')).toBeInTheDocument();
  });

  test('PD1.3 falls back to initial-letter when photoURL empty', () => {
    mockUser = { uid: 'u-1', email: 'jane@example.com', displayName: '', photoURL: '' };
    render(<ProfileDropdown />);
    const trigger = screen.getByTestId('profile-dropdown-trigger');
    // First letter of email (j) uppercased = J
    expect(trigger.textContent).toContain('J');
  });

  test('PD1.4 renders <img> when photoURL present', () => {
    mockUser = { uid: 'u-1', email: 'a@b.com', displayName: 'A', photoURL: 'https://example.com/a.jpg' };
    render(<ProfileDropdown />);
    const img = screen.getByTestId('profile-dropdown-trigger').querySelector('img');
    expect(img).not.toBeNull();
    expect(img.getAttribute('src')).toBe('https://example.com/a.jpg');
  });
});

describe('PD2 — open/close behaviour', () => {
  test('PD2.1 menu hidden by default', () => {
    render(<ProfileDropdown />);
    expect(screen.queryByTestId('profile-dropdown-menu')).toBeNull();
  });

  test('PD2.2 click trigger opens menu', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();
  });

  test('PD2.3 click trigger again closes menu', () => {
    render(<ProfileDropdown />);
    const trigger = screen.getByTestId('profile-dropdown-trigger');
    fireEvent.click(trigger);
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByTestId('profile-dropdown-menu')).toBeNull();
  });

  test('PD2.4 Escape key closes menu', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('profile-dropdown-menu')).toBeNull();
  });

  test('PD2.5 click outside closes menu', () => {
    render(<>
      <ProfileDropdown />
      <button data-testid="outside">outside</button>
    </>);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    expect(screen.getByTestId('profile-dropdown-menu')).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    expect(screen.queryByTestId('profile-dropdown-menu')).toBeNull();
  });
});

describe('PD3 — menu contents (logout-only per directive)', () => {
  test('PD3.1 menu shows ออกจากระบบ button', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    expect(screen.getByTestId('profile-dropdown-logout')).toHaveTextContent('ออกจากระบบ');
  });

  test('PD3.2 menu shows displayName + groupName header', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    const menu = screen.getByTestId('profile-dropdown-menu');
    expect(menu.textContent).toContain('Admin');
    expect(menu.textContent).toContain('เจ้าของกิจการ');
  });

  test('PD3.3 menu has NO other items besides identity header + logout', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    const menuButtons = screen.getByTestId('profile-dropdown-menu').querySelectorAll('button');
    // Only the logout button should be inside the menu
    expect(menuButtons.length).toBe(1);
    expect(menuButtons[0].getAttribute('data-testid')).toBe('profile-dropdown-logout');
  });
});

describe('PD4 — logout action', () => {
  test('PD4.1 click logout fires signOut(auth)', async () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('profile-dropdown-logout'));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledTimes(1));
  });

  test('PD4.2 logout button shows กำลังออกจากระบบ… while in-flight', async () => {
    let resolveSignOut;
    signOutMock.mockReturnValueOnce(new Promise((res) => { resolveSignOut = res; }));
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('profile-dropdown-logout'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-dropdown-logout')).toHaveTextContent('กำลังออกจากระบบ');
    });
    resolveSignOut();
  });

  test('PD4.3 signOut error surfaces in error message (V31 no silent swallow)', async () => {
    signOutMock.mockRejectedValueOnce(new Error('network down'));
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    fireEvent.click(screen.getByTestId('profile-dropdown-logout'));
    await waitFor(() => {
      expect(screen.getByTestId('profile-dropdown-error')).toHaveTextContent('network down');
    });
  });
});

describe('PD5 — Thai cultural rules + a11y', () => {
  test('PD5.1 trigger has aria-haspopup + aria-expanded', () => {
    render(<ProfileDropdown />);
    const trigger = screen.getByTestId('profile-dropdown-trigger');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  test('PD5.2 menu has role=menu + aria-label', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    const menu = screen.getByTestId('profile-dropdown-menu');
    expect(menu.getAttribute('role')).toBe('menu');
    expect(menu.getAttribute('aria-label')).toBeTruthy();
  });

  test('PD5.3 displayName text NOT in red class (Thai cultural rule UC1)', () => {
    render(<ProfileDropdown />);
    fireEvent.click(screen.getByTestId('profile-dropdown-trigger'));
    const menu = screen.getByTestId('profile-dropdown-menu');
    // The header div contains the name — no red text class on it
    const nameDiv = menu.querySelector('.font-medium');
    expect(nameDiv).not.toBeNull();
    const cls = nameDiv.className;
    expect(cls).not.toMatch(/text-(red|rose)-/);
  });
});
