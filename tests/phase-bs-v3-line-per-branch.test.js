// ─── Phase BS V3 — Per-branch LINE OA configuration tests ──────────────
//
// User directive 2026-05-04: "ตั้งค่า line OA กับ คำของผูก Line ก็แยกข้อมูล
//   กันนะ ใช้คนละ line กัน".
//
// Coverage:
//   F1 — pure helpers (mergeLineConfigDefaults, normalizeLineConfigForWrite,
//        validateLineConfig)
//   F2 — DEFAULT_LINE_CONFIG shape stable + frozen
//   F3 — saveLineConfig / getLineConfig wiring (mocked Firestore)
//   F4 — listenToLineConfig + findLineConfigByDestination wiring
//   F5 — webhook routes by destination → branchId stamped on link request
//   F6 — be_link_requests writes carry branchId in BS V3
//   F7 — admin endpoint adapters (line-test, send-document, link-requests)
//        accept + use branchId
//   F8 — source-grep regression — LineSettingsTab reads via lineConfigClient
//        (NOT direct chat_config), webhook imports resolveLineConfigForWebhook
//   F9 — firestore.rules — be_line_configs gate matches design
//   F10 — migration script shape

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── F1 — pure helpers ──────────────────────────────────────────────────
describe('Phase BS V3 F1 — lineConfigClient pure helpers', () => {
  it('F1.1 — mergeLineConfigDefaults fills missing keys', async () => {
    const { mergeLineConfigDefaults, DEFAULT_LINE_CONFIG } = await import('../src/lib/lineConfigClient.js');
    const merged = mergeLineConfigDefaults({});
    expect(merged.channelId).toBe('');
    expect(merged.enabled).toBe(false);
    expect(merged.coursesKeywords).toEqual(DEFAULT_LINE_CONFIG.coursesKeywords);
    expect(merged.tokenTtlMinutes).toBe(1440);
  });

  it('F1.2 — mergeLineConfigDefaults preserves existing non-empty arrays', async () => {
    const { mergeLineConfigDefaults } = await import('../src/lib/lineConfigClient.js');
    const merged = mergeLineConfigDefaults({ coursesKeywords: ['custom'] });
    expect(merged.coursesKeywords).toEqual(['custom']);
  });

  it('F1.3 — mergeLineConfigDefaults falls back when array is empty', async () => {
    const { mergeLineConfigDefaults, DEFAULT_LINE_CONFIG } = await import('../src/lib/lineConfigClient.js');
    const merged = mergeLineConfigDefaults({ coursesKeywords: [] });
    expect(merged.coursesKeywords).toEqual(DEFAULT_LINE_CONFIG.coursesKeywords);
  });

  it('F1.4 — normalizeLineConfigForWrite trims + clamps', async () => {
    const { normalizeLineConfigForWrite } = await import('../src/lib/lineConfigClient.js');
    const out = normalizeLineConfigForWrite({
      branchId: '  BR-X  ',
      channelAccessToken: '  tok  ',
      maxCoursesInReply: 9999,
      maxAppointmentsInReply: -5,
      tokenTtlMinutes: 99999999,
      alreadyLinkedRule: 'unknown',
      coursesKeywords: ['  คอร์ส  ', '', null, 'two'],
    });
    expect(out.branchId).toBe('BR-X');
    expect(out.channelAccessToken).toBe('tok');
    expect(out.maxCoursesInReply).toBe(100);   // clamped
    expect(out.maxAppointmentsInReply).toBe(1); // clamped
    expect(out.tokenTtlMinutes).toBe(60 * 24 * 7);
    expect(out.alreadyLinkedRule).toBe('block'); // fallback
    expect(out.coursesKeywords).toEqual(['คอร์ส', 'two']);
  });

  it('F1.5 — validateLineConfig requires creds when enabled', async () => {
    const { validateLineConfig } = await import('../src/lib/lineConfigClient.js');
    expect(validateLineConfig({ enabled: true }).valid).toBe(false);
    expect(validateLineConfig({ enabled: true, channelSecret: 's', channelAccessToken: 't' }).valid).toBe(true);
    expect(validateLineConfig({ enabled: false }).valid).toBe(true);
  });

  it('F1.6 — validateLineConfig flags malformed botBasicId', async () => {
    const { validateLineConfig } = await import('../src/lib/lineConfigClient.js');
    expect(validateLineConfig({ botBasicId: 'no-at-prefix' }).valid).toBe(false);
    expect(validateLineConfig({ botBasicId: '@123abcde' }).valid).toBe(true);
    expect(validateLineConfig({ botBasicId: '' }).valid).toBe(true); // optional
  });
});

