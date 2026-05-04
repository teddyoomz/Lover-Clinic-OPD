// ─── CentralWarehousePanel — manage central warehouses (Phase 8h) ───────────
// Simple CRUD. Warehouses show up as selectable locations in Transfer +
// Withdrawal flows. Soft-delete only (isActive=false) to preserve audit.

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Warehouse, Plus, Edit3, Trash2, Loader2, X, AlertCircle, CheckCircle2, ArrowLeft, Phone, MapPin,
} from 'lucide-react';
import {
  listCentralWarehouses, createCentralWarehouse, updateCentralWarehouse, deleteCentralWarehouse,
} from '../../lib/scopedDataLayer.js';

export default function CentralWarehousePanel({ clinicSettings, theme, onAfterCreate }) {
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setWarehouses(await listCentralWarehouses({ includeInactive: showInactive })); }
    catch (e) { console.error('[Warehouses]', e); setWarehouses([]); }
    finally { setLoading(false); }
  }, [showInactive]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (w) => {
    if (!confirm(`ปิดใช้งานคลัง "${w.stockName}"?\n(ปิดแบบอ่อน — ข้อมูลเก็บไว้, ไม่แสดงใน dropdown)`)) return;
    try { await deleteCentralWarehouse(w.stockId); await load(); }
    catch (e) { alert(e.message); }
  };

  if (formOpen) {
    return (
      <WarehouseForm editing={editing} onClose={() => { setFormOpen(false); setEditing(null); }}
        onSaved={async () => {
          setFormOpen(false); setEditing(null);
          await load();
          // Phase 15.1 — let parent CentralStockTab refresh its warehouse list +
          // jump to balance after the first warehouse is created.
          if (typeof onAfterCreate === 'function' && !editing) {
            try { await onAfterCreate(); } catch (e) { console.error('[CentralWarehousePanel] onAfterCreate failed:', e); }
          }
        }} />
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: '1.5px solid rgba(244,63,94,0.15)' }}>
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center bg-purple-900/30 border border-purple-800">
            <Warehouse size={22} className="text-purple-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[var(--tx-heading)]">คลังกลาง (Central Warehouses)</h2>
            <p className="text-xs text-[var(--tx-muted)]">จัดการคลังกลาง — ใช้เป็นต้นทาง/ปลายทางสำหรับย้ายและเบิกสต็อก</p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[var(--tx-muted)] cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="accent-purple-500" />
            แสดงที่ปิดใช้งาน
          </label>
          <button onClick={() => { setEditing(null); setFormOpen(true); }}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 flex items-center gap-1.5">
            <Plus size={14} /> เพิ่มคลัง
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 text-[var(--tx-muted)] text-xs">
          <Loader2 size={16} className="animate-spin mr-2" /> กำลังโหลด...
        </div>
      ) : warehouses.length === 0 ? (
        <div className="bg-[var(--bg-surface)] rounded-2xl p-8 text-center border border-[var(--bd)]">
          <Warehouse size={32} className="mx-auto text-[var(--tx-muted)] mb-2" />
          <p className="text-xs text-[var(--tx-muted)]">ยังไม่มีคลังกลาง — กด "เพิ่มคลัง"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {warehouses.map(w => (
            <div key={w.stockId} className={`bg-[var(--bg-surface)] rounded-xl p-4 border ${w.isActive === false ? 'opacity-60 border-[var(--bd)]' : 'border-purple-900/50'} shadow`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
                    <Warehouse size={14} className="text-purple-400" /> {w.stockName}
                    {w.isActive === false && <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-900/30 text-red-400 border border-red-800">ปิด</span>}
                  </h3>
                  <p className="text-[10px] font-mono text-[var(--tx-muted)]">{w.stockId}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => { setEditing(w); setFormOpen(true); }}
                    className="p-1.5 rounded bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-purple-400 border border-[var(--bd)]" title="แก้ไข">
                    <Edit3 size={11} />
                  </button>
                  {w.isActive !== false && (
                    <button onClick={() => handleDelete(w)}
                      className="p-1.5 rounded bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-red-400 border border-[var(--bd)]" title="ปิดใช้งาน">
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              </div>
              <div className="space-y-1 text-[11px] text-[var(--tx-muted)]">
                {w.telephoneNumber && <div className="flex items-center gap-1.5"><Phone size={10} /> {w.telephoneNumber}</div>}
                {w.address && <div className="flex items-start gap-1.5"><MapPin size={10} className="mt-0.5 flex-shrink-0" /> <span className="line-clamp-2">{w.address}</span></div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WarehouseForm({ editing, onClose, onSaved }) {
  const [name, setName] = useState(editing?.stockName || '');
  const [phone, setPhone] = useState(editing?.telephoneNumber || '');
  const [address, setAddress] = useState(editing?.address || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const isEdit = !!editing;

  const handleSave = async () => {
    if (!name.trim()) { setError('กรุณากรอกชื่อคลัง'); return; }
    setSaving(true); setError('');
    try {
      if (isEdit) await updateCentralWarehouse(editing.stockId, { stockName: name, telephoneNumber: phone, address });
      else await createCentralWarehouse({ stockName: name, telephoneNumber: phone, address });
      setSuccess(true);
      setTimeout(onSaved, 500);
    } catch (e) { setError(e.message); setSaving(false); }
  };

  const inputCls = `w-full px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] border border-[var(--bd)] text-[var(--tx-primary)] focus:outline-none focus:border-purple-500`;
  const labelCls = 'block text-[10px] uppercase tracking-wider text-[var(--tx-muted)] mb-1 font-bold';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 bg-[var(--bg-surface)] rounded-2xl p-4 shadow-lg border border-[var(--bd)]">
        <button onClick={onClose}
          className="px-3 py-2 rounded-lg text-xs bg-[var(--bg-hover)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] border border-[var(--bd)] flex items-center gap-1.5">
          <ArrowLeft size={14} /> กลับ
        </button>
        <div className="flex-1">
          <h2 className="text-base font-bold text-[var(--tx-heading)]">{isEdit ? 'แก้ไขคลัง' : 'เพิ่มคลังใหม่'}</h2>
        </div>
        <button onClick={handleSave} disabled={!name.trim() || saving}
          className="px-5 py-2 rounded-lg text-xs font-bold bg-purple-700 text-white hover:bg-purple-600 disabled:opacity-40 flex items-center gap-1.5">
          {saving ? <Loader2 size={14} className="animate-spin" /> : success ? <CheckCircle2 size={14} /> : <Plus size={14} />}
          {isEdit ? 'บันทึก' : 'เพิ่ม'}
        </button>
      </div>
      {error && <div className="bg-red-950/40 border border-red-800 rounded-lg p-3 text-xs text-red-400 flex items-start gap-2"><AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {error}</div>}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg border border-[var(--bd)] space-y-3">
        <div>
          <label className={labelCls}>ชื่อคลัง *</label>
          <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="เช่น คลังกลาง กรุงเทพ" />
        </div>
        <div>
          <label className={labelCls}>เบอร์โทรศัพท์</label>
          <input type="text" value={phone} onChange={e => setPhone(e.target.value)} className={inputCls} placeholder="0X-XXXX-XXXX" />
        </div>
        <div>
          <label className={labelCls}>ที่อยู่</label>
          <textarea value={address} onChange={e => setAddress(e.target.value)} rows={3}
            className={`${inputCls} resize-none`} placeholder="ที่อยู่คลัง" />
        </div>
      </div>
    </div>
  );
}
