// ─── Phase 12.5 · validator tests for bank/expense-category/expense + Rule E
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  validateBankAccount, normalizeBankAccount, emptyBankAccountForm,
  generateBankAccountId, ACCOUNT_TYPE_OPTIONS,
  STATUS_OPTIONS as BANK_STATUS,
} from '../src/lib/bankAccountValidation.js';
import {
  validateExpenseCategory, normalizeExpenseCategory, emptyExpenseCategoryForm,
  generateExpenseCategoryId, STATUS_OPTIONS as CAT_STATUS,
} from '../src/lib/expenseCategoryValidation.js';
import {
  validateExpense, normalizeExpense, emptyExpenseForm,
  generateExpenseId, STATUS_OPTIONS as EXP_STATUS,
} from '../src/lib/expenseValidation.js';

/* ─── Bank Account ──────────────────────────────────────────────────── */

const bankBase = () => ({ ...emptyBankAccountForm(), bankName: 'กสิกรไทย', accountNumber: '1234567890' });

describe('validateBankAccount', () => {
  it('BA1: null/array rejected', () => {
    expect(validateBankAccount(null)?.[0]).toBe('form');
    expect(validateBankAccount([])?.[0]).toBe('form');
  });
  it('BA2: empty bankName rejected', () => {
    expect(validateBankAccount({ ...bankBase(), bankName: '' })?.[0]).toBe('bankName');
  });
  it('BA3: empty accountNumber rejected', () => {
    expect(validateBankAccount({ ...bankBase(), accountNumber: '' })?.[0]).toBe('accountNumber');
  });
  it('BA4: over-long bankName rejected', () => {
    expect(validateBankAccount({ ...bankBase(), bankName: 'x'.repeat(101) })?.[0]).toBe('bankName');
  });
  it('BA5: unknown accountType rejected', () => {
    expect(validateBankAccount({ ...bankBase(), accountType: 'crypto' })?.[0]).toBe('accountType');
  });
  it('BA6: each enumerated accountType accepted', () => {
    for (const t of ACCOUNT_TYPE_OPTIONS) {
      expect(validateBankAccount({ ...bankBase(), accountType: t })).toBeNull();
    }
  });
  it('BA7: isDefault must be boolean', () => {
    expect(validateBankAccount({ ...bankBase(), isDefault: 'yes' })?.[0]).toBe('isDefault');
  });
  it('BA8: status enum', () => {
    for (const s of BANK_STATUS) {
      expect(validateBankAccount({ ...bankBase(), status: s })).toBeNull();
    }
    expect(validateBankAccount({ ...bankBase(), status: 'closed' })?.[0]).toBe('status');
  });
  it('BA9: minimal valid accepted', () => {
    expect(validateBankAccount(bankBase())).toBeNull();
  });
});

describe('normalizeBankAccount', () => {
  it('BN1: strips dashes/spaces from accountNumber', () => {
    expect(normalizeBankAccount({ ...bankBase(), accountNumber: '123-456-7890' }).accountNumber).toBe('1234567890');
    expect(normalizeBankAccount({ ...bankBase(), accountNumber: '123 456 7890' }).accountNumber).toBe('1234567890');
  });
  it('BN2: unknown accountType defaults to savings', () => {
    expect(normalizeBankAccount({ ...bankBase(), accountType: 'invalid' }).accountType).toBe('savings');
  });
  it('BN3: isDefault coerced to boolean', () => {
    expect(normalizeBankAccount({ ...bankBase(), isDefault: 1 }).isDefault).toBe(true);
  });
});

describe('generateBankAccountId', () => {
  it('BG1: BANK- prefix', () => {
    expect(generateBankAccountId()).toMatch(/^BANK-[0-9a-z]+-[0-9a-f]{16}$/);
  });
  it('BG2: unique across 50', () => {
    const s = new Set();
    for (let i = 0; i < 50; i++) s.add(generateBankAccountId());
    expect(s.size).toBe(50);
  });
});

/* ─── Expense Category ─────────────────────────────────────────────── */

const catBase = () => ({ ...emptyExpenseCategoryForm(), name: 'ค่าเช่า' });

describe('validateExpenseCategory', () => {
  it('EC1: null rejected', () => {
    expect(validateExpenseCategory(null)?.[0]).toBe('form');
  });
  it('EC2: empty name rejected', () => {
    expect(validateExpenseCategory({ ...catBase(), name: '' })?.[0]).toBe('name');
  });
  it('EC3: over-long name rejected', () => {
    expect(validateExpenseCategory({ ...catBase(), name: 'x'.repeat(101) })?.[0]).toBe('name');
  });
  it('EC4: status enum', () => {
    for (const s of CAT_STATUS) {
      expect(validateExpenseCategory({ ...catBase(), status: s })).toBeNull();
    }
    expect(validateExpenseCategory({ ...catBase(), status: 'x' })?.[0]).toBe('status');
  });
  it('EC5: over-long note rejected', () => {
    expect(validateExpenseCategory({ ...catBase(), note: 'x'.repeat(301) })?.[0]).toBe('note');
  });
  it('EC6: minimal valid accepted', () => {
    expect(validateExpenseCategory(catBase())).toBeNull();
  });
});

