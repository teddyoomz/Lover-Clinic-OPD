// EOD+7 (2026-05-26) — regression bank for the 6-item UI fix batch.
//   1. PatientForm success message trimmed
//   2. Toggle contrast (both themes) — no /50-opacity dim text
//   3. OpdLifecycleRow dashed amber frame removed
//   4. Stepper step #2 ข้าม → แพทย์  (covered by phase-28-treatment-history-resolvers.test.js)
//   5. Filled-pending card breathing + shadow (.card-filled-pending)
//   6. opd-pending tab purple bubble (cardFlowSubPillCounts bucket + AV140)
import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import AppointmentHubTabBar from '../src/components/admin/AppointmentHubTabBar.jsx';

const read = (p) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');
afterEach(() => cleanup());

describe('EOD+7 · item 1 — PatientForm success message', () => {
  const src = read('src/pages/PatientForm.jsx');
  it('I1.1 Thai success line drops the "wait for staff to call" sentence', () => {
    expect(src).toContain("'ข้อมูลของท่านถูกส่งเรียบร้อยแล้ว'");
    expect(src).not.toContain('กรุณารอเจ้าหน้าที่เรียกชื่อเพื่อพบแพทย์');
  });
  it('I1.2 EN success line trimmed to parity', () => {
    expect(src).toContain("'Your information has been submitted.'");
    expect(src).not.toContain('Please wait to be called by our staff');
  });
});

describe('EOD+7 · item 2 — toggle contrast (both themes)', () => {
  const pf = read('src/pages/PatientForm.jsx');
  const tt = read('src/components/ThemeToggle.jsx');
  it('I2.1 LanguageToggle no longer uses dim /50-opacity inactive text', () => {
    expect(pf).not.toContain('text-red-300/50');
    expect(pf).not.toContain('text-pink-400/50');
  });
  it('I2.2 LanguageToggle inactive uses explicit INLINE color (robust vs JIT/specificity)', () => {
    // EOD+7 fix2: inline color beats any class-based override + needs no Tailwind JIT —
    // dark light-red #fca5a5 / light dark-rose #9f1239.
    expect(pf).toContain("(isDark ? '#fca5a5' : '#9f1239')");
  });
  it('I2.3 hero toggle inactive no longer uses dim heroFaint for button text', () => {
    expect(pf).toContain('rgba(255,255,255,0.78)');
    expect(pf).not.toMatch(/'th' \? '#fff' : heroFaint/);
    expect(pf).not.toMatch(/'en' \? '#fff' : heroFaint/);
  });
  it('I2.4 ThemeToggle compact moon bumped from --tx-muted to --tx-secondary', () => {
    expect(tt).toContain('text-[var(--tx-secondary)]');
    expect(tt).not.toContain('text-[var(--tx-muted)] hover:text-[var(--tx-heading)]');
  });
});

describe('EOD+7 · item 3 — OpdLifecycleRow dashed frame removed', () => {
  const src = read('src/components/admin/OpdLifecycleRow.jsx');
  it('I3.1 the row container has NO dashed amber frame', () => {
    expect(src).not.toContain('border-dashed');
    expect(src).not.toContain('border-amber-500/30');
    expect(src).not.toContain('bg-amber-500/[0.03]');
  });
  it('I3.2 the row keeps its flex layout', () => {
    expect(src).toContain('flex flex-wrap items-center gap-1.5 mt-1.5 md:justify-end');
  });
});

describe('EOD+7 · item 5 — filled-pending card breathing + shadow', () => {
  const css = read('src/index.css');
  const card = read('src/components/admin/AppointmentHubRowCard.jsx');
  it('I5.1 index.css defines the card-filled-pending keyframe + class', () => {
    expect(css).toContain('@keyframes card-filled-pending-breathe');
    expect(css).toContain('.card-filled-pending {');
  });
  it('I5.2 reduced-motion disables the animation (keeps a static strong shadow)', () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.card-filled-pending\s*\{[^}]*animation:\s*none/);
  });
  it('I5.3 card derives isFilledPending from OPD state D and applies the class', () => {
    expect(card).toContain("opdLifecycle.state === 'D'");
    expect(card).toContain('const isFilledPending');
    expect(card).toContain("isFilledPending ? ' card-filled-pending' : ''");
  });
});

describe('EOD+7 · item 6 — opd-pending tab purple bubble', () => {
  const view = read('src/components/admin/AppointmentHubView.jsx');
  const av = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
  it('I6.1 cardFlowSubPillCounts includes the opd-pending bucket', () => {
    expect(view).toContain("{ today: 0, tomorrow: 0, future: 0, past: 0, 'opd-pending': 0 }");
  });
  it('I6.2 opd-pending counted separately, outside the date-range break loop', () => {
    expect(view).toContain("applyTabFilter([a], { tab: 'opd-pending', now })");
    expect(view).toContain("buckets['opd-pending']++");
  });
  it('I6.3 AV140 invariant registered', () => {
    expect(av).toContain('### AV140');
  });
  it('I6.4 TabBar renders the purple card-flow bubble for opd-pending when count > 0', () => {
    render(
      <AppointmentHubTabBar
        activeTab="today"
        counts={{ 'opd-pending': 17 }}
        cardFlowCounts={{ 'opd-pending': 3 }}
        onTabChange={() => {}}
      />
    );
    const bubble = screen.getByTestId('appt-hub-tab-opd-pending-cardflow-bubble');
    expect(bubble).toBeTruthy();
    expect(bubble.textContent).toBe('3');
  });
  it('I6.5 TabBar shows NO card-flow bubble for opd-pending when count is 0/absent', () => {
    render(
      <AppointmentHubTabBar
        activeTab="today"
        counts={{ 'opd-pending': 17 }}
        cardFlowCounts={{}}
        onTabChange={() => {}}
      />
    );
    expect(screen.queryByTestId('appt-hub-tab-opd-pending-cardflow-bubble')).toBeNull();
  });
});

describe('EOD+7 · item 7 — SendCustomerLinkModal QR fills mobile width', () => {
  const modal = read('src/components/backend/SendCustomerLinkModal.jsx');
  it('I7.1 QR container fills width — no max-w-[240px] cap', () => {
    expect(modal).not.toContain('max-w-[240px]');
    expect(modal).toContain('w-full aspect-square');
  });
  it('I7.2 QR generated at high res (600) so it stays crisp when large', () => {
    expect(modal).toContain('{ width: 600, margin: 2 }');
  });
  it('I7.3 modal scrolls if the larger QR overflows a short screen', () => {
    expect(modal).toContain('max-h-[90vh] overflow-y-auto');
  });
});
