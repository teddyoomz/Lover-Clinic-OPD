// VIP context + display primitives (2026-07-04, spec ②).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// Controlled theme — VipName/VipBadge read the READ-ONLY useResolvedTheme
// (bug-hunt R1 #9: display primitives never run useTheme's write effect).
let mockTheme = 'dark';
vi.mock('../src/hooks/useTheme.js', () => ({
  useTheme: () => ({ resolvedTheme: mockTheme }),
  useResolvedTheme: () => mockTheme,
}));

// Controlled listener — capture the onChange so tests drive snapshots.
let listenerOnChange = null;
const unsubSpy = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToVipCustomers: vi.fn((onChange) => { listenerOnChange = onChange; return unsubSpy; }),
}));

import { VipProvider, useIsVip } from '../src/lib/VipContext.jsx';
import { VipName, VipBadge, VIP_GOLD } from '../src/components/VipBadge.jsx';

function Probe({ id }) {
  const isVip = useIsVip(id);
  return <span data-testid="probe">{isVip ? 'VIP' : 'NOT'}</span>;
}

const flush = () => act(() => new Promise((r) => setTimeout(r, 0)));

beforeEach(() => { listenerOnChange = null; mockTheme = 'dark'; unsubSpy.mockClear(); });

describe('② VipContext', () => {
  it('V1 useIsVip OUTSIDE a provider → false, never throws (customer-facing structural guarantee)', () => {
    render(<Probe id="LC-1" />);
    expect(screen.getByTestId('probe')).toHaveTextContent('NOT');
  });

  it('V2 provider + listener snapshot → isVip flips true, and back off on removal (real-time)', async () => {
    render(<VipProvider><Probe id="LC-26000123" /></VipProvider>);
    await flush();
    expect(listenerOnChange).toBeTypeOf('function');
    await act(async () => { listenerOnChange(['LC-26000123', 'LC-9']); });
    expect(screen.getByTestId('probe')).toHaveTextContent('VIP');
    await act(async () => { listenerOnChange(['LC-9']); }); // toggle off elsewhere → live update
    expect(screen.getByTestId('probe')).toHaveTextContent('NOT');
  });

  it('V3 id coercion — numeric id matches string set entry', async () => {
    render(<VipProvider><Probe id={2853} /></VipProvider>);
    await flush();
    await act(async () => { listenerOnChange(['2853']); });
    expect(screen.getByTestId('probe')).toHaveTextContent('VIP');
  });

  it('V4 unmount unsubscribes the single listener', async () => {
    const { unmount } = render(<VipProvider><Probe id="x" /></VipProvider>);
    await flush();
    unmount();
    expect(unsubSpy).toHaveBeenCalled();
  });

  it('V5 null/empty customerId → false even when set is non-empty', async () => {
    render(<VipProvider><Probe id="" /></VipProvider>);
    await flush();
    await act(async () => { listenerOnChange(['LC-1']); });
    expect(screen.getByTestId('probe')).toHaveTextContent('NOT');
  });
});

describe('② VipName / VipBadge — gold both themes (AA)', () => {
  async function renderVip(theme, id = 'LC-1', vipIds = ['LC-1']) {
    mockTheme = theme;
    render(
      <VipProvider><VipName customerId={id}>คุณสมหญิง ใจดี</VipName></VipProvider>,
    );
    await flush();
    await act(async () => { listenerOnChange(vipIds); });
  }

  it('B1 dark theme → name gold #fbbf24 + 👑 VIP badge appended', async () => {
    await renderVip('dark');
    const name = screen.getByText('คุณสมหญิง ใจดี');
    expect(name).toHaveAttribute('data-vip', 'true');
    expect(name.style.color).toBe('rgb(251, 191, 36)'); // #fbbf24
    expect(screen.getByTestId('vip-badge')).toHaveTextContent('VIP');
  });

  it('B2 light theme → deepened gold #b45309 (AA 4.7:1 on white — aaAccent V125 pattern)', async () => {
    await renderVip('light');
    const name = screen.getByText('คุณสมหญิง ใจดี');
    expect(name.style.color).toBe('rgb(180, 83, 9)'); // #b45309
  });

  it('B3 non-VIP → plain name, NO badge, NO inline color', async () => {
    await renderVip('dark', 'LC-2', ['LC-1']);
    const name = screen.getByText('คุณสมหญิง ใจดี');
    expect(name).not.toHaveAttribute('data-vip');
    expect(name.style.color).toBe('');
    expect(screen.queryByTestId('vip-badge')).not.toBeInTheDocument();
  });

  it('B4 showBadge=false → gold name only (tight rows)', async () => {
    mockTheme = 'dark';
    render(<VipProvider><VipName customerId="LC-1" showBadge={false}>ชื่อ</VipName></VipProvider>);
    await flush();
    await act(async () => { listenerOnChange(['LC-1']); });
    expect(screen.getByText('ชื่อ')).toHaveAttribute('data-vip', 'true');
    expect(screen.queryByTestId('vip-badge')).not.toBeInTheDocument();
  });

  it('B5 VIP_GOLD constants locked (dark #fbbf24 / light #b45309)', () => {
    expect(VIP_GOLD).toEqual({ dark: '#fbbf24', light: '#b45309' });
  });

  it('B6 standalone VipBadge renders null without provider (safe anywhere)', () => {
    const { container } = render(<VipBadge customerId="LC-1" />);
    expect(container.firstChild).toBeNull();
  });
});
