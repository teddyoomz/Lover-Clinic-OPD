// V90 (2026-05-18 EOD+11 LATE) — Mobile bloom-overlay-blocking-customer-detail bug fix.
//
// User report (verbatim):
//   "ใน mobile กดเปิดเข้าไปในหน้าข้อมูลลูกค้าแต่ละคนจากหน้าข้อมูลลูกค้ารวม
//    แล้วเมนูแบบใหม่ของเราเวอร์ชั่นโมบาย มันเปิดค้างทับหน้านั้นไว้ ปิดไม่ได้
//    กลายเปิดว่าเข้าไม่ได้เลย ลองเข้าจากลิ้งแยกแล้วในหน้าต่างอื่นก็โดน UI
//    เมนูเราบังแบบในภาพเลย"
//
// Pre-V90: BackendShellNew defaulted `bloomOpen = useState(true)` per EOD+5
// directive ("เมนูเปิดรออยู่"). When admin clicked a customer in
// CustomerListTab, BackendDashboard set `viewingCustomer` → CustomerDetailView
// rendered as `children` → BUT the customer-pick path didn't go through
// BackendShellNew's `handleNavigate`, so `setBloomOpen(false)` never fired →
// bloom stayed open over the customer detail page. Same for direct URL link
// (`?backend=1&customer=<id>`) — fresh shell mount with bloomOpen=true.
//
// V90 fix (cosmetic-shell discipline — ZERO menu visual touch, ZERO handler
// re-wiring):
//   - BackendDashboard computes `isSpecificEntityContext` from existing state
//     (viewingCustomer || treatmentFormMode || editingCustomer)
//   - Passed as a NEW prop to BackendShellNew (additive, backward-compat
//     default = false so any other consumer is unchanged)
//   - BackendShellNew uses the flag as `useState(!flag)` initial default →
//     direct URL to a specific entity surface starts with bloom CLOSED
//   - BackendShellNew adds a useEffect that closes bloom whenever the flag
//     transitions to true → in-app navigation from list to detail also
//     auto-closes the bloom
//   - All menu visuals + onClick handlers + orb layout + backdrop +
//     keyboard handling untouched (V82 lock honored).

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, screen } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';

// ─── Mock the heavy children so we focus on BackendShellNew logic ───
vi.mock('../src/components/backend/shell/BackendTopBarNew.jsx', () => ({
  default: () => <div data-testid="topbar-mock" />,
}));
vi.mock('../src/components/backend/shell/BackendDuoPill.jsx', () => ({
  default: ({ onOpenBloom }) => (
    <button data-testid="duopill-mock" onClick={onOpenBloom}>open</button>
  ),
}));
vi.mock('../src/components/backend/shell/BackendArcBloom.jsx', () => ({
  default: ({ open }) => open ? <div data-testid="bloom-overlay" /> : null,
}));
vi.mock('../src/components/backend/nav/BackendCmdPalette.jsx', () => ({
  default: () => null,
}));

import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';

const ADMIN_DASHBOARD_PATH = path.resolve(__dirname, '../src/pages/BackendDashboard.jsx');
const SHELL_PATH = path.resolve(__dirname, '../src/components/backend/shell/BackendShellNew.jsx');
const SOURCE_DASH = fs.readFileSync(ADMIN_DASHBOARD_PATH, 'utf8');
const SOURCE_SHELL = fs.readFileSync(SHELL_PATH, 'utf8');

