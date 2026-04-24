// ─── Backend nav config — single source of truth ───────────────────────────
// Template for Phase 10-12+. Adding a new page = add one entry to a section's
// `items[]` (or append a new section). The Sidebar / Drawer / CmdPalette all
// read from this file; keep it data-only (no JSX) so it can be imported from
// tests + tree-shaken cleanly.
//
// Shape:
//   sections: [{
//     id:        stable string (for aria-controls + localStorage expansion state)
//     label:     Thai title shown in sidebar header
//     icon:      lucide-react component name (string — looked up in `iconFor`)
//     items: [{
//       id:          stable string — maps to URL ?tab=<id> + setActiveTab arg
//       label:       Thai label
//       icon:        lucide-react component name
//       palette:     keywords for cmdk fuzzy search (Thai + English)
//       color:       tailwind color family — active-state accent (existing TAB_COLOR_MAP)
//       shortcut:    optional keyboard shortcut (e.g. 'g c' for "go customers")
//     }]
//   }]
//
// IDs are permanent — breaking them breaks deep-link URLs.

import {
  // section icons
  UsersRound, Briefcase, Package, Wallet, Megaphone, Settings, BarChart3, Database,
  // tab icons
  Download, Users, CalendarDays, ShoppingCart,
  Package as PackageIcon, Tag, Ticket, Gift, Wallet as WalletIcon,
  LayoutDashboard, Receipt, CalendarCheck, Boxes, Sparkles, TrendingUp, Activity,
  // Phase 11 master-data tab icons
  FolderTree, Scale, Wrench, CalendarX, Building2, ShieldCheck,
  // Phase 12.1 people tab icons
  User, Stethoscope,
  // Phase 12.2 catalog tab icons
  Briefcase as BriefcaseIcon,
  // Phase 12.5 finance master tab icon
  Banknote,
  // Phase 12.6 online-sale tab icon
  Globe2,
  // Phase 13.1 quotation tab icon
  FileText,
  // Phase 13.2 staff schedules tab icon
  CalendarClock,
} from 'lucide-react';

// Pinned items render flat at the top of the sidebar (above sections) —
// reserved for frequently-used pages that deserve one-click access without
// a section drill-down. Keep short (≤ 3 items) to preserve grouping value.
export const PINNED_ITEMS = [
  { id: 'appointments', label: 'นัดหมาย', icon: CalendarDays, color: 'sky', palette: 'appointment schedule นัด จอง calendar ปฏิทิน' },
];

