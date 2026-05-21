import { useEffect, useRef, useState, useCallback } from 'react';
import { auth } from '../firebase.js';
import { getOrCreateDeviceId } from '../lib/tabletDeviceCache.js';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import {
  listenToRequestedSessionForTablet, listenToChartEditSession, updateChartEditSession,
  freeChartTablet, uploadTransportImage, uploadTransportJson, downloadTransportImageAsDataUrl,
} from '../lib/chartEditSession.js';
import { SESSION_STATUS, CANCELLED_BY, HEARTBEAT_INTERVAL_MS } from '../lib/chartEditSessionCore.js';
import TabletStandby from '../components/tablet-chart/TabletStandby.jsx';
import TabletChartCanvas from '../components/tablet-chart/TabletChartCanvas.jsx';
import EditorToolRail from '../components/tablet-chart/EditorToolRail.jsx';

// The ?tablet=chart target. Renders the standby screen until a 'requested' session
// aimed at THIS device arrives, then pops the full-screen editor instantly (Q4).
// Save → upload result + status 'saved' (PC merges into charts[]). Cancel or a PC
// cancel → exit back to standby. Patient label uses neutral colors (Rule 04).
export default function TabletChartEditorPage() {
  const deviceId = getOrCreateDeviceId();
  const { branchId } = useSelectedBranch();
  const uid = auth.currentUser?.uid || '';
  const byName = auth.currentUser?.displayName || auth.currentUser?.email || '';
  const [active, setActive] = useState(null);     // active session doc being edited
  const [templateDataUrl, setTemplateDataUrl] = useState('');
  const [tool, setTool] = useState('pen'); const [color, setColor] = useState('#ef4444'); const [size, setSize] = useState(4);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false); const [saveErr, setSaveErr] = useState('');
  const [diag, setDiag] = useState(null);   // TEMP on-device render diagnostic (read real iPad canvas state) — remove after debug
  const canvasRef = useRef(null); const sesUnsubRef = useRef(null);

  const closeEditor = useCallback((free = true) => {
    sesUnsubRef.current?.(); sesUnsubRef.current = null;
    if (free) freeChartTablet(deviceId).catch(() => {});
    setActive(null); setTemplateDataUrl('');
  }, [deviceId]);

  const openSession = useCallback(async (sdoc) => {
    let loadedUrl = sdoc.templateImageUrl || '';
    const dataUrl = loadedUrl ? await downloadTransportImageAsDataUrl(loadedUrl) : '';
    setTemplateDataUrl(dataUrl); setActive(sdoc);
    await updateChartEditSession(sdoc.sessionId, { status: SESSION_STATUS.ACTIVE, tabletHeartbeatAt: Date.now() });
    sesUnsubRef.current = listenToChartEditSession(sdoc.sessionId, async (live) => {
      if (!live) return;
      if (live.status === SESSION_STATUS.CANCELLED && live.cancelledBy !== CANCELLED_BY.TABLET) {
        setNotice('การเชื่อมต่อถูกยกเลิกจาก PC'); closeEditor(false); return;
      }
      // Q4 instant-pop can fire on the 'requested' doc BEFORE the PC finishes uploading the
      // template, so templateImageUrl arrives a moment later → load it when it lands/changes.
      if (live.templateImageUrl && live.templateImageUrl !== loadedUrl) {
        loadedUrl = live.templateImageUrl;
        const d = await downloadTransportImageAsDataUrl(live.templateImageUrl);
        setTemplateDataUrl(d);
      }
    }, () => {});
  }, [closeEditor]);

  // Q4 instant-pop: a 'requested' session for THIS device → open immediately.
  useEffect(() => {
    if (!branchId || active) return;
    const unsub = listenToRequestedSessionForTablet({ branchId, tabletDeviceId: deviceId }, (sdoc) => { if (sdoc) openSession(sdoc); }, () => {});
    return () => unsub?.();
  }, [branchId, deviceId, active, openSession]);

  const onSave = useCallback(async () => {
    if (!active || saving) return;
    setSaving(true); setSaveErr('');
    try {
      const dataUrl = canvasRef.current.exportDataUrl();
      const fabricJson = canvasRef.current.exportFabricJson();
      // PNG carries every VISIBLE edit (flattened) into charts[] — this is the essential save.
      const url = await uploadTransportImage(active.sessionId, 'result', dataUrl);
      // The lossless fabricJson (object-level re-edit) is OPTIONAL. A json upload failure — e.g.
      // storage.rules not yet allowing application/json — must NEVER block the save (the PNG
      // already has all the edits). Guard it so a json hiccup can't reject the whole onSave.
      let jsonUrl = null;
      if (fabricJson) { try { jsonUrl = await uploadTransportJson(active.sessionId, 'result', JSON.parse(fabricJson)); } catch { jsonUrl = null; } }
      await updateChartEditSession(active.sessionId, { status: SESSION_STATUS.SAVED, resultImageUrl: url, resultFabricJsonUrl: jsonUrl });
      closeEditor(true);
    } catch {
      setSaveErr('บันทึกไม่สำเร็จ — ลองใหม่อีกครั้ง');   // never silently fail; editor stays open to retry
    } finally {
      setSaving(false);
    }
  }, [active, saving, closeEditor]);

  const onCancel = useCallback(async () => {
    if (active) await updateChartEditSession(active.sessionId, { status: SESSION_STATUS.CANCELLED, cancelledBy: CANCELLED_BY.TABLET }).catch(() => {});
    closeEditor(true);
  }, [active, closeEditor]);

  // tablet heartbeat while editing
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => updateChartEditSession(active.sessionId, { tabletHeartbeatAt: Date.now() }).catch(() => {}), HEARTBEAT_INTERVAL_MS);
    return () => clearInterval(t);
  }, [active]);

  // TEMP on-device render diagnostic — reads the REAL visible lower-canvas state ON THE TABLET
  // (dpr, backing/CSS dims, object count, painted-pixel ratio, rAF liveness). I can't open
  // devtools on the iPad; this surfaces the truth so a screenshot localizes the render bug.
  // REMOVE after the live-render bug is resolved.
  useEffect(() => {
    if (!active) return;
    let rafTick = 0; const rafLoop = () => { rafTick++; requestAnimationFrame(rafLoop); }; requestAnimationFrame(rafLoop);
    const id = setInterval(() => {
      const lc = document.querySelector('canvas.lower-canvas');
      if (!lc) { setDiag({ err: 'no lower-canvas' }); return; }
      let paint = '?';
      try {
        const ctx = lc.getContext('2d'); const N = 8; let colored = 0, white = 0, transparent = 0, total = 0;
        for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) { const d = ctx.getImageData(Math.floor(lc.width * i / N), Math.floor(lc.height * j / N), 1, 1).data; total++; if (d[3] < 10) transparent++; else if (d[0] > 245 && d[1] > 245 && d[2] > 245) white++; else colored++; }
        paint = `c${colored} w${white} t${transparent}/${total}`;
      } catch (e) { paint = 'ERR ' + (e.message || e).slice(0, 24); }
      let objs = '?'; try { const j = canvasRef.current?.exportFabricJson?.(); objs = j ? JSON.parse(j).objects.length : 'null'; } catch { objs = 'e'; }
      const r = lc.getBoundingClientRect();
      const ups = document.querySelectorAll('canvas').length;
      setDiag({ dpr: window.devicePixelRatio, back: `${lc.width}x${lc.height}`, css: `${Math.round(r.width)}x${Math.round(r.height)}`, objs, paint, canvases: ups, raf: rafTick });
      rafTick = 0;
    }, 1000);
    return () => clearInterval(id);
  }, [active]);

  // Always render the standby — it keeps useTabletPresence mounted, so the heartbeat
  // holds the presence 'busy' while editing (instead of an unmount-free flipping it
  // 'idle' and letting a 2nd PC grab a tablet that's mid-session). Editor + notice
  // are full-screen overlays on top.
  return (
    <>
      <TabletStandby deviceId={deviceId} uid={uid} byName={byName} busy={!!active} />
      {notice && !active && (
        <div className="fixed inset-0 z-[130] bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-4">
          <div className="text-5xl">🔌</div><div data-testid="editor-notice">{notice}</div>
          <button className="bg-neutral-800 rounded px-4 py-2" onClick={() => setNotice('')}>กลับสู่หน้ารอ</button>
        </div>
      )}
      {active && (
        <div className="fixed inset-0 z-[125] bg-neutral-950 flex flex-col">
          <header className="flex items-center justify-between px-4 py-2 bg-neutral-900 text-neutral-100 border-b border-neutral-800">
            <button data-testid="editor-cancel" onClick={onCancel} className="px-3 py-1.5 border border-neutral-600 rounded">✕ ยกเลิก</button>
            <span className={`text-sm ${saveErr ? 'text-red-400 font-semibold' : 'opacity-80'}`} data-testid="editor-header-label">{saveErr || `${active.template?.name} · ${active.patientLabel}`}</span>
            <button data-testid="editor-save" onClick={onSave} disabled={saving} className="px-4 py-1.5 bg-emerald-500 text-black font-bold rounded disabled:opacity-50">{saving ? 'กำลังบันทึก…' : '✓ บันทึก'}</button>
          </header>
          {diag && (
            <div data-testid="editor-render-diag" style={{ position: 'fixed', left: 4, bottom: 4, zIndex: 200, background: 'rgba(0,0,0,0.85)', color: '#22ff22', font: '12px monospace', padding: '5px 8px', borderRadius: 5, pointerEvents: 'none', maxWidth: '92vw' }}>
              {diag.err ? `DIAG ${diag.err}` : `DIAG dpr ${diag.dpr} · back ${diag.back} · css ${diag.css} · objs ${diag.objs} · paint ${diag.paint} · canvases ${diag.canvases} · raf/s ${diag.raf}`}
            </div>
          )}
          <div className="flex flex-1 min-h-0">
            <EditorToolRail {...{ tool, setTool, color, setColor, size, setSize }}
              onUndo={() => canvasRef.current?.undo()} onRedo={() => canvasRef.current?.redo()}
              onClear={() => canvasRef.current?.clear()} onDelete={() => canvasRef.current?.deleteSelected()} />
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
              <TabletChartCanvas ref={canvasRef} templateImageUrl={templateDataUrl} tool={tool} color={color} size={size}
                onRequestSelect={() => setTool('select')} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
