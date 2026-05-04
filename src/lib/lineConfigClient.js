// ─── Line Config Client — Phase BS V3 (2026-05-04) ─────────────────────
// Per-branch LINE Official Account configuration. Each branch has its own
// channel + bot Q&A + linking config stored at:
//   artifacts/{appId}/public/data/be_line_configs/{branchId}
//
// User directive 2026-05-04: "ตั้งค่า line OA กับ คำของผูก Line ก็แยกข้อมูล
// กันนะ ใช้คนละ line กัน". Webhook routes incoming events by `event.destination`
// (LINE bot user ID) → matches a config doc → resolves branchId → uses that
// config's tokens for signature verification + reply.
//
// Read/write contract:
//   - getLineConfig(branchId) → single doc, null if not yet configured
//   - saveLineConfig(branchId, data) → setDoc({merge:true}) preserving fields
//   - listenToLineConfig(branchId, onChange, onError) → onSnapshot listener
//
// Rule H-quater: this module reads ONLY from be_line_configs/* (never
// from clinic_settings/chat_config). Webhook + admin endpoints retain a
// chat_config.line fallback during transition for back-compat (see
// api/admin/_lib/lineConfigAdmin.js); the client UI is fully migrated.

import { doc, getDoc, setDoc, onSnapshot, collection, query, where, limit, getDocs } from 'firebase/firestore';
import { db, appId } from '../firebase.js';

/**
 * Default shape — kept in sync with LineSettingsTab DEFAULT_BOT_CONFIG.
 * Frozen so callers can spread but not mutate.
 */
export const DEFAULT_LINE_CONFIG = Object.freeze({
  // Channel credentials
  channelId: '',
  channelSecret: '',
  channelAccessToken: '',
  botBasicId: '',                // @-handle e.g. "@123abcde"
  destination: '',               // LINE bot user ID (Uxxx) — populated on test
  enabled: false,
  // Bot Q&A
  botEnabled: true,
  coursesKeywords: ['คอร์ส', 'courses', 'course', 'เหลือ', 'remaining'],
  appointmentsKeywords: ['นัด', 'appointment', 'appt', 'วันนัด'],
  maxCoursesInReply: 20,
  maxAppointmentsInReply: 10,
  helpMessage: '',
  welcomeMessage: '',
  notLinkedMessage: '',
  // Customer linking
  tokenTtlMinutes: 1440,
  alreadyLinkedRule: 'block',    // 'block' | 'replace'
});

function lineConfigDocRef(branchId) {
  if (!branchId || typeof branchId !== 'string') {
    throw new Error('lineConfigClient: branchId required (got: ' + String(branchId) + ')');
  }
  return doc(db, 'artifacts', appId, 'public', 'data', 'be_line_configs', branchId);
}

function lineConfigsColRef() {
  return collection(db, 'artifacts', appId, 'public', 'data', 'be_line_configs');
}

/**
 * Read a branch's LINE config. Returns merged-with-defaults shape if doc
 * exists, or null if branch hasn't been configured yet.
 */
export async function getLineConfig(branchId) {
  if (!branchId) return null;
  try {
    const snap = await getDoc(lineConfigDocRef(branchId));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return mergeLineConfigDefaults(data);
  } catch {
    return null;
  }
}

/**
 * Live-subscribe to a branch's LINE config. Returns an unsubscribe fn.
 * onChange called with merged-with-defaults shape (or null if doc missing).
 */
export function listenToLineConfig(branchId, onChange, onError) {
  if (!branchId) {
    if (typeof onChange === 'function') onChange(null);
    return () => {};
  }
  try {
    const unsub = onSnapshot(
      lineConfigDocRef(branchId),
      (snap) => {
        if (!snap.exists()) {
          if (typeof onChange === 'function') onChange(null);
          return;
        }
        if (typeof onChange === 'function') {
          onChange(mergeLineConfigDefaults(snap.data() || {}));
        }
      },
      (err) => {
        if (typeof onError === 'function') onError(err);
      }
    );
    return unsub;
  } catch (err) {
    if (typeof onError === 'function') onError(err);
    return () => {};
  }
}

/**
 * Save a branch's LINE config. Stamps branchId + updatedAt. Uses
 * setDoc({merge:true}) so partial saves preserve untouched fields.
 *
 * @param {string} branchId
 * @param {Object} data — partial or full LINE config shape
 */
