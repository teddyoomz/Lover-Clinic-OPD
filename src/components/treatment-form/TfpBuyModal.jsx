// ─── TfpBuyModal — TreatmentFormPage buy modal (ซื้อโปรโมชัน/คอร์ส/สินค้า) ────
// TFP extraction step 3 (2026-07-19, extraction-only refactor): the buy modal
// JSX moved VERBATIM out of TreatmentFormPage.jsx. This is the MONEY-CRITICAL
// modal (V13 whitelist history · V42 qty multiplier · V162 purchaseUid) — the
// strictest extraction gates apply:
//   - MONEY state + handlers stay in TreatmentFormPage (threaded as explicit
//     props): buyChecked/qty/disc/vat maps + openBuyModal (fetch + whitelist),
//     toggleBuyCheck, confirmBuyModal (buildPurchasedCourseEntry / purchaseUid
//     path) are TFP closures — this file contains ZERO buy MONEY logic.
//   - keystroke isolation (2026-07-19 EOD+2, perf punchlist #20): the
//     VIEW-FILTER state (buyQuery / buySelectedCat / buyShowLimit + the
//     buyFilteredItems memo, moved verbatim from TFP:1773-1782) is owned HERE
//     so a search keystroke re-renders THIS modal only — not the 5.3k-line
//     money form. Reset semantics preserved: fresh state per open (the TFP
//     callsite mount-conditional unmounts us) + reset-on-type-switch via the
//     [buyModalType] effect (replaces the resets openBuyModal used to do).
//   - the `{buyModalOpen && (...)}` mount-conditional stays at the TFP
//     callsite (mount model unchanged — V160 lesson).
//   - AV78 backdrop-no-close + ModalScrollLock (AV205) preserved verbatim.

import { useState, useMemo, useEffect } from 'react';
import { Loader2, Search } from 'lucide-react';
import { ModalScrollLock } from '../../lib/useModalScrollLock.js';
import { aaAccent } from '../../lib/themeAccent.js';

