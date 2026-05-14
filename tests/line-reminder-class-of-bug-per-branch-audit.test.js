// Task 14 — AV45 / LR-1..LR-5 per-branch LINE OA discipline source-grep regression
// (2026-05-15, LINE OA Appointment Reminder Phase)
//
// Locks the existing implementation shape after Wave 1-3 ships. Any future drift
// at one of the 5 invariant boundaries (push token / webhook resolve / customer
// lookup / modal UI / audit log) fails build. Companion spec:
// docs/superpowers/specs/2026-05-15-line-oa-appointment-reminder.md §18.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function readFile(p) { return fs.readFileSync(path.join(ROOT, p), 'utf8'); }

describe('AV45 / LR-1..LR-5 — per-branch LINE OA discipline', () => {
  describe('LR-1 Push API call uses per-branch channelAccessToken', () => {
    it('LR1.audit — fire endpoint passes channelAccessToken from branchCfg, NOT global', () => {
      const text = readFile('api/cron/line-reminder-fire.js');
      expect(text).toMatch(/channelAccessToken:\s*branchCfg\.channelAccessToken/);
      expect(text).not.toMatch(/process\.env\.LINE_CHANNEL_TOKEN/);
    });
    it('LR1.audit — retry endpoint uses getLineConfigForBranch', () => {
      const text = readFile('api/cron/line-reminder-retry.js');
      expect(text).toMatch(/getLineConfigForBranch/);
      expect(text).toMatch(/channelAccessToken:\s*(branchCfg|cfg)\.channelAccessToken/);
    });
    it('LR1.audit — debug fire endpoint uses getLineConfigForBranch', () => {
      const text = readFile('api/admin/line-reminder-debug-fire.js');
      expect(text).toMatch(/getLineConfigForBranch/);
    });
  });

  describe('LR-2 Webhook signature verification destination-routed', () => {
    it('LR2.audit — line.js uses resolveLineConfigForWebhook', () => {
      const text = readFile('api/webhook/line.js');
      expect(text).toMatch(/resolveLineConfigForWebhook/);
    });
  });

  describe('LR-3 Customer LINE userId branch-scoped helper', () => {
    it('LR3.audit — pipeline uses getCustomerLineUserIdAtBranch', () => {
      const text = readFile('api/cron/line-reminder-fire.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
    it('LR3.audit — debug fire uses helper', () => {
      const text = readFile('api/admin/line-reminder-debug-fire.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
    it('LR3.audit — retry uses helper', () => {
      const text = readFile('api/cron/line-reminder-retry.js');
      expect(text).toMatch(/getCustomerLineUserIdAtBranch/);
    });
    it('LR3.audit — admin link-requests writes per-branch lineUserId', () => {
      const text = readFile('api/admin/link-requests.js');
      expect(text).toMatch(/lineUserId_byBranch/);
    });
  });

  describe('LR-4 Cross-branch customer detection in modals', () => {
    const SITES = [
      'src/components/backend/AppointmentFormModal.jsx',
      'src/components/backend/DepositPanel.jsx',
      'src/components/backend/AppointmentCalendarView.jsx',
      'src/pages/AdminDashboard.jsx',
      'src/components/TreatmentFormPage.jsx',
    ];
    for (const site of SITES) {
      it(`LR4.audit — ${site.split('/').pop()} uses LineNotifyConfirmation + CustomerOption`, () => {
        const text = readFile(site);
        expect(text).toMatch(/LineNotifyConfirmation/);
        expect(text).toMatch(/CustomerOption/);
      });
    }
  });

  describe('LR-5 Audit log entries include branchId', () => {
    it('LR5.audit — buildReminderLogDoc has branchId field', () => {
      const text = readFile('src/lib/lineReminderClient.js');
      expect(text).toMatch(/branchId,/);
    });
    it('LR5.audit — postback log writes branchId', () => {
      const text = readFile('api/webhook/line.js');
      expect(text).toMatch(/be_line_reminder_postback_log[\s\S]{0,500}branchId/);
    });
  });

  it('AV45 — sanctioned exceptions documented in audit-anti-vibe-code SKILL.md', () => {
    const text = readFile('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(text).toMatch(/AV45/);
    expect(text).toMatch(/LINE OA per-branch/);
  });
});
