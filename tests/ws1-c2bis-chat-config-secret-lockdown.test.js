import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// ─── WS1 C2-bis (2026-06-10) — chat_config secret lockdown ───────────────────
// Pre-deploy audit found C2 (2bcba3e9) migrated the readers of
// clinic_settings/chat_config to the admin SDK but NEVER added the firestore.rule
// to actually tighten it → the LINE/FB channel secrets stayed world-readable via
// the `clinic_settings/{settingId} read: if true` wildcard (confirmed live: unauth
// GET → HTTP 200). This adds the missing more-specific staff-only match + guards
// that the webhook readers stay on the admin SDK (so the tightening can't break
// inbound chat).

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const rules = read('firestore.rules');
const lineWebhook = read('api/webhook/line.js');
const fbWebhook = read('api/webhook/facebook.js');

describe('WS1 C2-bis — chat_config secret lockdown', () => {
  it('firestore.rules has a specific clinic_settings/chat_config match (more-specific wins over the public wildcard)', () => {
    expect(rules).toMatch(/match \/clinic_settings\/chat_config \{/);
    // staff-only read+write (the secrets must not be world-readable)
    const block = rules.match(/match \/clinic_settings\/chat_config \{[\s\S]{0,200}?\}/)?.[0] || '';
    expect(block).toMatch(/allow read, write: if isClinicStaff\(\)/);
    expect(block).not.toMatch(/if true/);
  });

  it('the public wildcard still serves non-secret settings (theme/main), system_config stays staff-only', () => {
    expect(rules).toMatch(/match \/clinic_settings\/\{settingId\} \{[\s\S]{0,120}allow read: if true/);
    expect(rules).toMatch(/match \/clinic_settings\/system_config \{[\s\S]{0,120}allow read: if isClinicStaff\(\)/);
  });

  it('both webhooks read chat_config via the admin SDK (so the staff-only rule cannot break inbound chat)', () => {
    for (const src of [lineWebhook, fbWebhook]) {
      // getChatConfig must use getAdminFirestore (admin SDK bypasses rules),
      // NOT an unauth REST apiFetch to the chat_config path.
      const getCfg = src.match(/function getChatConfig\([\s\S]{0,400}?\n\}/)?.[0] || src;
      expect(getCfg).toMatch(/getAdminFirestore\(\)/);
      expect(getCfg).not.toMatch(/apiFetch\([^)]*CHAT_CONFIG_PATH/);
    }
  });
});