describe('normalizeExpenseCategory + generateExpenseCategoryId', () => {
  it('ECN1: trims name/note', () => {
    const n = normalizeExpenseCategory({ name: '  ค่าเช่า  ', note: '  note  ' });
    expect(n.name).toBe('ค่าเช่า');
    expect(n.note).toBe('note');
  });
  it('ECN2: id prefix', () => {
    expect(generateExpenseCategoryId()).toMatch(/^EXPCAT-/);
  });
});

/* ─── Expense ──────────────────────────────────────────────────────── */

const expBase = () => ({ ...emptyExpenseForm(), expenseName: 'ค่าน้ำ', amount: 500, date: '2026-04-20' });

describe('validateExpense', () => {
  it('EX1: empty expenseName rejected', () => {
    expect(validateExpense({ ...expBase(), expenseName: '' })?.[0]).toBe('expenseName');
  });
  it('EX2: non-numeric amount rejected', () => {
    expect(validateExpense({ ...expBase(), amount: 'abc' })?.[0]).toBe('amount');
  });
  it('EX3: negative amount rejected', () => {
    expect(validateExpense({ ...expBase(), amount: -100 })?.[0]).toBe('amount');
  });
  it('EX4: strict requires amount > 0', () => {
    expect(validateExpense({ ...expBase(), amount: 0 }, { strict: true })?.[0]).toBe('amount');
  });
  it('EX5: non-strict allows zero amount', () => {
    expect(validateExpense({ ...expBase(), amount: 0 })).toBeNull();
  });
  it('EX6: strict requires date', () => {
    expect(validateExpense({ ...expBase(), date: '' }, { strict: true })?.[0]).toBe('date');
  });
  it('EX7: strict requires categoryId', () => {
    expect(validateExpense({ ...expBase(), categoryId: '' }, { strict: true })?.[0]).toBe('categoryId');
  });
  it('EX8: malformed date rejected', () => {
    expect(validateExpense({ ...expBase(), date: '20/04/2026' })?.[0]).toBe('date');
  });
  it('EX9: hasUserId must be boolean', () => {
    expect(validateExpense({ ...expBase(), hasUserId: 'yes' })?.[0]).toBe('hasUserId');
  });
  it('EX10: status enum', () => {
    for (const s of EXP_STATUS) {
      expect(validateExpense({ ...expBase(), status: s })).toBeNull();
    }
    expect(validateExpense({ ...expBase(), status: 'done' })?.[0]).toBe('status');
  });
  it('EX11: over-long docId rejected', () => {
    expect(validateExpense({ ...expBase(), docId: 'x'.repeat(51) })?.[0]).toBe('docId');
  });
  it('EX12: over-long note rejected', () => {
    expect(validateExpense({ ...expBase(), note: 'x'.repeat(1001) })?.[0]).toBe('note');
  });
  it('EX13: minimal non-strict valid', () => {
    expect(validateExpense(expBase())).toBeNull();
  });
  it('EX14: strict requires all 3 (date + categoryId + amount>0)', () => {
    const strict = { strict: true };
    expect(validateExpense({ ...expBase(), categoryId: 'CAT-1' }, strict)).toBeNull();
  });
});

describe('normalizeExpense', () => {
  it('EXN1: coerces amount string → number', () => {
    expect(normalizeExpense({ ...expBase(), amount: '1500' }).amount).toBe(1500);
  });
  it('EXN2: trims strings', () => {
    const n = normalizeExpense({ ...expBase(), expenseName: '  X  ', note: '  Y  ' });
    expect(n.expenseName).toBe('X');
    expect(n.note).toBe('Y');
  });
  it('EXN3: invalid status → active', () => {
    expect(normalizeExpense({ ...expBase(), status: 'weird' }).status).toBe('active');
  });
  it('EXN4: generateExpenseId prefix', () => {
    expect(generateExpenseId()).toMatch(/^EXP-/);
  });
});

/* ─── Rule E (Firestore-only) ──────────────────────────────────────── */

describe('Phase 12.5 — Rule E', () => {
  const IMPORT_BROKER = /(?:from\s+['"][^'"]*brokerClient|require\(\s*['"][^'"]*brokerClient)/;
  const FETCH_PROCLINIC = /(?:from\s+['"][^'"]*\/api\/proclinic\/|fetch\s*\(\s*['"`][^'"`]*\/api\/proclinic\/)/;

  it('RE1: validators clean of broker/proclinic imports', () => {
    for (const f of ['src/lib/bankAccountValidation.js', 'src/lib/expenseCategoryValidation.js', 'src/lib/expenseValidation.js']) {
      const src = fs.readFileSync(f, 'utf-8');
      expect(src).not.toMatch(IMPORT_BROKER);
      expect(src).not.toMatch(FETCH_PROCLINIC);
    }
  });

  it('RE2: FinanceMasterTab clean', () => {
    const src = fs.readFileSync('src/components/backend/FinanceMasterTab.jsx', 'utf-8');
    expect(src).not.toMatch(IMPORT_BROKER);
    expect(src).not.toMatch(FETCH_PROCLINIC);
  });
});
