import React from 'react';
import { useIsVip } from '../lib/VipContext.jsx';
import { useResolvedTheme } from '../hooks/useTheme.js';

/**
 * VIP display primitives (2026-07-04).
 *
 * Gold on customer names is ALLOWED per user 2026-07-04 ("ชื่อสีทองได้นะ
 * ห้ามแดงเฉยๆ") — supersedes the old no-gold rule; ONLY red stays forbidden
 * on names/HN (.claude/rules/04-thai-ui.md). AA both themes (V125 aaAccent
 * pattern): dark #fbbf24 (~11:1 on dark) / light #b45309 (4.7:1 on white).
 *
 * Renders NOTHING / plain children outside a VipProvider or for non-VIP
 * customers — safe to use on any surface; customer-facing pages never mount
 * the provider so VIP can never leak there (AV202).
 *
 * Theme via useResolvedTheme (bug-hunt R1 #9): READ-ONLY singleton
 * subscription — a display primitive mounted hundreds of times per list must
 * never run useTheme's write effect (setAttribute + localStorage +
 * `theme-transitioning`) nor mount its own MutationObserver per instance.
 */

export const VIP_GOLD = { dark: '#fbbf24', light: '#b45309' };
const CHIP = {
  dark:  { bg: 'rgba(245,158,11,.14)', bd: 'rgba(245,158,11,.45)', tx: '#fcd34d' },
  light: { bg: 'rgba(245,158,11,.12)', bd: 'rgba(180,83,9,.4)',  tx: '#92400e' },
};

export function VipBadge({ customerId, className = '' }) {
  const isVip = useIsVip(customerId);
  const resolvedTheme = useResolvedTheme();
  if (!isVip) return null;
  const c = resolvedTheme === 'light' ? CHIP.light : CHIP.dark;
  return (
    <span
      data-testid="vip-badge"
      className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded-full text-[9px] font-extrabold align-middle whitespace-nowrap ${className}`}
      style={{ background: c.bg, border: `1px solid ${c.bd}`, color: c.tx }}
      title="ลูกค้า VIP"
    >
      👑 VIP
    </span>
  );
}

/**
 * Wrap a customer-name render: gold name color + 👑 VIP badge appended when
 * the customer is VIP; plain passthrough otherwise. Keeps the caller's own
 * classes intact (className forwarded).
 *
 * Badge placement (bug-hunt R1 #10): the badge renders as a SIBLING after the
 * name span — NOT inside it — so callers passing `truncate` classes ellipsize
 * the NAME only; a long Thai name can never clip the 👑 VIP chip away.
 *
 * @param {object} props
 * @param {string|number} props.customerId key into the VIP set
 * @param {boolean} [props.showBadge=true] set false in ultra-tight rows
 */
export function VipName({ customerId, showBadge = true, className = '', children }) {
  const isVip = useIsVip(customerId);
  const resolvedTheme = useResolvedTheme();
  if (!isVip) {
    return <span className={className || undefined}>{children}</span>;
  }
  const gold = resolvedTheme === 'light' ? VIP_GOLD.light : VIP_GOLD.dark;
  return (
    <>
      <span className={className || undefined} style={{ color: gold }} data-vip="true">
        {children}
      </span>
      {showBadge && <VipBadge customerId={customerId} className="ml-1.5 flex-none" />}
    </>
  );
}

export default VipBadge;
