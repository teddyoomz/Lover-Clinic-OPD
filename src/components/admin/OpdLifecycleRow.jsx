// V118 (2026-05-23) — Presentational sub-component for the OPD lifecycle row.
//
// Inserted between the status pill row and the existing action row inside
// AppointmentHubRowCard. Receives derived state — does NOT compute it.
// State derivation lives in `src/lib/opdSessionState.js` (AV118).
//
// Visibility per locked spec (docs/superpowers/specs/2026-05-23-card-opd-lifecycle-row-design.html):
//   State A — 🟢 ดูข้อมูล OPD only
//   State B — 🔵 ส่งลิ้งค์ + ⏳ ยังไม่มีข้อมูล (disabled)
//   State C — 🟢 ดูลิ้งค์ + ⏳ รอลูกค้ากรอก (disabled)
//   State D — 🟢 ดูลิ้งค์ + 🟢 ดูข้อมูล (REVIEW) + 🔴 บันทึก OPD  (review-then-save)
//   State E — 🟢 ดูข้อมูล OPD only (transient — converts to A on next render)
//
// User directive (locked 2026-05-23): "admin จะต้อง Review ข้อมูลลูกค้าด้วย
// การกดปุ่มดูข้อมูลนี้ก่อน เพื่อดูข้อมูลคร่าวๆ แล้วถ้าไม่มีปัญหาอะไรก็จะกดปุ่ม
// บันทึกลง OPD" — view button MUST appear before save in State D.

import React from 'react';
import { Send, QrCode, Clock, ClipboardCheck, FileSearch, Loader2 } from 'lucide-react';

export default function OpdLifecycleRow({
  state,                    // 'A' | 'B' | 'C' | 'D' | 'E'
  onSendLink,               // () => void  — State B trigger
  onViewLink,               // () => void  — State C/D trigger
  onSaveOpd,                // () => void  — State D trigger
  onViewOpd,                // () => void  — State A/D/E trigger (review or post-save view)
  sendLinkBusy = false,
  saveOpdBusy = false,
}) {
  // V118 visibility predicates — keep cheap + grep-stable for AV118 source-grep.
  const showLinkSend = state === 'B';
  const showLinkView = state === 'C' || state === 'D';
  const showOpdWaitNoData = state === 'B';
  const showOpdWaitFilling = state === 'C';
  const showOpdView = state === 'A' || state === 'D' || state === 'E';
  const showOpdSave = state === 'D';

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 mt-1.5 py-1.5 px-2 rounded-md border-y border-dashed border-amber-500/30 bg-amber-500/[0.03] md:justify-end"
      data-testid="opd-lifecycle-row"
      data-opd-state={state}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-amber-500/70 mr-auto">
        OPD lifecycle
      </span>

      {showLinkSend && (
        <button
          type="button"
          onClick={onSendLink}
          disabled={sendLinkBusy}
          data-testid="opd-link-send-btn"
          title="สร้างลิ้งค์สำหรับลูกค้ากรอกข้อมูล OPD"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-blue-900/30 border-blue-700/40 text-blue-300 hover:bg-blue-900/50 disabled:opacity-50 transition-colors"
        >
          {sendLinkBusy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
          ส่งลิ้งค์ลูกค้ากรอก OPD
        </button>
      )}

      {showLinkView && (
        <button
          type="button"
          onClick={onViewLink}
          disabled={sendLinkBusy}
          data-testid="opd-link-view-btn"
          title="ดู / พิมพ์ลิ้งค์ที่ส่งให้ลูกค้าแล้ว"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-emerald-900/30 border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/50 disabled:opacity-50 transition-colors"
        >
          {sendLinkBusy ? <Loader2 size={11} className="animate-spin" /> : <QrCode size={11} />}
          ดูลิ้งค์ที่ส่งไป
        </button>
      )}

      {showOpdWaitNoData && (
        <span
          data-testid="opd-save-btn-wait"
          data-opd-disabled-reason="no-data"
          title="ยังไม่มีข้อมูล — กดส่งลิ้งค์ให้ลูกค้ากรอกก่อน"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-slate-800/50 border-slate-700/40 text-slate-500 opacity-70 cursor-not-allowed"
        >
          <Clock size={11} />
          ยังไม่มีข้อมูล
        </span>
      )}

      {showOpdWaitFilling && (
        <span
          data-testid="opd-save-btn-wait"
          data-opd-disabled-reason="waiting-customer"
          title="รอลูกค้ากรอกข้อมูลผ่าน QR/ลิ้งค์"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-slate-800/50 border-slate-700/40 text-slate-500 opacity-70 cursor-not-allowed"
        >
          <Clock size={11} />
          รอลูกค้ากรอก
        </span>
      )}

      {/* V118 — View OPD rendered BEFORE Save so left-to-right read order is
          "review then save" in State D (per user directive). In State A and E
          this is the sole action — admin clicks to view any-time. */}
      {showOpdView && (
        <button
          type="button"
          onClick={onViewOpd}
          data-testid="opd-view-btn"
          title="ดูข้อมูล OPD ของลูกค้า"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-bold border bg-emerald-900/30 border-emerald-700/40 text-emerald-300 hover:bg-emerald-900/50 transition-colors"
        >
          <FileSearch size={11} />
          ดูข้อมูล OPD
        </button>
      )}

      {showOpdSave && (
        <button
          type="button"
          onClick={onSaveOpd}
          disabled={saveOpdBusy}
          data-testid="opd-save-btn-active"
          title="บันทึก OPD — สร้างลูกค้าใน be_customers + ผูกนัด/มัดจำ"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-extrabold border-2 bg-red-950/40 border-red-600/60 text-red-300 hover:bg-red-900/50 disabled:opacity-50 animate-pulse transition-colors"
          style={{ animationDuration: '2.4s' }}
        >
          {saveOpdBusy ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
          บันทึกลง OPD
        </button>
      )}
    </div>
  );
}
