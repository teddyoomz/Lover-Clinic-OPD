import { useEffect, useRef, useState, useCallback } from 'react';
import { auth } from '../firebase.js';
import { getOrCreateDeviceId } from '../lib/tabletDeviceCache.js';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import {
  listenToRequestedSessionForTablet, listenToChartEditSession, updateChartEditSession,
  freeChartTablet, uploadTransportImage, downloadTransportImageAsDataUrl,
} from '../lib/chartEditSession.js';
import { SESSION_STATUS, CANCELLED_BY, HEARTBEAT_INTERVAL_MS } from '../lib/chartEditSessionCore.js';
import TabletStandby from '../components/tablet-chart/TabletStandby.jsx';
import PenCanvas from '../components/tablet-chart/PenCanvas.jsx';
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
  const canvasRef = useRef(null); const sesUnsubRef = useRef(null);

  const closeEditor = useCallback((free = true) => {
    sesUnsubRef.current?.(); sesUnsubRef.current = null;
    if (free) freeChartTablet(deviceId).catch(() => {});
    setActive(null); setTemplateDataUrl('');
  }, [deviceId]);

  const openSession = useCallback(async (sdoc) => {
    const dataUrl = sdoc.templateImageUrl ? await downloadTransportImageAsDataUrl(sdoc.templateImageUrl) : '';
    setTemplateDataUrl(dataUrl); setActive(sdoc);
    await updateChartEditSession(sdoc.sessionId, { status: SESSION_STATUS.ACTIVE, tabletHeartbeatAt: Date.now() });
    sesUnsubRef.current = listenToChartEditSession(sdoc.sessionId, (live) => {
      if (live && live.status === SESSION_STATUS.CANCELLED && live.cancelledBy !== CANCELLED_BY.TABLET) {
        setNotice('การเชื่อมต่อถูกยกเลิกจาก PC'); closeEditor(false);
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
    if (!active) return;
    const dataUrl = canvasRef.current.exportDataUrl();
    const url = await uploadTransportImage(active.sessionId, 'result', dataUrl);
    await updateChartEditSession(active.sessionId, { status: SESSION_STATUS.SAVED, resultImageUrl: url });
    closeEditor(true);
  }, [active, closeEditor]);

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
            <span className="text-sm opacity-80">{active.template?.name} · {active.patientLabel}</span>
            <button data-testid="editor-save" onClick={onSave} className="px-4 py-1.5 bg-emerald-500 text-black font-bold rounded">✓ บันทึก</button>
          </header>
          <div className="flex flex-1 min-h-0">
            <EditorToolRail {...{ tool, setTool, color, setColor, size, setSize }}
              onUndo={() => canvasRef.current.undo()} onRedo={() => canvasRef.current.redo()} onClear={() => canvasRef.current.clear()} />
            <div className="flex-1 min-h-0 overflow-auto flex items-center justify-center p-3">
              <PenCanvas ref={canvasRef} templateImageUrl={templateDataUrl} tool={tool} color={color} size={size} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
