import { describe, it, expect } from 'vitest';
import { resolveDepositCancelState } from '../src/lib/depositCancelDecision.js';

// Rule I flow-simulate — pure mirrors of the choice→action mapping wired into
// each cancel surface. The source-grep test (frontend-tab-removal-source-grep)
// locks the real code to these mappings; this verifies the mapping is correct.

// Frontend นัดหมาย appt-cancel (AppointmentHubView.handleCancelChoice → AdminDashboard.onCancelAppt)
function apptCancelAction(choice) {
  if (choice === 'cancel') return 'noop';
  return choice === 'both' ? 'deleteDepositBookingPair' : 'cancel-appt-only';
}
// Backend AppointmentCalendarView appt-delete
function calDeleteAction(choice) {
  if (choice === 'cancel') return 'noop';
  return choice === 'both' ? 'deleteDepositBookingPair' : 'deleteBackendAppointment';
}
// Backend Finance·มัดจำ deposit-delete (DepositPanel)
function depositCancelAction(choice) {
  if (choice === 'cancel') return 'noop';
  return choice === 'both' ? 'deleteDepositBookingPair' : 'deleteDeposit';
}

describe('deposit-cancel flow-simulate (Rule I)', () => {
  it('F1 appt surface choice mapping', () => {
    expect(apptCancelAction('both')).toBe('deleteDepositBookingPair'); // hard, both gone
    expect(apptCancelAction('this-only')).toBe('cancel-appt-only');    // deposit preserved
    expect(apptCancelAction('cancel')).toBe('noop');
  });
  it('F2 calendar surface choice mapping', () => {
    expect(calDeleteAction('both')).toBe('deleteDepositBookingPair');
    expect(calDeleteAction('this-only')).toBe('deleteBackendAppointment'); // deposit preserved
    expect(calDeleteAction('cancel')).toBe('noop');
  });
  it('F3 deposit surface choice mapping', () => {
    expect(depositCancelAction('both')).toBe('deleteDepositBookingPair');
    expect(depositCancelAction('this-only')).toBe('deleteDeposit'); // appt preserved
    expect(depositCancelAction('cancel')).toBe('noop');
  });
  it('F4 used deposit blocks hard-delete (real helper)', () => {
    expect(resolveDepositCancelState({ id: 'D', amount: 2000, usedAmount: 500, status: 'active' }).blocked).toBe(true);
    expect(resolveDepositCancelState({ id: 'D', amount: 2000, usedAmount: 0, status: 'active' }).blocked).toBe(false);
  });
  it('F5 no-deposit booking → caller takes plain-confirm path (hasDeposit false)', () => {
    // appt with no linkedDepositId → dialog never opens; resolveDepositCancelState(null) confirms
    expect(resolveDepositCancelState(null).hasDeposit).toBe(false);
  });
  it('F6 tab default-route guard: removed modes → appointment', () => {
    const REMOVED = ['dashboard', 'noDeposit', 'noDepositHistory', 'deposit', 'depositHistory', 'history'];
    const safeMode = (m) => REMOVED.includes(m) ? 'appointment' : m;
    expect(safeMode('dashboard')).toBe('appointment');
    expect(safeMode('history')).toBe('appointment');
    expect(safeMode('deposit')).toBe('appointment');
    expect(safeMode('noDeposit')).toBe('appointment');
    expect(safeMode('chat')).toBe('chat');
    expect(safeMode('appointment')).toBe('appointment');
    expect(safeMode('clinicSettings')).toBe('clinicSettings');
  });
});
