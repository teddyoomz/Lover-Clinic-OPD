// ─── CloneTab — Search ProClinic + Clone customer data ──────────────────────
// Search by HN (last 3-4 digits), name, surname, or ID card number.
// Display results as cards with "ดูดข้อมูลทั้งหมด" button.

import { useState, useRef, useCallback } from 'react';
import { Search, Loader2, AlertCircle, Download, Info, Users, Pause, Play, X, CheckCircle2, RefreshCw, SkipForward, Zap } from 'lucide-react';
import { searchCustomers } from '../../lib/brokerClient.js';
import { customerExists } from '../../lib/backendClient.js';
import { smartClone, cloneAllCustomers } from '../../lib/cloneOrchestrator.js';
import { hexToRgb } from '../../utils.js';
import CustomerCard from './CustomerCard.jsx';

export default function CloneTab({ clinicSettings, theme }) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState(null); // null = not searched, [] = no results
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  // Clone state (per customer)
  const [cloneStates, setCloneStates] = useState({}); // { [id]: { status, progress } }
  const abortControllerRef = useRef(null);

  // Bulk clone state
  const [bulkPhase, setBulkPhase] = useState('idle'); // idle|listing|checking|cloning|paused|done|cancelled|error
  const [bulkProgress, setBulkProgress] = useState(null);
  const [bulkLog, setBulkLog] = useState([]);
  const bulkControlRef = useRef(null);
  const bulkAbortRef = useRef(null);

  // ── Search ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearchError('');
    setSearchResults(null);

    try {
      const result = await searchCustomers(q);
      if (!result?.success) {
        setSearchError(result?.error || 'ค้นหาไม่สำเร็จ');
        setSearchResults([]);
        return;
      }
      const customers = result.customers || [];
      setSearchResults(customers);

      // Check which customers already exist in be_customers
      const existsChecks = await Promise.all(
        customers.map(async (c) => {
          try {
            const exists = await customerExists(c.id);
            return { id: c.id, exists };
          } catch { return { id: c.id, exists: false }; }
        })
      );

      const existsMap = {};
      existsChecks.forEach(({ id, exists }) => {
        if (exists) existsMap[id] = { status: 'exists', progress: null };
      });
      setCloneStates(prev => ({ ...prev, ...existsMap }));
    } catch (err) {
      setSearchError(err.message || 'เกิดข้อผิดพลาดในการค้นหา');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Clone ─────────────────────────────────────────────────────────────────

  const handleClone = useCallback(async (proClinicId) => {
    // Update status to cloning
    setCloneStates(prev => ({
      ...prev,
      [proClinicId]: { status: 'cloning', progress: { step: 0, label: 'เริ่มต้น...', percent: 0 } },
    }));

    // Create abort controller
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const result = await smartClone(
        proClinicId,
        // Progress callback
        (progress) => {
          setCloneStates(prev => ({
            ...prev,
            [proClinicId]: { status: 'cloning', progress },
          }));
        },
        controller.signal
      );

      if (result.success) {
        setCloneStates(prev => ({
          ...prev,
          [proClinicId]: { status: 'done', progress: null },
        }));
      } else {
        setCloneStates(prev => ({
          ...prev,
          [proClinicId]: { status: 'error', progress: null, error: result.error },
        }));
      }
    } catch (err) {
      setCloneStates(prev => ({
        ...prev,
        [proClinicId]: { status: 'error', progress: null, error: err.message },
      }));
    }
  }, []);

  // ── Bulk Clone handlers ─────────────────────────────────────────────────
  const handleStartBulk = useCallback(() => {
    const controller = new AbortController();
    bulkAbortRef.current = controller;
    setBulkPhase('listing');
    setBulkLog([]);
    setBulkProgress(null);

    const { promise, pause, resume } = cloneAllCustomers(
      (state) => {
        setBulkProgress(state);
        setBulkLog([...(state.log || [])]);
        if (state.phase === 'done' || state.phase === 'cancelled') setBulkPhase(state.phase);
        else if (state.phase === 'error') setBulkPhase('error');
        else if (state.phase === 'paused') setBulkPhase('paused');
        else setBulkPhase(state.phase);
      },
      controller.signal
    );
    bulkControlRef.current = { pause, resume };
    promise.catch(() => setBulkPhase('error'));
  }, []);

  const handlePauseBulk = () => { bulkControlRef.current?.pause(); setBulkPhase('paused'); };
  const handleResumeBulk = () => { bulkControlRef.current?.resume(); setBulkPhase('cloning'); };
  const handleCancelBulk = () => { bulkAbortRef.current?.abort(); setBulkPhase('cancelled'); };

  const fmtEta = (secs) => {
    if (!secs || secs <= 0) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m} นาที ${s} วินาที` : `${s} วินาที`;
  };

  return (
    <div className="space-y-6">

      {/* ── Search Bar ── */}
      <div className="bg-[var(--bg-surface)] rounded-2xl p-5 shadow-lg" style={{ border: `1.5px solid rgba(${acRgb},0.15)` }}>
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: `rgba(${acRgb},0.5)` }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="ค้นหา HN (3-4 ตัวท้าย), ชื่อ, นามสกุล, หรือเลขบัตรประชาชน..."
              className="w-full pl-12 pr-4 py-3 rounded-xl bg-[var(--bg-input)] border-2 border-[var(--bd-strong)] text-sm text-[var(--tx-primary)] placeholder:text-[var(--tx-muted)] focus:outline-none transition-all"
              style={{ boxShadow: `inset 0 2px 4px rgba(0,0,0,0.1)` }}
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="px-6 py-3 rounded-xl font-black text-sm text-white transition-all disabled:opacity-40 flex items-center gap-2 hover:shadow-xl active:scale-[0.97] uppercase tracking-wider"
            style={{ background: `linear-gradient(135deg, ${ac}, rgba(${acRgb},0.8))`, boxShadow: `0 4px 20px rgba(${acRgb},0.35)` }}
          >
            {searching ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            ค้นหา
          </button>
        </div>

        {/* Hint */}
        <p className="mt-3 text-xs text-[var(--tx-muted)] flex items-center gap-1.5">
          <Info size={12} /> ค้นหาจาก ProClinic โดยตรง — ต้อง login ProClinic ก่อน (ผ่าน Cookie Relay Extension)
        </p>
      </div>

      {/* ── Bulk Clone Section ── */}
      <div className="bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl p-5">
        {bulkPhase === 'idle' ? (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
                <Users size={16} style={{ color: ac }} /> Clone ลูกค้าทุกคน
              </h3>
              <p className="text-xs text-[var(--tx-muted)] mt-1">ดูดข้อมูลทุกคนจาก ProClinic อัตโนมัติ — ข้ามคนที่ไม่มีอะไรเปลี่ยน</p>
            </div>
            <button onClick={handleStartBulk}
              className="px-5 py-2.5 rounded-lg font-bold text-sm text-white flex items-center gap-2 hover:opacity-90 active:scale-[0.98] transition-all"
              style={{ backgroundColor: ac }}>
              <Download size={15} /> เริ่มดูดทุกคน
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-[var(--tx-heading)] flex items-center gap-2">
                <Users size={16} style={{ color: ac }} />
                {bulkPhase === 'listing' ? 'กำลังดึงรายชื่อ...' :
                 bulkPhase === 'checking' ? 'กำลังตรวจสอบ...' :
                 bulkPhase === 'cloning' ? 'กำลัง Clone...' :
                 bulkPhase === 'paused' ? 'หยุดชั่วคราว' :
                 bulkPhase === 'done' ? 'เสร็จแล้ว' :
                 bulkPhase === 'cancelled' ? 'ยกเลิกแล้ว' : 'เกิดข้อผิดพลาด'}
              </h3>
              <div className="flex items-center gap-2">
                {(bulkPhase === 'cloning' || bulkPhase === 'listing' || bulkPhase === 'checking') && (
                  <>
                    <button onClick={handlePauseBulk} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-900/20 border border-amber-700/40 text-amber-400 hover:bg-amber-900/30 transition-all flex items-center gap-1">
                      <Pause size={12} /> หยุด
                    </button>
                    <button onClick={handleCancelBulk} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/20 border border-red-700/40 text-red-400 hover:bg-red-900/30 transition-all flex items-center gap-1">
                      <X size={12} /> ยกเลิก
                    </button>
                  </>
                )}
                {bulkPhase === 'paused' && (
                  <>
                    <button onClick={handleResumeBulk} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-900/20 border border-emerald-700/40 text-emerald-400 hover:bg-emerald-900/30 transition-all flex items-center gap-1">
                      <Play size={12} /> เดินต่อ
                    </button>
                    <button onClick={handleCancelBulk} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-900/20 border border-red-700/40 text-red-400 hover:bg-red-900/30 transition-all flex items-center gap-1">
                      <X size={12} /> ยกเลิก
                    </button>
                  </>
                )}
                {(bulkPhase === 'done' || bulkPhase === 'cancelled' || bulkPhase === 'error') && (
                  <button onClick={() => { setBulkPhase('idle'); setBulkProgress(null); setBulkLog([]); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-muted)] hover:text-[var(--tx-primary)] transition-all flex items-center gap-1">
                    <RefreshCw size={12} /> Clone ใหม่
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            {bulkProgress && (
              <div>
                <div className="w-full h-2 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${bulkProgress.percent || 0}%`,
                      backgroundColor: bulkPhase === 'paused' ? '#d97706' : bulkPhase === 'error' ? '#dc2626' : ac,
                    }} />
                </div>
                <div className="flex items-center justify-between mt-1.5 text-xs text-[var(--tx-muted)]">
                  <span>
                    {bulkProgress.currentName && bulkPhase !== 'done' && (
                      <span className="text-[var(--tx-heading)] font-medium">{bulkProgress.currentName}</span>
                    )}
                    {bulkProgress.currentAction && bulkProgress.currentAction !== 'skip' && (
                      <span className="ml-1.5 text-[var(--tx-muted)]">
                        ({bulkProgress.currentAction === 'full' ? 'clone ใหม่' : bulkProgress.currentAction === 'incremental' ? 'อัพเดท' : 'resume'})
                      </span>
                    )}
                  </span>
                  <span>
                    {bulkProgress.estimatedSecondsLeft > 0 && `เหลือ ~${fmtEta(bulkProgress.estimatedSecondsLeft)}`}
                  </span>
                </div>
              </div>
            )}

            {/* Summary stats */}
            {bulkProgress && (
              <div className="flex flex-wrap gap-3 text-xs">
                <span className="text-[var(--tx-muted)]">ทั้งหมด <span className="font-bold text-[var(--tx-heading)]">{bulkProgress.totalCustomers}</span></span>
                {bulkProgress.skipCount > 0 && <span className="text-gray-500"><SkipForward size={11} className="inline mr-0.5" />{bulkProgress.skipCount} ข้าม</span>}
                {bulkProgress.completedCount > 0 && <span className="text-emerald-400"><CheckCircle2 size={11} className="inline mr-0.5" />{bulkProgress.completedCount} สำเร็จ</span>}
                {bulkProgress.incrementalCount > 0 && <span className="text-sky-400"><Zap size={11} className="inline mr-0.5" />{bulkProgress.incrementalCount} อัพเดท</span>}
                {bulkProgress.failedCount > 0 && <span className="text-red-400"><AlertCircle size={11} className="inline mr-0.5" />{bulkProgress.failedCount} ผิดพลาด</span>}
              </div>
            )}

            {/* Log */}
            {bulkLog.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg bg-[var(--bg-elevated)] border border-[var(--bd)] p-2 space-y-0.5">
                {bulkLog.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs py-0.5">
                    {entry.status === 'ok' && entry.action === 'skip' ? (
                      <SkipForward size={11} className="text-gray-500 shrink-0" />
                    ) : entry.status === 'ok' ? (
                      <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle size={11} className="text-red-400 shrink-0" />
                    )}
                    <span className="text-[var(--tx-secondary)] font-medium truncate">{entry.name || entry.id}</span>
                    <span className="text-[var(--tx-muted)] truncate flex-1">{entry.message}</span>
                    {entry.duration > 0 && <span className="text-[var(--tx-muted)] shrink-0">{entry.duration}s</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Search Error ── */}
      {searchError && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-400">ค้นหาไม่สำเร็จ</p>
            <p className="text-xs text-red-400/70 mt-1">{searchError}</p>
          </div>
        </div>
      )}

      {/* ── Search Results ── */}
      {searchResults !== null && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-[var(--tx-heading)] uppercase tracking-wider">
              ผลการค้นหา
            </h2>
            <span className="text-xs text-[var(--tx-muted)]">
              {searchResults.length} รายการ
            </span>
          </div>

          {searchResults.length === 0 && !searching ? (
            <div className="text-center py-12 bg-[var(--bg-surface)] border border-[var(--bd)] rounded-xl">
              <Search size={32} className="mx-auto text-[var(--tx-muted)] mb-3" />
              <p className="text-sm text-[var(--tx-muted)]">ไม่พบผลลัพธ์สำหรับ "{searchQuery}"</p>
              <p className="text-xs text-[var(--tx-muted)] mt-1">ลองค้นหาด้วย HN, ชื่อ, หรือเบอร์โทร</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {searchResults.map((customer) => {
                const state = cloneStates[customer.id] || { status: 'idle' };
                return (
                  <CustomerCard
                    key={customer.id}
                    customer={customer}
                    accentColor={ac}
                    mode="search"
                    cloneStatus={state.status}
                    cloneProgress={state.progress}
                    onClone={handleClone}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Empty State (before search) ── */}
      {searchResults === null && !searching && (
        <div className="flex flex-col items-center justify-center py-16">
          {/* Hero icon with fire glow */}
          <div className="relative mb-6">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, rgba(${acRgb},0.2), rgba(${acRgb},0.05))`, border: `1.5px solid rgba(${acRgb},0.3)`, boxShadow: `0 0 40px rgba(${acRgb},0.15), 0 0 80px rgba(${acRgb},0.05)` }}>
              <Download size={32} style={{ color: ac }} />
            </div>
            <div className="absolute -inset-4 rounded-3xl opacity-30" style={{ background: `radial-gradient(circle, rgba(${acRgb},0.15) 0%, transparent 70%)` }} />
          </div>
          <h3 className="text-xl font-black text-[var(--tx-heading)] mb-2 tracking-tight">Clone ข้อมูลลูกค้า</h3>
          <p className="text-sm text-[var(--tx-muted)] max-w-lg mx-auto text-center leading-relaxed mb-8">
            ค้นหาลูกค้าจาก ProClinic แล้วดูดข้อมูลทั้งหมด (ข้อมูลส่วนตัว, คอร์ส, นัดหมาย, ประวัติการรักษา) มาเก็บไว้ในระบบหลังบ้านของเรา
          </p>
          {/* Quick start guide */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl w-full">
            {[
              { step: '1', title: 'ค้นหา', desc: 'พิมพ์ HN, ชื่อ, หรือเบอร์โทร' },
              { step: '2', title: 'เลือก', desc: 'เลือกลูกค้าที่ต้องการ clone' },
              { step: '3', title: 'ดูดข้อมูล', desc: 'กดปุ่มเพื่อดูดข้อมูลทั้งหมด' },
            ].map(s => (
              <div key={s.step} className="flex items-start gap-3 p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--bd)]">
                <span className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black shrink-0"
                  style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}>{s.step}</span>
                <div>
                  <p className="text-sm font-bold text-[var(--tx-heading)]">{s.title}</p>
                  <p className="text-xs text-[var(--tx-muted)] mt-0.5">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Loading overlay ── */}
      {searching && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-[var(--tx-muted)]" />
          <span className="ml-3 text-sm text-[var(--tx-muted)]">กำลังค้นหาจาก ProClinic...</span>
        </div>
      )}
    </div>
  );
}