// ─── F2 — DEFAULT_LINE_CONFIG shape stable ──────────────────────────────
describe('Phase BS V3 F2 — DEFAULT_LINE_CONFIG', () => {
  it('F2.1 — DEFAULT_LINE_CONFIG is frozen', async () => {
    const { DEFAULT_LINE_CONFIG } = await import('../src/lib/lineConfigClient.js');
    expect(Object.isFrozen(DEFAULT_LINE_CONFIG)).toBe(true);
  });

  it('F2.2 — DEFAULT_LINE_CONFIG has all required keys', async () => {
    const { DEFAULT_LINE_CONFIG } = await import('../src/lib/lineConfigClient.js');
    const required = [
      'channelId', 'channelSecret', 'channelAccessToken', 'botBasicId', 'destination',
      'enabled', 'botEnabled',
      'coursesKeywords', 'appointmentsKeywords',
      'maxCoursesInReply', 'maxAppointmentsInReply',
      'helpMessage', 'welcomeMessage', 'notLinkedMessage',
      'tokenTtlMinutes', 'alreadyLinkedRule',
    ];
    for (const k of required) expect(DEFAULT_LINE_CONFIG).toHaveProperty(k);
  });
});

// ─── F3 — saveLineConfig / getLineConfig wiring ────────────────────────
describe('Phase BS V3 F3 — saveLineConfig / getLineConfig', () => {
  beforeEach(() => vi.resetModules());

  it('F3.1 — saveLineConfig requires non-empty branchId', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      setDoc: vi.fn(async () => undefined),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const mod = await import('../src/lib/lineConfigClient.js');
    await expect(mod.saveLineConfig('', { channelId: 'x' })).rejects.toThrow(/branchId required/);
    await expect(mod.saveLineConfig('   ', { channelId: 'x' })).rejects.toThrow(/branchId required/);
  });

  it('F3.2 — saveLineConfig stamps branchId + updatedAt', async () => {
    const setDocSpy = vi.fn(async () => undefined);
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({ _id: 'mock-ref' }),
      getDoc: async () => ({ exists: () => false }),
      setDoc: setDocSpy,
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const mod = await import('../src/lib/lineConfigClient.js');
    await mod.saveLineConfig('BR-1', { channelId: '123', enabled: false });
    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [, payload, opts] = setDocSpy.mock.calls[0];
    expect(payload.branchId).toBe('BR-1');
    expect(typeof payload.updatedAt).toBe('string');
    expect(opts).toEqual({ merge: true });
  });

  it('F3.3 — getLineConfig returns null when doc missing', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false, data: () => null }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const mod = await import('../src/lib/lineConfigClient.js');
    const out = await mod.getLineConfig('BR-1');
    expect(out).toBeNull();
  });

  it('F3.4 — getLineConfig merges with defaults when doc exists', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({
        exists: () => true,
        data: () => ({ channelAccessToken: 'tok', enabled: true }),
      }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const mod = await import('../src/lib/lineConfigClient.js');
    const out = await mod.getLineConfig('BR-1');
    expect(out.channelAccessToken).toBe('tok');
    expect(out.enabled).toBe(true);
    expect(out.botEnabled).toBe(true); // default
    expect(Array.isArray(out.coursesKeywords)).toBe(true);
  });
});

// ─── F4 — listenToLineConfig + findLineConfigByDestination ──────────────
describe('Phase BS V3 F4 — listener + by-destination', () => {
  beforeEach(() => vi.resetModules());

  it('F4.1 — listenToLineConfig with empty branchId calls onChange(null)', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const { listenToLineConfig } = await import('../src/lib/lineConfigClient.js');
    const onChange = vi.fn();
    const unsub = listenToLineConfig('', onChange);
    expect(typeof unsub).toBe('function');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('F4.2 — findLineConfigByDestination returns matching doc', async () => {
    const fakeDoc = { id: 'BR-X', data: () => ({ branchId: 'BR-X', destination: 'U123', channelAccessToken: 'tok' }) };
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: false, docs: [fakeDoc] }),
    }));
    const { findLineConfigByDestination } = await import('../src/lib/lineConfigClient.js');
    const out = await findLineConfigByDestination('U123');
    expect(out).toBeTruthy();
    expect(out.branchId).toBe('BR-X');
    expect(out.config.channelAccessToken).toBe('tok');
  });

  it('F4.3 — findLineConfigByDestination returns null when no match', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const { findLineConfigByDestination } = await import('../src/lib/lineConfigClient.js');
    expect(await findLineConfigByDestination('Unone')).toBeNull();
  });

  it('F4.4 — findLineConfigByDestination returns null on empty input', async () => {
    vi.doMock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: null }));
    vi.doMock('firebase/firestore', () => ({
      doc: () => ({}),
      getDoc: async () => ({ exists: () => false }),
      setDoc: vi.fn(),
      onSnapshot: () => () => {},
      collection: () => ({}),
      query: () => ({}),
      where: () => ({}),
      limit: () => ({}),
      getDocs: async () => ({ empty: true, docs: [] }),
    }));
    const { findLineConfigByDestination } = await import('../src/lib/lineConfigClient.js');
    expect(await findLineConfigByDestination('')).toBeNull();
    expect(await findLineConfigByDestination(null)).toBeNull();
  });
});

