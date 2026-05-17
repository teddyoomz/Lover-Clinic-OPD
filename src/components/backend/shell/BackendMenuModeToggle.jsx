// Backend Menu D — pill toggle ⚡↔📋. Desktop+Tablet ≥768px only; hidden on mobile.
// Consumes useBackendMenuMode() — purely cosmetic chrome.

import { Zap, List } from 'lucide-react';
import { useBackendMenuMode } from './backendMenuMode.js';

export default function BackendMenuModeToggle() {
  const [mode, setMode] = useBackendMenuMode();

  return (
    <div
      role="group"
      aria-label="โหมดเมนู"
      data-testid="backend-menu-mode-toggle"
      className="hidden md:inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--bd)] p-0.5"
    >
      <button
        type="button"
        onClick={() => setMode('new')}
        aria-pressed={mode === 'new'}
        data-testid="mode-toggle-new"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          mode === 'new'
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
            : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'
        }`}
      >
        <Zap size={12} /> ใหม่
      </button>
      <button
        type="button"
        onClick={() => setMode('classic')}
        aria-pressed={mode === 'classic'}
        data-testid="mode-toggle-classic"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          mode === 'classic'
            ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-sm'
            : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'
        }`}
      >
        <List size={12} /> เดิม
      </button>
    </div>
  );
}
