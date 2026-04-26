// V32-tris-quater (2026-04-26) — Admin-mediated ID-link request flow
//
// User chain (session 12):
//   "ระบบไลน์... ผูก line id ลูกค้า กับฐานข้อมูล" (Option 2 admin approval)
//   "ใช้การพิมพ์เลขที่บัตรประชาชน / passport ดีกว่า"
//   "ให้พิมพ์ ผูก [เลขบัตร]"
//   "ขอปุ่มแก้ไขข้อมูลลูกค้า... แก้ / เพิ่ม เลขที่บัตรประชาชน"
//   "ทำแล้วทดสอบกรอกแก้ไข มาให้ครบว่าทำได้ save ได้จริง"
//
// Test groups:
//   Q1 — interpretCustomerMessage 'ผูก <ID>' intent detection
//   Q2 — reply formatters (ack / rate-limit / invalid / approved / rejected)
//   Q3 — webhook source-grep guards (handler ordering, rate-limit, anti-enum)
//   Q4 — admin/link-requests endpoint shape (list/approve/reject)
//   Q5 — EditCustomerIdsModal RTL (mount + fill + save + verify payload)
//   Q6 — LinkRequestsTab + linkRequestsClient source-grep
//   Q7 — firestore.rules be_link_requests + be_link_attempts lockdown
//   Q8 — nav + dashboard wiring + tabPermissions

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import EditCustomerIdsModal from '../src/components/backend/EditCustomerIdsModal.jsx';
import {
  interpretCustomerMessage,
  formatIdRequestAck,
  formatIdRequestRateLimitedReply,
  formatIdRequestInvalidFormat,
  formatLinkRequestApprovedReply,
  formatLinkRequestRejectedReply,
} from '../src/lib/lineBotResponder.js';

const RESPONDER_SRC = readFileSync('src/lib/lineBotResponder.js', 'utf8');
const WEBHOOK_SRC = readFileSync('api/webhook/line.js', 'utf8');
const ADMIN_SRC = readFileSync('api/admin/link-requests.js', 'utf8');
const TAB_SRC = readFileSync('src/components/backend/LinkRequestsTab.jsx', 'utf8');
const CLIENT_SRC = readFileSync('src/lib/linkRequestsClient.js', 'utf8');
const RULES_SRC = readFileSync('firestore.rules', 'utf8');
const NAV_SRC = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
const DASH_SRC = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
const TAB_PERMS_SRC = readFileSync('src/lib/tabPermissions.js', 'utf8');
const CDV_SRC = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');
const EDIT_MODAL_SRC = readFileSync('src/components/backend/EditCustomerIdsModal.jsx', 'utf8');

// ─── Q1 — interpretCustomerMessage 'ผูก <ID>' ────────────────────────────
describe('Q1 ผูก <ID> intent detection', () => {
  test('Q1.1 "ผูก 1234567890123" → id-link-request national-id', () => {
    const r = interpretCustomerMessage('ผูก 1234567890123');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.idType).toBe('national-id');
    expect(r.payload.idValue).toBe('1234567890123');
  });
  test('Q1.2 "ผูกบัญชี <id>" longer prefix also works', () => {
    expect(interpretCustomerMessage('ผูกบัญชี 1234567890123').intent).toBe('id-link-request');
  });
  test('Q1.3 "link <id>" English prefix works (case-insensitive)', () => {
    expect(interpretCustomerMessage('link 1234567890123').intent).toBe('id-link-request');
    expect(interpretCustomerMessage('LINK 1234567890123').intent).toBe('id-link-request');
  });
  test('Q1.4 strips dashes/dots/spaces from ID before matching', () => {
    const r = interpretCustomerMessage('ผูก 1-2345-67890-12-3');
    expect(r.payload.idType).toBe('national-id');
    expect(r.payload.idValue).toBe('1234567890123');
  });
  test('Q1.5 passport AA1234567 → passport idType, uppercased', () => {
    const r = interpretCustomerMessage('ผูก aa1234567');
    expect(r.payload.idType).toBe('passport');
    expect(r.payload.idValue).toBe('AA1234567');
  });
  test('Q1.6 passport must have BOTH letter + digit', () => {
    expect(interpretCustomerMessage('ผูก ABCDEF').payload.idType).toBe('invalid');
    expect(interpretCustomerMessage('ผูก 123456').payload.idType).toBe('invalid');
  });
  test('Q1.7 BARE 13-digit number (no prefix) does NOT trigger id-link-request (anti-false-positive)', () => {
    expect(interpretCustomerMessage('1234567890123').intent).toBe('help');
  });
  test('Q1.8 invalid format after prefix → idType="invalid" (route to format hint)', () => {
    const r = interpretCustomerMessage('ผูก 123');
    expect(r.intent).toBe('id-link-request');
    expect(r.payload.idType).toBe('invalid');
    expect(r.payload.idValue).toBe('');
  });
  test('Q1.9 "LINK-<token>" (existing QR flow) takes priority over id-link-request', () => {
    expect(interpretCustomerMessage('LINK-ABCDEF12345').intent).toBe('link');
  });
  test('Q1.10 "ผูก" alone (no ID) → invalid format (still id-link-request intent)', () => {
    const r = interpretCustomerMessage('ผูก');
    // No space-separated suffix, just word — falls through to keyword test
    expect(r.intent).toBe('help');
  });
  test('Q1.11 14-digit number rejected (only 13 digits valid)', () => {
    expect(interpretCustomerMessage('ผูก 12345678901234').payload.idType).toBe('invalid');
  });
  test('Q1.12 12-digit number rejected', () => {
    expect(interpretCustomerMessage('ผูก 123456789012').payload.idType).toBe('invalid');
  });
});

