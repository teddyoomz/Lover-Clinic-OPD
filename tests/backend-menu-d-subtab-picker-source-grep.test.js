// Tier 2 source-grep regression locks — Backend Menu D Sub-tab Picker.
// These lock the contract so future edits that drift trigger build failure.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SUB_TAB_EMOJI_FILE = 'src/components/backend/shell/subTabEmoji.js';
const SUBTAB_BLOOM_FILE = 'src/components/backend/shell/BackendSubTabBloom.jsx';
const ARC_BLOOM_FILE = 'src/components/backend/shell/BackendArcBloom.jsx';
const CSS_FILE = 'src/index.css';

const SUB_TAB_EMOJI_SRC = readFileSync(SUB_TAB_EMOJI_FILE, 'utf-8');
const SUBTAB_BLOOM_SRC = readFileSync(SUBTAB_BLOOM_FILE, 'utf-8');
const ARC_BLOOM_SRC = readFileSync(ARC_BLOOM_FILE, 'utf-8');
const CSS_SRC = readFileSync(CSS_FILE, 'utf-8');

describe('Backend Menu D — Sub-tab Picker source-grep regression locks', () => {
  // ---- T1: emoji map file ----

  it('SG1.1 subTabEmoji.js exports SUB_TAB_EMOJI map', () => {
    expect(SUB_TAB_EMOJI_SRC).toMatch(/export const SUB_TAB_EMOJI = \{/);
  });

  it('SG1.2 subTabEmoji.js exports SUB_TAB_EMOJI_FALLBACK = "✨"', () => {
    expect(SUB_TAB_EMOJI_SRC).toMatch(/export const SUB_TAB_EMOJI_FALLBACK = '✨'/);
  });

  it('SG1.3 subTabEmoji.js exports getSubTabEmoji function', () => {
    expect(SUB_TAB_EMOJI_SRC).toMatch(/export function getSubTabEmoji\(itemId\)/);
  });

  it('SG1.4 emoji map covers all 8 NAV_SECTIONS via expected sentinel ids', () => {
    const sentinels = [
      'appointment-all', 'customers', 'sales', 'stock',
      'finance', 'promotions', 'reports', 'staff',
    ];
    sentinels.forEach((id) => {
      const re = new RegExp(`'${id}':\\s*'`);
      expect(SUB_TAB_EMOJI_SRC).toMatch(re);
    });
  });

  // ---- T2: SubTabBloom component contract ----

  it('SG2.1 BackendSubTabBloom imports getSubTabEmoji', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/from '\.\/subTabEmoji\.js'/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/getSubTabEmoji/);
  });

  it('SG2.2 BackendSubTabBloom default-exports component receiving (section, onClose, onNavigate, parentColor, originRect)', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/export default function BackendSubTabBloom/);
    ['section', 'onClose', 'onNavigate', 'parentColor', 'originRect'].forEach((prop) => {
      expect(SUBTAB_BLOOM_SRC).toContain(prop);
    });
  });

  it('SG2.3 onNavigate signature preserved verbatim — onNavigate?.(item.id)', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/onNavigate\?\.\(item\.id\)/);
  });

  it('SG2.4 MD_BREAKPOINT = 768 (responsive split anchor)', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/MD_BREAKPOINT\s*=\s*768/);
  });

  it('SG2.5 mouse-follow useEffect present with MAX_BIAS = 6 + LERP = 0.12', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/MAX_BIAS\s*=\s*6/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/LERP\s*=\s*0\.12/);
  });

  it('SG2.6 mouse-follow gated on !isMobile AND prefers-reduced-motion', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/if \(isMobile\) return;/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/prefers-reduced-motion/);
  });

  it('SG2.7 cleanup cancels rAF + removes both mouse listeners', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/cancelAnimationFrame/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/removeEventListener\(['"]mousemove['"]/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/removeEventListener\(['"]mouseout['"]/);
  });

  it('SG2.8 mobile origin computed from originRect when isMobile && originRect', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/if \(isMobile && originRect/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/--origin-x/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/--origin-y/);
  });

  it('SG2.9 a11y: role="dialog" + aria-modal + role="menuitem" + Escape close', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/role="dialog"/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/aria-modal="true"/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/role="menuitem"/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/e\.key === 'Escape'/);
  });

  it('SG2.10 backdrop click → onClose; modal stopPropagation (cosmetic-shell preserves wiring)', () => {
    expect(SUBTAB_BLOOM_SRC).toMatch(/onClick={onClose}/);
    expect(SUBTAB_BLOOM_SRC).toMatch(/e\.stopPropagation\(\)/);
  });

  // ---- T3: ArcBloom integration contract ----

  it('SG3.1 BackendArcBloom imports BackendSubTabBloom', () => {
    expect(ARC_BLOOM_SRC).toMatch(/import BackendSubTabBloom from '\.\/BackendSubTabBloom\.jsx'/);
  });

  it('SG3.2 handleOrbClick branches on items.length: 0 early-return, 1 direct-nav, ≥2 picker', () => {
    expect(ARC_BLOOM_SRC).toMatch(/if \(!items \|\| items\.length === 0\) return/);
    expect(ARC_BLOOM_SRC).toMatch(/if \(items\.length === 1\)/);
    expect(ARC_BLOOM_SRC).toMatch(/setPickerSection\(section\)/);
  });

  it('SG3.3 picker state: pickerSection + pickerOriginRect useState pair present', () => {
    expect(ARC_BLOOM_SRC).toMatch(/const \[pickerSection, setPickerSection\] = useState\(null\)/);
    expect(ARC_BLOOM_SRC).toMatch(/const \[pickerOriginRect, setPickerOriginRect\] = useState\(null\)/);
  });

  it('SG3.4 handlePickerNavigate routes onNavigate + closes BOTH blooms', () => {
    expect(ARC_BLOOM_SRC).toMatch(/handlePickerNavigate = useCallback/);
    // The handler must call onNavigate AND onClose (both blooms collapse)
    expect(ARC_BLOOM_SRC).toMatch(/setPickerSection\(null\);\s*onClose\?\.\(\)/);
  });

  it('SG3.5 orb onClick captures event for rect resolution (ev?.currentTarget?.getBoundingClientRect)', () => {
    expect(ARC_BLOOM_SRC).toMatch(/onClick=\{\(ev\) => handleOrbClick\(section, ev\)/);
    expect(ARC_BLOOM_SRC).toMatch(/ev\?\.currentTarget\?\.getBoundingClientRect\?\.\(\)/);
  });

  it('SG3.6 SubTabBloom mount passes all 5 props (section, parentColor, originRect, onNavigate, onClose)', () => {
    const mountBlock = ARC_BLOOM_SRC.match(/<BackendSubTabBloom[\s\S]*?\/>/);
    expect(mountBlock).not.toBeNull();
    ['section=', 'parentColor=', 'originRect=', 'onNavigate=', 'onClose='].forEach((prop) => {
      expect(mountBlock[0]).toContain(prop);
    });
  });

  // ---- T4: CSS contract ----

  it('SG4.1 CSS contains .subtab-overlay + .subtab-modal + .subtab-cell selectors', () => {
    expect(CSS_SRC).toMatch(/\.subtab-overlay\s*\{/);
    expect(CSS_SRC).toMatch(/\.subtab-modal\s*\{/);
    expect(CSS_SRC).toMatch(/\.subtab-cell\s*\{/);
  });

  it('SG4.2 V5 desktop CSS has perspective + 3D transform vars (--tilt-x/-y/-mx/-my)', () => {
    expect(CSS_SRC).toMatch(/\.subtab-overlay\.desktop\s*\{\s*perspective/);
    expect(CSS_SRC).toMatch(/--tilt-mx/);
    expect(CSS_SRC).toMatch(/--tilt-my/);
  });

  it('SG4.3 V2 mobile CSS uses parent gradient (var(--c1) → var(--c2)) + transform-origin from --origin-x/-y', () => {
    expect(CSS_SRC).toMatch(/\.subtab-modal\.mobile\s*\{[\s\S]*?linear-gradient\(135deg,\s*var\(--c1/);
    expect(CSS_SRC).toMatch(/transform-origin:\s*var\(--origin-x/);
  });

  it('SG4.4 Reduced-motion @media flattens 3D + disables transitions', () => {
    expect(CSS_SRC).toMatch(/@media \(prefers-reduced-motion: reduce\)\s*\{[\s\S]*?\.subtab-modal\.desktop/);
  });

  // ---- T5: Cosmetic-shell preservation ----

  it('SG5.1 cosmetic-shell — subtab files do NOT import or write NAV_SECTIONS (comments OK as doc references)', () => {
    // The picker is read-only with respect to the nav config; it never imports NAV_SECTIONS.
    expect(SUBTAB_BLOOM_SRC).not.toMatch(/import[\s\S]*?NAV_SECTIONS/);
    expect(SUB_TAB_EMOJI_SRC).not.toMatch(/import[\s\S]*?NAV_SECTIONS/);
    // Also no direct mutation
    expect(SUBTAB_BLOOM_SRC).not.toMatch(/NAV_SECTIONS\s*=/);
    expect(SUB_TAB_EMOJI_SRC).not.toMatch(/NAV_SECTIONS\s*=/);
  });

  it('SG5.2 cosmetic-shell — onNavigate(tabId) signature preserved at orb level (verbatim)', () => {
    // handleOrbClick still ultimately produces onNavigate(itemId) for single-item path AND via picker for multi-item
    expect(ARC_BLOOM_SRC).toMatch(/onNavigate\?\.\(items\[0\]\.id\)/);
    expect(ARC_BLOOM_SRC).toMatch(/onNavigate\?\.\(itemId\)/);
  });
});
