// ─── BackendCmdPalette — cmdk-based command palette ───────────────────────
// Ctrl+K / ⌘K (or mobile search icon) opens a centered dialog with fuzzy
// search across all nav items. Pick an item → navigate.
//
// cmdk handles: keyboard nav (Arrow↑↓, Enter, ESC), filtering, accessibility
// (roles/aria). We layer our Tailwind styles + section grouping on top.

import { useEffect, useMemo } from 'react';
import { Command } from 'cmdk';
import { Search, CornerDownLeft, X } from 'lucide-react';
import { NAV_SECTIONS, PINNED_ITEMS, TAB_COLOR_MAP } from './navConfig.js';
import { useTabAccess } from '../../../hooks/useTabAccess.js';
import { useModalScrollLock } from '../../../lib/useModalScrollLock.js';

export default function BackendCmdPalette({ open, onOpenChange, onNavigate }) {
  // AV205 — gate on open (early return below runs after hooks)
  useModalScrollLock(!!open);
  // Phase 13.5.2 — filter palette results by user permissions. Hidden tabs
  // never appear in fuzzy search; empty sections collapse out.
  const { canAccess } = useTabAccess();
  const visiblePinned = useMemo(
    () => PINNED_ITEMS.filter(it => canAccess(it.id)),
    [canAccess]
  );
  const visibleSections = useMemo(
    () => NAV_SECTIONS
      .map(s => ({ ...s, items: s.items.filter(it => canAccess(it.id)) }))
      .filter(s => s.items.length > 0),
    [canAccess]
  );
  // Global ⌘K / Ctrl+K hotkey.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  // Close on route/nav.
  const handleSelect = (itemId) => {
    onNavigate(itemId);
    onOpenChange(false);
  };

  if (!open) return null;

  return (
    // V85-followup (EOD9, 2026-05-18) — AV78 EXEMPTION for command palette
    // per user "ทำให้กดที่ตรงที่ว่างเบลอๆตรงอื่นแล้วปิดตัวเองลงไปได้ด้วย".
    // Cmd palette is a NAV tool (no unsaved data), unlike form modals where
    // AV78 protects against accidental data loss. Click-outside-to-close is
    // the established convention for command palettes (cmd+k tools). The
    // currentTarget===target check ensures only backdrop clicks close — clicks
    // INSIDE the Command tree bubble up but get filtered out.
    // V92 (2026-05-18 EOD+11 LATE) — mobile cmd-palette redesign per user
    // report "เมนูใหม่กดเปิดมาแล้วเต็มจอเลย แถมไม่มีปุ่มปิดอีก ช่วย Design
    // drop down มันให้สวยและใช้งานง่ายกว่านี้ สำหรับ mobile":
    //   - Sheet-style mobile layout: `mt-12` (48px top backdrop) +
    //     `max-h-[calc(100vh-3rem)]` instead of `h-full` so the user can
    //     tap the 48px area above to dismiss (AV78 exemption already in
    //     place per V85-followup EOD9 — palette is a nav tool, no data).
    //   - `rounded-b-2xl` on mobile so the sheet's bottom edge feels
    //     polished (top sticks to the 48px gap so top corners are flush).
    //   - Visible X close button in header (mobile + desktop) — gives an
    //     explicit dismiss affordance independent of backdrop-tap discovery.
    //   - Desktop layout UNCHANGED (sm:max-w-xl + sm:max-h-[70vh] +
    //     sm:rounded-2xl all preserved).
    <div
      className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4 animate-fadeIn overflow-y-auto overscroll-contain"
      onClick={(e) => { if (e.currentTarget === e.target) onOpenChange(false); }}
    >
      <Command
        label="เมนูค้นหา"
        loop
        className="w-full sm:max-w-xl mt-12 sm:mt-0 max-h-[calc(100vh-3rem)] sm:max-h-[70vh] flex flex-col bg-[var(--bg-surface)] rounded-b-2xl sm:rounded-2xl border-x border-b sm:border-t border-[var(--bd)] shadow-2xl overflow-hidden animate-scaleIn"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onOpenChange(false); }}
      >
        {/* Search input + close button */}
        <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[var(--bd)]">
          <Search size={16} className="text-[var(--tx-muted)] flex-shrink-0" />
          <Command.Input
            placeholder="ค้นหาเมนู… (ลูกค้า / ขาย / สต็อก / โปรโมชัน / ...)"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--tx-primary)] placeholder-[var(--tx-muted)]"
            autoFocus
          />
          <kbd className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] font-mono text-[var(--tx-muted)]">
            ESC
          </kbd>
          {/* V92 — explicit X close button (mobile + desktop) */}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="ปิดเมนูค้นหา"
            data-testid="cmd-palette-close"
            className="p-1.5 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 text-[var(--tx-muted)] hover:text-[var(--tx-primary)] flex-shrink-0 transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Results list */}
        <Command.List className="flex-1 overflow-y-auto px-2 py-2 [scrollbar-width:thin]">
          <Command.Empty className="px-3 py-8 text-center text-sm text-[var(--tx-muted)]">
            ไม่พบเมนูที่ตรงกับคำค้น
          </Command.Empty>

          {/* Pinned — always first for frequent-access items
              (Phase 13.5.2: visiblePinned = perm-filtered) */}
          {visiblePinned.length > 0 && (
            <Command.Group
              heading="ใช้บ่อย"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--tx-muted)]"
            >
              {visiblePinned.map(item => {
                const ItemIcon = item.icon;
                const cm = TAB_COLOR_MAP[item.color] || TAB_COLOR_MAP.rose;
                return (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.palette}`}
                    onSelect={() => handleSelect(item.id)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer text-[var(--tx-secondary)] aria-selected:bg-[var(--bg-hover)] aria-selected:text-[var(--tx-primary)] transition-colors"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${cm.activeBg}`}>
                      <ItemIcon size={14} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    <CornerDownLeft size={12} className="text-[var(--tx-muted)] opacity-0 aria-selected:opacity-100 transition-opacity" />
                  </Command.Item>
                );
              })}
            </Command.Group>
          )}

          {visibleSections.map((section) => (
            <Command.Group
              key={section.id}
              heading={section.label}
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--tx-muted)]"
            >
              {section.items.map((item) => {
                const ItemIcon = item.icon;
                const cm = TAB_COLOR_MAP[item.color] || TAB_COLOR_MAP.rose;
                return (
                  <Command.Item
                    key={item.id}
                    value={`${item.label} ${item.palette}`}
                    onSelect={() => handleSelect(item.id)}
                    className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm cursor-pointer text-[var(--tx-secondary)] aria-selected:bg-[var(--bg-hover)] aria-selected:text-[var(--tx-primary)] transition-colors"
                  >
                    <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 text-white ${cm.activeBg}`}>
                      <ItemIcon size={14} />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                    <CornerDownLeft size={12} className="text-[var(--tx-muted)] opacity-0 aria-selected:opacity-100 transition-opacity" />
                  </Command.Item>
                );
              })}
            </Command.Group>
          ))}
        </Command.List>

        {/* Footer hint */}
        <div className="hidden sm:flex items-center justify-between gap-2 px-3 py-2 border-t border-[var(--bd)] text-[10px] text-[var(--tx-muted)]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] font-mono">↑↓</kbd>
              เลือก
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-hover)] border border-[var(--bd)] font-mono">↵</kbd>
              ไป
            </span>
          </div>
          <span>cmdk</span>
        </div>
      </Command>
    </div>
  );
}
