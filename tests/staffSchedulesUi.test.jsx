// ─── Phase 13.2.3 · StaffSchedulesTab focused UI tests ────────────────────
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false, media: '', onchange: null,
      addListener: () => {}, removeListener: () => {},
      addEventListener: () => {}, removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});

vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app', auth: { currentUser: null } }));

const mockListStaffSchedules = vi.fn();
const mockSaveStaffSchedule = vi.fn();
const mockDeleteStaffSchedule = vi.fn();
const mockListStaff = vi.fn();

vi.mock('../src/lib/backendClient.js', () => ({
  listStaffSchedules: (...a) => mockListStaffSchedules(...a),
  saveStaffSchedule: (...a) => mockSaveStaffSchedule(...a),
  deleteStaffSchedule: (...a) => mockDeleteStaffSchedule(...a),
  listStaff: (...a) => mockListStaff(...a),
}));

const StaffSchedulesTab = (await import('../src/components/backend/StaffSchedulesTab.jsx')).default;

function makeEntry(over = {}) {
  return {
    scheduleId: 'STFSCH-0426-aaa', id: 'STFSCH-0426-aaa',
    staffId: 'STAFF-1', staffName: 'Alice',
    date: '2026-04-24', type: 'work',
    startTime: '09:00', endTime: '18:00', note: '',
    ...over,
  };
}

describe('StaffSchedulesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListStaff.mockResolvedValue([]);
  });

  it('SU1: empty state', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([]);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีตารางงาน/)).toBeInTheDocument());
  });

  it('SU2: row renders with staff + date + time', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([makeEntry()]);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Alice'));
    const row = screen.getByTestId('staff-schedule-row-STFSCH-0426-aaa');
    expect(row).toHaveTextContent('24/04/2026');
    expect(row).toHaveTextContent('09:00');
    expect(row).toHaveTextContent('18:00');
    expect(row).toHaveTextContent('ทำงาน');
  });

  it('SU3: type filter isolates', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([
      makeEntry(),
      makeEntry({ scheduleId: 'STFSCH-0426-bbb', id: 'STFSCH-0426-bbb', staffName: 'Bob', type: 'holiday', startTime: '', endTime: '' }),
    ]);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Alice'));
    const filterSelect = screen.getByDisplayValue('ประเภททั้งหมด');
    fireEvent.change(filterSelect, { target: { value: 'holiday' } });
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('SU4: search filters by staff name', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([
      makeEntry(),
      makeEntry({ scheduleId: 'STFSCH-0426-bbb', id: 'STFSCH-0426-bbb', staffName: 'Bob' }),
    ]);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Alice'));
    const search = screen.getByPlaceholderText(/ค้นหาชื่อพนักงาน/);
    fireEvent.change(search, { target: { value: 'Bob' } });
    expect(screen.queryByText('Alice')).not.toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('SU5: holiday type hides time dropdowns, shows note input', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([]);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/ยังไม่มีตารางงาน/));
    const typeSelect = screen.getByTestId('schedule-type-select');
    fireEvent.change(typeSelect, { target: { value: 'holiday' } });
    expect(screen.getByPlaceholderText('หมายเหตุ (ถ้ามี)')).toBeInTheDocument();
    expect(screen.queryByText('เริ่ม *')).not.toBeInTheDocument();
  });

  it('SU6: delete confirms + calls mock', async () => {
    mockListStaffSchedules.mockResolvedValueOnce([makeEntry()]);
    mockDeleteStaffSchedule.mockResolvedValueOnce({ success: true });
    mockListStaffSchedules.mockResolvedValueOnce([]); // after delete reload
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<StaffSchedulesTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Alice'));
    fireEvent.click(screen.getByTestId('staff-schedule-delete-STFSCH-0426-aaa'));
    await waitFor(() => expect(mockDeleteStaffSchedule).toHaveBeenCalledWith('STFSCH-0426-aaa'));
    confirmSpy.mockRestore();
  });
});
