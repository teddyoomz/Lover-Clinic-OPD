// ─── BackendSidebar — desktop persistent sidebar (Phase 9.x template) ──────
// Collapsible (expanded ≥220px, collapsed 64px icon-only). Grouped sections
// from navConfig with accordion-style expand/collapse. Active item glows
// with its section's accent color.
//
// Keyboard:
//   Tab        — move focus through items
//   Enter/Space — activate item
//   ArrowDown  — next item in list
//   ArrowUp    — previous item
//
// Accessibility:
//   nav[aria-label]          — landmark
//   button[aria-current=page] — active item
//   button[aria-expanded]    — section toggle

import { useEffect, useState, useCallback } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Search, Database } from 'lucide-react';
import { NAV_SECTIONS, PINNED_ITEMS, TAB_COLOR_MAP, sectionOf } from './navConfig.js';
import { hexToRgb } from '../../../utils.js';

const STORAGE_KEY_COLLAPSED = 'backend-nav-collapsed-v1';
const STORAGE_KEY_EXPANDED_SECTIONS = 'backend-nav-expanded-sections-v1';

function loadCollapsed() {
  try { return localStorage.getItem(STORAGE_KEY_COLLAPSED) === '1'; } catch { return false; }
}
function saveCollapsed(v) {
  try { localStorage.setItem(STORAGE_KEY_COLLAPSED, v ? '1' : '0'); } catch { /* quota/privacy */ }
}
function loadExpandedSections(activeTabId) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_EXPANDED_SECTIONS);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  // Default: expand the section that contains the active tab.
  const sec = sectionOf(activeTabId);
  return sec ? { [sec]: true } : {};
}
function saveExpandedSections(state) {
  try { localStorage.setItem(STORAGE_KEY_EXPANDED_SECTIONS, JSON.stringify(state)); } catch { /* ignore */ }
}

