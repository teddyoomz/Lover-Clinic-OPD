// HTTP Function — ไม่มีข้อจำกัด Firestore region
// PatientForm เรียกหลัง updateDoc สำเร็จ
const functionsV1 = require('firebase-functions/v1');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();

const APP_ID = 'loverclinic-opd-4c39b';
const BASE_PATH = `artifacts/${APP_ID}/public/data`;

exports.sendPushOnSubmit = functionsV1.https.onRequest(async (req, res) => {
  // CORS
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).send(''); return; }
  if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

  const { sessionId, changedSections = [] } = req.body;
  if (!sessionId) { res.status(400).json({ ok: false, reason: 'missing sessionId' }); return; }

  const db = getFirestore();

  // อ่านข้อมูล session จาก Firestore
  const sessionDoc = await db.doc(`${BASE_PATH}/opd_sessions/${sessionId}`).get();
  if (!sessionDoc.exists) { res.status(200).json({ ok: false, reason: 'session not found' }); return; }

  const session = sessionDoc.data();
  if (!session.isUnread) { res.status(200).json({ ok: false, reason: 'not unread' }); return; }

  // ตรวจสอบโหมดทดสอบ (globalPushMuted)
  const settingsDoc = await db.doc(`${BASE_PATH}/push_config/settings`).get();
  if (settingsDoc.exists && settingsDoc.data().globalPushMuted) {
    res.status(200).json({ ok: false, reason: 'push muted (test mode)' }); return;
  }

  // อ่าน FCM tokens
  const tokensDoc = await db.doc(`${BASE_PATH}/push_config/tokens`).get();
  if (!tokensDoc.exists) { res.status(200).json({ ok: false, reason: 'no tokens doc' }); return; }

  const tokenEntries = tokensDoc.data().tokens || [];
  if (tokenEntries.length === 0) { res.status(200).json({ ok: false, reason: 'no tokens' }); return; }

  // สร้างข้อความ notification
  const pd = session.patientData;
  const patientName = pd?.firstName
    ? `${pd.firstName} ${pd.lastName || ''}`.trim()
    : null;
  const rawName = session.sessionName || sessionId;
  const sessionName = rawName.length > 28 ? rawName.substring(0, 27) + '…' : rawName;
  const isEdit = !!session.updatedAt;

  let title, body;
  if (isEdit) {
    title = sessionName;
    const sections = changedSections.length > 0
      ? changedSections.join(' · ')
      : 'ข้อมูลผู้ป่วย';
    body = `✏️ แก้ไขแล้ว · ${sections}`;
  } else {
    title = sessionName;
    body = patientName ? `🔔 ข้อมูลใหม่ · ${patientName}` : '🔔 ได้รับข้อมูลผู้ป่วยแล้ว';
  }

  const tokenStrings = tokenEntries
    .map(t => (typeof t === 'string' ? t : t.token))
    .filter(Boolean);

  const message = {
    notification: { title, body },
    webpush: {
      notification: {
        title,
        body,
        icon: '/favicon.svg',
        badge: '/favicon.svg',
        requireInteraction: true,
        data: { url: '/' },
      },
      fcmOptions: { link: '/' },
    },
    tokens: tokenStrings,
  };

  try {
    const response = await getMessaging().sendEachForMulticast(message);

    // ลบ token ที่หมดอายุ
    const invalidTokens = new Set();
    response.responses.forEach((resp, idx) => {
      if (!resp.success) {
        const code = resp.error?.code;
        if (
          code === 'messaging/registration-token-not-registered' ||
          code === 'messaging/invalid-registration-token'
        ) {
          invalidTokens.add(tokenStrings[idx]);
        }
      }
    });

    if (invalidTokens.size > 0) {
      const newTokens = tokenEntries.filter(t => {
        const tk = typeof t === 'string' ? t : t.token;
        return !invalidTokens.has(tk);
      });
      await db.doc(`${BASE_PATH}/push_config/tokens`).set({ tokens: newTokens });
    }

    console.log(`[${sessionId}] Push: ${response.successCount} ok, ${response.failureCount} fail`);
    res.status(200).json({ ok: true, sent: response.successCount });
  } catch (err) {
    console.error('FCM error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});