// ─── F5 — webhook routes by destination ─────────────────────────────────
describe('Phase BS V3 F5 — webhook source-grep + admin SDK helper', () => {
  it('F5.1 — webhook imports resolveLineConfigForWebhook', () => {
    const src = read('api/webhook/line.js');
    expect(src).toMatch(/import\s*{[^}]*resolveLineConfigForWebhook[^}]*}\s*from\s*['"][^'"]*lineConfigAdmin/);
  });

  it('F5.2 — processEvent calls resolveLineConfigForWebhook for per-event routing', () => {
    const src = read('api/webhook/line.js');
    const procIdx = src.indexOf('async function processEvent');
    const procEnd = src.indexOf('// ─── Handler', procIdx);
    expect(procIdx).toBeGreaterThan(-1);
    const procBody = src.slice(procIdx, procEnd);
    expect(procBody).toMatch(/resolveLineConfigForWebhook\s*\(\s*db\s*,\s*event\s*\)/);
  });

  it('F5.3 — processEvent returns early when no config resolves', () => {
    const src = read('api/webhook/line.js');
    expect(src).toMatch(/if\s*\(\s*!config\?\.channelAccessToken\s*\)\s*return;/);
  });

  it('F5.4 — handler verifies signature against the resolved config', () => {
    const src = read('api/webhook/line.js');
    expect(src).toMatch(/verifySignature\s*\([^)]*verifyConfig\.channelSecret\s*\)/);
  });

  it('F5.5 — _lib/lineConfigAdmin exports the four resolution helpers', () => {
    const src = read('api/admin/_lib/lineConfigAdmin.js');
    expect(src).toMatch(/export\s+async\s+function\s+resolveLineConfigForWebhook/);
    expect(src).toMatch(/export\s+async\s+function\s+resolveLineConfigForAdmin/);
    expect(src).toMatch(/export\s+async\s+function\s+findLineConfigByDestination/);
    expect(src).toMatch(/export\s+async\s+function\s+getLineConfigForBranch/);
  });
});

// ─── F6 — be_link_requests writes carry branchId ────────────────────────
describe('Phase BS V3 F6 — link request branchId stamp', () => {
  it('F6.1 — createLinkRequest accepts + writes branchId', () => {
    const src = read('api/webhook/line.js');
    expect(src).toMatch(/async\s+function\s+createLinkRequest\s*\(\s*\{\s*[^}]*\bbranchId\b[^}]*\}\s*\)/);
    expect(src).toMatch(/branchId:\s*stampedBranchId/);
  });

  it('F6.2 — maybeEmitBotReply forwards branchId into createLinkRequest', () => {
    const src = read('api/webhook/line.js');
    expect(src).toMatch(/createLinkRequest\s*\(\s*\{[^}]*idValue,\s*branchId\s*\}/);
  });

  it('F6.3 — link-requests admin endpoint resolves token by branchId', () => {
    const src = read('api/admin/link-requests.js');
    expect(src).toMatch(/getLineTokenForBranch\s*\(\s*db\s*,\s*requestBranchId\s*\)/);
    // No more ungated chat_config-only path:
    expect(src).not.toMatch(/snap\.data\(\)\?\.\s*line\?\.\s*channelAccessToken/);
  });
});

