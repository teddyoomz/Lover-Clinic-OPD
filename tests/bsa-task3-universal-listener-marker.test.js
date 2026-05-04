import { describe, it, expect } from 'vitest';
import * as backend from '../src/lib/backendClient.js';

describe('Task 3 — Universal listener __universal__ marker', () => {
  const universalListeners = [
    'listenToCustomer',
    'listenToCustomerTreatments',
    'listenToCustomerAppointments',
    'listenToCustomerSales',
    'listenToCustomerFinance',
    'listenToCourseChanges',
    'listenToAudiences',
    'listenToUserPermissions',
  ];

  for (const name of universalListeners) {
    it(`T3.${name} is marked __universal__:true`, () => {
      expect(typeof backend[name]).toBe('function');
      expect(backend[name].__universal__).toBe(true);
    });
  }

  const branchScopedListeners = [
    'listenToAppointmentsByDate',
    'listenToAllSales',
    'listenToHolidays',
    'listenToScheduleByDay',
  ];

  for (const name of branchScopedListeners) {
    it(`T3.${name} is NOT marked __universal__ (branch-scoped)`, () => {
      expect(typeof backend[name]).toBe('function');
      expect(backend[name].__universal__).toBeFalsy();
    });
  }
});
