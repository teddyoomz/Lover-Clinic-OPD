// ─── CrossBranchImportModal — Phase 17.1 ──────────────────────────────────
// Entity-agnostic modal. Renders source-branch picker + preview table with
// dedup + FK-check greying + select-all + Import button. POSTs to
// /api/admin/cross-branch-import on confirm.
//
// Driven entirely by props.adapter — see src/lib/crossBranchImportAdapters/.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import * as scopedDataLayer from '../../lib/scopedDataLayer.js';
import { auth } from '../../firebase.js';

const LISTER_NAME_BY_COLLECTION = {
  'be_products': 'listProducts',
  'be_product_groups': 'listProductGroups',
  'be_product_unit_groups': 'listProductUnitGroups',
  'be_medical_instruments': 'listMedicalInstruments',
  'be_holidays': 'listHolidays',
  'be_courses': 'listCourses',
  'be_df_groups': 'listDfGroups',
};

function listForCollection(collection, opts) {
  const fnName = LISTER_NAME_BY_COLLECTION[collection];
  const fn = scopedDataLayer[fnName];
  if (typeof fn !== 'function') {
    throw new Error(`No lister exported from scopedDataLayer for ${collection}`);
  }
  return fn(opts);
}

export default function CrossBranchImportModal({ adapter, isDark, onClose, onImported }) {
  const { branchId: targetBranchId } = useSelectedBranch();

  const [branches, setBranches] = useState([]);
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [sourceItems, setSourceItems] = useState([]);
  const [targetItems, setTargetItems] = useState([]);
  const [fkSourceMaps, setFkSourceMaps] = useState({});  // {col: {id: dedupKey}}
  const [fkTargetSets, setFkTargetSets] = useState({});  // {col: Set<dedupKey>}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  // Load branches list on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await scopedDataLayer.listBranches();
        if (!cancelled) {
          setBranches((list || []).filter(b => b && b.branchId !== targetBranchId && b.status !== 'พักใช้งาน'));
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'โหลดสาขาล้มเหลว');
      }
    })();
    return () => { cancelled = true; };
  }, [targetBranchId]);

  // Load source / target / FK data on source pick.
  const loadPreview = useCallback(async () => {
    if (!sourceBranchId) return;
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    try {
      const [src, tgt] = await Promise.all([
        listForCollection(adapter.collection, { branchId: sourceBranchId }),
        listForCollection(adapter.collection, { branchId: targetBranchId }),
      ]);

      // Compute FK collections needed (union of fkRefs across all source items).
      const fkRefs = (src || []).flatMap(item => adapter.fkRefs(item));
      const fkCollections = [...new Set(fkRefs.map(r => r.collection))];

      const fkSrcMaps = {};
      const fkTgtSets = {};
      for (const col of fkCollections) {
        const [srcFk, tgtFk] = await Promise.all([
          listForCollection(col, { branchId: sourceBranchId }),
          listForCollection(col, { branchId: targetBranchId }),
        ]);
        // We need the FK adapter to compute dedupKey for source FK lookup;
        // dynamically import the registry so this stays adapter-agnostic.
        const { getAdapter } = await import('../../lib/crossBranchImportAdapters/index.js');
        const fkEntityType = (
          col === 'be_products' ? 'products' :
          col === 'be_product_groups' ? 'product-groups' :
          col === 'be_product_unit_groups' ? 'product-units' : null
        );
        const fkAdapter = fkEntityType ? getAdapter(fkEntityType) : null;
        const idKey = (
          col === 'be_products' ? 'productId' :
          col === 'be_product_groups' ? 'groupId' :
          col === 'be_product_unit_groups' ? 'unitGroupId' : 'id'
        );
        const srcMap = {};
        (srcFk || []).forEach(f => {
          const id = String(f[idKey] || f.id || '');
          if (id && fkAdapter) srcMap[id] = fkAdapter.dedupKey(f);
        });
        const tgtSet = new Set((tgtFk || []).map(f => fkAdapter ? fkAdapter.dedupKey(f) : f.id));
        fkSrcMaps[col] = srcMap;
        fkTgtSets[col] = tgtSet;
      }

      setSourceItems(src || []);
      setTargetItems(tgt || []);
      setFkSourceMaps(fkSrcMaps);
      setFkTargetSets(fkTgtSets);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [sourceBranchId, targetBranchId, adapter]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // Compute classification per row.
  const classified = useMemo(() => {
    const targetDedupSet = new Set((targetItems || []).map(t => adapter.dedupKey(t)));
    return (sourceItems || []).map(item => {
      const dedupKey = adapter.dedupKey(item);
      if (targetDedupSet.has(dedupKey)) {
        return { item, status: 'dup', reason: 'ซ้ำกับ ' + dedupKey + ' ในสาขานี้' };
      }
      const refs = adapter.fkRefs(item);
      const missing = [];
      for (const ref of refs) {
        for (const refId of ref.ids) {
          const sourceKey = fkSourceMaps[ref.collection]?.[refId];
          if (!sourceKey || !fkTargetSets[ref.collection]?.has(sourceKey)) {
            missing.push({ collection: ref.collection, sourceKey: sourceKey || '(unknown)' });
          }
        }
      }
      if (missing.length > 0) {
        const summary = missing.map(m => m.sourceKey).join(', ');
        return { item, status: 'fk', reason: 'ต้อง import ก่อน: ' + summary };
      }
      return { item, status: 'ok' };
    });
  }, [sourceItems, targetItems, fkSourceMaps, fkTargetSets, adapter]);

  const importableIds = useMemo(
    () => classified.filter(c => c.status === 'ok').map(c => c.item.id),
    [classified]
  );

  const allImportableSelected = importableIds.length > 0
    && importableIds.every(id => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allImportableSelected) return new Set();
      return new Set(importableIds);
    });
  };

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch('/api/admin/cross-branch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          entityType: adapter.entityType,
          sourceBranchId,
          targetBranchId,
          itemIds: Array.from(selectedIds),
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Import failed: ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
      if (typeof onImported === 'function') onImported(data);
    } catch (e) {
      setError(e.message || 'Import ล้มเหลว');
    } finally {
      setImporting(false);
    }
  };

  const overlayCls = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm';
  const panelCls = `w-[90vw] max-w-3xl max-h-[85vh] flex flex-col rounded-xl shadow-xl ${
    isDark ? 'bg-[#111] border border-[#333] text-gray-200' : 'bg-white border border-gray-200 text-gray-800'
  }`;

  return (
    <div className={overlayCls} role="dialog" aria-modal="true" aria-label="Cross-branch import">
      <div className={panelCls}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-inherit">
          <h3 className="text-base font-semibold">Copy {adapter.entityType} จากสาขาอื่น</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {!result && (
            <>
              {/* Source picker */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  สาขาต้นทาง
                </label>
                <select
                  value={sourceBranchId}
                  onChange={(e) => setSourceBranchId(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                    isDark ? 'bg-[#1a1a1a] border border-[#333]' : 'bg-gray-50 border border-gray-200'
                  }`}
                  data-testid="cross-branch-source-picker"
                >
                  <option value="">-- เลือกสาขา --</option>
                  {branches.map(b => (
                    <option key={b.branchId} value={b.branchId}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Loading / Error / Preview */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-purple-400" />
                  <span className="text-xs text-gray-500 ml-2">กำลังโหลด...</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-900/20 border border-rose-800/40 text-rose-300 text-xs">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!loading && !error && sourceBranchId && classified.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allImportableSelected}
                        onChange={toggleAll}
                        data-testid="cross-branch-select-all"
                      />
                      <span>เลือกทั้งหมด ({importableIds.length} รายการ)</span>
                    </label>
                    <span>{classified.length} รายการ ({importableIds.length} import ได้)</span>
                  </div>
                  <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                    {classified.map(({ item, status, reason }) => {
                      const disabled = status !== 'ok';
                      const row = adapter.displayRow(item);
                      const rowCls = disabled
                        ? (status === 'dup'
                          ? 'opacity-40 grayscale'
                          : 'opacity-50 ring-1 ring-rose-800/40')
                        : 'hover:bg-white/5';
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-2 p-2 rounded ${rowCls} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          title={disabled ? reason : ''}
                          data-testid={`cross-branch-row-${item.id}`}
                          data-status={status}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            disabled={disabled}
                            onChange={() => toggleOne(item.id)}
                            data-testid={`cross-branch-row-checkbox-${item.id}`}
                          />
                          <div className="flex-1 text-xs">
                            <div className="font-medium">{row.primary}</div>
                            {row.secondary && <div className="text-gray-500">{row.secondary}</div>}
                            {row.tertiary && <div className="text-gray-600">{row.tertiary}</div>}
                            {disabled && <div className="text-rose-400 mt-1">{reason}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && !error && sourceBranchId && classified.length === 0 && (
                <div className="text-xs text-gray-500 text-center py-8">
                  ไม่พบข้อมูลในสาขาต้นทาง
                </div>
              )}
            </>
          )}

          {/* Result panel */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800/40 text-emerald-300 text-xs">
                <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>Import สำเร็จ {result.imported.length} รายการ ({result.skippedDup.length} ซ้ำ • {result.skippedFK.length} ขาด FK)</span>
              </div>
              <div className="text-xs text-gray-500">
                Audit: <code>{result.auditId}</code>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-inherit">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg hover:bg-white/10"
            data-testid="cross-branch-cancel-btn"
          >
            {result ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importing}
              className={`px-4 py-1.5 text-xs rounded-lg font-medium ${
                selectedIds.size === 0 || importing
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
              data-testid="cross-branch-import-confirm-btn"
            >
              {importing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  กำลัง import...
                </span>
              ) : (
                <span>Import {selectedIds.size} รายการ</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
