// AV198 — source-grep regression locks for the staff-chat System notification card.
// These lock the invariants that protect against future drift (Rule P Tier-2).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('AV198 — staff-chat System notification card invariants', () => {
  it('A1 functions/index.js writes the card AFTER the FCM send, non-fatal, skips edits + no-branch', () => {
    const s = read('functions/index.js');
    expect(s).toMatch(/buildStaffChatNotification/);
    expect(s).toMatch(/writeStaffChatNotification/);
    expect(s).toMatch(/const isEdit = !!session\.updatedAt/);     // skip edits
    expect(s).toMatch(/if \(!isEdit\)/);
    expect(s).toMatch(/session\.linkedCustomerId \? 'followup' : 'intake'/); // kind detection
    // wrapped in its own try/catch (non-fatal — never breaks the push)
    expect(s).toMatch(/staff-chat notify failed/);
    expect(s).toMatch(/FieldValue/);
    // round-2 fix C: the card write MUST be BEFORE the FCM-token guards, so the
    // in-app card writes even when no device registered for push.
    expect(s.indexOf('writeStaffChatNotification(db')).toBeGreaterThan(0);
    expect(s.indexOf('writeStaffChatNotification(db')).toBeLessThan(s.indexOf('push_config/tokens'));
  });

  it('A2 builder always uses the system identity (deviceId:system, displayName:ระบบ) — never a human device', () => {
    const s = read('functions/staffChatNotify.js');
    expect(s).toMatch(/deviceId: 'system'/);
    expect(s).toMatch(/displayName: 'ระบบ'/);
    // writer skips when there is no branch to route to
    expect(s).toMatch(/if \(!doc \|\| !doc\.branchId\) return false/);
    expect(s).toMatch(/be_staff_chat_messages/);
    // round-3 fix #2: deterministic id per session → idempotent (no duplicate on retry)
    expect(s).toMatch(/CHAT-SYS-\$\{String\(sessionId\)\}/);
  });

  it('A8 system cards are read-only — buildReplySnapshot refuses a system message', () => {
    const s = read('src/lib/staffChatClient.js');
    expect(s).toMatch(/if \(msg\.system\) return null/);
  });

  it('A10 firestore.rules — "ระบบ" system cards are SERVER-ONLY at the rule layer (no client forge or delete)', () => {
    const s = read('firestore.rules');
    expect(s).toMatch(/allow delete: if isClinicStaff\(\) && !\('system' in resource\.data\)/); // can't delete a system card
    expect(s).toMatch(/&& !\('system' in request\.resource\.data\)/);                            // can't forge a system card on create
  });

  it('A9 card label colors are THEME-AWARE (AA in light mode) — no hardcoded soft-pink/tan that vanishes on a light card', () => {
    const s = read('src/components/staffchat/StaffChatSystemCard.jsx');
    // round-5 fix: the "ระบบ" label + "รอลงทะเบียน" pill must be theme-aware classes, not
    // hardcoded #f3b4b4 / #caa37a (1.37:1 on the light --bg-card).
    expect(s).not.toMatch(/#f3b4b4/);
    expect(s).not.toMatch(/color:\s*'#caa37a'/);
    expect(s).toMatch(/ระบบ · LoverClinic<\/div>/);
    expect(s).toMatch(/text-rose-700 dark:text-rose-300/);   // system label
    expect(s).toMatch(/text-amber-700 dark:text-amber-300/); // รอลงทะเบียน pill
  });

  it('A3 the customer NAME link is sky, NEVER red (Thai culture); fire-red only on icon/border', () => {
    const s = read('src/components/staffchat/StaffChatSystemCard.jsx');
    // the clickable name uses text-sky
    expect(s).toMatch(/system-card-customer-link[\s\S]*?text-sky/);
    // the NAME link must NOT be red
    const linkBlock = s.slice(s.indexOf('system-card-customer-link'), s.indexOf('system-card-customer-link') + 600);
    expect(linkBlock).not.toMatch(/text-red|#dc2626|#ef4444/);
  });

  it('A4 the link opens the customer detail in a NEW TAB via the canonical deep-link', () => {
    const s = read('src/components/staffchat/StaffChatSystemCard.jsx');
    expect(s).toMatch(/\/\?backend=1&customer=\$\{encodeURIComponent\(customerId\)\}/);
    expect(s).toMatch(/target="_blank"/);
    expect(s).toMatch(/rel="noopener noreferrer"/);
  });

  it('A5 StaffChatMessage routes system docs to the card BEFORE the human bubble', () => {
    const s = read('src/components/staffchat/StaffChatMessage.jsx');
    expect(s).toMatch(/import \{ StaffChatSystemCard \}/);
    expect(s).toMatch(/if \(message && message\.system\)/);
  });

  it('A6 intake live-resolves (never stores a stale customerId) — picker prefers system.customerId else session.brokerProClinicId', () => {
    const s = read('src/lib/staffChatNotifyResolve.js');
    expect(s).toMatch(/if \(sys\.customerId\) return String\(sys\.customerId\)/);
    expect(s).toMatch(/brokerProClinicId/);
    expect(s).toMatch(/onSnapshot/);            // live flip for intake
    expect(s).toMatch(/getCustomer/);           // live name + HN
    expect(s).toMatch(/system-card session listener/); // round-2 fix A: listener error is LOGGED, not silently swallowed
    expect(s).toMatch(/setMissing\(true\)/);    // round-1 fix: deleted-customer downgrade
  });

  it('A11 intake ALSO resolves via the linked appointment (booking-flow: session hard-deleted on save) — not only brokerProClinicId', () => {
    const s = read('src/lib/staffChatNotifyResolve.js');
    // pure picker prefers appointment.customerId over session.brokerProClinicId
    expect(s).toMatch(/if \(apptData && apptData\.customerId\) return String\(apptData\.customerId\)/);
    // the hook subscribes to be_appointments by linkedOpdSessionId (the durable, branch-agnostic signal)
    expect(s).toMatch(/be_appointments/);
    expect(s).toMatch(/where\('linkedOpdSessionId', '==', sessionId\)/);
    expect(s).toMatch(/system-card appointment listener/); // appt listener error LOGGED, not swallowed
  });

  it('A7 the AV198 invariant is recorded in the audit skill', () => {
    const s = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(s).toMatch(/AV198/);
  });
});
