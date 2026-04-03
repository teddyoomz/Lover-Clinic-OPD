// ─── Saved Replies API (proxy FB saved_message_responses) ────────────────────
// Authenticated GET endpoint — returns saved replies from Facebook Page

import { verifyAuth } from '../proclinic/_lib/auth.js';

const APP_ID = process.env.FIREBASE_APP_ID || 'loverclinic-opd-4c39b';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${APP_ID}/databases/(default)/documents`;
const CHAT_CONFIG_PATH = `artifacts/${APP_ID}/public/data/clinic_settings/chat_config`;

async function getChatConfig() {
  const res = await fetch(`${FIRESTORE_BASE}/${CHAT_CONFIG_PATH}`);
  if (!res.ok) return null;
  const doc = await res.json();
  return doc.fields || null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await verifyAuth(req, res);
  if (!user) return;

  try {
    const config = await getChatConfig();
    if (!config) return res.status(200).json({ success: false, error: 'Chat ยังไม่ได้ตั้งค่า' });

    const fbFields = config.facebook?.mapValue?.fields;
    const token = fbFields?.pageAccessToken?.stringValue;
    const pageId = fbFields?.pageId?.stringValue;
    if (!token || !pageId) return res.status(200).json({ success: false, error: 'Facebook ยังไม่ได้ตั้งค่า' });

    const fbRes = await fetch(`https://graph.facebook.com/v25.0/${pageId}/saved_message_responses?access_token=${token}`);
    const data = await fbRes.json();

    if (data.error) {
      console.error('[saved-replies] FB API error:', data.error);
      return res.status(200).json({ success: false, error: data.error.message });
    }

    const replies = (data.data || [])
      .filter(r => r.is_enabled !== false)
      .map(r => ({ id: r.id, title: r.title || '', message: r.message || '' }));

    return res.status(200).json({ success: true, replies });
  } catch (err) {
    console.error('[saved-replies] Error:', err);
    return res.status(200).json({ success: false, error: err.message });
  }
}