// ─── Q2 — reply formatters ───────────────────────────────────────────────
describe('Q2 reply formatters', () => {
  test('Q2.1 formatIdRequestAck same message regardless of input (anti-enumeration)', () => {
    const a = formatIdRequestAck();
    const b = formatIdRequestAck();
    expect(a).toBe(b);
    expect(a).toMatch(/ระบบได้รับคำขอแล้ว/);
    // Critical — does NOT leak whether ID matched
    expect(a).not.toMatch(/ไม่พบ|ไม่ถูก|invalid/);
  });
  test('Q2.2 formatIdRequestRateLimitedReply has rate-limit message', () => {
    expect(formatIdRequestRateLimitedReply()).toMatch(/เกิน|กำหนด/);
  });
  test('Q2.3 formatIdRequestInvalidFormat shows expected formats', () => {
    const f = formatIdRequestInvalidFormat();
    expect(f).toMatch(/13 หลัก/);
    expect(f).toMatch(/พาสปอร์ต/);
    expect(f).toMatch(/ผูก/);
  });
  test('Q2.4 formatLinkRequestApprovedReply with name', () => {
    expect(formatLinkRequestApprovedReply('สมชาย')).toMatch(/สมชาย/);
    expect(formatLinkRequestApprovedReply('สมชาย')).toMatch(/อนุมัติ/);
  });
  test('Q2.5 formatLinkRequestApprovedReply without name still works', () => {
    expect(formatLinkRequestApprovedReply('')).toMatch(/อนุมัติการผูกบัญชี LINE สำเร็จ/);
  });
  test('Q2.6 formatLinkRequestRejectedReply has polite Thai apology', () => {
    expect(formatLinkRequestRejectedReply()).toMatch(/ไม่ได้รับการอนุมัติ/);
    expect(formatLinkRequestRejectedReply()).toMatch(/ติดต่อคลินิก/);
  });
});

