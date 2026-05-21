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

// Normalize any image source to a data URL for Storage transport. Chart templates from the
// selector model carry a public-asset PATH (e.g. '/chart-templates/face-female.svg'), NOT a
// data URL — uploadString(...,'data_url') throws storage/invalid-format on a path, which the
// PC surfaced as "เริ่มการเชื่อมต่อไม่สำเร็จ" + a blank tablet ("ไม่พบรูปภาพ"). Result uploads
// already pass a canvas data URL (data: → passthrough, no fetch). A blank template
// ('กระดาษเปล่า' has imageUrl null) → '' → caller writes templateImageUrl null → tablet draws
// on an empty canvas. (resolve-at-the-writer chokepoint — every caller is protected.)
export async function resolveToDataUrl(src) {
  if (!src || typeof src !== 'string') return '';
  if (src.startsWith('data:')) return src;
  const res = await fetch(src);
  if (!res.ok) { const e = new Error('TEMPLATE_FETCH_FAILED'); e.code = 'TEMPLATE_FETCH_FAILED'; e.status = res.status; throw e; }
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// kind: 'template' | 'result'. Accepts a data URL OR a fetchable URL/path (templates).
export async function uploadTransportImage(sessionId, kind, src) {
  const dataUrl = await resolveToDataUrl(src);
  if (!dataUrl) return null;   // blank template → nothing to transport; tablet draws on empty canvas
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
