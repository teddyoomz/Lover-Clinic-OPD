import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __d = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(__d, '..', p), 'utf8');

const admin = read('src/pages/AdminDashboard.jsx');
const hub = read('src/components/admin/AppointmentHubView.jsx');
const cal = read('src/components/backend/AppointmentCalendarView.jsx');
const dep = read('src/components/backend/DepositPanel.jsx');
const dlg = read('src/components/admin/DepositAwareCancelDialog.jsx');

describe('Frontend tab removal (source-grep)', () => {
  it('SG1 default adminMode is appointment (not dashboard)', () => {
    expect(admin).toMatch(/useState\('appointment'\)/);
    expect(admin).not.toMatch(/useState\('dashboard'\)/);
  });
  it('SG2 redirect guard present', () => {
    expect(admin).toMatch(/REMOVED_ADMIN_MODES/);
    expect(admin).toMatch(/REMOVED_ADMIN_MODES\.includes\(mode\)/);
  });
  it('SG3 removed tab labels gone (desktop + mobile)', () => {
    expect(admin).not.toMatch(/<span>คิวหน้า Clinic<\/span>/);
    expect(admin).not.toMatch(/<span>จองไม่มัดจำ<\/span>/);
    expect(admin).not.toMatch(/<span>จองมัดจำ<\/span>/);
    expect(admin).not.toMatch(/<span>ประวัติ<\/span>/);
  });
  it('SG4 dead render-branch markers excised', () => {
    expect(admin).not.toMatch(/adminMode === 'history' \?/);
    expect(admin).not.toMatch(/adminMode === 'deposit' \?/);
    expect(admin).not.toMatch(/adminMode === 'depositHistory' \?/);
    expect(admin).not.toMatch(/adminMode === 'noDeposit' \?/);
    expect(admin).not.toMatch(/adminMode === 'noDepositHistory' \?/);
  });
  it('SG5 surviving render branches present', () => {
    expect(admin).toMatch(/adminMode === 'chat' \?/);
    expect(admin).toMatch(/adminMode === 'clinicSettings' \?/);
    expect(admin).toMatch(/adminMode === 'appointment' \?/);
  });
  it('SG6 no live setAdminMode to removed VIEW modes', () => {
    expect(admin).not.toMatch(/setAdminMode\('dashboard'\)/);
    expect(admin).not.toMatch(/setAdminMode\('history'\)/);
    expect(admin).not.toMatch(/setAdminMode\('depositHistory'\)/);
    expect(admin).not.toMatch(/setAdminMode\('noDepositHistory'\)/);
  });
  it('SG7 mobile จอง picker state removed', () => {
    expect(admin).not.toMatch(/showMobileJongPicker/);
  });
});

describe('Deposit-aware cancel dialog wiring (source-grep)', () => {
  it('SG8 dialog component shape', () => {
    expect(dlg).toMatch(/resolveDepositCancelState/);
    expect(dlg).toMatch(/getDeposit/);
    expect(dlg).toMatch(/orientation/);
    expect(dlg).toMatch(/cancel-choice-both/);
    expect(dlg).toMatch(/cancel-choice-keep/);
    expect(dlg).toMatch(/cancel-choice-back/);
  });
  it('SG9 นัดหมาย wired (View dispatch + AdminDashboard handler)', () => {
    expect(hub).toMatch(/DepositAwareCancelDialog/);
    expect(hub).toMatch(/deleteDeposit: choice === 'both'/);
    expect(admin).toMatch(/opts\.deleteDeposit/);
    expect(admin).toMatch(/deleteDepositBookingPair/);
  });
  it('SG10 AppointmentCalendarView wired', () => {
    expect(cal).toMatch(/DepositAwareCancelDialog/);
    expect(cal).toMatch(/deleteDepositBookingPair/);
    expect(cal).toMatch(/deleteBackendAppointment/);
  });
  it('SG11 DepositPanel wired (deposit orientation)', () => {
    expect(dep).toMatch(/DepositAwareCancelDialog/);
    expect(dep).toMatch(/orientation="deposit"/);
    expect(dep).toMatch(/deleteDepositBookingPair/);
    expect(dep).toMatch(/deleteDeposit\(depId\)/);
  });
});
