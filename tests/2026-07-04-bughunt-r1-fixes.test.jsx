// Bug-hunt R1 fixes (2026-07-04) — regression bank for the 8 CONFIRMED
// findings of the adversarial hunt over the recall/VIP/staffchat-cards batch.
//   #1  z-index: chat-launched modals must stack ABOVE the z-9000 chat panel
//   #2  EdLauncher mount race: gate on the FIRST assessments snapshot
//   #3  modal host: open modal survives card eviction from the 50-msg window
//   #4  synthetic session: canonical → kiosk reverse-map (no false "ไม่มี")
//   #7  TFP card branchId: edit prefers the treatment's persisted branch
//   #9  VipName/VipBadge: read-only theme (no per-row write effect)
//   #10 VIP badge renders as SIBLING of the truncating name span
//   #12 ESC stack: one press closes only the TOP modal
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';
import { synthesizeSessionFromCustomer } from '../src/lib/opdSessionState.js';
import { useEscToClose, __escStackSize } from '../src/lib/useEscToClose.js';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

// ─── #1 z-index tier ─────────────────────────────────────────────────────────
describe('R1#1 — chat-launched modals stack above the z-9000 panel', () => {
  it('Z1 StaffChatIntakeModal portal is z-[9600] (no z-[240] survivor)', () => {
    const s = read('src/components/staffchat/StaffChatIntakeModal.jsx');
    expect(s).toMatch(/z-\[9600\]/);
    expect(s).not.toMatch(/z-\[240\]/);
  });
  it('Z2 StaffChatEdModalLauncher loading+empty portals are z-[9600] and it passes zClassName to EDDetailModal', () => {
    const s = read('src/components/staffchat/StaffChatEdModalLauncher.jsx');
    expect((s.match(/z-\[9600\]/g) || []).length).toBeGreaterThanOrEqual(3); // loading + empty + zClassName pass
    expect(s).not.toMatch(/z-\[240\]/);
    expect(s).toMatch(/zClassName="z-\[9600\]"/);
  });
  it('Z3 EDDetailModal keeps the CDV default z-[110] via the zClassName prop', () => {
    const s = read('src/components/backend/EDDetailModal.jsx');
    expect(s).toMatch(/zClassName = 'z-\[110\]'/);
    expect(s).toMatch(/\$\{zClassName\}/);
  });
});

// ─── #2/#5/#8 EdLauncher assessments gate ────────────────────────────────────
describe('R1#2 — EdLauncher waits for the first assessments snapshot', () => {
  const s = read('src/components/staffchat/StaffChatEdModalLauncher.jsx');
  it('G1 spinner gate requires BOTH customer + assessments loaded', () => {
    expect(s).toMatch(/if \(!loaded \|\| !assessLoaded\)/);
  });
  it('G2 assessLoaded set true in BOTH the data and error callbacks', () => {
    expect((s.match(/setAssessLoaded\(true\)/g) || []).length).toBeGreaterThanOrEqual(3); // no-customerId + onChange + onError
    expect(s).toMatch(/setAssessLoaded\(false\)/); // reset on customerId change
  });
});

// ─── #3 modal host survives card eviction ────────────────────────────────────
let mockResolved = { pending: false, missing: false, customerId: 'LC-1', name: 'คุณทดสอบ', hn: 'LC-1' };
vi.mock('../src/lib/staffChatNotifyResolve.js', () => ({
  useSystemCardCustomer: () => mockResolved,
}));
vi.mock('../src/components/staffchat/StaffChatIntakeModal.jsx', () => ({
  StaffChatIntakeModal: (props) => <div data-testid="mock-intake-modal" data-session={props.sessionId} />,
}));
vi.mock('../src/components/staffchat/StaffChatEdModalLauncher.jsx', () => ({
  StaffChatEdModalLauncher: () => <div data-testid="mock-ed-launcher" />,
}));

import { StaffChatSystemCard } from '../src/components/staffchat/StaffChatSystemCard.jsx';
import { StaffChatSystemModalHost } from '../src/components/staffchat/StaffChatSystemModalHost.jsx';

describe('R1#3 — hosted modal survives the card leaving the 50-message window', () => {
  beforeEach(() => { mockResolved = { pending: false, missing: false, customerId: 'LC-1', name: 'คุณทดสอบ', hn: 'LC-1' }; });

  it('H1 click → modal opens via the host; card unmount (eviction) keeps it open', () => {
    const msg = { id: 'M1', createdAt: null, system: { kind: 'intake', sessionId: 'S-1' } };
    const { rerender } = render(
      <StaffChatSystemModalHost>
        <StaffChatSystemCard message={msg} />
      </StaffChatSystemModalHost>,
    );
    fireEvent.click(screen.getByTestId('system-card-view-intake'));
    expect(screen.getByTestId('mock-intake-modal')).toHaveAttribute('data-session', 'S-1');
    // 50 new messages arrive → the card is evicted (unmounted) — modal STAYS
    rerender(<StaffChatSystemModalHost>{null}</StaffChatSystemModalHost>);
    expect(screen.getByTestId('mock-intake-modal')).toBeInTheDocument();
  });

  it('H2 hostless card (standalone mount) falls back to local state — modal still opens', () => {
    const msg = { id: 'M2', createdAt: null, system: { kind: 'followup', customerId: 'LC-1' } };
    render(<StaffChatSystemCard message={msg} />);
    fireEvent.click(screen.getByTestId('system-card-view-assessment'));
    expect(screen.getByTestId('mock-ed-launcher')).toBeInTheDocument();
  });
});

