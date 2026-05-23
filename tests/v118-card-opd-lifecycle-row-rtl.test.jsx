// V118 (2026-05-23) — RTL tests for OpdLifecycleRow component.
//
// Verifies the 5-state matrix: which buttons render per state + click handlers
// fire the correct callback. Component is purely presentational; state lives
// in the parent (HubView).

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import OpdLifecycleRow from '../src/components/admin/OpdLifecycleRow.jsx';

function setup(state, overrides = {}) {
  const onSendLink = vi.fn();
  const onViewLink = vi.fn();
  const onSaveOpd = vi.fn();
  const onViewOpd = vi.fn();
  const utils = render(
    <OpdLifecycleRow
      state={state}
      onSendLink={overrides.onSendLink || onSendLink}
      onViewLink={overrides.onViewLink || onViewLink}
      onSaveOpd={overrides.onSaveOpd || onSaveOpd}
      onViewOpd={overrides.onViewOpd || onViewOpd}
      sendLinkBusy={!!overrides.sendLinkBusy}
      saveOpdBusy={!!overrides.saveOpdBusy}
    />
  );
  return { ...utils, onSendLink, onViewLink, onSaveOpd, onViewOpd };
}

describe('V118 — OpdLifecycleRow RTL: state matrix', () => {
  it('R1.A — State A renders only view-OPD button', () => {
    setup('A');
    expect(screen.getByTestId('opd-view-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('opd-link-send-btn')).toBeNull();
    expect(screen.queryByTestId('opd-link-view-btn')).toBeNull();
    expect(screen.queryByTestId('opd-save-btn-active')).toBeNull();
    expect(screen.queryByTestId('opd-save-btn-wait')).toBeNull();
  });

  it('R1.B — State B renders send-link + wait (no-data)', () => {
    setup('B');
    expect(screen.getByTestId('opd-link-send-btn')).toBeInTheDocument();
    expect(screen.getByTestId('opd-save-btn-wait')).toHaveAttribute('data-opd-disabled-reason', 'no-data');
    expect(screen.queryByTestId('opd-view-btn')).toBeNull();
    expect(screen.queryByTestId('opd-save-btn-active')).toBeNull();
  });

  it('R1.C — State C renders view-link + wait (waiting-customer)', () => {
    setup('C');
    expect(screen.getByTestId('opd-link-view-btn')).toBeInTheDocument();
    expect(screen.getByTestId('opd-save-btn-wait')).toHaveAttribute('data-opd-disabled-reason', 'waiting-customer');
    expect(screen.queryByTestId('opd-link-send-btn')).toBeNull();
    expect(screen.queryByTestId('opd-view-btn')).toBeNull();
  });

  it('R1.D — State D renders view-link + view-OPD (review) + save-active (3 buttons)', () => {
    // User directive (locked 2026-05-23): "admin จะต้อง Review ข้อมูลลูกค้าด้วย
    // การกดปุ่มดูข้อมูลนี้ก่อน เพื่อดูข้อมูลคร่าวๆ แล้วถ้าไม่มีปัญหาอะไรก็จะกด
    // ปุ่มบันทึกลง OPD" — view button MUST appear before save in State D.
    setup('D');
    expect(screen.getByTestId('opd-link-view-btn')).toBeInTheDocument();
    expect(screen.getByTestId('opd-view-btn')).toBeInTheDocument();
    expect(screen.getByTestId('opd-save-btn-active')).toBeInTheDocument();
    expect(screen.queryByTestId('opd-save-btn-wait')).toBeNull();
  });

  it('R1.E — State E renders view-OPD only (same as A)', () => {
    setup('E');
    expect(screen.getByTestId('opd-view-btn')).toBeInTheDocument();
    expect(screen.queryByTestId('opd-link-send-btn')).toBeNull();
    expect(screen.queryByTestId('opd-save-btn-active')).toBeNull();
  });
});

describe('V118 — OpdLifecycleRow RTL: click handlers', () => {
  it('R2.B — click send-link fires onSendLink', () => {
    const { onSendLink } = setup('B');
    screen.getByTestId('opd-link-send-btn').click();
    expect(onSendLink).toHaveBeenCalledOnce();
  });

  it('R2.C — click view-link in State C fires onViewLink', () => {
    const { onViewLink } = setup('C');
    screen.getByTestId('opd-link-view-btn').click();
    expect(onViewLink).toHaveBeenCalledOnce();
  });

  it('R2.D-save — click save-active fires onSaveOpd', () => {
    const { onSaveOpd } = setup('D');
    screen.getByTestId('opd-save-btn-active').click();
    expect(onSaveOpd).toHaveBeenCalledOnce();
  });

  it('R2.D-view — click view-OPD in State D fires onViewOpd (review path)', () => {
    const { onViewOpd } = setup('D');
    screen.getByTestId('opd-view-btn').click();
    expect(onViewOpd).toHaveBeenCalledOnce();
  });

  it('R2.A — click view-OPD in State A fires onViewOpd', () => {
    const { onViewOpd } = setup('A');
    screen.getByTestId('opd-view-btn').click();
    expect(onViewOpd).toHaveBeenCalledOnce();
  });

  it('R2.E — click view-OPD in State E fires onViewOpd', () => {
    const { onViewOpd } = setup('E');
    screen.getByTestId('opd-view-btn').click();
    expect(onViewOpd).toHaveBeenCalledOnce();
  });
});

describe('V118 — OpdLifecycleRow RTL: container + accessibility', () => {
  it('R3.1 — data-opd-state attribute set on container', () => {
    setup('D');
    expect(screen.getByTestId('opd-lifecycle-row')).toHaveAttribute('data-opd-state', 'D');
  });

  it('R3.2 — busy disables clickable buttons', () => {
    setup('D', { saveOpdBusy: true });
    expect(screen.getByTestId('opd-save-btn-active')).toBeDisabled();
  });

  it('R3.3 — sendLinkBusy disables link buttons', () => {
    setup('B', { sendLinkBusy: true });
    expect(screen.getByTestId('opd-link-send-btn')).toBeDisabled();
  });

  it('R3.4 — OPD lifecycle row label is present', () => {
    setup('A');
    expect(screen.getByText(/OPD lifecycle/i)).toBeInTheDocument();
  });
});