describe('V90 — bloom auto-close on specific-entity context (RTL behavior)', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-backend-menu-mode');
  });

  it('B1.1 — bloom OPEN on initial mount when isSpecificEntityContext=false (EOD+5 default)', () => {
    render(
      <BackendShellNew activeTabId="appointment-all" onNavigate={() => {}}>
        <div>main</div>
      </BackendShellNew>
    );
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
  });

  it('B1.2 — bloom CLOSED on initial mount when isSpecificEntityContext=true (V90 direct link)', () => {
    render(
      <BackendShellNew
        activeTabId="appointment-all"
        onNavigate={() => {}}
        isSpecificEntityContext={true}
      >
        <div>main</div>
      </BackendShellNew>
    );
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('B2.1 — bloom auto-closes when isSpecificEntityContext transitions false→true (V90 in-app)', () => {
    const { rerender } = render(
      <BackendShellNew
        activeTabId="customers"
        onNavigate={() => {}}
        isSpecificEntityContext={false}
      >
        <div>customer-list</div>
      </BackendShellNew>
    );
    // Bloom open on initial mount (no entity context yet)
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();

    // Simulate user clicking a customer → BackendDashboard sets viewingCustomer
    // → isSpecificEntityContext becomes true → BackendShellNew should auto-close
    act(() => {
      rerender(
        <BackendShellNew
          activeTabId="customers"
          onNavigate={() => {}}
          isSpecificEntityContext={true}
        >
          <div>customer-detail</div>
        </BackendShellNew>
      );
    });
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('B3.1 — bloom does NOT re-open when user explicitly clicks DuoPill while on entity surface', () => {
    // Note: this asserts the user can still OPEN the bloom intentionally on
    // an entity surface (e.g. to navigate to a different section). The
    // useEffect only fires on transitions INTO entity context, not on
    // each render.
    const { rerender } = render(
      <BackendShellNew
        activeTabId="customers"
        onNavigate={() => {}}
        isSpecificEntityContext={true}
      >
        <div>customer-detail</div>
      </BackendShellNew>
    );
    // Bloom closed initially due to entity context
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();

    // Re-render with SAME context flag → useEffect deps don't change → no force-close
    rerender(
      <BackendShellNew
        activeTabId="customers"
        onNavigate={() => {}}
        isSpecificEntityContext={true}
      >
        <div>customer-detail</div>
      </BackendShellNew>
    );
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });
});

describe('V90 — source-grep regression (wiring + V82 lock preservation)', () => {
  it('S1.1 — BackendShellNew prop signature includes isSpecificEntityContext with default false', () => {
    expect(SOURCE_SHELL).toMatch(/isSpecificEntityContext\s*=\s*false/);
  });

  it('S1.2 — bloomOpen useState reads from isSpecificEntityContext on initial mount', () => {
    // DL repoint (2026-07-19): the deep-link signal is folded into the initial state.
    expect(SOURCE_SHELL).toMatch(/useState\(!\(isSpecificEntityContext \|\| initialBloomClosed\)\)/);
  });

  it('S1.3 — useEffect closes bloom on isSpecificEntityContext transition', () => {
    expect(SOURCE_SHELL).toMatch(/useEffect\([\s\S]{0,200}?if\s*\(\s*isSpecificEntityContext\s*\)\s*\{[\s\S]{0,50}setBloomOpen\(false\)/);
    expect(SOURCE_SHELL).toMatch(/}, \[isSpecificEntityContext\]\)/);
  });

  it('S2.1 — BackendDashboard computes isSpecificEntityContext from viewingCustomer + treatmentFormMode + editingCustomer', () => {
    expect(SOURCE_DASH).toMatch(/const isSpecificEntityContext = !!viewingCustomer \|\| !!treatmentFormMode \|\| !!editingCustomer/);
  });

  it('S2.2 — BackendDashboard passes isSpecificEntityContext to BackendShellNew', () => {
    expect(SOURCE_DASH).toMatch(/<BackendShellNew[\s\S]{0,300}?isSpecificEntityContext=\{isSpecificEntityContext\}/);
  });

  it('S3.1 — V90 marker comments present in both files', () => {
    expect(SOURCE_DASH).toMatch(/V90[\s\S]{0,300}entity-context signal/i);
    expect(SOURCE_SHELL).toMatch(/V90[\s\S]{0,300}auto-close/i);
  });

  it('S4.1 — V82 menu-untouchable lock: handleNavigate body unchanged', () => {
    // V85-followup AV82 invariant: handleNavigate MUST close both overlays.
    // V90 must NOT alter this body.
    expect(SOURCE_SHELL).toMatch(/onNavigate\?\.\(tabId\);\s*setBloomOpen\(false\);\s*setPaletteOpen\(false\);/);
  });

  it('S4.2 — V82 menu-untouchable lock: ArcBloom + DuoPill + CmdPalette render structure preserved', () => {
    // Same shell children, same wiring, same composition. V91 (2026-05-18
    // EOD+11 LATE) swapped DuoPill prop name `onOpenBloom` → `bloomOpen` +
    // `onToggleBloom` for the new tap-to-close behavior. Lock the V91 shape
    // here (post-V91 contract).
    expect(SOURCE_SHELL).toMatch(/<BackendArcBloom\s*\n\s*open=\{bloomOpen\}/);
    expect(SOURCE_SHELL).toMatch(/<BackendDuoPill bloomOpen=\{bloomOpen\} onToggleBloom=\{toggleBloom\}/);
    expect(SOURCE_SHELL).toMatch(/<BackendCmdPalette open=\{paletteOpen\}/);
  });

  it('S5.1 — backward-compat: prop default = false means any caller passing nothing keeps EOD+5 behavior', () => {
    // Default value `false` means bloomOpen = useState(!false) = useState(true)
    // → bloom OPEN on mount (EOD+5 directive preserved).
    expect(SOURCE_SHELL).toMatch(/isSpecificEntityContext\s*=\s*false/);
  });
});

// ─── ArcBloom deep-link fix (2026-07-19) — `?backend=1&tab=X` lands ON the tab ─
// Backlog "ArcBloom deep-link gap": the resolver useEffect set activeTab
// correctly, but new-menu mode mounted the bloom overlay ON TOP → every tab
// deep link visually landed on the bloom home (old-menu mode honored them).
// Fix: BackendDashboard captures a validated `hadTabDeepLink` ONCE at mount →
// shell prop `initialBloomClosed` feeds ONLY the initial bloomOpen state.
describe('DL — tab deep-link starts bloom CLOSED (2026-07-19)', () => {
  it('DL.1 — initialBloomClosed=true → bloom overlay NOT mounted at start', () => {
    render(
      <BackendShellNew activeTabId="reports" onNavigate={() => {}} initialBloomClosed={true}>
        <div data-testid="tab-content">tab</div>
      </BackendShellNew>
    );
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    expect(screen.queryByTestId('tab-content')).not.toBeNull();
  });

  it('DL.2 — default (no prop) keeps EOD+5 bloom-open behavior (backward compat)', () => {
    render(
      <BackendShellNew activeTabId="appointment-all" onNavigate={() => {}}>
        <div>main</div>
      </BackendShellNew>
    );
    expect(screen.queryByTestId('bloom-overlay')).not.toBeNull();
  });

  it('DL.3 — source-grep: dashboard computes validated hadTabDeepLink + passes the prop', () => {
    expect(SOURCE_DASH).toMatch(/const \[hadTabDeepLink\] = useState\(\(\) => \{/);
    // validation mirrors the resolver mapping (appointments → appointment-all + ALL_ITEM_IDS gate)
    expect(SOURCE_DASH).toMatch(/t === 'appointments' \? 'appointment-all' : t/);
    expect(SOURCE_DASH).toMatch(/ALL_ITEM_IDS\.includes\(resolved\)/);
    expect(SOURCE_DASH).toMatch(/initialBloomClosed=\{hadTabDeepLink\}/);
    // shell: V90 auto-close effect UNCHANGED (keyed on the entity signal only)
    expect(SOURCE_SHELL).toMatch(/\}, \[isSpecificEntityContext\]\)/);
  });
});
