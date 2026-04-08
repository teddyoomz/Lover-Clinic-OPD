// ─── CustomerListTab — Display cloned customers from be_customers ───────────
// Card grid layout similar to ProClinic's /admin/customer/search page.
// Client-side search filtering by name, HN, phone.

import { useState, useEffect, useMemo } from 'react';
import { Users, Search, Loader2, RefreshCw } from 'lucide-react';
import { getAllCustomers } from '../../lib/backendClient.js';
import { hexToRgb } from '../../utils.js';
import CustomerCard from './CustomerCard.jsx';

export default function CustomerListTab({ clinicSettings, theme }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  // Fetch all cloned customers
  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getAllCustomers()
      .then(data => {
        if (!cancelled) setCustomers(data);
      })
      .catch(err => {
        console.error('[CustomerListTab] Failed to load customers:', err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [refreshKey]);

  // Client-side filter
  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return customers;
    const q = filterQuery.trim().toLowerCase();
    return customers.filter(c => {
      const name = `${c.patientData?.prefix || ''} ${c.patientData?.firstName || ''} ${c.patientData?.lastName || ''}`.toLowerCase();
      const hn = (c.proClinicHN || '').toLowerCase();
      const phone = (c.patientData?.phone || '').toLowerCase();
      const id = (c.proClinicId || '').toLowerCase();
      return name.includes(q) || hn.includes(q) || phone.includes(q) || id.includes(q);
    });
  }, [customers, filterQuery]);

  return (
    <div className="space-y-4">

      {/* ── Header bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search filter */}
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="ค้นหาลูกค้าในระบบ..."
            className="w-full pl-9 pr-4 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none focus:ring-2 transition-all"
            style={{ '--tw-ring-color': `rgba(${acRgb},0.4)` }}
          />
        </div>

        {/* Refresh button */}
        <button
          onClick={() => setRefreshKey(k => k + 1)}
          disabled={loading}
          className="px-3 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all text-xs font-bold flex items-center gap-1.5"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> รีเฟรช
        </button>

        {/* Count */}
        <span className="text-xs text-[var(--tx-muted)] font-medium">
          {filtered.length} / {customers.length} รายการ
        </span>
      </div>

      {/* ── Loading ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังโหลดข้อมูลลูกค้า...</span>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && customers.length === 0 && (
        <div className="text-center py-20 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
          <Users size={36} className="mx-auto text-[var(--tx-muted)] mb-3" />
          <h3 className="text-sm font-bold text-[var(--tx-heading)] mb-1">ยังไม่มีข้อมูลลูกค้า</h3>
          <p className="text-xs text-[var(--tx-muted)]">ไปที่ "Clone ลูกค้า" เพื่อดูดข้อมูลจาก ProClinic มาเก็บไว้</p>
        </div>
      )}

      {/* ── No filter results ── */}
      {!loading && customers.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
          <Search size={28} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-sm text-[var(--tx-muted)]">ไม่พบลูกค้าที่ตรงกับ "{filterQuery}"</p>
        </div>
      )}

      {/* ── Customer Grid ── */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filtered.map(customer => (
            <CustomerCard
              key={customer.id}
              customer={customer}
              accentColor={ac}
              mode="cloned"
            />
          ))}
        </div>
      )}
    </div>
  );
}
