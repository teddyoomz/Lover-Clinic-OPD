// ─── ComingSoon — shared placeholder for scaffold-only tabs ────────────────
// Used by Phase 11.1 scaffold (6 master-data stubs) + any future tab that
// lands as a nav item before its CRUD UI is built.
//
// Keep thin: just a centered card with icon + title + message. Each caller
// passes the label + icon + optional message.
//
// Rule C1 (Rule of 3): this is the 2nd placeholder shape in the codebase
// (after the inline ReportComingSoon in BackendDashboard.jsx). Once Phase 16
// polish refactors ReportComingSoon to use this, we'll hit 3 and the extract
// is justified. Extracting early here because we'll use it 6 times in one
// commit.

import { Construction } from 'lucide-react';
import { hexToRgb } from '../../utils.js';

/**
 * @param {object} props
 * @param {React.ComponentType} props.icon — lucide icon (shown in card)
 * @param {string} props.label — Thai title of the tab
 * @param {string} [props.message] — description of what will land here
 * @param {string} [props.phaseTag] — e.g. "Phase 11.2" — shown below message
 * @param {{ accentColor?: string }} [props.clinicSettings]
 */
export default function ComingSoon({
  icon: Icon = Construction,
  label,
  message = 'อยู่ระหว่างพัฒนา — จะปล่อยใน task ถัดไป',
  phaseTag,
  clinicSettings,
}) {
  const ac = clinicSettings?.accentColor || '#f59e0b';
  const acRgb = hexToRgb(ac);

  return (
    <div className="space-y-4" data-testid="coming-soon">
      <div
        className="rounded-xl p-12 text-center"
        style={{
          background: `linear-gradient(135deg, rgba(${acRgb},0.05), transparent 60%), var(--bg-card)`,
          border: `1px dashed rgba(${acRgb},0.35)`,
          boxShadow: `0 0 32px -12px rgba(${acRgb},0.25)`,
        }}
      >
        <span
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{
            background: `linear-gradient(135deg, rgba(${acRgb},0.22), rgba(${acRgb},0.08))`,
            border: `1px solid rgba(${acRgb},0.35)`,
            boxShadow: `0 0 24px -6px rgba(${acRgb},0.50)`,
          }}
        >
          <Icon size={32} strokeWidth={2} style={{ color: ac }} />
        </span>
        <h2
          className="text-2xl font-black text-[var(--tx-heading)] mb-2"
          style={{ letterSpacing: '-0.015em' }}
        >
          {label}
        </h2>
        <p className="text-sm text-[var(--tx-muted)] flex items-center justify-center gap-2">
          <Construction size={14} /> {message}
        </p>
        {phaseTag && (
          <p
            className="text-xs font-bold uppercase tracking-wider mt-3"
            style={{ color: ac, letterSpacing: '0.08em' }}
          >
            {phaseTag}
          </p>
        )}
      </div>
    </div>
  );
}
