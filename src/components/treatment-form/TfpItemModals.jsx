// ─── TfpItemModals — TreatmentFormPage item-entry modals ─────────────────────
// TFP extraction step 2 (2026-07-07, extraction-only refactor): the lab / med /
// med-group / remed / consumable / consumable-group modal JSX moved VERBATIM out
// of TreatmentFormPage.jsx. Zero behavior change:
//   - ALL state + handlers stay in TreatmentFormPage (threaded as explicit props)
//   - the `{xxxModalOpen && (...)}` mount-conditional stays at the TFP callsite
//     (mount model unchanged — V160 lesson: open === mount for these modals)
//   - AV78 backdrop-no-close + ModalScrollLock (AV205) preserved verbatim
// The buy modal (ซื้อคอร์ส/โปร/สินค้า) is NOT here — it is money-critical (V13
// whitelist history) and stays in TFP until its own dedicated extraction step.

import { Loader2, Search, Trash2 } from 'lucide-react';
import { ModalScrollLock } from '../../lib/useModalScrollLock.js';
import { aaAccent } from '../../lib/themeAccent.js';
import { LabPriceSummary, MedPriceSummary } from './TfpFormPrimitives.jsx';

// ── Lab item add/edit modal ─────────────────────────────────────────────────
export function LabItemModal({
  isDark, labelCls, inputCls, selectCls,
  editingLabIndex, labModalLoading, labProducts,
  labModalSelected, setLabModalSelected,
  labModalQty, setLabModalQty,
  labModalPrice, setLabModalPrice,
  labModalDiscount, setLabModalDiscount,
  labModalDiscountType, setLabModalDiscountType,
  labModalVat, setLabModalVat,
  labItems, setLabItems, setLabModalOpen,
}) {
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-lab" onKeyDown={e => { if (e.key === 'Escape') setLabModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 mx-4 ${isDark ? 'bg-[#111] border border-[#333]' : 'bg-white'}`} onClick={e => e.stopPropagation()}>
        <h4 id="modal-title-lab" className="text-sm font-bold text-cyan-500 mb-4">{editingLabIndex >= 0 ? 'แก้ไข Lab' : 'เพิ่ม Lab'}</h4>
        {labModalLoading ? <div className="text-center py-6"><Loader2 size={20} className="animate-spin mx-auto text-gray-500" /></div> : (
          <div className="space-y-3">
            <div>
              <label className={labelCls}>เลือก Lab</label>
              <select value={labModalSelected?.id || ''} onChange={e => {
                const p = labProducts.find(p => String(p.id) === e.target.value);
                if (p) { setLabModalSelected(p); setLabModalPrice(p.price || '0'); setLabModalVat(!!p.isVatIncluded); }
              }} className={selectCls} disabled={editingLabIndex >= 0}>
                <option value="">-- เลือก --</option>
                {labProducts.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>จำนวน</label>
                <input type="number" step="0.01" min="0.01" value={labModalQty} onChange={e => setLabModalQty(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>ราคาต่อหน่วย</label>
                <input type="number" step="0.01" min="0" value={labModalPrice} onChange={e => setLabModalPrice(e.target.value)} className={inputCls} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>ส่วนลด</label>
                <input type="number" step="0.01" min="0" value={labModalDiscount} onChange={e => setLabModalDiscount(e.target.value)} className={inputCls} placeholder="0" />
              </div>
              <div>
                <label className={labelCls}>ประเภทส่วนลด</label>
                <select value={labModalDiscountType} onChange={e => setLabModalDiscountType(e.target.value)} className={selectCls}>
                  <option value="amount">บาท</option>
                  <option value="percent">%</option>
                </select>
              </div>
            </div>
            <label className="flex items-center gap-2 text-xs text-gray-400">
              <input type="checkbox" checked={labModalVat} onChange={e => setLabModalVat(e.target.checked)} /> VAT 7%
            </label>
            {/* Lab price summary — pre-computed (no IIFE, Vite OXC safe) */}
            <LabPriceSummary price={labModalPrice} discount={labModalDiscount} discountType={labModalDiscountType} vat={labModalVat} isDark={isDark} />
            <div className="flex gap-2 pt-2">
              <button onClick={() => setLabModalOpen(false)} className={`flex-1 py-2 rounded-lg text-xs font-bold border ${isDark ? 'border-[#333] text-gray-400' : 'border-gray-300 text-gray-500'}`}>ยกเลิก</button>
              <button disabled={!labModalSelected} onClick={() => {
                const p = parseFloat(labModalPrice) || 0;
                const d = parseFloat(labModalDiscount) || 0;
                const afterDisc = labModalDiscountType === 'percent' ? p * (1 - d/100) : p - d;
                const vat = labModalVat ? afterDisc * 0.07 : 0;
                const finalPrice = (afterDisc + vat).toFixed(2);
                const existing = editingLabIndex >= 0 ? labItems[editingLabIndex] : null;
                const item = {
                  id: existing?.id || '',
                  productId: labModalSelected.id, productName: labModalSelected.name, unitName: labModalSelected.unit || '',
                  qty: labModalQty || '1', price: finalPrice, originalPrice: labModalPrice,
                  discount: labModalDiscount || '0', discountType: labModalDiscountType === 'percent' ? '%' : 'บาท',
                  isVatIncluded: labModalVat, rowId: existing?.rowId || '',
                  information: existing?.information || '',
                  images: existing?.images || [],
                  fileId: existing?.fileId || '', pdfBase64: existing?.pdfBase64 || '', pdfFileName: existing?.pdfFileName || '',
                };
                if (editingLabIndex >= 0) {
                  setLabItems(prev => prev.map((l, i) => i === editingLabIndex ? item : l));
                } else {
                  setLabItems(prev => [...prev, item]);
                }
                setLabModalOpen(false);
              }} className="flex-1 py-2 rounded-lg text-xs font-bold bg-cyan-600 text-white disabled:opacity-40">ยืนยัน</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Take-home medication add/edit modal (matching ProClinic) ────────────────
export function MedItemModal({
  isDark, labelCls, inputCls,
  editingMedIndex, medModalLoading, medFilteredProducts, selectMedProduct,
  medModalQuery, setMedModalQuery,
  medModalSelected, setMedModalSelected,
  medModalQty, setMedModalQty,
  medModalPrice, setMedModalPrice,
  medModalPremium, setMedModalPremium,
  medModalDiscount, setMedModalDiscount,
  medModalDiscountType, setMedModalDiscountType,
  medModalVat, setMedModalVat,
  medModalLabelOpen, setMedModalLabelOpen,
  confirmMedModal, setMedModalOpen,
}) {
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-med" onKeyDown={e => { if (e.key === 'Escape') setMedModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 id="modal-title-med" className="text-sm font-black" style={{ color: aaAccent('#10b981', isDark) }}>{editingMedIndex >= 0 ? 'แก้ไขยากลับบ้าน' : 'เพิ่มยากลับบ้าน'}</h3>
        </div>
        <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          {/* Product select with search */}
          <div>
            <label className={labelCls}>ยากลับบ้าน *</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
              <input value={medModalSelected ? medModalSelected.name : medModalQuery}
                onChange={e => { setMedModalQuery(e.target.value); setMedModalSelected(null); }}
                onFocus={() => { if (medModalSelected) { setMedModalQuery(medModalSelected.name); setMedModalSelected(null); } }}
                className={`${inputCls} !pl-8`} placeholder="เลือกยากลับบ้าน" autoFocus />
            </div>
            {!medModalSelected && (
              <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                {medModalLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                ) : medFilteredProducts.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">ไม่พบรายการ</p>
                ) : medFilteredProducts.map(p => (
                  <button key={p.id} onClick={() => selectMedProduct(p)}
                    className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                    <div>
                      <span className="font-bold">{p.name}</span>
                      {p.category && <span className="text-xs text-gray-500 ml-2">[{p.category}]</span>}
                    </div>
                    <span className="text-xs text-gray-500 whitespace-nowrap ml-2">฿{p.price} / {p.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Qty + Unit + Price */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className={labelCls}>จำนวน *</label>
              <div className="flex">
                <input type="number" value={medModalQty} onChange={e => setMedModalQty(e.target.value)}
                  className={`${inputCls} rounded-r-none`} placeholder="กรอกจำนวน" />
                <span className={`flex items-center px-2 text-xs border border-l-0 rounded-r-lg ${isDark ? 'border-[#333] bg-[#1a1a1a] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                  {medModalSelected?.unit || 'หน่วย'}
                </span>
              </div>
            </div>
            <div>
              <label className={labelCls}>ราคาต่อหน่วย *</label>
              <input type="number" value={medModalPrice} onChange={e => setMedModalPrice(e.target.value)}
                className={inputCls} placeholder="กรอกราคาต่อหน่วย" />
            </div>
            <div className="flex items-end pb-2">
              <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
                <input type="checkbox" checked={medModalPremium} onChange={e => setMedModalPremium(e.target.checked)}
                  className="w-3.5 h-3.5 rounded accent-emerald-500" />
                สินค้าของแถม
              </label>
            </div>
          </div>
          {/* Price summary */}
          <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">สรุปราคาต่อหน่วย</p>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-24 shrink-0">ส่วนลดต่อหน่วย</span>
              <input type="number" value={medModalDiscount} onChange={e => setMedModalDiscount(e.target.value)}
                className={`${inputCls} !w-24`} placeholder="0" />
              <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                <input type="radio" name="medDiscType" checked={medModalDiscountType === 'amount'} onChange={() => setMedModalDiscountType('amount')} className="w-3 h-3" /> บาท
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-400 cursor-pointer">
                <input type="radio" name="medDiscType" checked={medModalDiscountType === 'percent'} onChange={() => setMedModalDiscountType('percent')} className="w-3 h-3" /> %
              </label>
            </div>
            {/* Med price summary — extracted from IIFE (Vite OXC safe) */}
            <MedPriceSummary price={medModalPrice} discount={medModalDiscount} discountType={medModalDiscountType} vat={medModalVat} onVatChange={setMedModalVat} premium={medModalPremium} isDark={isDark} />
          </div>
          {/* Label info (expandable) */}
          <div>
            <button onClick={() => setMedModalLabelOpen(!medModalLabelOpen)}
              className={`flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-400 transition-colors`}>
              <span className={`transition-transform ${medModalLabelOpen ? 'rotate-90' : ''}`}>▶</span>
              ข้อมูลฉลากยา
            </button>
            {medModalLabelOpen && medModalSelected?.label && (
              <div className={`mt-2 rounded-lg border p-3 space-y-2 text-xs ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                <div><span className="text-xs font-bold text-gray-500">ชื่อสามัญ:</span> <span className="text-gray-400">{medModalSelected.label.genericName || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-500">ข้อบ่งใช้:</span> <span className="text-gray-400">{medModalSelected.label.indications || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-500">รับประทานครั้งละ:</span> <span className="text-gray-400">{medModalSelected.label.dosageAmount || '-'} {medModalSelected.label.dosageUnit || ''}</span></div>
                <div><span className="text-xs font-bold text-gray-500">วันละ:</span> <span className="text-gray-400">{medModalSelected.label.timesPerDay || '-'} ครั้ง</span></div>
                <div><span className="text-xs font-bold text-gray-500">วิธีรับประทาน:</span> <span className="text-gray-400">{medModalSelected.label.administrationMethod || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-500">ช่วงเวลา:</span> <span className="text-gray-400">{medModalSelected.label.administrationTimes || '-'}</span></div>
                <div><span className="text-xs font-bold text-gray-500">คำแนะนำ:</span> <span className="text-gray-400">{medModalSelected.label.instructions || '-'}</span></div>
              </div>
            )}
          </div>
        </div>
        {/* Footer */}
        <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <button onClick={() => setMedModalOpen(false)}
            className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button onClick={confirmMedModal} disabled={!medModalSelected}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Medication group modal — full overlay matching ProClinic ────────────────
export function MedGroupModal({
  isDark, selectCls,
  medGroupSelectedId, setMedGroupSelectedId,
  medGroupData, medGroupLoading,
  medGroupChecked, setMedGroupChecked, toggleMedGroupCheck,
  selectedGroupProducts, confirmMedGroup, setMedGroupModalOpen,
}) {
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-med-group" onKeyDown={e => { if (e.key === 'Escape') setMedGroupModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 id="modal-title-med-group" className="text-sm font-black" style={{ color: aaAccent('#10b981', isDark) }}>เพิ่มยากลับบ้าน</h3>
          <select value={medGroupSelectedId}
            onChange={e => {
              setMedGroupSelectedId(e.target.value);
              const g = medGroupData.find(g => String(g.id) === e.target.value);
              setMedGroupChecked(new Set((g?.products || []).map((_, i) => i)));
            }}
            className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
            {medGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
        </div>
        {/* Table */}
        <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          {medGroupLoading ? (
            <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มยา...</span></div>
          ) : selectedGroupProducts.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มยากลับบ้าน</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <th className="text-left py-1.5 pr-2 w-8"></th>
                  <th className="text-left py-1.5">รายการยากลับบ้าน ({selectedGroupProducts.length} รายการ)</th>
                  <th className="text-center py-1.5 w-16">จำนวน</th>
                  <th className="text-center py-1.5 w-12">หน่วย</th>
                  <th className="text-center py-1.5 w-20">ราคาต่อหน่วย</th>
                </tr>
              </thead>
              <tbody>
                {selectedGroupProducts.map((p, i) => (
                  <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={medGroupChecked.has(i)} onChange={() => toggleMedGroupCheck(i)}
                        className="w-3.5 h-3.5 rounded accent-emerald-500" />
                    </td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                    <td className="py-2 text-center text-gray-500">{p.unit}</td>
                    <td className="py-2 text-center">{parseFloat(p.price).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Selected items chips */}
        {medGroupChecked.size > 0 && (
          <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-500 mb-1.5">รายการที่เลือก ({medGroupChecked.size} รายการ)</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedGroupProducts.map((p, i) => medGroupChecked.has(i) && (
                <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                  {p.name} ({parseFloat(p.qty)} {p.unit})
                  <button onClick={() => toggleMedGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Footer buttons */}
        <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <button onClick={() => setMedGroupModalOpen(false)}
            className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button onClick={confirmMedGroup} disabled={medGroupChecked.size === 0}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Remed panel — past medications from treatment history (inline, not overlay) ──
export function RemedPanel({ isDark, options, setMedications, setRemedModalOpen }) {
  return (
    <div className={`rounded-lg border p-3 mb-3 ${isDark ? 'border-sky-900/30 bg-[#0a0c14]' : 'border-sky-200 bg-sky-50/30'}`}>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-xs font-bold text-sky-400 uppercase tracking-widest">ประวัติการสั่งยา (Remed)</p>
        <button onClick={() => setRemedModalOpen(false)} aria-label="ปิดประวัติการสั่งยา" className="ml-auto text-gray-400 hover:text-gray-300 p-1"><Trash2 size={12} /></button>
      </div>
      {(options?.remedItems || []).length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-4">ไม่พบประวัติการสั่งยาของผู้ป่วยรายนี้</p>
      ) : (
        <div className={`rounded-lg border max-h-48 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
          {options.remedItems.map((item, idx) => (
            <button key={idx} onClick={() => {
              setMedications(prev => [...prev, {
                id: item.productId || `remed-${idx}`,
                name: item.name,
                dosage: '',
                qty: item.qty || '1',
                unitPrice: item.price || '0',
                unit: '',
              }]);
            }}
              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
              <span className="font-bold">{item.name}</span>
              <span className="text-xs text-gray-500">
                x{item.qty} {item.price !== '0' && item.price !== '0.00' ? `฿${item.price}` : ''}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Consumable add modal (matching ProClinic) ───────────────────────────────
export function ConsItemModal({
  isDark, labelCls, inputCls,
  consModalLoading, consFilteredProducts,
  consModalQuery, setConsModalQuery,
  consModalSelected, setConsModalSelected,
  consModalQty, setConsModalQty,
  confirmConsModal, setConsModalOpen,
}) {
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-cons" onKeyDown={e => { if (e.key === 'Escape') setConsModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 id="modal-title-cons" className="text-sm font-black" style={{ color: aaAccent('#eab308', isDark) }}>เพิ่มสินค้าสิ้นเปลือง</h3>
        </div>
        <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
          <div>
            <label className={labelCls}>สินค้าสิ้นเปลือง *</label>
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
              <input value={consModalSelected ? consModalSelected.name : consModalQuery}
                onChange={e => { setConsModalQuery(e.target.value); setConsModalSelected(null); }}
                onFocus={() => { if (consModalSelected) { setConsModalQuery(consModalSelected.name); setConsModalSelected(null); } }}
                className={`${inputCls} !pl-8`} placeholder="เลือกสินค้าสิ้นเปลือง" autoFocus />
            </div>
            {!consModalSelected && (
              <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                {consModalLoading ? (
                  <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-orange-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                ) : consFilteredProducts.length === 0 ? (
                  <p className="text-xs text-gray-500 text-center py-3">ไม่พบรายการ</p>
                ) : consFilteredProducts.map(p => (
                  <button key={p.id} onClick={() => { setConsModalSelected(p); setConsModalQty('1'); }}
                    className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                    <span className="font-bold">{p.name}</span>
                    <span className="text-xs text-gray-500">{p.unit}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>จำนวน *</label>
            <input type="number" value={consModalQty} onChange={e => setConsModalQty(e.target.value)}
              className={inputCls} placeholder="กรอกจำนวน" />
          </div>
        </div>
        <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <button onClick={() => setConsModalOpen(false)}
            className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button onClick={confirmConsModal} disabled={!consModalSelected}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Consumable group modal — full overlay matching ProClinic ────────────────
export function ConsGroupModal({
  isDark, selectCls,
  consGroupSelectedId, setConsGroupSelectedId,
  consGroupData, consGroupLoading,
  consGroupChecked, setConsGroupChecked, toggleConsGroupCheck,
  selectedConsGroupProducts, confirmConsGroup, setConsGroupModalOpen,
}) {
  return (
    // AV78 (EOD8): backdrop click does NOT close — explicit close only (X / Cancel / ESC)
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 overflow-y-auto overscroll-contain" role="dialog" aria-modal="true" aria-labelledby="modal-title-cons-group" onKeyDown={e => { if (e.key === 'Escape') setConsGroupModalOpen(false); }}>
      <ModalScrollLock />
      <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <h3 id="modal-title-cons-group" className="text-sm font-black" style={{ color: aaAccent('#eab308', isDark) }}>เพิ่มสินค้าสิ้นเปลือง</h3>
          <select value={consGroupSelectedId}
            onChange={e => {
              setConsGroupSelectedId(e.target.value);
              const g = consGroupData.find(g => String(g.id) === e.target.value);
              setConsGroupChecked(new Set((g?.products || []).map((_, i) => i)));
            }}
            className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
            {consGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
        </div>
        {/* Table */}
        <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
          {consGroupLoading ? (
            <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-orange-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มสินค้า...</span></div>
          ) : selectedConsGroupProducts.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มสินค้าสิ้นเปลือง</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className={`text-[11px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  <th className="text-left py-1.5 pr-2 w-8"></th>
                  <th className="text-left py-1.5">รายการ ({selectedConsGroupProducts.length} รายการ)</th>
                  <th className="text-center py-1.5 w-16">จำนวน</th>
                  <th className="text-center py-1.5 w-12">หน่วย</th>
                </tr>
              </thead>
              <tbody>
                {selectedConsGroupProducts.map((p, i) => (
                  <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                    <td className="py-2 pr-2">
                      <input type="checkbox" checked={consGroupChecked.has(i)} onChange={() => toggleConsGroupCheck(i)}
                        className="w-3.5 h-3.5 rounded accent-orange-500" />
                    </td>
                    <td className="py-2 font-medium">{p.name}</td>
                    <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                    <td className="py-2 text-center text-gray-500">{p.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {/* Selected items chips */}
        {consGroupChecked.size > 0 && (
          <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-500 mb-1.5">รายการที่เลือก ({consGroupChecked.size} รายการ)</p>
            <div className="flex flex-wrap gap-1.5">
              {selectedConsGroupProducts.map((p, i) => consGroupChecked.has(i) && (
                <span key={i} className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400">
                  {p.name} ({parseFloat(p.qty)} {p.unit})
                  <button onClick={() => toggleConsGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                </span>
              ))}
            </div>
          </div>
        )}
        {/* Footer buttons */}
        <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
          <button onClick={() => setConsGroupModalOpen(false)}
            className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
            ยกเลิก
          </button>
          <button onClick={confirmConsGroup} disabled={consGroupChecked.size === 0}
            className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-orange-500 hover:bg-orange-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
            ยืนยัน
          </button>
        </div>
      </div>
    </div>
  );
}
