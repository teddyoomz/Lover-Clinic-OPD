// ─── CustomerCard — Reusable card for displaying customer info ──────────────
// V68 (2026-05-15) — V5 Editorial redesign. World-class polish for the
// customer-list view. Initials avatar with hash-derived gradient (no
// generic User icon). 4-layer shadow stack for depth (lit-from-above
// inset highlight + tight contact + mid-depth + soft ambient). Meta-col
// (phone above branch). LINE chip in bottom meta row (Q4=C decision).
//
// Public API stable from pre-V68: same props, same callbacks. Caller
// CustomerListTab.jsx unchanged.
//
// Layout:
//   ┌──────────────────────────────────────────┐  ← rounded-2xl, 4-layer shadow
//   │ [56px halo gradient avatar]            ✕ │  ← header + delete (hover-only)
//   │   นางสาว แพรพร พรแพร                       │
//   │   HN 000004 · 28 ปี · ♀️ หญิง               │  ← tagline
//   │ ┌──────────────────────────────────────┐ │
//   │ │ 📞 081-234-5678                      │ │  ← meta-col: phone
//   │ │ 📍 นครราชสีมา                         │ │  ← branch (stacked)
//   │ └──────────────────────────────────────┘ │
//   │ 💊 12 รักษา · 📦 5 คอร์ส       🟢 LINE  │  ← engagement + LINE chip
//   └──────────────────────────────────────────┘

import { useHasPermission, useTabAccess } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { CustomerLineBadge } from '../CustomerOption.jsx';
import PhoneLink from '../PhoneLink.jsx';

// Avatar gradient palette — 6 colors (no red per Thai cultural rule).
// Hash-derived from customer name so the same person always gets the
// same color (visual identity anchor across sessions).
const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-pink-500 to-pink-700',
  'bg-gradient-to-br from-teal-500 to-teal-700',
  'bg-gradient-to-br from-amber-500 to-amber-700',
  'bg-gradient-to-br from-blue-500 to-blue-700',
  'bg-gradient-to-br from-purple-500 to-purple-700',
  'bg-gradient-to-br from-emerald-500 to-emerald-700',
];

