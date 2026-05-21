import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChartEditSession, listenToChartEditSession, updateChartEditSession,
  deleteChartEditSession, freeChartTablet, uploadTransportImage,
  downloadTransportImageAsDataUrl, downloadTransportJson, cleanupSessionStorage,
} from '../lib/chartEditSession.js';
import { SESSION_STATUS, CANCELLED_BY, HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS, isHeartbeatStale } from '../lib/chartEditSessionCore.js';

function randSessionId() { const a = new Uint8Array(8); window.crypto.getRandomValues(a); return 'CES-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }

// PC side. onSaved(chartData) is called with { dataUrl, fabricJson, templateId, source:'tablet' }
// — fabricJson comes from the tablet's result.json (lossless object data) when present, else
// it stays null; same shape ChartSection.handleSave expects, so the result funnels through the
// existing path. Both downloads are guarded so a Storage hiccup can never hang the PC merge.
export function useChartEditSession({ pcDeviceId, pcUid, onSaved }) {
  const [session, setSession] = useState(null);   // live session doc
  const [phase, setPhase] = useState('idle');      // idle | waiting | failed
  const [error, setError] = useState('');
  const idRef = useRef(null); const unsubRef = useRef(null); const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const teardown = useCallback(() => { unsubRef.current?.(); unsubRef.current = null; idRef.current = null; }, []);

  const start = useCallback(async ({ tablet, template, patientLabel, templateDataUrl, branchId }) => {
    setError(''); setPhase('waiting');
    const sessionId = randSessionId(); idRef.current = sessionId;
    let created = false;
    try {
      await createChartEditSession({ sessionId, branchId, pcDeviceId, pcUid, tabletDeviceId: tablet.deviceId, tabletName: tablet.deviceName, template, patientLabel });
      created = true;
      const url = await uploadTransportImage(sessionId, 'template', templateDataUrl);
      await updateChartEditSession(sessionId, { templateImageUrl: url });
    } catch (e) {
      setPhase('failed');
      setError(
        e.code === 'TABLET_BUSY' ? 'แท็บเล็ตเครื่องนี้กำลังถูกใช้งานอยู่'
          : e.code === 'TABLET_OFFLINE' ? 'แท็บเล็ตไม่พร้อม (อาจปิดหน้าจอหรือหลุดการเชื่อมต่อ) — ลองเลือกใหม่'
            : 'เริ่มการเชื่อมต่อไม่สำเร็จ'
      );
      // Defense-in-depth: if the session was created before a later step failed (e.g. the
      // template upload), cancel it + free the tablet so the tablet exits its editor instead
      // of sitting open with no image. The tablet is already subscribed → reacts to cancelled.
      if (created) {
        await updateChartEditSession(sessionId, { status: SESSION_STATUS.CANCELLED, cancelledBy: CANCELLED_BY.PC }).catch(() => {});
        await freeChartTablet(tablet.deviceId).catch(() => {});
      }
      idRef.current = null;
      return;
    }
    unsubRef.current = listenToChartEditSession(sessionId, async (doc) => {
      if (!doc) return; setSession(doc);
      if (doc.status === SESSION_STATUS.CANCELLED) {
        setPhase('failed'); setError(doc.cancelledBy === CANCELLED_BY.TABLET ? 'แท็บเล็ตยกเลิกการแก้ไข' : 'หลุดการเชื่อมต่อกับแท็บเล็ต');
        teardown(); return;
      }
      if (doc.status === SESSION_STATUS.SAVED && doc.resultImageUrl) {
        // The merge MUST NOT hang: if the result download throws, surface a failure +
        // still clean up the session/tablet (an un-guarded await here left the PC stuck
        // forever on "รอการบันทึกจากแท็บเล็ต" while the tablet had already saved).
        let merged = false;
        try {
          const dataUrl = await downloadTransportImageAsDataUrl(doc.resultImageUrl);
          let fabricJson = null;
          if (doc.resultFabricJsonUrl) { const j = await downloadTransportJson(doc.resultFabricJsonUrl); fabricJson = j ? JSON.stringify(j) : null; }
          onSavedRef.current?.({ dataUrl, fabricJson, templateId: doc.template?.id || 'blank', source: 'tablet' });
          merged = true;
        } catch {
          setPhase('failed'); setError('รับรูปจากแท็บเล็ตไม่สำเร็จ — ลองใหม่');
        }
        await Promise.allSettled([deleteChartEditSession(sessionId), cleanupSessionStorage(sessionId), freeChartTablet(doc.tabletDeviceId)]);
        teardown();
        if (merged) setPhase('idle');
      }
    }, () => { setPhase('failed'); setError('การเชื่อมต่อขัดข้อง'); });
  }, [pcDeviceId, pcUid, teardown]);

  const cancel = useCallback(async (reason = CANCELLED_BY.PC) => {
    const id = idRef.current; if (!id) { setPhase('idle'); return; }
    await updateChartEditSession(id, { status: SESSION_STATUS.CANCELLED, cancelledBy: reason }).catch(() => {});
    await Promise.allSettled([cleanupSessionStorage(id), session?.tabletDeviceId && freeChartTablet(session.tabletDeviceId)]);
    setPhase('idle'); teardown();
  }, [teardown, session]);

  // PC heartbeat + watchdog on the tablet side
  useEffect(() => {
    if (phase !== 'waiting' || !idRef.current) return;
    const beat = setInterval(() => updateChartEditSession(idRef.current, { pcHeartbeatAt: Date.now() }).catch(() => {}), HEARTBEAT_INTERVAL_MS);
    const watch = setInterval(() => {
      const tb = session?.tabletHeartbeatAt;
      if (session?.status === SESSION_STATUS.ACTIVE && tb && isHeartbeatStale(tb, Date.now(), HEARTBEAT_STALE_MS)) cancel(CANCELLED_BY.TIMEOUT);
    }, 5000);
    return () => { clearInterval(beat); clearInterval(watch); };
  }, [phase, session, cancel]);

  useEffect(() => () => teardown(), [teardown]);
  return { phase, error, session, start, cancel };
}
