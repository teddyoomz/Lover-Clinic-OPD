// V64-fix11 (2026-05-09) — shared style constants for V64 Appointment Hub.
//
// Aesthetic direction: "Editorial Ember — Refined Dark with Warm Accents".
// Design Context (from .impeccable.md): Dark + Fire/Ember + Premium masculine,
// sky accent for appointments tab, NO red on patient names, NO gold.
//
// User: "ฝากเปลี่ยนรูปแบบหรือสีของปุ่มทุกปุ่ม ... สไตล์ปุ่มมันเหมือน proclinic
// เป๊ะ ไม่ได้เข้ากับตีมเรา". Pre-fix11 buttons used solid bg-emerald-600 /
// bg-sky-600 / bg-rose-500 — generic Bootstrap-feeling. fix11 introduces
// 3-tier hierarchy + ember warmth for primary actions.
//
// Three button tiers + LINE brand button:
//   PRIMARY      — ember gradient (most warmth) for confirm / record / walk-in
//   SECONDARY    — sky outline ghost for edit / navigate (cool, subdued)
//   DESTRUCTIVE  — rose outline ghost for cancel / delete
//   LINE         — #06C755 brand green (V32-tris-ter lock)
//
// All buttons share:
//   - active:scale-95 (tactile press feedback)
//   - transition-all (smooth color/scale change)
//   - rounded-md (8px — sharper than rounded-lg, feels more editorial)
//   - text-[11px] font-bold (tight + readable in dense row context)
//
// Rule of 3 lock — 6 button kinds × 3 components (RowCard + FilterBar +
// TabBar pills) = 9+ usages. Centralize.

// ─── Buttons ───────────────────────────────────────────────────────────────

export const BTN_BASE =
  'text-[11px] font-bold px-3 py-1.5 rounded-md inline-flex items-center gap-1 ' +
  'active:scale-95 transition-all duration-150';

// PRIMARY — ember warm gradient. For "go" actions: confirm, record-treatment,
// add-walk-in. Subtle inner glow via shadow + warm border. Hover lifts.
export const BTN_PRIMARY =
  `${BTN_BASE} ` +
  'bg-gradient-to-br from-amber-500 to-orange-600 ' +
  'text-white shadow-sm shadow-orange-950/40 ' +
  'border border-orange-700/60 ' +
  'hover:from-amber-400 hover:to-orange-500 hover:shadow-md hover:shadow-orange-900/40';

// SECONDARY — sky outline ghost. For navigation / edit (cool, contextual).
// Reads as "available action without urgency". Hover fills with subtle sky tint.
export const BTN_SECONDARY =
  `${BTN_BASE} ` +
  'bg-transparent text-sky-700 dark:text-sky-300 ' +
  'border border-sky-300 dark:border-sky-700/60 ' +
  'hover:bg-sky-100 dark:hover:bg-sky-950/50 hover:border-sky-400 dark:hover:border-sky-600';

// DESTRUCTIVE — rose outline ghost. For cancel / delete. Outline (not solid) so
// it doesn't shout — cancellation is reversible, not a critical-error path.
export const BTN_DESTRUCTIVE =
  `${BTN_BASE} ` +
  'bg-transparent text-rose-700 dark:text-rose-400 ' +
  'border border-rose-300 dark:border-rose-800/60 ' +
  'hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-300';

// LINE — brand green (Phase 14.7-bis V32-tris-ter, 2026-04-26). Cannot
// substitute — LINE Corp brand color is part of recognition.
export const BTN_LINE =
  `${BTN_BASE} ` +
  'bg-[#06C755] hover:bg-[#04a948] text-white ' +
  'border border-[#06C755] shadow-sm shadow-emerald-950/30';

// ─── Tab pills ─────────────────────────────────────────────────────────────

export const TAB_BASE =
  'px-4 py-2 rounded-md text-xs font-bold transition-all duration-150 ' +
  'flex items-center gap-2 border active:scale-95';

// Active tab: ember gradient (matches primary CTA so user understands "this is
// where you are now, this is the live data set").
export const TAB_ACTIVE =
  `${TAB_BASE} ` +
  'bg-gradient-to-br from-amber-500 to-orange-600 border-orange-700/60 ' +
  'text-white shadow-sm shadow-orange-950/40';

