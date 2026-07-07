// ─── TfpFormPrimitives — TreatmentFormPage leaf components ──────────────────
// TFP extraction step 1 (2026-07-07, extraction-only refactor): these 7 memo'd
// presentational components moved VERBATIM out of TreatmentFormPage.jsx
// (were module-scope lines ~156-369). Zero behavior change — same props, same
// markup, same memo semantics. TreatmentFormPage imports them back.
//
// Perf note (2026-04-19, original): every helper here is wrapped in React.memo.
// The parent TreatmentFormPage has 119 useState calls, so ANY state change
// re-renders the whole tree. Memoizing these leaf components isolates
// keystroke re-renders to just the one component being edited. Callers pass
// stable refs (useCallback handlers, primitive props) so the memo check
// actually rejects re-renders; see setOpdField / setVitalField in the parent.

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { flushSync } from 'react-dom';
import { Check, Copy } from 'lucide-react';
import { LocalInput } from '../form/LocalField.jsx';
import { aaAccent } from '../../lib/themeAccent.js';

export const SectionHeader = memo(function SectionHeader({ icon: Icon, title, isDark, accent, children }) {
  const a = aaAccent(accent, isDark); // V125: deepen -500 accent to AA-dark in light theme
  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      <Icon size={15} style={{ color: a }} />
      <h4 className="text-xs font-bold tracking-wide" style={{ color: a }}>{title}</h4>
      {children}
    </div>
  );
});

export const FormSection = memo(function FormSection({ isDark, children, className = '' }) {
  return (
    <div className={`rounded-xl border p-5 ${isDark ? 'border-[#1a1a1a] bg-[#0a0a0a]' : 'border-gray-200 bg-white'} ${className}`}>
      {children}
    </div>
  );
});

export const ActionBtn = memo(function ActionBtn({ children, color, isDark, onClick, className = '' }) {
  const c = aaAccent(color, isDark); // V125: deepen -500 accent to AA-dark in light theme
  return (
    <button onClick={onClick}
      className={`text-xs font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${className}`}
      style={{ color: c, borderColor: `${c}40`, background: `${c}0a` }}>
      {children}
    </button>
  );
});

