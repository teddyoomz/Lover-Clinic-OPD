// ─── /api/admin/infra-health-test-alert (2026-07-19) ───────────────────────
// Fires a TEST alert through the REAL alert channels (staff-chat system card +
// LINE OA text push) so the admin can verify end-to-end delivery with one
// button — the Rule Q L1 hook for the health monitor ("FCM success ≠
// displayed" lesson: the proof is the human SEEING the message arrive).
// Card id is CHAT-SYS-INFRA-TEST-{ts} (clearly labeled ทดสอบ; staff-chat
// retention sweeps it later — no cleanup pass needed).
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { verifyAdminOrPermissionToken } from './_lib/adminAuth.js';
import { getLineConfigForBranch } from './_lib/lineConfigAdmin.js';
import { pushLineMessage } from '../../src/lib/lineReminderClient.js';
import { INFRA_FALLBACK_STAFF_CHAT_BRANCH } from '../../src/lib/infraHealthCore.js';

const APP_ID = 'loverclinic-opd-4c39b';
const PREFIX = `artifacts/${APP_ID}/public/data`;

export default async function handler(req, res) {
  const auth = await verifyAdminOrPermissionToken(req, res, 'system_config_management');
  if (!auth) return; // 401/403 already written

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const db = getFirestore();
    const sysSnap = await db.doc(`${PREFIX}/clinic_settings/system_config`).get();
    const infraCfg = (sysSnap.exists && sysSnap.data()?.infraHealth) || {};
    const nowMs = Date.now();
    const text = `🩺 ทดสอบแจ้งเตือนสุขภาพระบบ LoverClinic\nถ้าเห็นข้อความนี้ = ช่องทางแจ้งเตือนใช้งานได้\n(ยิงโดย ${auth.email || auth.uid})`;

    // ① staff-chat card (admin SDK bypasses the client create validators —
    //    same path the intake/followup server cards use)
    const staffChat = { ok: false, branchId: '' };
    try {
      const branchId = String(infraCfg.staffChatBranchId || '') || INFRA_FALLBACK_STAFF_CHAT_BRANCH;
      const id = `CHAT-SYS-INFRA-TEST-${nowMs}`;
      await db.doc(`${PREFIX}/be_staff_chat_messages/${id}`).set({
        id,
        branchId,
        deviceId: 'system',
        displayName: 'ระบบ',
        text,
        system: { kind: 'infra-health', overall: 'ok', issueCount: 0, dateKey: 'TEST' },
        createdAt: FieldValue.serverTimestamp(),
      });
      staffChat.ok = true;
      staffChat.branchId = branchId;
    } catch (e) {
      staffChat.error = String(e?.message || e).slice(0, 200);
    }

    // ② LINE push per configured target (per-branch OA — recipient must be a
    //    friend of that branch's OA; 410 = blocked/unfollowed)
    const line = [];
    const targets = Array.isArray(infraCfg.lineTargets) ? infraCfg.lineTargets.slice(0, 5) : [];
    for (const t of targets) {
      const entry = { lineUserId: String(t?.lineUserId || ''), branchId: String(t?.branchId || ''), statusCode: 0 };
      try {
        const cfg = await getLineConfigForBranch(db, entry.branchId);
        if (!cfg || !cfg.channelAccessToken) entry.statusCode = -1; // no OA config for branch
        else {
          const r = await pushLineMessage({
            channelAccessToken: cfg.channelAccessToken,
            lineUserId: entry.lineUserId,
            flexJson: { type: 'text', text },
          });
          entry.statusCode = r.statusCode;
        }
      } catch (e) {
        entry.statusCode = -2;
        entry.error = String(e?.message || e).slice(0, 120);
      }
      line.push(entry);
    }

    return res.status(200).json({ ok: true, staffChat, line, noLineTargets: targets.length === 0 });
  } catch (e) {
    console.error('[infra-health-test-alert] failed:', e?.message || e);
    return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
  }
}