function pickGradient(name) {
  let hash = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0; // force int32
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// Strip Thai title prefix + take first 2 chars for initials
function getInitials(name) {
  const cleaned = String(name || '').replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim();
  return cleaned.slice(0, 2) || '?';
}

// Format relative time
function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

// Compute age from birthdate ISO
function computeAge(birthdate) {
  if (!birthdate) return '';
  const now = new Date();
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return '';
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age > 0 ? `${age} ปี` : '';
}

// Gender emoji
function genderEmoji(gender) {
  const g = String(gender || '').toLowerCase();
  if (g.includes('หญิง') || g === 'female' || g === 'f') return '♀️ หญิง';
  if (g.includes('ชาย') || g === 'male' || g === 'm') return '♂️ ชาย';
  return gender || '';
}

export default function CustomerCard({
  customer,
  // V68: `accentColor` accepted for API stability; the V5 design bakes the
  // accent into the shadow stack (fire-red dark / sakura light) rather than
  // applying the dynamic clinic accent color per-card.
  // eslint-disable-next-line no-unused-vars
  accentColor,
  theme,
  mode = 'cloned',
  cloneStatus,
  cloneProgress,
  onClone,
  onView,
  onDeleteClick,
  // V81-fix4 (Bug "branches มั่ว", 2026-05-17 EOD+2): optional Map<branchId, {id, name}>
  // injected by parent to resolve customer.branchId → branch name at render time.
  // Customer doc has no `branchName` field; without this map the chip shows raw
  // BR-... ID which the user described as "ขึ้นสาขามั่ว".
  branchesMap,
}) {
  const isDark = theme !== 'light';
  const { branchId: contextBranchId } = useSelectedBranch();

  const hasDeletePerm = useHasPermission('customer_delete');
  const tabAccess = useTabAccess();
  const canDelete = hasDeletePerm || tabAccess?.isAdmin === true;

  const hn = customer.proClinicHN || customer.hn_no || customer.hn || '';
  const id = customer.proClinicId || customer.id || '';
  const name = customer.name
    || (customer.patientData
        ? `${customer.patientData.prefix || ''} ${customer.patientData.firstName || customer.patientData.firstNameTh || ''} ${customer.patientData.lastName || customer.patientData.lastNameTh || ''}`.trim()
        : `${customer.prefix || ''} ${customer.firstname || ''} ${customer.lastname || ''}`.trim())
    || '-';
  const phone = customer.phone || customer.telephone_number || customer.patientData?.phone || '';
  const gender = customer.patientData?.gender || customer.gender || '';
  const birthdate = customer.patientData?.birthdate || customer.birthdate || '';
  // V81-fix4 (Bug "branches มั่ว"): prefer branchesMap lookup (branch NAME) over
  // raw branchId fallback. Order: live map lookup → denormalized branchName field
  // (none currently) → raw branchId (last resort). Empty string if no branch info.
  const branchName = (() => {
    const bid = customer.branchId;
    if (branchesMap && bid) {
      const found = branchesMap.get(bid);
      if (found?.name) return found.name;
    }
    return customer.branchName || customer.branchId || '';
  })();
  const treatmentCount = customer.treatmentCount || 0;
  const courseCount = (customer.courses?.length) || 0;
  const updatedRel = relativeTime(customer.updatedAt || customer.lastSyncedAt || customer.clonedAt);

  const initials = getInitials(name);
  const gradientCls = pickGradient(name);
  const ageStr = computeAge(birthdate);
  const genderStr = genderEmoji(gender);

  const handleCardClick = () => {
    if (mode === 'cloned' && onView) onView(customer);
  };

  // Tagline: HN · age · gender — only fields that exist
  const taglineParts = [
    hn ? `HN ${hn}` : null,
    ageStr,
    genderStr,
  ].filter(Boolean);

  // Format phone with dash separators (XXX-XXX-XXXX)
  const phoneDisplay = phone
    ? phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
    : '';

  return (
    <div
      onClick={handleCardClick}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && mode === 'cloned' && onView) {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role={mode === 'cloned' && onView ? 'button' : undefined}
      tabIndex={mode === 'cloned' && onView ? 0 : undefined}
      data-testid={`customer-card-${id || hn}`}
      className={`relative bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--bd)] rounded-2xl p-5 transition-all duration-200 group ${mode === 'cloned' && onView ? 'cursor-pointer' : ''} ${isDark
        ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.35),0_12px_32px_rgba(0,0,0,0.4)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.35),0_8px_20px_rgba(0,0,0,0.45),0_20px_48px_rgba(220,38,38,0.10)] hover:-translate-y-0.5 hover:border-[var(--bd-strong)]'
        : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(31,41,55,0.04),0_4px_12px_rgba(31,41,55,0.06),0_12px_28px_rgba(219,39,119,0.08)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(31,41,55,0.06),0_8px_20px_rgba(31,41,55,0.08),0_20px_48px_rgba(219,39,119,0.18)] hover:-translate-y-0.5 hover:border-[var(--bd-strong)]'}`}
    >
      {/* Hover-only delete button */}
      {mode === 'cloned' && canDelete && onDeleteClick && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDeleteClick(customer); }}
          title="ลบลูกค้า"
          aria-label="ลบลูกค้า"
          data-testid={`delete-customer-${id || hn}`}
          className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--tx-muted)] bg-transparent opacity-0 group-hover:opacity-100 hover:bg-red-500/12 hover:text-red-400 transition-all"
        >
          <span aria-hidden="true">🗑️</span>
        </button>
      )}

      {/* Header — avatar + name + tagline */}
      <div className="flex items-center gap-4 mb-3">
        <div className={`relative flex-shrink-0`}>
          {/* Halo glow */}
          <div className="absolute -inset-1 rounded-full opacity-60 blur-md bg-gradient-to-br from-red-500/25 to-pink-400/15 pointer-events-none" />
          <div
            className={`relative w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white border-2 border-[var(--bg-card)] shadow-lg ${gradientCls}`}
            aria-hidden="true"
          >
            {initials}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {/* Name — NEVER red (Thai cultural rule) */}
          <h3 className="text-base font-extrabold text-[var(--tx-heading)] leading-tight tracking-tight truncate">
            {name}
          </h3>
          {taglineParts.length > 0 && (
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              {taglineParts.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Meta box — phone above branch (vertical stack per Q5 decision).
          T9-review-fix: `bg-black/3` is NOT in Tailwind 3.4 default opacity
          scale (silently drops); also `dark:` defaults to `media` (OS prefers-
          color-scheme), not the app `theme` prop. Use arbitrary-value opacity
          + explicit isDark ternary to bind to the app theme. */}
      <div className={`flex flex-col gap-2 my-3 px-3.5 py-3 border border-[var(--bd)] rounded-xl ${isDark ? 'bg-white/[0.03]' : 'bg-black/[0.03]'}`}>
        {phoneDisplay && (
          <div className="flex items-center gap-2 text-sm text-[var(--tx-secondary)]">
            <span aria-hidden="true" className="text-sm opacity-85">📞</span>
            <PhoneLink value={phone}>{phoneDisplay}</PhoneLink>
          </div>
        )}
        {branchName && (
          <div className="flex items-center gap-2 text-sm text-[var(--tx-secondary)]">
            <span aria-hidden="true" className="text-sm opacity-85">📍</span>
            {branchName}
          </div>
        )}
      </div>

      {/* Footer — engagement counts + LINE chip */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-3 text-xs text-[var(--tx-muted)]">
          <span>💊 <strong className="text-[var(--tx-heading)] font-bold">{treatmentCount}</strong> รักษา</span>
          <span>📦 <strong className="text-[var(--tx-heading)] font-bold">{courseCount}</strong> คอร์ส</span>
          {updatedRel && (
            <span className="text-[var(--tx-quiet)] hidden lg:inline">· {updatedRel}</span>
          )}
        </div>
        <CustomerLineBadge customer={customer} contextBranchId={contextBranchId} />
      </div>

      {/* Search-mode clone footer (preserved for backward-compat) */}
      {mode === 'search' && onClone && (
        <div className="mt-4">
          {cloneStatus === 'cloning' ? (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500/80 to-red-600 transition-all duration-300" style={{ width: `${cloneProgress?.percent || 0}%` }} />
              </div>
              <p className="text-xs text-[var(--tx-muted)] truncate">{cloneProgress?.label || 'กำลังดำเนินการ...'}</p>
            </div>
          ) : (
            <button
              onClick={() => onClone(id)}
              className="w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98] bg-red-500/15 border border-red-500/40 text-red-500 hover:bg-red-500/25"
            >
              {cloneStatus === 'done' ? '✓ Clone สำเร็จ' :
               cloneStatus === 'error' ? '↻ ลองอีกครั้ง' :
               cloneStatus === 'exists' ? '↻ อัพเดทข้อมูล' :
               '⬇️ ดูดข้อมูลทั้งหมด'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