export async function saveLineConfig(branchId, data) {
  if (!branchId || typeof branchId !== 'string' || !branchId.trim()) {
    throw new Error('saveLineConfig: branchId required');
  }
  const now = new Date().toISOString();
  const payload = normalizeLineConfigForWrite({ ...(data || {}), branchId, updatedAt: now });
  await setDoc(lineConfigDocRef(branchId), payload, { merge: true });
  return { branchId, ...payload };
}

/**
 * Find the line config that matches a given LINE bot destination. Used by
 * the webhook to route incoming events to the correct branch. Returns
 * { config, branchId } or null.
 */
export async function findLineConfigByDestination(destination) {
  if (!destination || typeof destination !== 'string') return null;
  try {
    const q = query(
      lineConfigsColRef(),
      where('destination', '==', destination),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    const data = d.data() || {};
    return {
      branchId: data.branchId || d.id,
      config: mergeLineConfigDefaults(data),
    };
  } catch {
    return null;
  }
}

/**
 * Pure helper: merge raw Firestore data with defaults so newly-introduced
 * fields have safe values + keyword arrays fall back to defaults when
 * missing or empty.
 */
export function mergeLineConfigDefaults(raw) {
  const r = raw || {};
  return {
    ...DEFAULT_LINE_CONFIG,
    ...r,
    coursesKeywords:
      Array.isArray(r.coursesKeywords) && r.coursesKeywords.length
        ? r.coursesKeywords
        : DEFAULT_LINE_CONFIG.coursesKeywords,
    appointmentsKeywords:
      Array.isArray(r.appointmentsKeywords) && r.appointmentsKeywords.length
        ? r.appointmentsKeywords
        : DEFAULT_LINE_CONFIG.appointmentsKeywords,
  };
}

/**
 * Pure helper: clamp + sanitize input for write. Mirrors LineSettingsTab
 * Save handler validation rules.
 */
export function normalizeLineConfigForWrite(input) {
  const r = input || {};
  return {
    branchId: String(r.branchId || '').trim(),
    channelId: String(r.channelId || '').trim(),
    channelSecret: String(r.channelSecret || '').trim(),
    channelAccessToken: String(r.channelAccessToken || '').trim(),
    botBasicId: String(r.botBasicId || '').trim(),
    destination: String(r.destination || '').trim(),
    enabled: !!r.enabled,
    botEnabled: r.botEnabled === undefined ? true : !!r.botEnabled,
    coursesKeywords: (r.coursesKeywords || [])
      .filter((s) => s !== null && s !== undefined)
      .map((s) => String(s).trim())
      .filter(Boolean),
    appointmentsKeywords: (r.appointmentsKeywords || [])
      .filter((s) => s !== null && s !== undefined)
      .map((s) => String(s).trim())
      .filter(Boolean),
    maxCoursesInReply: Math.max(1, Math.min(100, Number(r.maxCoursesInReply) || 20)),
    maxAppointmentsInReply: Math.max(1, Math.min(100, Number(r.maxAppointmentsInReply) || 10)),
    helpMessage: String(r.helpMessage || ''),
    welcomeMessage: String(r.welcomeMessage || ''),
    notLinkedMessage: String(r.notLinkedMessage || ''),
    tokenTtlMinutes: Math.max(1, Math.min(60 * 24 * 7, Number(r.tokenTtlMinutes) || 1440)),
    alreadyLinkedRule: ['block', 'replace'].includes(r.alreadyLinkedRule)
      ? r.alreadyLinkedRule
      : 'block',
    updatedAt: r.updatedAt || new Date().toISOString(),
  };
}

/**
 * Pure validator. Returns { valid, errors: [string] }.
 */
export function validateLineConfig(cfg) {
  const errors = [];
  const c = cfg || {};
  if (c.enabled && (!c.channelSecret || !c.channelAccessToken)) {
    errors.push('เปิดใช้งาน LINE ต้องกรอก Channel Secret + Access Token');
  }
  if (c.botBasicId && !/^@/.test(String(c.botBasicId).trim())) {
    errors.push('Bot Basic ID ต้องขึ้นต้นด้วย @ (เช่น @123abcde)');
  }
  return { valid: errors.length === 0, errors };
}