export const NAV_SECTIONS = [
  {
    id: 'customers',
    label: 'ลูกค้า',
    icon: UsersRound,
    items: [
      { id: 'clone',       label: 'Clone ลูกค้า',   icon: Download, color: 'violet', palette: 'clone import proclinic ดูด นำเข้า ลูกค้า' },
      { id: 'customers',   label: 'ข้อมูลลูกค้า',    icon: Users,    color: 'teal',   palette: 'customer list ลูกค้า รายชื่อ' },
    ],
  },
  {
    id: 'sales',
    label: 'การขาย',
    icon: Briefcase,
    items: [
      { id: 'sales',         label: 'ขาย / ใบเสร็จ',  icon: ShoppingCart, color: 'rose', palette: 'sale invoice receipt ขาย ใบเสร็จ บิล' },
      { id: 'quotations',    label: 'ใบเสนอราคา',    icon: FileText,     color: 'rose', palette: 'quotation QUO เสนอราคา quote estimate ใบเสนอ' },
      { id: 'online-sales',  label: 'ขายออนไลน์',    icon: Globe2,       color: 'rose', palette: 'online sale transfer slip bank ออนไลน์ โอน สลิป' },
    ],
  },
  {
    id: 'stock',
    label: 'คลังสินค้า',
    icon: Package,
    items: [
      { id: 'stock',       label: 'สต็อก',           icon: PackageIcon, color: 'rose', palette: 'stock inventory warehouse batch คลัง สต็อก สินค้า' },
    ],
  },
  {
    id: 'finance',
    label: 'การเงิน',
    icon: Wallet,
    items: [
      { id: 'finance',     label: 'การเงิน',         icon: WalletIcon, color: 'emerald', palette: 'finance deposit wallet points membership การเงิน มัดจำ กระเป๋า' },
    ],
  },
  {
    id: 'marketing',
    label: 'การตลาด',
    icon: Megaphone,
    items: [
      { id: 'promotions',  label: 'โปรโมชัน',       icon: Tag,    color: 'orange', palette: 'promotion โปรโมชัน โปร discount' },
      { id: 'coupons',     label: 'คูปอง',          icon: Ticket, color: 'orange', palette: 'coupon คูปอง โค้ด code discount' },
      { id: 'vouchers',    label: 'Voucher',         icon: Gift,   color: 'orange', palette: 'voucher hdmall grabhealth platform' },
    ],
  },
  {
    id: 'reports',
    label: 'รายงาน',
    icon: BarChart3,
    items: [
      { id: 'reports',               label: 'หน้ารายงาน',      icon: LayoutDashboard, color: 'sky',   palette: 'reports home รายงาน หน้ารายงาน landing dashboard' },
      { id: 'reports-sale',          label: 'รายการขาย',        icon: Receipt,         color: 'sky',   palette: 'sale report รายการขาย ใบเสร็จ revenue invoice' },
      { id: 'reports-customer',      label: 'ลูกค้าสาขา',         icon: Users,           color: 'sky',   palette: 'customer report ลูกค้า สาขา patient' },
      { id: 'reports-appointment',   label: 'นัดหมาย (รายงาน)',  icon: CalendarCheck,   color: 'sky',   palette: 'appointment report นัด นัดหมาย booking schedule' },
      { id: 'reports-stock',         label: 'สต็อค (รายงาน)',    icon: Boxes,           color: 'sky',   palette: 'stock report สต็อค balance inventory' },
      { id: 'reports-rfm',           label: 'CRM Insight',       icon: Sparkles,        color: 'amber', palette: 'rfm crm insight ลูกค้าคุณภาพ champion loyalty segment' },
      { id: 'reports-revenue',       label: 'วิเคราะห์รายได้',    icon: TrendingUp,      color: 'amber', palette: 'revenue analysis procedure category รายได้ หัตถการ' },
      { id: 'reports-appt-analysis', label: 'วิเคราะห์นัด',       icon: Activity,        color: 'amber', palette: 'appointment analysis kpi performance วิเคราะห์ นัด' },
      { id: 'reports-daily-revenue', label: 'รายรับประจำวัน',     icon: CalendarDays,    color: 'sky',   palette: 'daily revenue รายรับ ประจำวัน daily-briefing per-day' },
      { id: 'reports-staff-sales',   label: 'ยอดขายรายพนักงาน',   icon: Users,           color: 'sky',   palette: 'staff sales doctor seller ยอดขาย รายแพทย์ พนักงาน' },
      { id: 'reports-pnl',           label: 'กำไรขาดทุน (P&L)',    icon: TrendingUp,      color: 'emerald', palette: 'pnl profit loss P&L กำไรขาดทุน profit-and-loss' },
      { id: 'reports-payment',       label: 'สรุปบัญชีรับชำระ',    icon: WalletIcon,      color: 'emerald', palette: 'payment summary บัญชี ชำระ สรุป cash transfer' },
    ],
  },
  {
    // Phase 11 Master Data Suite — renamed from old 'system' container.
    // Old `masterdata` (ProClinic sync) stays as the FIRST item (seed-only),
    // 6 new CRUD tabs land as stubs in 11.1 and replace one-by-one in 11.2-11.7.
    id: 'master',
    label: 'ข้อมูลพื้นฐาน',
    icon: Database,
    items: [
      { id: 'masterdata',           label: 'Sync ProClinic',   icon: Download,      color: 'amber', palette: 'sync import initial seed proclinic ข้อมูลพื้นฐาน นำเข้า master' },
      { id: 'product-groups',       label: 'กลุ่มสินค้า',        icon: FolderTree,    color: 'amber', palette: 'product group category กลุ่ม หมวดหมู่ สินค้า' },
      { id: 'product-units',        label: 'หน่วยสินค้า',         icon: Scale,         color: 'amber', palette: 'unit amp เข็ม U ครั้ง หน่วย' },
      { id: 'medical-instruments',  label: 'เครื่องหัตถการ',      icon: Wrench,        color: 'amber', palette: 'medical instrument laser hifu maintenance เครื่องมือ' },
      { id: 'holidays',             label: 'วันหยุด',             icon: CalendarX,     color: 'amber', palette: 'holiday off วันหยุด day-off closure' },
      { id: 'branches',             label: 'สาขา',               icon: Building2,     color: 'amber', palette: 'branch สาขา location' },
      { id: 'permission-groups',    label: 'สิทธิ์การใช้งาน',      icon: ShieldCheck,   color: 'amber', palette: 'permission role rights สิทธิ์ บทบาท access' },
      { id: 'staff',                label: 'พนักงาน',             icon: User,          color: 'amber', palette: 'staff employee user พนักงาน เจ้าหน้าที่' },
      { id: 'staff-schedules',      label: 'ตารางงานพนักงาน',     icon: CalendarClock, color: 'amber', palette: 'schedule shift work holiday leave ตาราง เวลา ทำงาน หยุด ลา พนักงาน' },
      { id: 'doctors',              label: 'แพทย์ & ผู้ช่วย',      icon: Stethoscope,   color: 'amber', palette: 'doctor assistant physician แพทย์ หมอ ผู้ช่วยแพทย์' },
      { id: 'products',             label: 'สินค้า',              icon: PackageIcon,   color: 'amber', palette: 'product drug service สินค้า ยา บริการ' },
      { id: 'courses',              label: 'คอร์ส',               icon: BriefcaseIcon, color: 'amber', palette: 'course program package คอร์ส โปรแกรม' },
      { id: 'finance-master',       label: 'ตั้งค่าการเงิน',       icon: Banknote,      color: 'amber', palette: 'bank account expense category ค่าใช้จ่าย บัญชีธนาคาร finance' },
    ],
  },
];

