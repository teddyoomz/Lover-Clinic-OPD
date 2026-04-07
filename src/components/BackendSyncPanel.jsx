// ─── BackendSyncPanel ──────────────────────────────────────────────────────
// Manual sync of ProClinic master data to backend Firestore collections.
// 4 cards: Products, Courses, Doctors, Staff
// Each calls broker API → saves to be_master_* via backendClient.

import { useState, useEffect } from 'react';
import { Package, Stethoscope, Users, ClipboardList, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import * as broker from '../lib/brokerClient.js';
import * as backend from '../lib/backendClient.js';
import { formatBangkokTime } from '../utils.js';

// Use explicit Tailwind classes (dynamic interpolation breaks JIT purge)
const SYNC_TYPES = [
  { key: 'products', label: 'สินค้า/ยา/บริการ', icon: Package, syncFn: () => broker.syncProducts(),
    iconBg: 'bg-violet-500/10', iconText: 'text-violet-400', btnBg: 'bg-violet-700/20 text-violet-400 hover:bg-violet-700/30 border border-violet-700/30' },
  { key: 'courses', label: 'คอร์ส', icon: ClipboardList, syncFn: () => broker.syncCourses(),
    iconBg: 'bg-sky-500/10', iconText: 'text-sky-400', btnBg: 'bg-sky-700/20 text-sky-400 hover:bg-sky-700/30 border border-sky-700/30' },
  { key: 'doctors', label: 'แพทย์/ผู้ช่วย', icon: Stethoscope, syncFn: () => broker.syncDoctors(),
    iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400', btnBg: 'bg-emerald-700/20 text-emerald-400 hover:bg-emerald-700/30 border border-emerald-700/30' },
  { key: 'staff', label: 'พนักงาน', icon: Users, syncFn: () => broker.syncStaff(),
    iconBg: 'bg-amber-500/10', iconText: 'text-amber-400', btnBg: 'bg-amber-700/20 text-amber-400 hover:bg-amber-700/30 border border-amber-700/30' },
];

export default function BackendSyncPanel({ isDark, showToast }) {
  const [syncStatus, setSyncStatus] = useState({});
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [statusLoading, setStatusLoading] = useState(true);

  // Load sync status on mount
  useEffect(() => {
    backend.getSyncStatus().then(s => {
      setSyncStatus(s || {});
      setStatusLoading(false);
    }).catch(() => setStatusLoading(false));
  }, []);

  const handleSync = async (type) => {
    const config = SYNC_TYPES.find(t => t.key === type);
    if (!config) return;

    setLoading(prev => ({ ...prev, [type]: true }));
    setErrors(prev => ({ ...prev, [type]: null }));

    try {
      const data = await config.syncFn();
      if (!data.success) throw new Error(data.error || 'Sync failed');

      // Save to backend Firestore
      await backend.saveMasterData(type, data.items);
      await backend.updateSyncStatus(type, data.count);

      // Update local state
      setSyncStatus(prev => ({
        ...prev,
        [type]: { lastSyncedAt: new Date().toISOString(), count: data.count },
      }));

      if (showToast) showToast(`Sync ${config.label} สำเร็จ (${data.count} รายการ)`);
    } catch (err) {
      setErrors(prev => ({ ...prev, [type]: err.message }));
      if (showToast) showToast(`Sync ${config.label} ล้มเหลว: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleSyncAll = async () => {
    for (const t of SYNC_TYPES) {
      await handleSync(t.key);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--tx-muted)]">
          Sync ข้อมูลจาก ProClinic มาเก็บในระบบหลังบ้าน (ข้อมูลทางเดียว — ไม่ส่งกลับ)
        </p>
        <button
          onClick={handleSyncAll}
          disabled={Object.values(loading).some(Boolean)}
          className="text-[10px] px-3 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          <RefreshCw size={12} /> Sync ทั้งหมด
        </button>
      </div>

      {/* Sync Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {SYNC_TYPES.map(({ key, label, icon: Icon, iconBg, iconText, btnBg }) => {
          const status = syncStatus[key];
          const isLoading = loading[key];
          const error = errors[key];

          return (
            <div key={key} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4 transition-all hover:border-[var(--bd-strong)]">
              {/* Card header */}
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-lg ${iconBg}`}>
                  <Icon size={16} className={iconText} />
                </div>
                <h4 className="text-sm font-bold text-[var(--tx-heading)]">{label}</h4>
              </div>

              {/* Stats */}
              <div className="space-y-1 mb-3 text-xs">
                <div className="flex justify-between">
                  <span className="text-[var(--tx-muted)]">จำนวน</span>
                  <span className="text-[var(--tx-primary)] font-semibold">
                    {statusLoading ? '...' : status?.count != null ? `${status.count} รายการ` : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--tx-muted)]">Sync ล่าสุด</span>
                  <span className="text-[var(--tx-secondary)] text-[10px]">
                    {statusLoading ? '...' : status?.lastSyncedAt ? formatBangkokTime(status.lastSyncedAt) : 'ยังไม่เคย Sync'}
                  </span>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="text-[10px] text-red-400 bg-red-500/10 rounded-lg px-2 py-1.5 mb-2 flex items-center gap-1">
                  <AlertCircle size={10} /> {error}
                </div>
              )}

              {/* Sync button */}
              <button
                onClick={() => handleSync(key)}
                disabled={isLoading}
                className={`w-full text-xs px-3 py-2 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 ${
                  isLoading
                    ? 'bg-[var(--bg-hover)] text-[var(--tx-muted)] cursor-wait'
                    : btnBg
                }`}
              >
                {isLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> กำลัง Sync...</>
                ) : (
                  <><RefreshCw size={12} /> Sync ตอนนี้</>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
