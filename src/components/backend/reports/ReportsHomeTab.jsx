// audit-branch-scope: BS-11 navigation-only — no data load (V52, 2026-05-08)
// ─── ReportsHomeTab — landing card grid replicating ProClinic /admin/report ─
// 2026-07-08 wire-up: every card opens a working report (no "เร็วๆนี้"/disabled).
// Card map wires the 6 previously-mislabeled/hidden tabs + 4 data-ready new tabs.
// Drift guard: reports-home-wiring-drift-guard.test.js asserts every tabId is a
// registered navConfig id (ReportCard still supports a 'soon' status defensively,
// but no card uses it — a future soon card without a real tab fails the guard).

import { useMemo } from 'react';
import {
  BarChart3, ChevronRight, Star,
  Receipt, Users, CalendarCheck, Boxes, Sparkles, TrendingUp, Activity, ShieldCheck,
} from 'lucide-react';
import { hexToRgb } from '../../../utils.js';

/**
 * Card status:
 *   active    → tabId set, fully clickable
 *   soon      → renders disabled with "เร็วๆนี้" badge
 *   external  → not in this app; never set in v1
 */
// 2026-07-08 — reports-home wire-up: every card opens a working report (no
// "เร็วๆนี้"/disabled). 6 previously-mislabeled tabs wired to their real tabIds,
// 4 data-ready new report tabs added, dead cards removed. The drift-guard test
// (reports-home-wiring-drift-guard.test.js) asserts every tabId here is a
// registered navConfig id → this wiring-gap bug class (V52-family) can't recur.
const CATEGORIES = [
  {
    id: 'sales',
    title: 'รายงานการขาย',
    items: [
      { label: 'รายรับประจำวัน',                              status: 'active', tabId: 'reports-daily-revenue' },
      { label: 'การขาย (ใบเสร็จ)',                            status: 'active', tabId: 'reports-sale' },
      { label: 'ยอดขายรายแพทย์/พนักงาน',                    status: 'active', tabId: 'reports-staff-sales' },
      { label: 'ยอดขายรายแพทย์/พนักงานตามยอดเงินที่ชำระ',     status: 'active', tabId: 'reports-staff-sales' },
      { label: 'กำไร/ขาดทุน (P&L)',                          status: 'active', tabId: 'reports-pnl' },
      { label: 'สรุปบัญชีรับชำระ',                            status: 'active', tabId: 'reports-payment' },
      { label: 'การขายออนไลน์',                              status: 'active', tabId: 'reports-alt-sales' },
      { label: 'ยอดขายคู่ค้า',                               status: 'active', tabId: 'reports-alt-sales' },
      { label: 'รายการขายค้างชำระ',                          status: 'active', tabId: 'reports-outstanding' },
    ],
  },
  {
    id: 'customer',
    title: 'รายงานลูกค้า',
    items: [
      { label: 'ลูกค้าสาขา',                                  status: 'active', tabId: 'reports-customer' },
      { label: 'คอร์สคงเหลือ',                                status: 'active', tabId: 'reports-remaining-course' },
    ],
  },
  {
    id: 'expense',
    title: 'รายงานรายจ่าย',
    items: [
      { label: 'รายจ่ายทั้งหมด (แยกหมวดในแท็บ)',              status: 'active', tabId: 'expense-report' },
      { label: 'ค่ามือแพทย์ (DF)',                            status: 'active', tabId: 'reports-df-payout' },
    ],
  },
  {
    id: 'appointment',
    title: 'รายงานนัดหมาย',
    items: [
      { label: 'รายงานนัดหมาย',                               status: 'active', tabId: 'reports-appointment' },
    ],
  },
  {
    id: 'stock',
    title: 'รายงานสต็อคสินค้า',
    items: [
      { label: 'สต็อคสินค้า (คงเหลือ)',                       status: 'active', tabId: 'reports-stock' },
      { label: 'รายการเคลื่อนไหวสต็อค',                       status: 'active', tabId: 'reports-stock-movements' },
      { label: 'ล็อตสินค้าใกล้หมดอายุ',                       status: 'active', tabId: 'reports-stock-alert' },
      { label: 'ล็อตสินค้าหมดอายุ',                           status: 'active', tabId: 'reports-stock-alert' },
      { label: 'สินค้าใกล้หมดสต็อค',                           status: 'active', tabId: 'reports-stock-alert' },
    ],
  },
];

