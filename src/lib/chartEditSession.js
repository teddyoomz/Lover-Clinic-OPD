// Storage transport for the tablet chart editor (Q5: images travel via Firebase
// Storage; the session doc carries only URLs). Re-exports the branch-scoped
// pairing fns from scopedDataLayer so UI/hook code imports one module.
import { ref as storageRef, uploadString, getDownloadURL, listAll, deleteObject } from 'firebase/storage';
import { storage } from '../firebase.js';

export {
  listenToChartTabletPresenceByBranch, listenToRequestedSessionForTablet, upsertChartTabletPresence,
  listenToChartEditSession, createChartEditSession, updateChartEditSession, freeChartTablet, deleteChartEditSession,
} from './scopedDataLayer.js';

const folder = (sessionId) => `uploads/chart-edit-sessions/${sessionId}`;

// kind: 'template' | 'result'. dataUrl is a PNG data URL.
export async function uploadTransportImage(sessionId, kind, dataUrl) {
  const r = storageRef(storage, `${folder(sessionId)}/${kind}.png`);
  await uploadString(r, dataUrl, 'data_url');
  return getDownloadURL(r);
}

export async function downloadTransportImageAsDataUrl(url) {
  const res = await fetch(url);
  const blob = await res.blob();
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

export async function cleanupSessionStorage(sessionId) {
  try {
    const all = await listAll(storageRef(storage, folder(sessionId)));
    await Promise.all(all.items.map(i => deleteObject(i).catch(() => {})));
  } catch { /* already gone */ }
}