export default function BackendSidebar({
  activeTabId,
  onNavigate,
  clinicSettings,
  onOpenPalette,
  // Optional overrides (mobile drawer passes these to reuse the same content).
  forceExpanded = false,
  hideCollapseToggle = false,
  hidePaletteButton = false,
}) {
  const [collapsed, setCollapsed] = useState(() => forceExpanded ? false : loadCollapsed());
  const [expandedSections, setExpandedSections] = useState(() => loadExpandedSections(activeTabId));

  useEffect(() => { if (!forceExpanded) saveCollapsed(collapsed); }, [collapsed, forceExpanded]);
  useEffect(() => { saveExpandedSections(expandedSections); }, [expandedSections]);

  // When active tab changes, ensure its section is expanded (good UX on
  // deep-link hydration + cmdk jump).
  useEffect(() => {
    const sec = sectionOf(activeTabId);
    if (!sec) return;
    setExpandedSections(prev => prev[sec] ? prev : { ...prev, [sec]: true });
  }, [activeTabId]);

  const toggleSection = useCallback((sid) => {
    setExpandedSections(prev => ({ ...prev, [sid]: !prev[sid] }));
  }, []);

  const effectiveCollapsed = forceExpanded ? false : collapsed;
  const widthClass = effectiveCollapsed ? 'w-16' : 'w-60';

  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  return (
    <nav
      aria-label="เมนูระบบหลังบ้าน"
      className={`${widthClass} shrink-0 flex flex-col bg-[var(--bg-surface)] border-r border-[var(--bd)] transition-[width] duration-200 ease-out h-full`}
    >
      {/* Header: icon + clinic name (hidden when collapsed) */}
      <div className="px-3 py-3.5 border-b border-[var(--bd)] flex items-center gap-2.5 flex-shrink-0">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, rgba(${acRgb},0.25), rgba(${acRgb},0.1))`,
            border: `1px solid rgba(${acRgb},0.35)`,
            boxShadow: `0 0 20px rgba(${acRgb},0.15)`,
          }}
        >
          <Database size={18} style={{ color: ac }} />
        </div>
        {!effectiveCollapsed && (
          <div className="min-w-0">
            <h1 className="text-[11px] font-black tracking-wider uppercase truncate" style={{ color: ac }}>
              ระบบหลังบ้าน
            </h1>
            <p className="text-[10px] text-[var(--tx-muted)] truncate">{clinicSettings?.clinicName || 'Clinic'}</p>
          </div>
        )}
      </div>

      {/* Palette trigger (search) — hidden on mobile drawer (already has top bar search) */}
      {!hidePaletteButton && (
        <button
          onClick={onOpenPalette}
          className={`mx-2 my-2 flex items-center gap-2 px-2.5 py-2 rounded-lg border border-[var(--bd)] bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:border-[var(--accent)] transition-colors ${effectiveCollapsed ? 'justify-center' : 'justify-between'}`}
          aria-label="เปิดเมนูค้นหา (Ctrl+K)"
          title="Ctrl+K / ⌘K"
        >
          <div className="flex items-center gap-2 min-w-0">
            <Search size={14} className="flex-shrink-0" />
            {!effectiveCollapsed && <span className="text-xs truncate">ค้นหาเมนู…</span>}
          </div>
          {!effectiveCollapsed && (
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--bd)] font-mono text-[var(--tx-muted)]">
              ⌘K
            </kbd>
          )}
        </button>
      )}

      {/* Pinned items — flat, no section header. Rendered above groups for
          one-click access to frequently-used pages (e.g. นัดหมาย). */}
      {PINNED_ITEMS.length > 0 && (
        <ul className="px-2 pt-1 pb-2 border-b border-[var(--bd)] space-y-0.5" role="list">
          {PINNED_ITEMS.map(item => {
            const ItemIcon = item.icon;
            const isActive = activeTabId === item.id;
            const cm = TAB_COLOR_MAP[item.color] || TAB_COLOR_MAP.rose;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  title={effectiveCollapsed ? item.label : undefined}
                  className={`w-full flex items-center gap-2.5 rounded-lg font-medium text-xs transition-all ${
                    effectiveCollapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'
                  } ${
                    isActive
                      ? `${cm.activeBg} text-white`
                      : 'text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-hover)]'
                  }`}
                  style={isActive ? { boxShadow: cm.activeGlow } : undefined}
                >
                  <ItemIcon size={16} className="flex-shrink-0" />
                  {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Sections — visual hierarchy:
          - Section HEADER: uppercase, smaller (10px), accent-tinted text,
            colored icon, gradient bg-tint when active section, left-border
            indicator. Looks like a "group label" not an item.
          - Items: regular case, larger (12px), indented under header with a
            left rail (border-l) so the visual grouping is unmistakable. */}
      <ul className="flex-1 overflow-y-auto overflow-x-hidden px-2 pt-2 pb-3 space-y-1 [scrollbar-width:thin]" role="list">
        {NAV_SECTIONS.map((section) => {
          const Icon = section.icon;
          const isExpanded = !!expandedSections[section.id];
          const activeInThisSection = section.items.some(it => it.id === activeTabId);

          return (
            <li key={section.id} className="relative">
              {/* Section HEADER — distinctly styled vs items. */}
              {!effectiveCollapsed && (
                <button
                  onClick={() => toggleSection(section.id)}
                  aria-expanded={isExpanded}
                  aria-controls={`nav-section-${section.id}`}
                  className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-[10px] font-black uppercase tracking-[0.12em] transition-all ${
                    activeInThisSection
                      ? 'text-[var(--tx-primary)]'
                      : 'text-[var(--tx-muted)] hover:text-[var(--tx-secondary)]'
                  }`}
                  style={activeInThisSection ? {
                    background: `linear-gradient(90deg, rgba(${acRgb},0.12), rgba(${acRgb},0.02))`,
                    borderLeft: `3px solid rgba(${acRgb},0.7)`,
                    paddingLeft: 'calc(0.625rem - 3px)', // compensate for border so text doesn't shift
                  } : {
                    borderLeft: '3px solid transparent',
                    paddingLeft: 'calc(0.625rem - 3px)',
                  }}
                >
                  <Icon
                    size={13}
                    className="flex-shrink-0"
                    style={activeInThisSection ? { color: ac } : undefined}
                  />
                  <span className="flex-1 text-left truncate">{section.label}</span>
                  <ChevronDown
                    size={11}
                    className={`flex-shrink-0 opacity-60 transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                  />
                </button>
              )}

              {/* Items — indented under header with a left rail (border-l) so
                  the visual grouping is unmistakable. */}
              <ul
                id={`nav-section-${section.id}`}
                className={`${
                  effectiveCollapsed
                    ? 'space-y-0.5'
                    : (isExpanded
                      ? 'mt-1 mb-2 ml-3 pl-2 space-y-0.5 border-l border-[var(--bd)]'
                      : 'hidden')
                }`}
                role="list"
              >
                {section.items.map(item => {
                  const ItemIcon = item.icon;
                  const isActive = activeTabId === item.id;
                  const cm = TAB_COLOR_MAP[item.color] || TAB_COLOR_MAP.rose;

                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => onNavigate(item.id)}
                        aria-current={isActive ? 'page' : undefined}
                        title={effectiveCollapsed ? item.label : undefined}
                        className={`w-full flex items-center gap-2.5 rounded-lg font-medium text-xs transition-all ${
                          effectiveCollapsed ? 'justify-center px-0 py-2.5' : 'px-2.5 py-2'
                        } ${
                          isActive
                            ? `${cm.activeBg} text-white`
                            : 'text-[var(--tx-secondary)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-hover)]'
                        }`}
                        style={isActive ? { boxShadow: cm.activeGlow } : undefined}
                      >
                        <ItemIcon size={15} className="flex-shrink-0 opacity-90" />
                        {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>

      {/* Collapse toggle (desktop only — mobile drawer passes hideCollapseToggle) */}
      {!hideCollapseToggle && (
        <button
          onClick={() => setCollapsed(c => !c)}
          className="border-t border-[var(--bd)] flex items-center justify-center py-2 text-[var(--tx-muted)] hover:text-[var(--tx-primary)] hover:bg-[var(--bg-hover)] transition-colors flex-shrink-0"
          aria-label={effectiveCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
          title={effectiveCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'}
        >
          {effectiveCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>
      )}
    </nav>
  );
}
