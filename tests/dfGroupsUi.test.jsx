// ─── Phase 13.3.3 · DfGroupsTab + DfGroupFormModal focused tests ──────────
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

const mockListDfGroups = vi.fn();
const mockDeleteDfGroup = vi.fn();
const mockSaveDfGroup = vi.fn();
const mockGetAllMasterDataItems = vi.fn();

vi.mock('../src/lib/backendClient.js', () => ({
  listDfGroups: (...a) => mockListDfGroups(...a),
  deleteDfGroup: (...a) => mockDeleteDfGroup(...a),
  saveDfGroup: (...a) => mockSaveDfGroup(...a),
  getAllMasterDataItems: (...a) => mockGetAllMasterDataItems(...a),
}));

const DfGroupsTab = (await import('../src/components/backend/DfGroupsTab.jsx')).default;
const DfGroupFormModal = (await import('../src/components/backend/DfGroupFormModal.jsx')).default;

const makeGroup = (over = {}) => ({
  groupId: 'DFG-0426-aaa', id: 'DFG-0426-aaa',
  name: 'Group A', status: 'active', note: '',
  rates: [{ courseId: 'C1', courseName: 'Laser', value: 20, type: 'percent' }],
  ...over,
});

describe('DfGroupsTab', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('DU1: empty state', async () => {
    mockListDfGroups.mockResolvedValueOnce([]);
    render(<DfGroupsTab clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/ยังไม่มีกลุ่ม DF/)).toBeInTheDocument());
  });

  it('DU2: row renders with name + rate count + badge', async () => {
    mockListDfGroups.mockResolvedValueOnce([makeGroup()]);
    render(<DfGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Group A'));
    const row = screen.getByTestId('df-group-row-DFG-0426-aaa');
    expect(row).toHaveTextContent('1 อัตรา');
    expect(row).toHaveTextContent('ใช้งาน');
  });

  it('DU3: status filter isolates', async () => {
    mockListDfGroups.mockResolvedValueOnce([
      makeGroup(),
      makeGroup({ groupId: 'DFG-0426-bbb', id: 'DFG-0426-bbb', name: 'Group B', status: 'disabled' }),
    ]);
    render(<DfGroupsTab clinicSettings={{}} />);
    await waitFor(() => screen.getByText('Group A'));
    const filter = screen.getByDisplayValue('สถานะทั้งหมด');
    fireEvent.change(filter, { target: { value: 'disabled' } });
    expect(screen.queryByText('Group A')).not.toBeInTheDocument();
    expect(screen.getByText('Group B')).toBeInTheDocument();
  });
});

describe('DfGroupFormModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllMasterDataItems.mockResolvedValue([]);
  });

  it('DU4: renders create title', async () => {
    render(<DfGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/สร้างกลุ่ม DF ใหม่/)).toBeInTheDocument());
  });

  it('DU5: renders edit title + existing rate row', async () => {
    render(<DfGroupFormModal group={makeGroup()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => expect(screen.getByText(/แก้ไขกลุ่ม DF/)).toBeInTheDocument());
    expect(screen.getByText('Laser')).toBeInTheDocument();
    expect(screen.getByTestId('df-rate-value-0')).toHaveValue(20);
  });

  it('DU6: validation blocks save when name empty', async () => {
    render(<DfGroupFormModal onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/สร้างกลุ่ม DF ใหม่/));
    const saveBtn = screen.getByRole('button', { name: /บันทึก|สร้าง/i });
    fireEvent.click(saveBtn);
    await waitFor(() => expect(mockSaveDfGroup).not.toHaveBeenCalled());
  });

  it('DU7: rate type switch updates value', async () => {
    render(<DfGroupFormModal group={makeGroup()} onClose={() => {}} onSaved={() => {}} clinicSettings={{}} />);
    await waitFor(() => screen.getByText(/แก้ไขกลุ่ม DF/));
    const typeSelect = screen.getByTestId('df-rate-type-0');
    fireEvent.change(typeSelect, { target: { value: 'baht' } });
    expect(typeSelect).toHaveValue('baht');
  });
});
