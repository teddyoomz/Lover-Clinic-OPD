// ─── ReportsHomeTab — landing card grid replicating ProClinic /admin/report ─
// 6 categories × ~36 cards (matches captured screenshot 2026-04-19).
// Cards link to active Phase 10 tabs OR show "เร็วๆนี้" badge for deferred items.

import { useMemo } from 'react';
import {
  BarChart3, ChevronRight, Star,
  Receipt, Users, CalendarCheck, Boxes, Sparkles, TrendingUp, Activity,
} from 'lucide-react';
import { hexToRgb } from '../../../utils.js';

/**
 * Card status:
 *   active    → tabId set, fully clickable
 *   soon      → renders disabled with "เร็วๆนี้" badge
 *   external  → not in this app; never set in v1
 */
const CATEGORIES = [
  {
    id: 'sales',
    title: 'รายงานการขาย',
    items: [
      { label: 'รายรับประจำวัน',                              status: 'soon' },
      { label: 'ยอดขายลูกค้า',                                status: 'soon' },
      { label: 'ยอดขายคู่ค้า',                                status: 'soon' },
      { label: 'ยอดขายรายโปรโมชัน/คอร์ส/สินค้าหน้าร้าน',     status: 'soon' },
      { label: 'ยอดขายรายแพทย์/พนักงาน',                    status: 'soon' },
      { label: 'ยอดขายรายแพทย์/พนักงานตามยอดเงินที่ชำระ',     status: 'soon' },
      { label: 'ยอดขายรายลูกค้า',                             status: 'soon' },
      { label: 'การขาย',                                      status: 'active', tabId: 'reports-sale' },
      { label: 'กำไร/ขาดทุน',                                 status: 'soon' },
      { label: 'กำไรต่อการรักษา',                              status: 'soon' },
      { label: 'การขายออนไลน์',                                status: 'soon' },
    ],
  },
  {
    id: 'marketing',
    title: 'รายงานการตลาด',
    items: [
      { label: 'คูปองส่วนลด',                                  status: 'soon' },
      { label: 'Voucher',                                       status: 'soon' },
    ],
  },
  {
    id: 'customer',
    title: 'รายงานลูกค้า',
    items: [
      { label: 'ลูกค้าสาขา',                                   status: 'active', tabId: 'reports-customer' },
      { label: 'คอร์สคงเหลือ',                                 status: 'soon' },
      { label: 'รายการขายค้างชำระ',                            status: 'soon' },
      { label: 'ประวัติการรักษา',                              status: 'soon' },
      { label: 'รายงานการใช้คอร์ส',                            status: 'soon' },
    ],
  },
  {
    id: 'general',
    title: 'รายงานทั่วไป',
    items: [
      { label: 'รายงานโปรโมชัน',                                status: 'soon' },
      { label: 'รายงานคอร์ส',                                   status: 'soon' },
      { label: 'รายงานสินค้า',                                  status: 'soon' },
      { label: 'รายงานนัดหมาย',                                status: 'active', tabId: 'reports-appointment' },
    ],
  },
  {
    id: 'expense',
    title: 'รายงานรายจ่าย',
    items: [
      { label: 'รายจ่ายทั้งหมด',                                status: 'soon' },
      { label: 'รายจ่ายแพทย์',                                  status: 'soon' },
      { label: 'รายจ่ายพนักงาน',                               status: 'soon' },
      { label: 'รายจ่ายอื่นๆ',                                  status: 'soon' },
    ],
  },
  {
    id: 'stock',
    title: 'รายงานสต็อคสินค้า',
    items: [
      { label: 'สต็อคสินค้า',                                  status: 'active', tabId: 'reports-stock' },
      { label: 'รายงานนำเข้าสินค้า',                            status: 'soon' },
      { label: 'รายการเคลื่อนไหวสต็อค',                        status: 'soon' },
      { label: 'ล็อตสินค้าใกล้หมดอายุ',                        status: 'soon' },
      { label: 'ล็อตสินค้าหมดอายุ',                            status: 'soon' },
      { label: 'สินค้าใกล้หมดสต็อค',                            status: 'soon' },
      { label: 'สรุปใช้ยาประจำวัน',                              status: 'soon' },
      { label: 'สรุปใช้ยาตามช่วงเวลา',                           status: 'soon' },
      { label: 'สรุปใช้ยาตามวันที่รักษา',                         status: 'soon' },
      { label: 'สรุปใช้ยาตามวันที่ขาย',                          status: 'soon' },
      { label: 'ตัดสต็อคสินค้าล่วงหน้า',                          status: 'soon' },
    ],
  },
];

const ANALYTICS = [
  { label: 'CRM Insight (RFM)',         icon: Sparkles,    tabId: 'reports-rfm',           hint: 'จัดกลุ่มลูกค้า 11 segments' },
  { label: 'วิเคราะห์รายได้ตามหัตถการ',  icon: TrendingUp,  tabId: 'reports-revenue',        hint: 'แยกตามประเภท + หมวดหมู่' },
  { label: 'วิเคราะห์นัดหมาย',           icon: Activity,    tabId: 'reports-appt-analysis',  hint: 'KPI per advisor + Performance' },
  { label: 'Smart Audience',             icon: Users,       tabId: null,                     hint: 'เร็วๆนี้ (Phase 10b)' },
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
          เลือกรายงานที่ต้องการดู — รายการที่พร้อมใช้แสดง <span className="text-cyan-400 font-bold">ฟ้า</span> ส่วน "เร็วๆนี้" คือฟีเจอร์ที่จะทยอยปล่อยใน Phase ถัดไป
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
          ? 'bg-[var(--bg-card)] border-amber-700/40 hover:border-amber-500/60 hover:bg-amber-900/10 cursor-pointer'
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
