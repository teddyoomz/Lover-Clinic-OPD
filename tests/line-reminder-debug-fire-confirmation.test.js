import { describe, it, expect } from 'vitest';
import { validateDebugFireRequest } from '../api/admin/line-reminder-debug-fire.js';

describe('T6 validateDebugFireRequest', () => {
  it('T6.1 valid dry-run request', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'dry-run' }, { branchName: 'X' })).toEqual({ valid: true });
  });

  it('T6.2 valid single request requires customerId', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'single' }, { branchName: 'X' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'single', customerId: 'C1' }, { branchName: 'X' }).valid).toBe(true);
  });

  it('T6.3 mode=all requires confirmBranchName === branch.branchName', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: '' }, { branchName: 'นครราชสีมา' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: 'wrong' }, { branchName: 'นครราชสีมา' }).valid).toBe(false);
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'all', confirmBranchName: 'นครราชสีมา' }, { branchName: 'นครราชสีมา' }).valid).toBe(true);
  });

  it('T6.4 invalid mode', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'dayBefore', mode: 'fakemode' }, { branchName: 'X' }).valid).toBe(false);
  });

  it('T6.5 invalid reminderType', () => {
    expect(validateDebugFireRequest({ branchId: 'BR-A', reminderType: 'every-15-min', mode: 'dry-run' }, { branchName: 'X' }).valid).toBe(false);
  });

  it('T6.6 missing branchId', () => {
    expect(validateDebugFireRequest({ reminderType: 'dayBefore', mode: 'dry-run' }, { branchName: 'X' }).valid).toBe(false);
  });
});