/** Flat list of all item IDs — used for URL parsing whitelist. */
export const ALL_ITEM_IDS = [
  ...PINNED_ITEMS.map(i => i.id),
  ...NAV_SECTIONS.flatMap(s => s.items.map(i => i.id)),
];

/** O(1) lookup: item id → { section, item }. Pinned items return section = null. */
export const ITEM_LOOKUP = (() => {
  const map = new Map();
  for (const item of PINNED_ITEMS) {
    map.set(item.id, { section: null, item });
  }
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      map.set(item.id, { section, item });
    }
  }
  return map;
})();

/**
 * Find section id that owns a given item id. Pinned items return null (they
 * live outside sections but are still navigable).
 */
export function sectionOf(itemId) {
  return ITEM_LOOKUP.get(itemId)?.section?.id || null;
}

/** Find item metadata (label, icon, color) by id. */
export function itemById(itemId) {
  return ITEM_LOOKUP.get(itemId)?.item || null;
}

/** Per-item color class for active state — mirrors the legacy TAB_COLOR_MAP. */
export const TAB_COLOR_MAP = {
  violet:  { activeBg: 'bg-violet-700',  activeGlow: '0 0 15px rgba(139,92,246,0.4)', hoverTx: 'hover:text-violet-400', activeRing: 'ring-violet-500/40'  },
  teal:    { activeBg: 'bg-teal-700',    activeGlow: '0 0 15px rgba(20,184,166,0.4)', hoverTx: 'hover:text-teal-400',   activeRing: 'ring-teal-500/40'    },
  amber:   { activeBg: 'bg-orange-700',  activeGlow: '0 0 15px rgba(245,158,11,0.4)', hoverTx: 'hover:text-orange-400', activeRing: 'ring-amber-500/40'   },
  sky:     { activeBg: 'bg-sky-700',     activeGlow: '0 0 15px rgba(14,165,233,0.4)', hoverTx: 'hover:text-sky-400',    activeRing: 'ring-sky-500/40'     },
  rose:    { activeBg: 'bg-rose-700',    activeGlow: '0 0 15px rgba(244,63,94,0.4)',  hoverTx: 'hover:text-rose-400',   activeRing: 'ring-rose-500/40'    },
  emerald: { activeBg: 'bg-emerald-700', activeGlow: '0 0 15px rgba(16,185,129,0.4)', hoverTx: 'hover:text-emerald-400',activeRing: 'ring-emerald-500/40' },
  orange:  { activeBg: 'bg-orange-700',  activeGlow: '0 0 15px rgba(249,115,22,0.4)', hoverTx: 'hover:text-orange-400', activeRing: 'ring-orange-500/40'  },
};
