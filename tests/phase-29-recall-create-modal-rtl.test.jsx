// tests/phase-29-recall-create-modal-rtl.test.jsx
//
// Phase 29.6 (2026-05-14) — RTL test bank for RecallCreateModal + RecallSlotCard.
// M1-M11 covering slot toggle / days badge / validation / save fires / auto-suggest /
// inline-learn / customer header / ESC + backdrop close.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Mock scopedDataLayer createRecall / createRecallPair (we only verify call shape)
const mockCreateRecall = vi.fn(async () => ({ id: 'RECALL-mock-1' }));
const mockCreateRecallPair = vi.fn(async () => ({ id1: 'RECALL-mock-1', id2: 'RECALL-mock-2' }));

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  createRecall: (...args) => mockCreateRecall(...args),
  createRecallPair: (...args) => mockCreateRecallPair(...args),
}));

// Mock thaiTodayISO to return a fixed date for deterministic testing
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return {
    ...actual,
    thaiTodayISO: () => '2026-05-14',
  };
});

import { RecallCreateModal } from '../src/components/backend/recall/RecallCreateModal.jsx';

const customer = {
  id: 'LC-26000001',
  displayName: 'นาย Eee',
  phone: '081-1234567',
  lineUserId: 'U_xyz',
  hn: 'HN001',
};

beforeEach(() => {
  mockCreateRecall.mockClear();
  mockCreateRecallPair.mockClear();
});

describe('Phase 29 · M1 RecallCreateModal slot toggle behavior', () => {
  it('M1.1 both slots disabled by default when no treatment context', () => {
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-slot-aftercare')).toHaveAttribute('data-slot-enabled', 'false');
    expect(screen.getByTestId('recall-slot-revisit')).toHaveAttribute('data-slot-enabled', 'false');
  });

  it('M1.2 aftercare ENABLED by default when treatmentContext provided', () => {
    render(
      <RecallCreateModal
        customer={customer}
        treatmentContext={{ treatmentId: 'BT-1', date: '14 พ.ค.', summary: 'ฟิลเลอร์' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-slot-aftercare')).toHaveAttribute('data-slot-enabled', 'true');
    expect(screen.getByTestId('recall-slot-revisit')).toHaveAttribute('data-slot-enabled', 'false');
  });

  it('M1.3 toggle ON shows date + reason inputs', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    expect(screen.getByTestId('recall-slot-aftercare-reason')).toBeInTheDocument();
  });

  it('M1.4 toggle OFF hides body', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle')); // ON
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle')); // OFF
    expect(screen.queryByTestId('recall-slot-aftercare-reason')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · M2 validation', () => {
  it('M2.1 both slots off → save button disabled + banner', () => {
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-create-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('recall-create-save')).toBeDisabled();
  });

  it('M2.2 one slot on but missing date → save disabled', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    expect(screen.getByTestId('recall-create-save')).toBeDisabled();
  });
});

describe('Phase 29 · M3 footer summary', () => {
  it('M3.1 shows "จะสร้าง 0 recall" when both off', () => {
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-create-summary')).toHaveTextContent('จะสร้าง');
    expect(screen.getByTestId('recall-create-summary')).toHaveTextContent('0');
  });

  it('M3.2 toggle on slot 1 → "จะสร้าง 1 recall"', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    expect(screen.getByTestId('recall-create-summary')).toHaveTextContent('1');
  });

  it('M3.3 both on → "จะสร้าง 2 recall"', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    await user.click(screen.getByTestId('recall-slot-revisit-toggle'));
    expect(screen.getByTestId('recall-create-summary')).toHaveTextContent('2');
  });

  it('M3.4 save button label reflects count', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    await user.click(screen.getByTestId('recall-slot-revisit-toggle'));
    expect(screen.getByTestId('recall-create-save')).toHaveTextContent('บันทึก 2 Recall');
  });
});