export const LabPriceSummary = memo(function LabPriceSummary({ price, discount, discountType, vat, isDark }) {
  const p = parseFloat(price) || 0;
  const d = parseFloat(discount) || 0;
  const afterDisc = discountType === 'percent' ? p * (1 - d / 100) : p - d;
  const vatAmt = vat ? afterDisc * 0.07 : 0;
  const total = afterDisc + vatAmt;
  return <div className={`text-xs font-bold text-right ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>ราคาสุทธิ: {total.toFixed(2)} บาท</div>;
});

export const MedPriceSummary = memo(function MedPriceSummary({ price, discount, discountType, vat, onVatChange, premium, isDark }) {
  const p = parseFloat(price) || 0;
  const d = parseFloat(discount) || 0;
  const afterDisc = discountType === 'percent' ? p * (1 - d / 100) : p - d;
  const vatAmt = vat ? afterDisc * 0.07 : 0;
  const net = premium ? 0 : Math.max(0, afterDisc + vatAmt);
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between text-gray-500"><span>ราคาหลังหักส่วนลด</span><span>{afterDisc.toFixed(2)} บาท</span></div>
      <div className="flex items-center justify-between text-gray-500">
        <label className="flex items-center gap-1 cursor-pointer">
          <input type="checkbox" checked={vat} onChange={e => onVatChange(e.target.checked)} className="w-3 h-3 rounded accent-emerald-500" />
          คำนวนค่าสินค้าเพิ่ม (VAT 7%)
        </label>
        <span>{vatAmt.toFixed(2)} บาท</span>
      </div>
      <div className="flex justify-between font-bold text-gray-300 pt-1 border-t border-dashed" style={{ borderColor: isDark ? '#333' : '#ddd' }}>
        <span>ราคาสุทธิ์ต่อหน่วย</span><span>{net.toFixed(2)} บาท</span>
      </div>
    </div>
  );
});

// VitalsGrid — 8 input fields (weight, height, temperature, pulseRate,
// respiratoryRate, systolicBP, diastolicBP, oxygenSaturation) + BMI display.
// Memo'd so keystrokes in OPD textareas / meds / billing don't force an
// 8-input reconcile here. BMI is passed in as prop so the parent's
// useMemo([weight,height]) result doesn't require recomputation here.
export const VitalsGrid = memo(function VitalsGrid({ vitals, onFieldChange, bmi, inputCls, labelCls }) {
  // Stable per-field committers — LocalInput's memo check compares onCommit
  // by ref, so inline arrows would defeat the whole point on every commit
  // bubble. These 8 useCallbacks are one-per-field, re-created only if the
  // parent's `onFieldChange` ref changes (which it shouldn't — it's already
  // a stable useCallback in the parent).
  const commit = useMemo(() => ({
    weight:            (v) => onFieldChange('weight', v),
    height:            (v) => onFieldChange('height', v),
    temperature:       (v) => onFieldChange('temperature', v),
    pulseRate:         (v) => onFieldChange('pulseRate', v),
    respiratoryRate:   (v) => onFieldChange('respiratoryRate', v),
    systolicBP:        (v) => onFieldChange('systolicBP', v),
    diastolicBP:       (v) => onFieldChange('diastolicBP', v),
    oxygenSaturation:  (v) => onFieldChange('oxygenSaturation', v),
  }), [onFieldChange]);
  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        {[['weight', 'น้ำหนัก (kg)'], ['height', 'ส่วนสูง (cm)']].map(([key, label]) => (
          <div key={key} data-field={`vitals.${key}`}>
            <label className={labelCls}>{label}</label>
            <LocalInput value={vitals[key]} onCommit={commit[key]} className={`${inputCls} text-center`} placeholder="-" />
          </div>
        ))}
        <div>
          <label className={labelCls}>BMI</label>
          <input value={bmi} readOnly className={`${inputCls} text-center opacity-60`} placeholder="-" />
        </div>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
        {[['temperature', 'BT (°C)'], ['pulseRate', 'PR (bpm)'], ['respiratoryRate', 'RR'],
          ['systolicBP', 'SBP (mmHg)'], ['diastolicBP', 'DBP (mmHg)']].map(([key, label]) => (
          <div key={key} data-field={`vitals.${key}`}>
            <label className={labelCls}>{label}</label>
            <LocalInput value={vitals[key]} onCommit={commit[key]} className={`${inputCls} text-center`} placeholder="-" />
          </div>
        ))}
      </div>
      <div className="mt-2" data-field="vitals.oxygenSaturation">
        <label className={labelCls}>O₂ Sat (%)</label>
        <LocalInput value={vitals.oxygenSaturation} onCommit={commit.oxygenSaturation} className={`${inputCls} text-center w-24`} placeholder="-" />
      </div>
    </>
  );
});

// OPD textarea with local state — critical perf fix for TreatmentFormPage.
//
// Problem: the parent has 119 useState calls. Any `setState` re-renders the
// whole tree. With `value={opd.symptoms} onChange={setOpd}` every
// keystroke fires a full parent reconcile, which feels laggy enough that
// a single typed character appears ~100-200ms after the key press on
// older tablets.
//
// Solution: the textarea owns its own local state while the user types.
// Parent `opd` state is only updated in two places:
//   1. `onBlur` — tab / click away commits via flushSync so the next event
//      (e.g. a submit click) sees the latest value.
//   2. 150ms debounce — backup in case the user submits without blurring
//      (edge case; blur usually fires before click on the submit button).
//
// External changes to `value` (edit-mode restore, "ใช้ข้อมูลครั้งก่อน"
// button) sync back into local via the `[value]` effect below so the UI
// stays in sync with parent state.
export const OPDFieldWithPrev = memo(function OPDFieldWithPrev({ field, label, rows, value, onFieldChange, prevValue, isDark, inputCls, labelCls, grow = false }) {
  const [local, setLocal] = useState(value || '');
  const committed = useRef(value || '');
  const [copied, setCopied] = useState(false);
  const hasPrev = !!(prevValue && prevValue.trim());

  // Sync IN — external value changes (edit-mode restore, copy button).
  useEffect(() => {
    const v = value || '';
    setLocal(v);
    committed.current = v;
  }, [value]);

  const commit = useCallback((next) => {
    if (next !== committed.current) {
      committed.current = next;
      onFieldChange(field, next);
    }
  }, [field, onFieldChange]);

  // Debounce backup — 150ms after last keystroke. Only commits if still dirty.
  useEffect(() => {
    if (local === committed.current) return undefined;
    const t = setTimeout(() => commit(local), 150);
    return () => clearTimeout(t);
  }, [local, commit]);

  const handleBlur = () => {
    // flushSync so a following submit-button click sees the new parent state.
    // Native event ordering: blur fires before click; React 18 batching may
    // defer our setOpd to render after click, so we force a sync flush.
    if (local !== committed.current) {
      flushSync(() => commit(local));
    }
  };

  const handleCopyAndFill = () => {
    navigator.clipboard.writeText(prevValue).catch(() => {});
    setLocal(prevValue);
    onFieldChange(field, prevValue);
    committed.current = prevValue;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    // 2026-05-25 — `grow` (CC field only) makes the wrapper a flex column so the
    // textarea below can flex-1 and fill the OPD Card's spare height (column balance).
    <div className={grow ? 'flex flex-col flex-1 min-h-0' : ''}>
      <label className={labelCls}>{label}</label>
      {hasPrev && (
        <div className={`mb-1.5 rounded-lg border px-3 py-2 ${isDark ? 'bg-[#0d0d0d] border-[#2a2a2a]' : 'bg-orange-50/40 border-orange-200/50'}`}>
          <div className="flex items-center justify-between mb-1">
            <span className={`text-[10px] font-bold uppercase tracking-wider ${isDark ? 'text-orange-500/70' : 'text-orange-600/70'}`}>ครั้งก่อน</span>
            <button type="button" onClick={handleCopyAndFill}
              className={`text-[11px] font-bold px-1.5 py-0.5 rounded border transition-all flex items-center gap-1 ${
                copied
                  ? isDark ? 'bg-green-950/40 text-green-400 border-green-900/50' : 'bg-green-50 text-green-600 border-green-200'
                  : isDark ? 'bg-[#111] border-[#333] text-gray-400 hover:text-orange-400 hover:border-orange-500/30' : 'bg-white border-gray-200 text-gray-500 hover:text-orange-600 hover:border-orange-300'
              }`}>
              {copied ? <Check size={9} /> : <Copy size={9} />}
              {copied ? 'คัดลอกแล้ว' : 'ใช้ข้อมูลนี้'}
            </button>
          </div>
          <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isDark ? 'text-gray-500' : 'text-gray-500'}`}>{prevValue}</p>
        </div>
      )}
      <textarea
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={handleBlur}
        rows={rows}
        className={`${inputCls} resize-none ${grow ? 'flex-1 min-h-0' : ''}`}
      />
    </div>
  );
});