// ─── #4/#6 synthetic-session reverse-map ─────────────────────────────────────
describe('R1#4 — synthesizeSessionFromCustomer reverse-maps canonical → kiosk fields', () => {
  it('S1 drugAllergy/foodAllergy → hasAllergies มี + composed detail (never a false ไม่มี)', () => {
    const s = synthesizeSessionFromCustomer({ id: 'C1', patientData: { drugAllergy: 'Penicillin', foodAllergy: 'กุ้ง' } });
    expect(s.patientData.hasAllergies).toBe('มี');
    expect(s.patientData.allergiesDetail).toBe('Penicillin / อาหาร: กุ้ง');
  });
  it('S2 congenitalDisease → hasUnderlying มี + ud_other bullet', () => {
    const s = synthesizeSessionFromCustomer({ id: 'C1', patientData: { congenitalDisease: 'เบาหวาน, ความดัน' } });
    expect(s.patientData.hasUnderlying).toBe('มี');
    expect(s.patientData.ud_other).toBe(true);
    expect(s.patientData.ud_otherDetail).toBe('เบาหวาน, ความดัน');
  });
  it('S3 gender codes M/F/LGBTQ → Thai display labels', () => {
    expect(synthesizeSessionFromCustomer({ id: 'C', patientData: { gender: 'M' } }).patientData.gender).toBe('ชาย');
    expect(synthesizeSessionFromCustomer({ id: 'C', patientData: { gender: 'F' } }).patientData.gender).toBe('หญิง');
    expect(synthesizeSessionFromCustomer({ id: 'C', patientData: { gender: 'LGBTQ' } }).patientData.gender).toBe('LGBTQ+');
  });
  it('S4 nationalId → idCard · source string → howFoundUs array · pregnanted → label', () => {
    const s = synthesizeSessionFromCustomer({ id: 'C1', patientData: { nationalId: '1234567890123', source: 'Facebook, เพื่อนแนะนำ', pregnanted: true } });
    expect(s.patientData.idCard).toBe('1234567890123');
    expect(s.patientData.howFoundUs).toEqual(['Facebook', 'เพื่อนแนะนำ']);
    expect(s.patientData.pregnancy).toBe('กำลังตั้งครรภ์');
  });
  it('S5 REAL kiosk keys always win (no clobber) + empty patientData stays {} (V118 U4.4 parity)', () => {
    const s = synthesizeSessionFromCustomer({
      id: 'C1',
      patientData: { hasAllergies: 'ไม่มี', drugAllergy: 'ghost', gender: 'ชาย' },
    });
    expect(s.patientData.hasAllergies).toBe('ไม่มี');       // explicit kiosk answer wins
    expect(s.patientData.allergiesDetail).toBeUndefined();  // no derived detail forced in
    expect(s.patientData.gender).toBe('ชาย');               // already a label — untouched
    expect(synthesizeSessionFromCustomer({ id: 'C2' }).patientData).toEqual({});
  });
  it('S6 no allergy data at all → no derived keys (absence ≠ มี)', () => {
    const s = synthesizeSessionFromCustomer({ id: 'C1', patientData: { firstName: 'ก' } });
    expect(s.patientData.hasAllergies).toBeUndefined();
    expect(s.patientData.hasUnderlying).toBeUndefined();
  });
  it('S7 OpdIntakeDetailBody renders "-" (not ไม่มี) for medication on synthetic sessions', () => {
    const s = read('src/components/OpdIntakeDetailBody.jsx');
    expect(s).toMatch(/viewingSession\.__synthetic \? '-' : 'ไม่มี'/);
  });
});

// ─── #7 TFP card branchId on edit ────────────────────────────────────────────
describe('R1#7 — TFP card branchId: edit prefers the persisted treatment branch', () => {
  const tfp = read('src/components/TreatmentFormPage.jsx');
  it('B1 card write uses (isEdit && loadedTreatmentBranchId) || selectedBranchId', () => {
    expect(tfp).toMatch(/branchId: \(isEdit && loadedTreatmentBranchId\) \|\| selectedBranchId \|\| ''/);
  });
  it('B2 loadedTreatmentBranchId captured from the loaded detail at edit-load', () => {
    expect(tfp).toMatch(/if \(t\.branchId\) setLoadedTreatmentBranchId\(t\.branchId\)/);
  });
});

