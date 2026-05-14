// tests/phase-29-recall-line-template-modal-rtl.test.jsx
//
// Phase 29.8 (2026-05-14) — RTL test bank for RecallLineTemplateModal.
// LT1.1-LT1.18 covers 3 template render, preview substitution, custom-mode
// textarea, send button gating, POST payload shape, success / failure paths,
// modal close behaviors.

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const mockRecord = vi.fn(async () => {});

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  recordRecallLineSend: (...args) => mockRecord(...args),
}));

vi.mock('../src/firebase.js', () => ({
  auth: {
    currentUser: { uid: 'TEST-UID', getIdToken: async () => 'mock-token' },
  },
  db: {},
  appId: 'loverclinic-opd-4c39b',
}));

import { RecallLineTemplateModal } from '../src/components/backend/recall/RecallLineTemplateModal.jsx';

const recall = {
  id: 'RECALL-test-1',
  branchId: 'BR-1',
  customerId: 'LC-1',
  customerName: 'นาย Eee',
  customerLineUserId: 'U_xyz',
  reason: 'ฟิลเลอร์ครบ 6 เดือน',
  recallDate: '2026-11-14',
};

const customer = {
  id: 'LC-1',
  displayName: 'นาย Eee',
  firstName: 'Eee',
};

// Capture global fetch
const ORIGINAL_FETCH = global.fetch;
let fetchMock;

beforeEach(() => {
  mockRecord.mockClear();
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, messageId: 'recall-msg-1', sentAt: '2026-05-14T12:00:00Z' }),
  }));
  global.fetch = fetchMock;
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('Phase 29 · LT1 RecallLineTemplateModal rendering', () => {
  it('LT1.1 renders header with customer name', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.getByText(/ส่งข้อความ LINE.+นาย Eee/)).toBeInTheDocument();
  });

  it('LT1.2 renders 3 template cards', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-line-template-recall-default')).toBeInTheDocument();
    expect(screen.getByTestId('recall-line-template-aftercare-followup')).toBeInTheDocument();
    expect(screen.getByTestId('recall-line-template-custom')).toBeInTheDocument();
  });

  it('LT1.3 template labels are Thai', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.getByText('📅 แจ้งครบรอบ recall')).toBeInTheDocument();
    expect(screen.getByText('💉 ติดตามผลฟิลเลอร์/botox')).toBeInTheDocument();
    expect(screen.getByText('✏️ ข้อความ custom')).toBeInTheDocument();
  });

  it('LT1.4 no template selected by default', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-line-template-recall-default')).toHaveAttribute('data-selected', 'false');
  });

  it('LT1.5 send button disabled by default', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.getByTestId('recall-line-send')).toBeDisabled();
  });

  it('LT1.6 preview HIDDEN by default', () => {
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    expect(screen.queryByTestId('recall-line-preview')).not.toBeInTheDocument();
  });
});

describe('Phase 29 · LT2 template selection + preview', () => {
  it('LT2.1 click template → selected + send enabled', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    expect(screen.getByTestId('recall-line-template-recall-default')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('recall-line-send')).not.toBeDisabled();
  });

  it('LT2.2 mutex selection', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    await user.click(screen.getByTestId('recall-line-template-aftercare-followup'));
    expect(screen.getByTestId('recall-line-template-recall-default')).toHaveAttribute('data-selected', 'false');
    expect(screen.getByTestId('recall-line-template-aftercare-followup')).toHaveAttribute('data-selected', 'true');
  });

  it('LT2.3 default template preview substitutes {ชื่อ} + {เรื่อง}', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    const preview = screen.getByTestId('recall-line-preview');
    expect(preview).toHaveTextContent('นาย Eee');
    expect(preview).toHaveTextContent('ฟิลเลอร์ครบ 6 เดือน');
    // Placeholders should NOT appear
    expect(preview).not.toHaveTextContent('{ชื่อ}');
    expect(preview).not.toHaveTextContent('{เรื่อง}');
  });

  it('LT2.4 custom template shows textarea + hides preview', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-custom'));
    expect(screen.getByTestId('recall-line-custom-text')).toBeInTheDocument();
    expect(screen.queryByTestId('recall-line-preview')).not.toBeInTheDocument();
  });

  it('LT2.5 custom mode requires textarea content before send', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-custom'));
    expect(screen.getByTestId('recall-line-send')).toBeDisabled();
    await user.type(screen.getByTestId('recall-line-custom-text'), 'hello');
    expect(screen.getByTestId('recall-line-send')).not.toBeDisabled();
  });
});

describe('Phase 29 · LT3 send dispatch', () => {
  it('LT3.1 send POSTs to /api/admin/line-send-recall with payload', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    await user.click(screen.getByTestId('recall-line-send'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/line-send-recall');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer mock-token');
    const body = JSON.parse(init.body);
    expect(body.recallId).toBe('RECALL-test-1');
    expect(body.customerLineUserId).toBe('U_xyz');
    expect(body.templateId).toBe('recall-default');
    expect(body.messageText).toMatch(/นาย Eee/);
    expect(body.messageText).toMatch(/ฟิลเลอร์ครบ 6 เดือน/);
    expect(body.branchId).toBe('BR-1');
  });

  it('LT3.2 success → stamps recall via recordRecallLineSend + onSent + close', async () => {
    const user = userEvent.setup();
    const onSent = vi.fn();
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} onSent={onSent} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    await user.click(screen.getByTestId('recall-line-send'));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(mockRecord).toHaveBeenCalledWith('RECALL-test-1', expect.objectContaining({
      templateId: 'recall-default',
      messageText: expect.stringMatching(/นาย Eee/),
    }));
    expect(onSent).toHaveBeenCalledWith('recall-msg-1');
  });

  it('LT3.3 failure → error shown + modal stays open', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementationOnce(async () => ({
      ok: false,
      status: 503,
      json: async () => ({ error: 'CONFIG_MISSING', code: 'CONFIG_MISSING' }),
    }));
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-line-template-recall-default'));
    await user.click(screen.getByTestId('recall-line-send'));
    await waitFor(() => expect(screen.getByTestId('recall-line-error')).toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });

  it('LT3.4 custom mode payload uses textarea content', async () => {
    const user = userEvent.setup();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={() => {}} />);
    await user.click(screen.getByTestId('recall-line-template-custom'));
    await user.type(screen.getByTestId('recall-line-custom-text'), 'custom message!');
    await user.click(screen.getByTestId('recall-line-send'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.templateId).toBe('custom');
    expect(body.messageText).toBe('custom message!');
  });
});

describe('Phase 29 · LT4 modal close behaviors', () => {
  it('LT4.1 ESC closes', () => {
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('LT4.2 close button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-line-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('LT4.3 cancel button closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-line-cancel'));
    expect(onClose).toHaveBeenCalled();
  });

  it('LT4.4 backdrop click closes', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<RecallLineTemplateModal recall={recall} customer={customer} onClose={onClose} />);
    await user.click(screen.getByTestId('recall-line-template-modal'));
    expect(onClose).toHaveBeenCalled();
  });
});
