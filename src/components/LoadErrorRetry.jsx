// ─── LoadErrorRetry — shared "couldn't load — retry" card ────────────────────
// 2026-06-16 (mobile-load reliability). Rendered when useResilientLoad's
// loadStatus === 'error' (auto-retries exhausted). Replaces the permanent
// stuck-spinner / black-screen / empty-skeleton with a clear escape.
//
// Theme-aware. NEVER red on a patient name (rule 04) — this is a connection-
// status card; the accent lives on the icon + button only. fullScreen=false
// renders a slim inline banner (e.g. above the AdminDashboard queue) so the
// rest of the page stays usable.
import { AlertTriangle, RotateCw } from 'lucide-react';

export default function LoadErrorRetry({
  onRetry,
  accentColor = '#dc2626',
  isDark = true,
  title = 'โหลดข้อมูลไม่สำเร็จ',
  message = 'การเชื่อมต่ออาจไม่เสถียร กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง',
  retryLabel = 'ลองใหม่',
  fullScreen = true,
}) {
  const wrap = fullScreen
    ? `flex flex-col items-center justify-center min-h-screen gap-4 px-8 text-center ${isDark ? 'bg-[#050505]' : 'bg-gradient-to-b from-pink-50 via-white to-pink-50'}`
    : `flex items-center justify-center gap-3 px-4 py-3 text-center rounded-xl border ${isDark ? 'bg-[#141414] border-white/10' : 'bg-white border-pink-200'}`;

  return (
    <div className={wrap} data-testid="load-error-retry" role="alert">
      <AlertTriangle size={fullScreen ? 34 : 20} style={{ color: accentColor }} aria-hidden="true" />
      <div className={fullScreen ? '' : 'flex-1 text-left'}>
        <p className={`font-bold ${fullScreen ? 'text-base mt-1' : 'text-sm'} ${isDark ? 'text-white' : 'text-gray-800'}`}>{title}</p>
        {fullScreen && (
          <p className={`text-xs mt-1.5 leading-relaxed max-w-[280px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{message}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all active:scale-95 shrink-0"
        style={{ backgroundColor: accentColor }}
        data-testid="load-error-retry-btn"
        aria-label={retryLabel}
      >
        <RotateCw size={15} aria-hidden="true" /> {retryLabel}
      </button>
    </div>
  );
}
