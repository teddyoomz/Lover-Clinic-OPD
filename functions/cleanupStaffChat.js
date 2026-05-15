// functions/cleanupStaffChat.js
// V73 (2026-05-16) — Daily 03:00 Bangkok cleanup of >7-day-old staff chat
// messages + orphan Storage attachments.
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { getApps, initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getStorage } = require('firebase-admin/storage');

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
const APP_ID = 'loverclinic-opd-4c39b';

exports.cleanupOldStaffChatMessages = onSchedule({
  schedule: '0 20 * * *',  // 20:00 UTC = 03:00 Bangkok
  timeZone: 'UTC',
  region: 'asia-southeast1',
}, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_staff_chat_messages`)
    .where('createdAt', '<', cutoff)
    .limit(500)
    .get();

  const attachmentUrls = [];
  const batch = db.batch();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.attachmentUrl) attachmentUrls.push(data.attachmentUrl);
    batch.delete(d.ref);
  }
  await batch.commit();

  const storage = getStorage();
  const bucket = storage.bucket();
  for (const url of attachmentUrls) {
    try {
      const m = url.match(/\/o\/([^?]+)/);
      if (!m) continue;
      const objectPath = decodeURIComponent(m[1]);
      await bucket.file(objectPath).delete({ ignoreNotFound: true });
    } catch (e) {
      console.warn('staff-chat cleanup attachment delete failed:', e.message);
    }
  }

  console.log(`[staff-chat-cleanup] deleted ${snap.size} messages + ${attachmentUrls.length} attachments`);
});