describe('Phase 29 · M4 auto-suggest pre-fill', () => {
  it('M4.1 master suggestion pre-fills slot enabled + reason', () => {
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          revisit: { days: 180, reason: 'ฟิลเลอร์ครบรอบ', sourceLabel: 'be_products/filler-x' },
        }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-slot-revisit')).toHaveAttribute('data-slot-enabled', 'true');
    const reasonInput = screen.getByTestId('recall-slot-revisit-reason');
    expect(reasonInput).toHaveValue('ฟิลเลอร์ครบรอบ');
  });

  it('M4.2 auto-suggest hint visible when master data provided', () => {
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          aftercare: { days: 1, reason: 'ติดตามอาการ', sourceLabel: 'be_products/X' },
        }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-slot-aftercare-auto-suggest')).toBeInTheDocument();
    expect(screen.getByTestId('recall-slot-aftercare-auto-suggest')).toHaveTextContent(/1 วัน/);
  });

  it('M4.3 no auto-suggest hint when no master data', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    expect(screen.queryByTestId('recall-slot-aftercare-auto-suggest')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · M5 inline-learn checkbox', () => {
  it('M5.1 inline-learn HIDDEN when master suggestion exists', () => {
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          revisit: { days: 180, reason: 'x', sourceLabel: 'be_products/X' },
        }}
        onClose={() => {}}
      />
    );
    expect(screen.queryByTestId('recall-slot-revisit-save-master')).not.toBeInTheDocument();
  });

  it('M5.2 inline-learn appears when admin enters values without master suggestion', async () => {
    const user = userEvent.setup();
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    // Type reason
    await user.type(screen.getByTestId('recall-slot-aftercare-reason'), 'r');
    // Set date via fireEvent (DateField wraps hidden input)
    const dateInput = screen.getByTestId('recall-slot-aftercare').querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-05-15' } });
    // Now inline-learn appears
    expect(screen.getByTestId('recall-slot-aftercare-save-master')).toBeInTheDocument();
  });
});

describe('Phase 29 · M6 save fires correct fn', () => {
  it('M6.1 only slot 1 → createRecall once', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          aftercare: { days: 1, reason: 'ติดตามอาการ', sourceLabel: 'x' },
        }}
        onClose={() => {}}
        onCreated={onCreated}
      />
    );
    await user.click(screen.getByTestId('recall-create-save'));
    expect(mockCreateRecall).toHaveBeenCalledTimes(1);
    expect(mockCreateRecallPair).not.toHaveBeenCalled();
    const arg = mockCreateRecall.mock.calls[0][0];
    expect(arg.slotType).toBe('aftercare');
    expect(arg.recallDate).toBe('2026-05-15');
    expect(arg.reason).toBe('ติดตามอาการ');
    expect(arg.customerId).toBe('LC-26000001');
    expect(onCreated).toHaveBeenCalledWith(['RECALL-mock-1']);
  });

  it('M6.2 both slots → createRecallPair once', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          aftercare: { days: 1, reason: 'a', sourceLabel: 'x' },
          revisit: { days: 180, reason: 'b', sourceLabel: 'y' },
        }}
        onClose={() => {}}
        onCreated={onCreated}
      />
    );
    await user.click(screen.getByTestId('recall-create-save'));
    expect(mockCreateRecallPair).toHaveBeenCalledTimes(1);
    expect(mockCreateRecall).not.toHaveBeenCalled();
    const arg = mockCreateRecallPair.mock.calls[0][0];
    expect(arg.slot1.recallDate).toBe('2026-05-15');
    expect(arg.slot2.recallDate).toBe('2026-11-10'); // 2026-05-14 + 180 days exactly
    expect(onCreated).toHaveBeenCalledWith(['RECALL-mock-1', 'RECALL-mock-2']);
  });

  it('M6.3 save fires onSaveToMaster when inline-learn checked', async () => {
    const user = userEvent.setup();
    const onSaveToMaster = vi.fn(async () => {});
    render(<RecallCreateModal customer={customer} onClose={() => {}} onSaveToMaster={onSaveToMaster} />);
    // Enable slot 1, set date + reason
    await user.click(screen.getByTestId('recall-slot-aftercare-toggle'));
    await user.type(screen.getByTestId('recall-slot-aftercare-reason'), 'reason-x');
    const dateInput = screen.getByTestId('recall-slot-aftercare').querySelector('input[type="date"]');
    fireEvent.change(dateInput, { target: { value: '2026-05-15' } });
    // Check inline-learn
    await user.click(screen.getByTestId('recall-slot-aftercare-save-master'));
    // Save
    await user.click(screen.getByTestId('recall-create-save'));
    expect(onSaveToMaster).toHaveBeenCalledTimes(1);
    expect(onSaveToMaster).toHaveBeenCalledWith({
      slotType: 'aftercare',
      days: 1,
      reason: 'reason-x',
    });
  });
});