export function TfpBuyModal({
  isDark, inputCls, selectCls,
  buyModalType, setBuyModalType,
  buyItems,
  buyCategories, buyLoading,
  buyChecked, setBuyChecked,
  buyQtyMap, setBuyQtyMap,
  buyDiscMap, setBuyDiscMap,
  buyVatMap, setBuyVatMap,
  toggleBuyCheck, openBuyModal, confirmBuyModal, setBuyModalOpen,
}) {
  // View-filter state (keystroke isolation #20) — see header comment.
  const [buyQuery, setBuyQuery] = useState('');
  const [buySelectedCat, setBuySelectedCat] = useState('');
  const [buyShowLimit, setBuyShowLimit] = useState(50);
  // Type switch (select / sidebar) resets the view filters — byte-identical to
  // the resets openBuyModal performed pre-isolation. Also fires on mount (no-op).
  useEffect(() => {
    setBuyQuery('');
    setBuySelectedCat('');
    setBuyShowLimit(50);
  }, [buyModalType]);
  // Moved verbatim from TreatmentFormPage (pre-isolation lines 1773-1782).
  const buyFilteredItems = useMemo(() => {
    let items = buyItems[buyModalType] || [];
    if (buySelectedCat) items = items.filter(i => i.category === buySelectedCat);
    if (buyQuery) {
      const q = buyQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [buyItems, buyModalType, buySelectedCat, buyQuery]);
  const buyVisibleItems = buyFilteredItems.slice(0, buyShowLimit);

  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-treat-buy" onKeyDown={e => { if (e.key === 'Escape') setBuyModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-5xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 id="modal-title-treat-buy" className="text-sm font-black" style={{ color: aaAccent('#14b8a6', isDark) }}>ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input value={buyQuery} onChange={e => setBuyQuery(e.target.value)}
                className={`${inputCls} !pl-8 !w-48`} placeholder="ค้นหาด้วยชื่อ" />
            </div>
            <select value={buyModalType} onChange={e => { setBuyModalType(e.target.value); setBuySelectedCat(''); setBuyChecked(new Set()); setBuyQtyMap({}); setBuyDiscMap({}); setBuyVatMap({}); openBuyModal(e.target.value); /* Phase 17.2-quinquies: always re-fetch on tab switch */ }}
              className={`${selectCls} !w-auto !text-xs`}>
              <option value="course">คอร์ส</option>
              <option value="promotion">โปรโมชัน</option>
              <option value="product">สินค้าหน้าร้าน</option>
            </select>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left sidebar — categories */}
          <div className={`w-48 shrink-0 border-r overflow-y-auto ${isDark ? 'border-[#222] bg-[#0a0a0a]' : 'border-gray-200 bg-gray-50'}`}>
            {['promotion', 'course', 'product'].map(type => {
              const cats = buyCategories[type] || [];
              const typeLabel = type === 'promotion' ? 'โปรโมชัน' : type === 'course' ? 'คอร์ส' : 'สินค้าหน้าร้าน';
              const isActiveType = buyModalType === type;
              return (
                <div key={type}>
                  <button onClick={() => { setBuyModalType(type); setBuySelectedCat(''); openBuyModal(type); /* Phase 17.2-quinquies: always re-fetch on tab switch */ }}
                    className={`w-full text-left px-3 py-2 text-xs font-bold border-b flex items-center justify-between ${
                      isActiveType ? 'text-teal-500' : isDark ? 'text-gray-400 border-[#1a1a1a]' : 'text-gray-600 border-gray-100'
                    } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                    {typeLabel}
                    <span className="text-xs">{isActiveType ? '▼' : '▶'}</span>
                  </button>
                  {isActiveType && (
                    <div>
                      <button onClick={() => setBuySelectedCat('')}
                        className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                          !buySelectedCat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                        } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                        {typeLabel}ทั้งหมด
                      </button>
                      {cats.map(cat => (
                        <button key={cat} onClick={() => setBuySelectedCat(cat)}
                          className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                            buySelectedCat === cat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                          } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Right — items table */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="overflow-x-auto overflow-y-auto flex-1">
              {buyLoading ? (
                <div className="flex items-center justify-center gap-2 py-12"><Loader2 size={16} className="animate-spin text-teal-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: isDark ? '#0e0e0e' : 'white' }}>
                    <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                      <th className="text-left py-2 px-2 w-8"></th>
                      <th className="text-left py-2 px-2">รายการ ({buyFilteredItems.length} รายการ)</th>
                      <th className="text-center py-2 px-2 w-16">จำนวน</th>
                      <th className="text-center py-2 px-2 w-12">หน่วย</th>
                      <th className="text-center py-2 px-2 w-24">ราคาต่อหน่วย</th>
                      <th className="text-center py-2 px-2 w-24">ส่วนลดต่อหน่วย</th>
                      <th className="text-center py-2 px-2 w-16">VAT 7%</th>
                      <th className="text-center py-2 px-2 w-24">ราคาสุทธิต่อหน่วย</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buyVisibleItems.map(item => {
                      const checked = buyChecked.has(item.id);
                      const qty = parseInt(buyQtyMap[item.id]) || 0;
                      const disc = parseFloat(buyDiscMap[item.id]) || 0;
                      const vat = !!buyVatMap[item.id];
                      const price = parseFloat(item.price) || 0;
                      const afterDisc = price - disc;
                      const vatAmt = vat ? afterDisc * 0.07 : 0;
                      const net = Math.max(0, afterDisc + vatAmt);
                      return (
                        <tr key={item.id} className={`border-t ${checked ? isDark ? 'bg-teal-500/10' : 'bg-teal-50' : ''} ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                          <td className="py-2 px-2">
                            <input type="checkbox" checked={checked} onChange={() => toggleBuyCheck(item.id)}
                              className="w-3.5 h-3.5 rounded accent-teal-500" />
                          </td>
                          <td className="py-2 px-2 font-medium">
                            <div className="flex items-center gap-2 min-w-0">
                              {buyModalType === 'promotion' && item.cover_image && (
                                <img src={item.cover_image} alt="" loading="lazy"
                                  className="w-6 h-6 rounded object-cover flex-shrink-0 border border-[var(--bd)]"
                                  onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              )}
                              <span className="truncate">{item.name}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2">
                            <input type="number" data-wheelable value={buyQtyMap[item.id] || ''} min="0"
                              onChange={e => setBuyQtyMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={`${inputCls} text-center !py-1 !text-xs !w-20`} />
                          </td>
                          <td className="py-2 px-2 text-center text-gray-500">{item.unit || (buyModalType === 'course' ? 'คอร์ส' : buyModalType === 'promotion' ? 'โปรโมชัน' : '-')}</td>
                          <td className="py-2 px-2 text-center">{(Number(item.price) || 0).toFixed(2)}</td>
                          <td className="py-2 px-2">
                            <input type="number" value={buyDiscMap[item.id] || ''} min="0"
                              onChange={e => setBuyDiscMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                              className={`${inputCls} text-center !py-1 !text-xs !w-20`} />
                          </td>
                          <td className="py-2 px-2 text-center">
                            <input type="checkbox" checked={vat}
                              onChange={e => setBuyVatMap(prev => ({ ...prev, [item.id]: e.target.checked }))}
                              className="w-3.5 h-3.5 rounded accent-teal-500" />
                          </td>
                          <td className="py-2 px-2 text-center font-medium">{net.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
            {/* Load more + Selected count */}
            <div className={`px-4 py-2 border-t text-xs text-gray-500 flex items-center justify-between ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
              <span>รายการที่เลือก ({buyChecked.size} รายการ) | แสดง {buyVisibleItems.length}/{buyFilteredItems.length}</span>
              {buyShowLimit < buyFilteredItems.length && (
                <button onClick={() => setBuyShowLimit(p => p + 50)} className="text-teal-400 hover:text-teal-300 font-bold">โหลดเพิ่ม +50</button>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <button onClick={() => setBuyModalOpen(false)}
            className={`px-8 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button onClick={confirmBuyModal} disabled={buyChecked.size === 0}
            className="px-8 py-2 rounded-lg text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