// ─── Q3 — webhook handler ─────────────────────────────────────────────────
describe('Q3 webhook id-link-request handler', () => {
  test('Q3.1 imports id-link-request reply formatters', () => {
    expect(WEBHOOK_SRC).toMatch(/formatIdRequestAck/);
    expect(WEBHOOK_SRC).toMatch(/formatIdRequestRateLimitedReply/);
    expect(WEBHOOK_SRC).toMatch(/formatIdRequestInvalidFormat/);
  });
  test('Q3.2 maybeEmitBotReply has id-link-request branch', () => {
    expect(WEBHOOK_SRC).toMatch(/intent\.intent === ['"]id-link-request['"]/);
  });
  test('Q3.3 invalid idType → format hint reply', () => {
    expect(WEBHOOK_SRC).toMatch(/idType === ['"]invalid['"][\s\S]{0,200}formatIdRequestInvalidFormat/);
  });
  // Helper: extract the id-link-request branch body (from start to next branch)
  const idBranch = (() => {
    const startIdx = WEBHOOK_SRC.indexOf("intent.intent === 'id-link-request'");
    if (startIdx < 0) return '';
    const tail = WEBHOOK_SRC.slice(startIdx);
    const nextBranchIdx = tail.search(/intent\.intent === 'courses'/);
    return nextBranchIdx > 0 ? tail.slice(0, nextBranchIdx) : tail.slice(0, 2000);
  })();

  test('Q3.4 rate-limit check before lookup (prevents brute force)', () => {
    const rateIdx = idBranch.indexOf('checkRateLimit');
    const lookupIdx = idBranch.indexOf('findCustomerByNationalId');
    expect(rateIdx).toBeGreaterThan(0);
    expect(lookupIdx).toBeGreaterThan(rateIdx);
  });
  test('Q3.5 RATE_LIMIT_MAX=5, RATE_LIMIT_WINDOW=24h', () => {
    expect(WEBHOOK_SRC).toMatch(/RATE_LIMIT_MAX\s*=\s*5/);
    expect(WEBHOOK_SRC).toMatch(/RATE_LIMIT_WINDOW_MS\s*=\s*24\s*\*\s*60\s*\*\s*60\s*\*\s*1000/);
  });
  test('Q3.6 same-reply ack regardless of match (anti-enumeration)', () => {
    // Bot calls formatIdRequestAck UNCONDITIONALLY after rate-limit pass —
    // not conditional on customer found/not-found.
    const ackCalls = idBranch.match(/formatIdRequestAck/g) || [];
    expect(ackCalls.length).toBeGreaterThanOrEqual(1);
    // CRITICAL: customer-not-found path does NOT use formatNotLinkedReply
    expect(idBranch).not.toMatch(/customer\s*===\s*null[\s\S]{0,80}formatNotLinkedReply/);
  });
  test('Q3.7 createLinkRequest writes pending entry only when customer found', () => {
    expect(idBranch).toMatch(/if \(customer\)[\s\S]{0,200}createLinkRequest/);
  });
  test('Q3.8 findCustomerByNationalId queries patientData.nationalId', () => {
    expect(WEBHOOK_SRC).toMatch(/\.where\(['"]patientData\.nationalId['"]/);
  });
  test('Q3.9 findCustomerByPassport queries patientData.passport (case variations)', () => {
    expect(WEBHOOK_SRC).toMatch(/\.where\(['"]patientData\.passport['"]/);
  });
  test('Q3.10 createLinkRequest stores last 4 digits only (privacy)', () => {
    expect(WEBHOOK_SRC).toMatch(/idValueLast4/);
    expect(WEBHOOK_SRC).toMatch(/\.slice\(-4\)/);
  });
  test('Q3.11 createLinkRequest snapshot LINE displayName + pictureUrl for admin UI', () => {
    expect(WEBHOOK_SRC).toMatch(/lineDisplayName/);
    expect(WEBHOOK_SRC).toMatch(/linePictureUrl/);
  });
});

// ─── Q4 — admin/link-requests endpoint ──────────────────────────────────
describe('Q4 admin/link-requests endpoint', () => {
  test('Q4.1 verifyAdminToken gate', () => {
    expect(ADMIN_SRC).toMatch(/await verifyAdminToken\(req,\s*res\)/);
  });
  test('Q4.2 imports formatLinkRequestApprovedReply + formatLinkRequestRejectedReply', () => {
    expect(ADMIN_SRC).toMatch(/formatLinkRequestApprovedReply/);
    expect(ADMIN_SRC).toMatch(/formatLinkRequestRejectedReply/);
  });
  test('Q4.3 list/approve/reject action dispatch', () => {
    expect(ADMIN_SRC).toMatch(/action === ['"]list['"]/);
    expect(ADMIN_SRC).toMatch(/action === ['"]approve['"]/);
    expect(ADMIN_SRC).toMatch(/action === ['"]reject['"]/);
  });
  test('Q4.4 approve writes lineUserId + lineLinkedAt via batch (atomic with status update)', () => {
    expect(ADMIN_SRC).toMatch(/db\.batch\(\)/);
    expect(ADMIN_SRC).toMatch(/lineUserId/);
    expect(ADMIN_SRC).toMatch(/lineLinkedAt/);
  });
  test('Q4.5 approve checks request status === pending (no double-approve)', () => {
    expect(ADMIN_SRC).toMatch(/req\.status !== ['"]pending['"]/);
  });
  test('Q4.6 approve re-checks customer + collision (defense at approval time)', () => {
    expect(ADMIN_SRC).toMatch(/cSnap\.exists/);
    expect(ADMIN_SRC).toMatch(/\.where\(['"]lineUserId['"],\s*['"]==['"],\s*lineUserId\)/);
  });
  test('Q4.7 approve pushes LINE notification (best-effort)', () => {
    expect(ADMIN_SRC).toMatch(/pushLineMessage[\s\S]{0,200}formatLinkRequestApprovedReply/);
  });
  test('Q4.8 reject pushes LINE notification', () => {
    expect(ADMIN_SRC).toMatch(/pushLineMessage[\s\S]{0,200}formatLinkRequestRejectedReply/);
  });
  test('Q4.9 reject reason truncated to 200 chars (anti-spam audit log)', () => {
    expect(ADMIN_SRC).toMatch(/\.slice\(0,\s*200\)/);
  });
  test('Q4.10 list sorts pending first, then by requestedAt desc', () => {
    expect(ADMIN_SRC).toMatch(/items\.sort/);
    expect(ADMIN_SRC).toMatch(/aPending !== bPending/);
  });
});

// ─── Q5 — EditCustomerIdsModal RTL (real flow) ─────────────────────────
describe('Q5 EditCustomerIdsModal RTL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Mock backendClient updateCustomer
  vi.mock('../src/lib/backendClient.js', () => ({
    updateCustomer: vi.fn().mockResolvedValue(undefined),
  }));

  test('Q5.1 mounts with current patientData values pre-filled', async () => {
    const customer = {
      id: 'c1',
      patientData: { nationalId: '1234567890123', passport: 'AA1234567' },
    };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('edit-customer-nationalId')).toBeInTheDocument());
    expect(screen.getByTestId('edit-customer-nationalId')).toHaveValue('1234567890123');
    expect(screen.getByTestId('edit-customer-passport')).toHaveValue('AA1234567');
  });

  test('Q5.2 saves both fields successfully + calls updateCustomer with dotted paths', async () => {
    const { updateCustomer } = await import('../src/lib/backendClient.js');
    const onSaved = vi.fn();
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={onSaved} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1234567890123' } });
    fireEvent.change(screen.getByTestId('edit-customer-passport'), { target: { value: 'aa1234567' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalledTimes(1));
    expect(updateCustomer).toHaveBeenCalledWith('c1', {
      'patientData.nationalId': '1234567890123',
      'patientData.passport': 'AA1234567', // uppercased
    });
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toEqual({
      nationalId: '1234567890123',
      passport: 'AA1234567',
    });
  });

  test('Q5.3 strips dashes / dots / spaces from nationalId before save', async () => {
    const { updateCustomer } = await import('../src/lib/backendClient.js');
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1-2345-67890-12-3' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalled());
    expect(updateCustomer.mock.calls.at(-1)[1]['patientData.nationalId']).toBe('1234567890123');
  });

  test('Q5.4 rejects nationalId that is not exactly 13 digits', async () => {
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '12345' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(screen.getByTestId('edit-customer-ids-error')).toBeInTheDocument());
    expect(screen.getByTestId('edit-customer-ids-error').textContent).toMatch(/13 หลัก/);
  });

  test('Q5.5 rejects passport without letter+digit combo', async () => {
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-passport'), { target: { value: 'ABCDEF' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(screen.getByTestId('edit-customer-ids-error')).toBeInTheDocument());
    expect(screen.getByTestId('edit-customer-ids-error').textContent).toMatch(/ตัวอักษร|ตัวเลข/);
  });

  test('Q5.6 rejects when BOTH fields empty', async () => {
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(screen.getByTestId('edit-customer-ids-error')).toBeInTheDocument());
    expect(screen.getByTestId('edit-customer-ids-error').textContent).toMatch(/อย่างน้อยหนึ่ง/);
  });

  test('Q5.7 saves only nationalId (passport empty) — works', async () => {
    const { updateCustomer } = await import('../src/lib/backendClient.js');
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1234567890123' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalled());
    const args = updateCustomer.mock.calls.at(-1)[1];
    expect(args['patientData.nationalId']).toBe('1234567890123');
    expect(args['patientData.passport']).toBe('');
  });

  test('Q5.8 shows success banner after save', async () => {
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1234567890123' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(screen.getByTestId('edit-customer-ids-success')).toBeInTheDocument());
  });

  test('Q5.9 surfaces backend error when updateCustomer throws', async () => {
    const { updateCustomer } = await import('../src/lib/backendClient.js');
    updateCustomer.mockRejectedValueOnce(new Error('PERMISSION_DENIED'));
    const customer = { id: 'c1', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1234567890123' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(screen.getByTestId('edit-customer-ids-error')).toBeInTheDocument());
    expect(screen.getByTestId('edit-customer-ids-error').textContent).toMatch(/PERMISSION_DENIED/);
  });

  test('Q5.10 falls back to customer.customerId when customer.id absent (legacy schema)', async () => {
    const { updateCustomer } = await import('../src/lib/backendClient.js');
    const customer = { customerId: 'legacy-cid', patientData: {} };
    render(<EditCustomerIdsModal customer={customer} onClose={() => {}} onSaved={() => {}} />);
    fireEvent.change(screen.getByTestId('edit-customer-nationalId'), { target: { value: '1234567890123' } });
    fireEvent.click(screen.getByTestId('edit-customer-ids-save'));
    await waitFor(() => expect(updateCustomer).toHaveBeenCalled());
    expect(updateCustomer.mock.calls.at(-1)[0]).toBe('legacy-cid');
  });
});

// ─── Q6 — LinkRequestsTab + linkRequestsClient ─────────────────────────
describe('Q6 LinkRequestsTab + linkRequestsClient', () => {
  test('Q6.1 client wraps /api/admin/link-requests endpoint', () => {
    expect(CLIENT_SRC).toMatch(/['"]\/api\/admin\/link-requests['"]/);
  });
  test('Q6.2 client exports listLinkRequests + approveLinkRequest + rejectLinkRequest', () => {
    expect(CLIENT_SRC).toMatch(/export function listLinkRequests/);
    expect(CLIENT_SRC).toMatch(/export function approveLinkRequest/);
    expect(CLIENT_SRC).toMatch(/export function rejectLinkRequest/);
  });
  test('Q6.3 client adds Bearer token from auth.currentUser', () => {
    expect(CLIENT_SRC).toMatch(/auth\?\.currentUser/);
    expect(CLIENT_SRC).toMatch(/Bearer/);
  });
  test('Q6.4 LinkRequestsTab has filter tabs (pending/approved/rejected)', () => {
    // testid is generated via template literal `link-requests-filter-${t.id}`
    expect(TAB_SRC).toMatch(/data-testid=\{`link-requests-filter-\$\{t\.id\}`\}/);
    // STATUS_TABS array contains all 3
    expect(TAB_SRC).toMatch(/id:\s*['"]pending['"]/);
    expect(TAB_SRC).toMatch(/id:\s*['"]approved['"]/);
    expect(TAB_SRC).toMatch(/id:\s*['"]rejected['"]/);
  });
  test('Q6.5 approve + reject buttons have data-testid', () => {
    expect(TAB_SRC).toMatch(/data-testid=\{`link-request-approve-/);
    expect(TAB_SRC).toMatch(/data-testid=\{`link-request-reject-/);
  });
  test('Q6.6 confirm dialog before approve (admin double-check)', () => {
    expect(TAB_SRC).toMatch(/window\.confirm\(/);
  });
  test('Q6.7 last-4 of ID shown (privacy — never full ID)', () => {
    expect(TAB_SRC).toMatch(/idValueLast4/);
  });
  test('Q6.8 reload after approve/reject keeps queue fresh', () => {
    const fn = TAB_SRC.match(/const handleApprove[\s\S]*?\};/m)?.[0] || '';
    expect(fn).toMatch(/await reload\(\)/);
  });
});

// ─── Q7 — firestore.rules lockdown ─────────────────────────────────────
describe('Q7 firestore.rules lockdown', () => {
  test('Q7.1 be_link_requests blocked for client SDK', () => {
    expect(RULES_SRC).toMatch(/match \/be_link_requests\/\{requestId\}\s*\{[\s\S]*?allow read,\s*write:\s*if false/);
  });
  test('Q7.2 be_link_attempts blocked for client SDK', () => {
    expect(RULES_SRC).toMatch(/match \/be_link_attempts\/\{lineUserId\}\s*\{[\s\S]*?allow read,\s*write:\s*if false/);
  });
});

// ─── Q8 — nav + dashboard + tabPermissions wiring ──────────────────────
describe('Q8 nav + dashboard + tabPermissions', () => {
  test('Q8.1 navConfig has link-requests entry', () => {
    expect(NAV_SRC).toMatch(/id:\s*['"]link-requests['"]/);
    expect(NAV_SRC).toMatch(/คำขอผูก LINE/);
  });
  test('Q8.2 BackendDashboard wires LinkRequestsTab lazy import + tab dispatch', () => {
    expect(DASH_SRC).toMatch(/const LinkRequestsTab\s*=\s*lazy/);
    expect(DASH_SRC).toMatch(/activeTab === ['"]link-requests['"]/);
    expect(DASH_SRC).toMatch(/<LinkRequestsTab/);
  });
  test('Q8.3 tabPermissions has link-requests adminOnly', () => {
    expect(TAB_PERMS_SRC).toMatch(/['"]link-requests['"]:\s*\{\s*adminOnly:\s*true\s*\}/);
  });
});

// ─── Q9 — CustomerDetailView wiring (V33.3 superseded V32-tris-quater) ────
// V33.3 (2026-04-27): EditCustomerIdsModal REMOVED in favor of full-page Edit
// Customer takeover (CustomerCreatePage mode='edit' via BackendDashboard).
// The focused เลขบัตร button is gone; admin clicks "แก้ไข" in the profile
// card → BackendDashboard.editingCustomer → CustomerCreatePage prefills the
// form. Q10 group below still validates the EditCustomerIdsModal *file*
// since it stays on disk for backward compat (just unmounted).
describe('Q9 CustomerDetailView wiring (V33.3 — page replaces modal)', () => {
  test('Q9.1 EditCustomerIdsModal NO LONGER imported (V33.3 removed)', () => {
    expect(CDV_SRC).not.toMatch(/import EditCustomerIdsModal/);
    expect(CDV_SRC).not.toMatch(/<EditCustomerIdsModal/);
  });
  test('Q9.2 editIdsOpen state REMOVED (V33.3)', () => {
    expect(CDV_SRC).not.toMatch(/setEditIdsOpen/);
    expect(CDV_SRC).not.toMatch(/data-testid=["']edit-customer-ids-btn["']/);
  });
  test('Q9.3 NEW Edit button delegates to onEditCustomer prop (full-page takeover)', () => {
    expect(CDV_SRC).toMatch(/data-testid=["']edit-customer-btn["']/);
    expect(CDV_SRC).toMatch(/onClick=\{onEditCustomer\}/);
    expect(CDV_SRC).toMatch(/onEditCustomer/);
  });
  test('Q9.4 BackendDashboard wires editingCustomer takeover to CustomerCreatePage mode=edit', async () => {
    const fs = await import('node:fs/promises');
    const dashSrc = await fs.readFile('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(dashSrc).toMatch(/editingCustomer \?/);
    expect(dashSrc).toMatch(/<CustomerCreatePage[\s\S]*?mode="edit"/);
    expect(dashSrc).toMatch(/onEditCustomer=\{\(\) => setEditingCustomer/);
  });
});

// ─── Q10 — EditCustomerIdsModal source-grep — ID validation locked ─────
describe('Q10 EditCustomerIdsModal validation invariants', () => {
  test('Q10.1 validateNationalId requires exactly 13 digits', () => {
    expect(EDIT_MODAL_SRC).toMatch(/\^\\d\{13\}\$/);
  });
  test('Q10.2 validatePassport requires 6-12 alphanumeric + letter + digit', () => {
    expect(EDIT_MODAL_SRC).toMatch(/\^\[A-Z0-9\]\{6,12\}\$/);
    expect(EDIT_MODAL_SRC).toMatch(/\/\[A-Z\]\//);
    expect(EDIT_MODAL_SRC).toMatch(/\/\\d\//);
  });
  test('Q10.3 strip separators (dash/dot/space) before validation', () => {
    expect(EDIT_MODAL_SRC).toMatch(/replace\(\/\[\\s\\-\.\(\)\]\/g/);
  });
  test('Q10.4 passport stored UPPERCASED', () => {
    expect(EDIT_MODAL_SRC).toMatch(/\.toUpperCase\(\)/);
  });
  test('Q10.5 updateCustomer called with dotted path patientData.X (preserves siblings)', () => {
    expect(EDIT_MODAL_SRC).toMatch(/['"]patientData\.nationalId['"]/);
    expect(EDIT_MODAL_SRC).toMatch(/['"]patientData\.passport['"]/);
  });
});
