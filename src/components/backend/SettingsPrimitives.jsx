// ─── Shared settings UI primitives (2026-06-02) ───────────────────────────
// Extracted verbatim from SystemSettingsTab (Rule C1 — now consumed by BOTH
// SystemSettingsTab AND ScheduledTasksTab). Pure presentational; no behaviour
// change vs the originals.
import { Save, AlertTriangle, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export function SectionCard({ icon: Icon, title, subtitle, children, footer }) {
  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--bd)] shadow-lg overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-[var(--bd)] flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[var(--bg-hover)] border border-[var(--bd)] flex items-center justify-center">
          <Icon size={18} className="text-[var(--tx-secondary)]" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-bold text-[var(--tx-heading)]">{title}</h3>
          {subtitle && <p className="text-xs text-[var(--tx-muted)] mt-0.5">{subtitle}</p>}
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
      {footer && (
        <div className="px-5 py-3 bg-[var(--bg-hover)]/30 border-t border-[var(--bd)]">{footer}</div>
      )}
    </div>
  );
}

export function StatusBanner({ kind, children }) {
  const palette = {
    success: 'bg-emerald-900/20 border-emerald-700/40 text-emerald-300',
    error:   'bg-rose-900/20    border-rose-700/40    text-rose-300',
    info:    'bg-sky-900/20     border-sky-700/40     text-sky-300',
  };
  return (
    <div className={`text-xs px-3 py-2 rounded-lg border ${palette[kind] || palette.info} flex items-center gap-2 mb-3`}>
      {kind === 'success' && <CheckCircle2 size={14} />}
      {kind === 'error' && <AlertCircle size={14} />}
      {kind === 'info' && <AlertTriangle size={14} />}
      <span>{children}</span>
    </div>
  );
}

export function SaveButton({ onClick, saving, success, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={saving || disabled}
      className="px-4 py-2 rounded-lg text-xs font-bold bg-rose-700 text-white hover:bg-rose-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
    >
      {saving ? <Loader2 size={14} className="animate-spin" /> :
       success ? <CheckCircle2 size={14} /> :
       <Save size={14} />}
      {saving ? 'กำลังบันทึก...' : success ? 'บันทึกสำเร็จ' : 'บันทึก'}
    </button>
  );
}