// ─── #9 read-only theme in VIP primitives ────────────────────────────────────
describe('R1#9 — VipName/VipBadge use the READ-ONLY useResolvedTheme', () => {
  it('T1 VipBadge.jsx imports useResolvedTheme, never the writing useTheme', () => {
    const s = read('src/components/VipBadge.jsx');
    expect(s).toMatch(/import \{ useResolvedTheme \} from '\.\.\/hooks\/useTheme\.js'/);
    expect(s).not.toMatch(/\buseTheme\(/);
  });
  it('T2 useResolvedTheme is a useSyncExternalStore singleton (no per-instance observer/write)', () => {
    const s = read('src/hooks/useTheme.js');
    expect(s).toMatch(/export function useResolvedTheme/);
    expect(s).toMatch(/useSyncExternalStore\(_subscribeResolvedTheme, readResolvedTheme/);
  });
});

// ─── #10 badge escapes name truncation ───────────────────────────────────────
vi.mock('../src/hooks/useTheme.js', async (importOriginal) => {
  const mod = await importOriginal();
  return { ...mod, useResolvedTheme: () => 'dark' };
});
vi.mock('../src/lib/VipContext.jsx', () => ({
  useIsVip: (id) => id === 'VIP-1',
  VipProvider: ({ children }) => children,
}));
import { VipName } from '../src/components/VipBadge.jsx';

describe('R1#10 — 👑 VIP badge is a SIBLING of the (truncating) name span', () => {
  it('N1 badge is NOT inside the name span — a truncated name cannot clip it', () => {
    render(<VipName customerId="VIP-1" className="truncate">ชื่อยาวมากๆๆๆๆๆๆๆๆๆๆๆๆๆๆๆ</VipName>);
    const name = screen.getByText(/ชื่อยาวมาก/);
    const badge = screen.getByTestId('vip-badge');
    expect(name.contains(badge)).toBe(false);          // sibling, not descendant
    expect(name).toHaveAttribute('data-vip', 'true');  // gold span intact
  });
  it('N2 non-VIP passthrough unchanged (single plain span, no badge)', () => {
    render(<VipName customerId="OTHER" className="truncate">ชื่อธรรมดา</VipName>);
    expect(screen.getByText('ชื่อธรรมดา').tagName).toBe('SPAN');
    expect(screen.queryByTestId('vip-badge')).not.toBeInTheDocument();
  });
});

// ─── #12 ESC stack discipline ────────────────────────────────────────────────
function EscProbe({ label, onClose }) {
  useEscToClose(onClose);
  return <div data-testid={`esc-${label}`} />;
}

describe('R1#12 — one ESC closes only the TOP modal (LIFO)', () => {
  it('E1 bottom modal ignores ESC while a top modal is open; closes after', () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const { rerender } = render(
      <>
        <EscProbe label="A" onClose={closeA} />
        <EscProbe label="B" onClose={closeB} />
      </>,
    );
    expect(__escStackSize()).toBe(2);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1); // top (mounted last)
    expect(closeA).not.toHaveBeenCalled();
    // B closes (unmounts) → A becomes top
    rerender(<EscProbe label="A" onClose={closeA} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeA).toHaveBeenCalledTimes(1);
  });
  it('E2 re-render with a NEW onClose identity does NOT reorder the stack', () => {
    const closeA1 = vi.fn(); const closeA2 = vi.fn(); const closeB = vi.fn();
    const { rerender } = render(
      <>
        <EscProbe label="A" onClose={closeA1} />
        <EscProbe label="B" onClose={closeB} />
      </>,
    );
    // A re-renders with a new inline callback (typical parent re-render)
    rerender(
      <>
        <EscProbe label="A" onClose={closeA2} />
        <EscProbe label="B" onClose={closeB} />
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1);   // B is STILL the top
    expect(closeA2).not.toHaveBeenCalled();
  });
  it('E3 stack empties on unmount (no leak)', () => {
    cleanup();
    expect(__escStackSize()).toBe(0);
  });
  it('E4 non-Escape keys never fire', () => {
    const close = vi.fn();
    render(<EscProbe label="solo" onClose={close} />);
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(close).not.toHaveBeenCalled();
  });
  it('E5 the stacking trio adopted the hook (source-grep)', () => {
    expect(read('src/components/backend/EDDetailModal.jsx')).toMatch(/useEscToClose\(onClose\)/);
    expect(read('src/components/staffchat/StaffChatIntakeModal.jsx')).toMatch(/useEscToClose\(onClose\)/);
    expect(read('src/components/staffchat/StaffChatEdModalLauncher.jsx')).toMatch(/useEscToClose\(onClose\)/);
  });
});
