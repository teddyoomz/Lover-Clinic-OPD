import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';

let presenceCb = null;
vi.mock('../src/lib/chartEditSession.js', () => ({
  listenToChartTabletPresenceByBranch: (opts, onChange) => { presenceCb = onChange; return () => {}; },
}));

import PcPairingModal from '../src/components/tablet-chart/PcPairingModal.jsx';

const readyTablet = { deviceId: 'TEST-T1', deviceName: 'iPad ห้อง 1', status: 'idle', lastHeartbeatAt: Date.now() };
const noop = () => {};
beforeEach(() => { presenceCb = null; });

describe('PcPairingModal (T7)', () => {
  it('PP1 edit-here calls onEditHere', () => {
    const onEditHere = vi.fn();
    render(<PcPairingModal branchId="BR-x" phase="choose" onEditHere={onEditHere} onSendToTablet={noop} onCancel={noop} onRetry={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId('edit-here'));
    expect(onEditHere).toHaveBeenCalled();
  });
  it('PP2 one ready tablet auto-selects → send enabled → onSendToTablet(device)', async () => {
    const onSend = vi.fn();
    render(<PcPairingModal branchId="BR-x" phase="choose" onEditHere={noop} onSendToTablet={onSend} onCancel={noop} onRetry={noop} onClose={noop} />);
    await act(async () => { presenceCb([readyTablet]); });
    const send = screen.getByTestId('send-tablet');
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(onSend).toHaveBeenCalledWith(expect.objectContaining({ deviceId: 'TEST-T1' }));
  });
  it('PP3 zero ready → no-tablet shown + send disabled', async () => {
    render(<PcPairingModal branchId="BR-x" phase="choose" onEditHere={noop} onSendToTablet={noop} onCancel={noop} onRetry={noop} onClose={noop} />);
    await act(async () => { presenceCb([]); });
    expect(screen.getByTestId('no-tablet')).toBeTruthy();
    expect(screen.getByTestId('send-tablet').disabled).toBe(true);
  });
  it('PP4 backdrop click does NOT close (AV78)', () => {
    const onClose = vi.fn();
    render(<PcPairingModal branchId="BR-x" phase="choose" onEditHere={noop} onSendToTablet={noop} onCancel={noop} onRetry={noop} onClose={onClose} />);
    // V123 — PcPairingModal now portals to document.body (AV143); the backdrop
    // no longer lives under the render container, so query it from the document.
    const backdrop = document.querySelector('.fixed.inset-0');
    fireEvent.click(backdrop); // the backdrop
    expect(onClose).not.toHaveBeenCalled();
  });
  it('PP5 waiting → cancel calls onCancel', () => {
    const onCancel = vi.fn();
    render(<PcPairingModal branchId="BR-x" phase="waiting" onEditHere={noop} onSendToTablet={noop} onCancel={onCancel} onRetry={noop} onClose={noop} />);
    fireEvent.click(screen.getByTestId('waiting-cancel'));
    expect(onCancel).toHaveBeenCalled();
  });
  it('PP6 failed shows error + retry', () => {
    const onRetry = vi.fn();
    render(<PcPairingModal branchId="BR-x" phase="failed" error="แท็บเล็ตยกเลิกการแก้ไข" onEditHere={noop} onSendToTablet={noop} onCancel={noop} onRetry={onRetry} onClose={noop} />);
    expect(screen.getByText('แท็บเล็ตยกเลิกการแก้ไข')).toBeTruthy();
    fireEvent.click(screen.getByTestId('failed-retry'));
    expect(onRetry).toHaveBeenCalled();
  });
});