describe('Phase 29 · M7 modal close behaviors', () => {
  it('M7.1 ESC closes modal', () => {
    const onClose = vi.fn();
    render(<RecallCreateModal customer={customer} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('M7.2 backdrop click closes modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallCreateModal customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-create-modal'));
    expect(onClose).toHaveBeenCalled();
  });

  it('M7.3 close button (X) closes modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallCreateModal customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-create-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('M7.4 cancel button closes modal', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallCreateModal customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-create-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('M7.5 modal body click does NOT close (stopPropagation)', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallCreateModal customer={customer} onClose={onClose} />);
    await user.click(screen.getByText(/ตั้ง Recall ใหม่/));
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('Phase 29 · M8 customer header', () => {
  it('M8.1 renders name + LC id + phone', () => {
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    expect(screen.getByText('นาย Eee')).toBeInTheDocument();
    expect(screen.getByText('LC-26000001')).toBeInTheDocument();
    expect(screen.getByText(/081-1234567/)).toBeInTheDocument();
  });

  it('M8.2 LINE badge "L" when lineUserId present', () => {
    render(<RecallCreateModal customer={customer} onClose={() => {}} />);
    expect(screen.getByText('L')).toBeInTheDocument();
  });

  it('M8.3 LINE badge HIDDEN when no lineUserId', () => {
    render(<RecallCreateModal customer={{ ...customer, lineUserId: null }} onClose={() => {}} />);
    expect(screen.queryByText('L')).not.toBeInTheDocument();
  });

  it('M8.4 treatment context line shown', () => {
    render(
      <RecallCreateModal
        customer={customer}
        treatmentContext={{ treatmentId: 'BT-1', date: '14 พ.ค.', summary: 'ฟิลเลอร์' }}
        onClose={() => {}}
      />
    );
    expect(screen.getByText(/จากการรักษา.+ฟิลเลอร์/)).toBeInTheDocument();
  });
});

describe('Phase 29 · M9 days-from-now badge', () => {
  it('M9.1 badge appears when date filled (via master suggestion)', () => {
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          aftercare: { days: 1, reason: 'x', sourceLabel: 'y' },
        }}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-slot-aftercare-days-badge')).toBeInTheDocument();
    expect(screen.getByTestId('recall-slot-aftercare-days-badge')).toHaveTextContent('พรุ่งนี้');
  });

  it('M9.2 6-month suggestion shows "184 วัน (~6 เดือน)" or similar', () => {
    render(
      <RecallCreateModal
        customer={customer}
        masterDataSuggestions={{
          revisit: { days: 180, reason: 'x', sourceLabel: 'y' },
        }}
        onClose={() => {}}
      />
    );
    const badge = screen.getByTestId('recall-slot-revisit-days-badge');
    // 180 = 6 * 30 → exact months → "180 วัน (6 เดือน)"
    expect(badge).toHaveTextContent(/180 วัน \(6 เดือน\)/);
  });
});