// ─── F7 — admin endpoint adapters ───────────────────────────────────────
describe('Phase BS V3 F7 — admin endpoints branchId-aware', () => {
  it('F7.1 — line-test accepts branchId param', () => {
    const src = read('api/admin/line-test.js');
    expect(src).toMatch(/const\s*\{\s*action,\s*branchId\s*\}\s*=\s*body/);
    expect(src).toMatch(/getLineConfigResolved\s*\(\s*db\s*,\s*branchId\s*\)/);
  });

  it('F7.2 — line-test persists destination on success when source=be_line_configs', () => {
    const src = read('api/admin/line-test.js');
    expect(src).toMatch(/source\s*===\s*['"]be_line_configs['"]/);
    expect(src).toMatch(/destination:\s*info\.userId/);
  });

  it('F7.3 — send-document accepts branchId + customerId in body', () => {
    const src = read('api/admin/send-document.js');
    expect(src).toMatch(/const\s*\{[^}]*\bbranchId\b[^}]*\}\s*=\s*body/);
    expect(src).toMatch(/be_customers\/\$\{customerId\}/);
    expect(src).toMatch(/getLineTokenForBranch\s*\(\s*db\s*,\s*resolvedBranchId\s*\)/);
  });

  it('F7.4 — lineTestClient passes branchId in payload', () => {
    const src = read('src/lib/lineTestClient.js');
    expect(src).toMatch(/testLineConnection\s*\(\s*\{\s*branchId/);
    expect(src).toMatch(/branchId:\s*branchId\s*\|\|\s*null/);
  });
});

// ─── F8 — source-grep regression ────────────────────────────────────────
describe('Phase BS V3 F8 — source-grep regression guards', () => {
  it('F8.1 — LineSettingsTab uses lineConfigClient (NOT direct chat_config)', () => {
    const src = read('src/components/backend/LineSettingsTab.jsx');
    expect(src).toMatch(/from\s+['"][^'"]*lineConfigClient/);
    expect(src).toMatch(/getLineConfig\s*\(\s*branchId\s*\)/);
    expect(src).toMatch(/saveLineConfig\s*\(\s*branchId,\s*form\s*\)/);
    // Direct read of clinic_settings/chat_config removed (strip comments
    // first so historical-context comments don't trigger false positives).
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toMatch(/clinic_settings/);
    expect(code).not.toMatch(/chat_config/);
    expect(code).not.toMatch(/data\(\)\?\.\s*line\b/);
  });

  it('F8.2 — LineSettingsTab uses useSelectedBranch hook', () => {
    const src = read('src/components/backend/LineSettingsTab.jsx');
    expect(src).toMatch(/import\s*\{[^}]*useSelectedBranch[^}]*\}\s*from\s*['"][^'"]*BranchContext/);
    expect(src).toMatch(/useSelectedBranch\(\s*\)/);
  });

  it('F8.3 — LineSettingsTab renders branch-scope hint with branchName', () => {
    const src = read('src/components/backend/LineSettingsTab.jsx');
    expect(src).toMatch(/data-testid="line-settings-branch-hint"/);
    expect(src).toMatch(/แต่ละสาขาใช้ LINE OA แยกกัน/);
  });

  it('F8.4 — webhook keeps signature verification before processEvent', () => {
    const src = read('api/webhook/line.js');
    const sigIdx = src.indexOf('verifySignature(rawBody');
    const procMapIdx = src.indexOf('events.map(e => processEvent');
    expect(sigIdx).toBeGreaterThan(-1);
    expect(procMapIdx).toBeGreaterThan(-1);
    expect(sigIdx).toBeLessThan(procMapIdx);
  });
});

// ─── F9 — firestore.rules be_line_configs gate ──────────────────────────
describe('Phase BS V3 F9 — firestore.rules', () => {
  const src = read('firestore.rules');

  it('F9.1 — be_line_configs match block exists', () => {
    expect(src).toMatch(/match\s+\/be_line_configs\/\{branchId\}/);
  });

  it('F9.2 — read open to clinic staff', () => {
    const idx = src.indexOf('match /be_line_configs/{branchId}');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/allow read:\s*if\s+isClinicStaff\(\)/);
  });

  it('F9.3 — write gated to admin OR system_config_management permission', () => {
    const idx = src.indexOf('match /be_line_configs/{branchId}');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/allow create,\s*update:/);
    expect(block).toMatch(/admin\s*==\s*true/);
    expect(block).toMatch(/perm_system_config_management/);
  });

  it('F9.4 — delete gated to admin', () => {
    const idx = src.indexOf('match /be_line_configs/{branchId}');
    const block = src.slice(idx, idx + 600);
    expect(block).toMatch(/allow delete:\s*if\s+isSignedIn\(\)\s*&&\s*request\.auth\.token\.admin\s*==\s*true/);
  });
});

// ─── F10 — migration script ─────────────────────────────────────────────
describe('Phase BS V3 F10 — migration script', () => {
  const src = read('scripts/line-config-migrate.mjs');

  it('F10.1 — copies clinic_settings/chat_config.line to be_line_configs/{NAKHON_ID}', () => {
    expect(src).toMatch(/clinic_settings.*chat_config/);
    expect(src).toMatch(/be_line_configs/);
    expect(src).toMatch(/BR-1777873556815-26df6480/);
  });

  it('F10.2 — calls /v2/bot/info to populate destination', () => {
    expect(src).toMatch(/api\.line\.me\/v2\/bot\/info/);
    expect(src).toMatch(/destination/);
  });

  it('F10.3 — writes audit doc with type=line-config-migrate', () => {
    expect(src).toMatch(/type:\s*['"]line-config-migrate['"]/);
    expect(src).toMatch(/be_admin_audit/);
  });

  it('F10.4 — does NOT delete the legacy chat_config.line (kept as fallback)', () => {
    // Should not contain a delete on clinic_settings/chat_config
    expect(src).not.toMatch(/\.delete\(\)\s*\/\/.*chat_config/);
    expect(src).not.toMatch(/chatCfgRef\.delete/);
  });
});