// Inactive: ghost. Hover hints ember warmth (subtle preview of activation).
export const TAB_INACTIVE =
  `${TAB_BASE} ` +
  'bg-[var(--bg-hover)] border-[var(--bd)] text-[var(--tx-muted)] ' +
  'hover:text-orange-700 dark:hover:text-orange-300 hover:border-orange-700/40';

// Bubble count chip on tab — different background per active state.
export const BUBBLE_ACTIVE =
  'text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-white/90 text-orange-700';
export const BUBBLE_INACTIVE =
  'text-[11px] px-1.5 py-0.5 rounded-full font-bold bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300';

// ─── Card status accents ───────────────────────────────────────────────────

// Left-edge accent bar (3px gradient) — peripheral-vision status indicator.
// Color choices reflect priority/urgency:
//   missed     → red (urgent — patient didn't come; admin must act)
//   pending    → amber (attention — needs confirm)
//   confirmed  → sky (locked-in — calm)
//   done       → emerald (closed — minor visual weight)
//   cancelled  → gray (deprioritized)
export const ACCENT_BAR_BASE =
  'absolute left-0 top-0 bottom-0 w-1 rounded-l-xl';

export const ACCENT_BAR = {
  missed:    'bg-gradient-to-b from-red-500 to-rose-700',
  pending:   'bg-gradient-to-b from-amber-400 to-orange-600',
  confirmed: 'bg-gradient-to-b from-sky-400 to-cyan-600',
  done:      'bg-gradient-to-b from-emerald-400 to-emerald-700',
  cancelled: 'bg-gradient-to-b from-gray-500 to-gray-700',
};

// ─── Status chip on right side of card ────────────────────────────────────

export const STATUS_CHIP_CLS = {
  pending:   'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800/60',
  confirmed: 'bg-sky-100 text-sky-900 border border-sky-300 dark:bg-sky-950/60 dark:text-sky-200 dark:border-sky-800/60',
  done:      'bg-emerald-100 text-emerald-900 border border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/60',
  cancelled: 'bg-gray-200 text-gray-700 border border-gray-300 dark:bg-gray-900/60 dark:text-gray-400 dark:border-gray-700/60',
};

// ─── Card surface ──────────────────────────────────────────────────────────

// Card hover state: hairline border lifts toward ember warmth.
export const CARD_SURFACE =
  'relative border border-[var(--bd)] rounded-xl ' +
  'bg-gradient-to-br from-[var(--bg-card)] via-[var(--bg-card)] to-[var(--bg-surface)] ' +
  'p-4 mb-3 ' +
  'transition-all duration-200 ' +
  'hover:border-orange-700/30 hover:shadow-lg hover:shadow-orange-950/10';

// ─── OPD lifecycle pills (card redesign 2026-05-26) ─────────────────────────
// DATA-THEME driven (NOT Tailwind `dark:`). `dark:` is OS-coupled here (no
// darkMode config in tailwind.config.js), so on a dark-OS machine it fires even
// in data-theme=light → washed light-on-translucent-dark pills (the exact
// green-on-green bug the user reported). The pill COLORS live in src/index.css
// keyed on the `data-theme` attribute (the app's real theme mechanism):
// `.opd-pill-{blue,emerald,wait,save}` = dark default (app is dark-first) +
// `[data-theme="light"|"auto"]` light override → theme-correct in BOTH themes
// regardless of prefers-color-scheme. (Found + fixed via Rule Q-vis real-browser
// check on a dark-OS machine, which exposed the dark:-approach washout. AV136.)
export const OPD_PILL_BASE =
  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all duration-150';

export const OPD_PILL = {
  // send-link (state B)
  blue:    `${OPD_PILL_BASE} border opd-pill-blue hover:brightness-95 disabled:opacity-50`,
  // view-link / view-OPD (state C/D/A/E)
  emerald: `${OPD_PILL_BASE} border opd-pill-emerald hover:brightness-95 disabled:opacity-50`,
  // wait (disabled — no-data / waiting-customer)
  wait:    `${OPD_PILL_BASE} border opd-pill-wait opacity-80 cursor-not-allowed`,
  // save CTA (state D) — strongest emphasis: rose + border-2 + pulse
  save:    `${OPD_PILL_BASE} border-2 opd-pill-save font-extrabold animate-pulse hover:brightness-95 disabled:opacity-50`,
};
