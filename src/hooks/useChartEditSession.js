import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChartEditSession, listenToChartEditSession, updateChartEditSession,
  deleteChartEditSession, freeChartTablet, uploadTransportImage,
  downloadTransportImageAsDataUrl, cleanupSessionStorage,
} from '../lib/chartEditSession.js';
import { SESSION_STATUS, CANCELLED_BY, HEARTBEAT_INTERVAL_MS, HEARTBEAT_STALE_MS, isHeartbeatStale } from '../lib/chartEditSessionCore.js';

function randSessionId() { const a = new Uint8Array(8); window.crypto.getRandomValues(a); return 'CES-' + Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }

// PC side. onSaved(chartData) is called with { dataUrl, fabricJson:null, templateId, source:'tablet' }
// — the same shape ChartSection.handleSave expects, so the tablet result funnels through the existing path.
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
    try {
      await createChartEditSession({ sessionId, branchId, pcDeviceId, pcUid, tabletDeviceId: tablet.deviceId, tabletName: tablet.deviceName, template, patientLabel });
      const url = await uploadTransportImage(sessionId, 'template', templateDataUrl);
      await updateChartEditSession(sessionId, { templateImageUrl: url });
    } catch (e) {
      setPhase('failed'); setError(e.code === 'TABLET_BUSY' ? 'แท็บเล็ตเครื่องนี้กำลังถูกใช้งานอยู่' : 'เริ่มการเชื่อมต่อไม่สำเร็จ'); idRef.current = null;
      return;
    }
    unsubRef.current = listenToChartEditSession(sessionId, async (doc) => {
      if (!doc) return; setSession(doc);
      if (doc.status === SESSION_STATUS.CANCELLED) {
        setPhase('failed'); setError(doc.cancelledBy === CANCELLED_BY.TABLET ? 'แท็บเล็ตยกเลิกการแก้ไข' : 'หลุดการเชื่อมต่อกับแท็บเล็ต');
        teardown(); return;
      }
      if (doc.status === SESSION_STATUS.SAVED && doc.resultImageUrl) {
        const dataUrl = await downloadTransportImageAsDataUrl(doc.resultImageUrl);
        onSavedRef.current?.({ dataUrl, fabricJson: null, templateId: doc.template?.id || 'blank', source: 'tablet' });
        await Promise.allSettled([deleteChartEditSession(sessionId), cleanupSessionStorage(sessionId), freeChartTablet(doc.tabletDeviceId)]);
        setPhase('idle'); teardown();
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
