import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const m = vi.hoisted(() => ({
  save: vi.fn(), useConfig: vi.fn(), useStatus: vi.fn(), useTabAccess: vi.fn(), useHasPerm: vi.fn(),
}));
vi.mock('../src/hooks/useSystemConfig.js', () => ({ useSystemConfig: () => m.useConfig() }));
vi.mock('../src/hooks/useScheduledTaskStatus.js', () => ({ useScheduledTaskStatus: () => m.useStatus() }));
vi.mock('../src/lib/systemConfigClient.js', () => ({ saveSystemConfig: (...a) => m.save(...a) }));
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: () => m.useTabAccess(),
  useHasPermission: () => m.useHasPerm(),
}));
vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { email: 'admin@x.com', getIdToken: async () => 'tok' } },
}));

import ScheduledTasksTab from '../src/components/backend/ScheduledTasksTab.jsx';
import { SCHEDULED_TASKS } from '../src/lib/scheduledTasksRegistry.js';

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  m.save.mockReset().mockResolvedValue({ auditId: 'a1', version: 1 });
  m.useConfig.mockReset().mockReturnValue({ config: { scheduledTasks: {} }, loading: false });
  m.useStatus.mockReset().mockReturnValue({});
  m.useTabAccess.mockReset().mockReturnValue({ isAdmin: true });
  m.useHasPerm.mockReset().mockReturnValue(true);
});
afterEach(() => cleanup());
afterAll(() => { if (ORIGINAL_FETCH === undefined) delete global.fetch; else global.fetch = ORIGINAL_FETCH; });

describe('ScheduledTasksTab', () => {
  it('renders all 10 tasks', () => {
    render(<ScheduledTasksTab />);
    expect(screen.getByTestId('scheduled-tasks-tab')).toBeTruthy();
    for (const t of SCHEDULED_TASKS) expect(screen.getByTestId(`task-${t.id}`)).toBeTruthy();
  });

  it('access-denied for non-admin without permission', () => {
    m.useTabAccess.mockReturnValue({ isAdmin: false });
    m.useHasPerm.mockReturnValue(false);
    render(<ScheduledTasksTab />);
    expect(screen.queryByTestId('scheduled-tasks-tab')).toBeNull();
    expect(screen.getByText(/ไม่มีสิทธิ์เข้าถึง/)).toBeTruthy();
  });

  it('disabling a safety-critical task prompts confirm; cancel reverts', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ScheduledTasksTab />);
    const toggle = screen.getByTestId('toggle-chatHistoryRetention'); // safetyCritical, starts on
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(confirmSpy).toHaveBeenCalled();
    expect(toggle.getAttribute('aria-checked')).toBe('true'); // cancelled → still on
    confirmSpy.mockRestore();
  });

  it('a normal task toggles without confirm', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ScheduledTasksTab />);
    const toggle = screen.getByTestId('toggle-staffChatRetention'); // not safety-critical
    fireEvent.click(toggle);
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    confirmSpy.mockRestore();
  });

  it('param input clamps to max', () => {
    render(<ScheduledTasksTab />);
    const input = screen.getByTestId('param-chatHistoryRetention-retentionHours');
    fireEvent.change(input, { target: { value: '9999' } });
    expect(Number(input.value)).toBe(720); // clamped to spec.max
  });

  it('Save writes the scheduledTasks patch via saveSystemConfig', async () => {
    render(<ScheduledTasksTab />);
    fireEvent.click(screen.getByRole('button', { name: /บันทึก/ }));
    await vi.waitFor(() => expect(m.save).toHaveBeenCalled());
    const arg = m.save.mock.calls[0][0];
    expect(arg.patch.scheduledTasks.chatHistoryRetention.enabled).toBe(true);
    expect(arg.executedBy).toBe('admin@x.com');
  });

  it('Run now POSTs to /api/admin/run-scheduled-task with the taskId', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ taskId: 'stockLotCleanup' }) });
    render(<ScheduledTasksTab />);
    fireEvent.click(screen.getByTestId('run-stockLotCleanup'));
    await vi.waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('/api/admin/run-scheduled-task');
    expect(JSON.parse(opts.body).taskId).toBe('stockLotCleanup');
    expect(opts.headers.Authorization).toBe('Bearer tok');
  });

  it('last-run badge shows the status summary', () => {
    m.useStatus.mockReturnValue({ chatHistoryRetention: { ok: true, summary: 'ลบ 18', lastRunAt: new Date().toISOString() } });
    render(<ScheduledTasksTab />);
    expect(screen.getByText(/✓ ลบ 18/)).toBeTruthy();
  });
});