const ANALYTICS = [
  { label: 'CRM Insight (RFM)',         icon: Sparkles,    tabId: 'reports-rfm',           hint: 'จัดกลุ่มลูกค้า 11 segments' },
  { label: 'วิเคราะห์รายได้ตามหัตถการ',  icon: TrendingUp,  tabId: 'reports-revenue',        hint: 'แยกตามประเภท + หมวดหมู่' },
  { label: 'วิเคราะห์นัดหมาย',           icon: Activity,    tabId: 'reports-appt-analysis',  hint: 'KPI per advisor + Performance' },
  // Recon (2026-07-07) — V155/V157 residual: retro side-effect verification
  { label: 'ตรวจความครบธุรกรรม',         icon: ShieldCheck, tabId: 'reports-reconciliation', hint: 'มัดจำ/wallet/แต้ม/คอร์ส ครบทุกใบขาย' },
  { label: 'รายงานคลินิก (ภาพรวม)',      icon: BarChart3,   tabId: 'clinic-report',          hint: 'ภาพรวม executive dashboard' },
  // 2026-07-08 — Smart Audience is a real Phase-16.1 tab (was stale-labeled "เร็วๆนี้ Phase 10b")
  { label: 'Smart Audience',             icon: Users,       tabId: 'smart-audience',         hint: 'สร้างกลุ่มลูกค้า (segment) + ส่งออก CSV' },
];

/**
 * @param {object} props
 * @param {(tabId: string) => void} props.onNavigate
 * @param {{ accentColor?: string }} [props.clinicSettings]
 */
export default function ReportsHomeTab({ onNavigate, clinicSettings }) {
  const ac = clinicSettings?.accentColor || '#06b6d4';
  const acRgb = useMemo(() => hexToRgb(ac), [ac]);

  return (
    <div className="space-y-6" data-testid="reports-home">
      {/* Header */}
      <div>
        <h2 className="text-xl font-black tracking-wider uppercase" style={{ color: ac }}>
          <BarChart3 size={20} className="inline mr-2" />
          รายงานสาขา
        </h2>
        <p className="text-xs text-[var(--tx-muted)] mt-0.5">
          เลือกรายงานที่ต้องการดู — ทุกรายการพร้อมใช้งาน
        </p>
      </div>

      {/* Analytics row (T2 — flagship) */}
      <section
        className="rounded-xl p-4 border"
        style={{
          background: `linear-gradient(135deg, rgba(${acRgb},0.08), transparent)`,
          borderColor: `rgba(${acRgb},0.25)`,
        }}
      >
        <h3 className="text-xs font-black tracking-wider uppercase text-amber-400 mb-3 flex items-center gap-2">
          <Star size={14} /> วิเคราะห์เชิงลึก
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ANALYTICS.map(card => (
            <AnalyticsCard
              key={card.label}
              card={card}
              onClick={() => card.tabId && onNavigate(card.tabId)}
            />
          ))}
        </div>
      </section>

      {/* 6 categories */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {CATEGORIES.map(cat => (
          <section
            key={cat.id}
            className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] overflow-hidden"
            data-testid={`category-${cat.id}`}
          >
            <header className="px-4 py-3 border-b border-[var(--bd)] bg-[var(--bg-hover)]">
              <h3 className="text-sm font-black tracking-wider uppercase text-cyan-400">
                {cat.title}
                <span className="ml-2 text-[10px] text-[var(--tx-muted)] font-normal">
                  ({cat.items.filter(i => i.status === 'active').length}/{cat.items.length})
                </span>
              </h3>
            </header>
            <ul className="divide-y divide-[var(--bd)]">
              {cat.items.map(item => (
                <ReportCard
                  key={item.label}
                  item={item}
                  onClick={() => item.status === 'active' && item.tabId && onNavigate(item.tabId)}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

function ReportCard({ item, onClick }) {
  const isActive = item.status === 'active';
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        disabled={!isActive}
        className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-2 transition-colors ${
          isActive
            ? 'hover:bg-cyan-900/20 text-[var(--tx-primary)] cursor-pointer'
            : 'text-[var(--tx-muted)] cursor-not-allowed'
        }`}
        data-active={isActive ? 'true' : 'false'}
      >
        <span className="text-xs">{item.label}</span>
        {isActive ? (
          <ChevronRight size={14} className="text-cyan-400 flex-shrink-0" />
        ) : (
          <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-hover)] text-[var(--tx-muted)]">
            เร็วๆนี้
          </span>
        )}
      </button>
    </li>
  );
}

function AnalyticsCard({ card, onClick }) {
  const isActive = !!card.tabId;
  const Icon = card.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!isActive}
      className={`text-left p-3 rounded-lg border transition-all ${
        isActive
          ? 'bg-[var(--bg-card)] border-amber-700/40 hover:border-amber-500/60 hover:bg-amber-900/10 cursor-pointer fx-glow-v5'
          : 'bg-[var(--bg-card)] border-[var(--bd)] opacity-50 cursor-not-allowed'
      }`}
    >
      <div className="flex items-center gap-2 mb-1">
        <Icon size={16} className={isActive ? 'text-amber-400' : 'text-[var(--tx-muted)]'} />
        <span className="text-xs font-bold text-[var(--tx-primary)]">{card.label}</span>
      </div>
      <p className="text-[10px] text-[var(--tx-muted)] line-clamp-2">{card.hint}</p>
    </button>
  );
}
