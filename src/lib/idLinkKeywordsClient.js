// ─── ID-Link Keywords Client (2026-07-07) ────────────────────────────────────
// Single doc `clinic_settings/link_id_keywords` storing the admin-configurable
// prefix words that trigger a LINE id-link request ("<คำ> <เลขบัตร/พาสปอร์ต>").
// Edited via the settings card in LinkRequestsTab (เมนูคำขอผูก LINE).
//
// Why NOT chat_config: chat_config holds LINE/FB channel SECRETS and is
// client-SDK-denied (WS1-C2-bis). Keywords are non-secret (the bot hint tells
// them to customers) → own doc, covered by the existing clinic_settings
// wildcard rule (read public / write isClinicStaff) — zero rules change.
//
// Readers: this client (settings card) + api/webhook/line.js
// getIdLinkKeywordsCached (admin SDK, 60s TTL). Absent doc → both sides use
// DEFAULT_ID_LINK_KEYWORDS (legacy ผูก/ผูกบัญชี/link — zero migration).
//
// Schema: { keywords: string[], updatedAt: serverTimestamp, updatedBy: uid }

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, appId } from '../firebase.js';
import { DEFAULT_ID_LINK_KEYWORDS, validateIdLinkKeywords } from './lineBotResponder.js';

const keywordsDoc = () => doc(db, 'artifacts', appId, 'public', 'data', 'clinic_settings', 'link_id_keywords');

/** Current keyword list — stored list when present/valid, else the defaults. */
export async function getIdLinkKeywords() {
  try {
    const snap = await getDoc(keywordsDoc());
    const raw = snap.exists() ? snap.data()?.keywords : null;
    if (Array.isArray(raw) && raw.length) return raw.map((k) => String(k ?? '').trim()).filter(Boolean);
  } catch { /* read failure → defaults below */ }
  return [...DEFAULT_ID_LINK_KEYWORDS];
}

/**
 * Validate + persist the keyword list. Returns { ok } or { ok:false, error }.
 * Webhook picks the change up within its 60s cache TTL.
 */
export async function saveIdLinkKeywords(list, uid = '') {
  const v = validateIdLinkKeywords(list);
  if (!v.ok) return v;
  await setDoc(keywordsDoc(), {
    keywords: v.keywords,
    updatedAt: serverTimestamp(),
    updatedBy: uid || '',
  }, { merge: true });
  return { ok: true, keywords: v.keywords };
}
