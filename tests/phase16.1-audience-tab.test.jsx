// Phase 16.1 (2026-04-30) — RTL tests for SmartAudienceTab + child components.
// Verifies render shape + add predicate + filter wiring + save / delete /
// export hooks. Customer + sales data mocked; backend helpers mocked too.

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { email: 'admin@test.local', uid: 'uid-test' } },
  db: {},
  appId: 'test-app',
}));

const listenToAudiencesMock = vi.fn();
const saveAudienceMock = vi.fn();
const deleteAudienceMock = vi.fn();
const newAudienceIdMock = vi.fn(() => 'AUD-fixed-1234567890-ABCDEF12');
const listProductsMock = vi.fn().mockResolvedValue([
  { id: 'P-1', name: 'สินค้าทดสอบ A' },
  { id: 'P-2', name: 'สินค้าทดสอบ B' },
]);
const listCoursesMock = vi.fn().mockResolvedValue([
  { id: 'C-1', name: 'คอร์สทดสอบ A' },
]);

vi.mock('../src/lib/backendClient.js', () => ({
  listenToAudiences: (...a) => listenToAudiencesMock(...a),
  saveAudience: (...a) => saveAudienceMock(...a),
  deleteAudience: (...a) => deleteAudienceMock(...a),
  newAudienceId: (...a) => newAudienceIdMock(...a),
  listProducts: (...a) => listProductsMock(...a),
  listCourses: (...a) => listCoursesMock(...a),
}));

const loadCustomersMock = vi.fn().mockResolvedValue([
  { id: 'c1', hn_no: 'HN001', firstname: 'อริส', lastname: 'ทดสอบ', gender: 'F', birthdate: '1985-04-15', branchId: 'BR-A', source: 'Facebook' },
  { id: 'c2', hn_no: 'HN002', firstname: 'ปรินซ์', lastname: 'ดี', gender: 'M', birthdate: '1995-04-15', branchId: 'BR-A', source: 'Walk-in' },
]);
const loadSalesMock = vi.fn().mockResolvedValue([
  { customerId: 'c1', saleDate: '2026-04-15', status: 'completed', billing: { netTotal: 8000 }, items: [] },
  { customerId: 'c2', saleDate: '2026-03-15', status: 'completed', billing: { netTotal: 1000 }, items: [] },
]);
vi.mock('../src/lib/reportsLoaders.js', () => ({
  loadAllCustomersForReport: (...a) => loadCustomersMock(...a),
  loadSalesByDateRange: (...a) => loadSalesMock(...a),
}));

const downloadCSVMock = vi.fn();
vi.mock('../src/lib/csvExport.js', () => ({
  downloadCSV: (...a) => downloadCSVMock(...a),
}));

vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({
    branchId: 'BR-A',
    branches: [{ branchId: 'BR-A', name: 'สาขา A' }, { branchId: 'BR-B', name: 'สาขา B' }],
    selectBranch: () => {},
    isReady: true,
  }),
}));

import SmartAudienceTab, { buildAudienceCsvRows } from '../src/components/backend/SmartAudienceTab.jsx';
import PredicateRow, { defaultParamsForType } from '../src/components/backend/audience/PredicateRow.jsx';
import RuleBuilder from '../src/components/backend/audience/RuleBuilder.jsx';
import SavedSegmentSidebar from '../src/components/backend/audience/SavedSegmentSidebar.jsx';
import AudiencePreviewPane from '../src/components/backend/audience/AudiencePreviewPane.jsx';

beforeEach(() => {
  listenToAudiencesMock.mockReset();
  // Default: emit empty list, return unsubscribe noop
  listenToAudiencesMock.mockImplementation((onChange) => {
    if (typeof onChange === 'function') onChange([]);
    return () => {};
  });
  saveAudienceMock.mockReset();
  deleteAudienceMock.mockReset();
  newAudienceIdMock.mockReset().mockReturnValue('AUD-fixed-1234567890-ABCDEF12');
  listProductsMock.mockReset().mockResolvedValue([{ id: 'P-1', name: 'สินค้า A' }]);
  listCoursesMock.mockReset().mockResolvedValue([{ id: 'C-1', name: 'คอร์ส A' }]);
  loadCustomersMock.mockReset().mockResolvedValue([
    { id: 'c1', hn_no: 'HN001', firstname: 'อริส', lastname: 'ทดสอบ', gender: 'F', birthdate: '1985-04-15', branchId: 'BR-A', source: 'Facebook' },
    { id: 'c2', hn_no: 'HN002', firstname: 'ปรินซ์', lastname: 'ดี', gender: 'M', birthdate: '1995-04-15', branchId: 'BR-A', source: 'Walk-in' },
  ]);
  loadSalesMock.mockReset().mockResolvedValue([
    { customerId: 'c1', saleDate: '2026-04-15', status: 'completed', billing: { netTotal: 8000 }, items: [] },
    { customerId: 'c2', saleDate: '2026-03-15', status: 'completed', billing: { netTotal: 1000 }, items: [] },
  ]);
  downloadCSVMock.mockReset();
});

// ─── T1 SmartAudienceTab top-level render ──────────────────────────────────
describe('T1 SmartAudienceTab top-level render', () => {
  test('T1.1 renders main shell with toolbar + sidebar + rule-builder + preview', async () => {
    render(<SmartAudienceTab />);
    expect(screen.getByTestId('smart-audience-tab')).toBeInTheDocument();
    expect(screen.getByTestId('smart-audience-toolbar')).toBeInTheDocument();
    expect(screen.getByTestId('saved-segment-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('smart-audience-rule-builder')).toBeInTheDocument();
    expect(screen.getByTestId('audience-preview-pane')).toBeInTheDocument();
    await waitFor(() => expect(loadCustomersMock).toHaveBeenCalled());
  });

  test('T1.2 subscribes to be_audiences via listenToAudiences', () => {
    render(<SmartAudienceTab />);
    expect(listenToAudiencesMock).toHaveBeenCalled();
  });

  test('T1.3 reload button re-fires loaders', async () => {
    render(<SmartAudienceTab />);
    await waitFor(() => expect(loadCustomersMock).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByTestId('smart-audience-reload'));
    await waitFor(() => expect(loadCustomersMock).toHaveBeenCalledTimes(2));
  });

  test('T1.4 save button disabled when name empty', () => {
    render(<SmartAudienceTab />);
    expect(screen.getByTestId('smart-audience-save')).toBeDisabled();
  });
});

// ─── T2 RuleBuilder add/delete predicate ───────────────────────────────────
describe('T2 RuleBuilder add/delete predicate', () => {
  test('T2.1 add predicate appends a row', () => {
    let rule = { kind: 'group', op: 'AND', children: [] };
    const onChange = vi.fn((next) => { rule = next; });
    const { rerender } = render(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    fireEvent.click(screen.getByTestId('rule-add-predicate-depth-0'));
    expect(onChange).toHaveBeenCalled();
    rerender(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    expect(rule.children).toHaveLength(1);
    expect(rule.children[0].kind).toBe('predicate');
    expect(rule.children[0].type).toBe('age-range');
  });

  test('T2.2 add nested group appends a group child', () => {
    let rule = { kind: 'group', op: 'AND', children: [] };
    const onChange = vi.fn((next) => { rule = next; });
    const { rerender } = render(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    fireEvent.click(screen.getByTestId('rule-add-group-depth-0'));
    rerender(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    expect(rule.children).toHaveLength(1);
    expect(rule.children[0].kind).toBe('group');
  });

  test('T2.3 delete child removes from children', () => {
    let rule = {
      kind: 'group',
      op: 'AND',
      children: [{ kind: 'predicate', type: 'gender', params: { value: 'F' } }],
    };
    const onChange = vi.fn((next) => { rule = next; });
    const { rerender } = render(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    fireEvent.click(screen.getByTestId('predicate-delete'));
    rerender(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    expect(rule.children).toHaveLength(0);
  });

  test('T2.4 toggle AND/OR fires onChange with new op', () => {
    let rule = { kind: 'group', op: 'AND', children: [] };
    const onChange = vi.fn((next) => { rule = next; });
    render(<RuleBuilder rule={rule} onChange={onChange} branches={[]} products={[]} courses={[]} />);
    fireEvent.change(screen.getByTestId('rule-op-depth-0'), { target: { value: 'OR' } });
    expect(onChange).toHaveBeenCalled();
    expect(rule.op).toBe('OR');
  });
});

// ─── T3 PredicateRow type-switch + params ─────────────────────────────────
describe('T3 PredicateRow', () => {
  test('T3.1 default age-range row renders min/max inputs', () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(
      <PredicateRow
        predicate={{ kind: 'predicate', type: 'age-range', params: { min: 30, max: 60 } }}
        onChange={onChange}
        onDelete={onDelete}
        branches={[]}
        products={[]}
        courses={[]}
      />,
    );
    expect(screen.getByTestId('param-age-min')).toHaveValue(30);
    expect(screen.getByTestId('param-age-max')).toHaveValue(60);
  });

  test('T3.2 switching type resets params via defaultParamsForType', () => {
    let predicate = { kind: 'predicate', type: 'age-range', params: { min: 30, max: 60 } };
    const onChange = vi.fn((next) => { predicate = next; });
    render(
      <PredicateRow
        predicate={predicate}
        onChange={onChange}
        onDelete={() => {}}
        branches={[]}
        products={[]}
        courses={[]}
      />,
    );
    fireEvent.change(screen.getByTestId('predicate-type-select'), { target: { value: 'gender' } });
    expect(onChange).toHaveBeenCalled();
    expect(predicate.type).toBe('gender');
    expect(predicate.params).toEqual({ value: 'F' });
  });

  test('T3.3 defaultParamsForType returns expected shape per type', () => {
    expect(defaultParamsForType('age-range')).toEqual({ min: 30, max: 60 });
    expect(defaultParamsForType('gender')).toEqual({ value: 'F' });
    expect(defaultParamsForType('branch')).toEqual({ branchIds: [] });
    expect(defaultParamsForType('source')).toEqual({ values: [] });
    expect(defaultParamsForType('bought-x-in-last-n')).toEqual({ kind: 'product', refId: '', months: 6 });
    expect(defaultParamsForType('spend-bracket')).toEqual({ min: 10000, max: null });
    expect(defaultParamsForType('last-visit-days')).toEqual({ op: '<=', days: 90 });
    expect(defaultParamsForType('has-unfinished-course')).toEqual({ value: true });
  });

  test('T3.4 delete fires onDelete', () => {
    const onDelete = vi.fn();
    render(
      <PredicateRow
        predicate={{ kind: 'predicate', type: 'gender', params: { value: 'F' } }}
        onChange={() => {}}
        onDelete={onDelete}
        branches={[]}
        products={[]}
        courses={[]}
      />,
    );
    fireEvent.click(screen.getByTestId('predicate-delete'));
    expect(onDelete).toHaveBeenCalled();
  });

  test('T3.5 source CSV input parses comma-separated values', () => {
    let predicate = { kind: 'predicate', type: 'source', params: { values: [] } };
    const onChange = vi.fn((next) => { predicate = next; });
    render(
      <PredicateRow
        predicate={predicate}
        onChange={onChange}
        onDelete={() => {}}
        branches={[]}
        products={[]}
        courses={[]}
      />,
    );
    fireEvent.change(screen.getByTestId('param-source'), { target: { value: 'Facebook, LINE, Walk-in' } });
    expect(predicate.params.values).toEqual(['Facebook', 'LINE', 'Walk-in']);
  });
});

// ─── T4 SavedSegmentSidebar ────────────────────────────────────────────────
describe('T4 SavedSegmentSidebar', () => {
  const items = [
    { id: 'a1', name: 'กลุ่มผู้หญิง 30-50', description: 'มาภายใน 90 วัน' },
    { id: 'a2', name: 'ลูกค้าใหม่', description: 'จาก Facebook' },
  ];

  test('T4.1 renders empty state when zero', () => {
    render(<SavedSegmentSidebar audiences={[]} loading={false} selectedId="" onSelect={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/ยังไม่มีกลุ่มที่บันทึก/)).toBeInTheDocument();
  });

  test('T4.2 renders item list', () => {
    render(<SavedSegmentSidebar audiences={items} loading={false} selectedId="" onSelect={() => {}} onNew={() => {}} />);
    expect(screen.getByText(/กลุ่มผู้หญิง 30-50/)).toBeInTheDocument();
    expect(screen.getByText(/ลูกค้าใหม่/)).toBeInTheDocument();
  });

  test('T4.3 search filters list', () => {
    render(<SavedSegmentSidebar audiences={items} loading={false} selectedId="" onSelect={() => {}} onNew={() => {}} />);
    fireEvent.change(screen.getByTestId('saved-segment-search'), { target: { value: 'ใหม่' } });
    expect(screen.queryByText(/กลุ่มผู้หญิง 30-50/)).toBeNull();
    expect(screen.getByText(/ลูกค้าใหม่/)).toBeInTheDocument();
  });

  test('T4.4 click item fires onSelect with audience', () => {
    const onSelect = vi.fn();
    render(<SavedSegmentSidebar audiences={items} loading={false} selectedId="" onSelect={onSelect} onNew={() => {}} />);
    fireEvent.click(screen.getByTestId('saved-segment-item-a1'));
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  test('T4.5 new button fires onNew', () => {
    const onNew = vi.fn();
    render(<SavedSegmentSidebar audiences={items} loading={false} selectedId="" onSelect={() => {}} onNew={onNew} />);
    fireEvent.click(screen.getByTestId('saved-segment-new'));
    expect(onNew).toHaveBeenCalled();
  });
});

// ─── T5 AudiencePreviewPane + buildAudienceCsvRows ─────────────────────────
describe('T5 AudiencePreviewPane + buildAudienceCsvRows', () => {
  test('T5.1 empty state when total=0', () => {
    render(<AudiencePreviewPane loading={false} total={0} sample={[]} onExport={() => {}} canExport={false} />);
    expect(screen.getByTestId('audience-preview-empty')).toBeInTheDocument();
  });

  test('T5.2 sample list renders HN + name', () => {
    const sample = [
      { id: 'c1', hn_no: 'HN001', firstname: 'A', lastname: 'B' },
      { id: 'c2', hn_no: 'HN002', firstname: 'X', lastname: 'Y' },
    ];
    render(<AudiencePreviewPane loading={false} total={2} sample={sample} onExport={() => {}} canExport={true} />);
    expect(screen.getByText('HN001')).toBeInTheDocument();
    expect(screen.getByText(/A B/)).toBeInTheDocument();
  });

  test('T5.3 export button disabled when canExport=false', () => {
    render(<AudiencePreviewPane loading={false} total={0} sample={[]} onExport={() => {}} canExport={false} />);
    expect(screen.getByTestId('audience-export-csv')).toBeDisabled();
  });

  test('T5.4 buildAudienceCsvRows shape contract', () => {
    const today = new Date(Date.UTC(2026, 3, 30));
    const customerById = new Map([
      ['c1', { id: 'c1', hn_no: 'HN1', firstname: 'A', lastname: 'B', gender: 'F', branchId: 'BR-A', source: 'FB', birthdate: '1990-01-01', telephone_number: '081', courses: [] }],
    ]);
    const salesByCustomer = new Map([
      ['c1', [{ status: 'completed', saleDate: '2026-04-15', billing: { netTotal: 1000 } }]],
    ]);
    const rows = buildAudienceCsvRows(['c1'], customerById, salesByCustomer, today);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      hn: 'HN1', firstname: 'A', lastname: 'B', gender: 'F',
      age: 36, branchId: 'BR-A', source: 'FB',
      lastVisit: '2026-04-15', totalSpend: 1000, courseCount: 0,
      lineUserId: '', phone: '081',
    });
  });

  test('T5.5 buildAudienceCsvRows skips missing customers', () => {
    const today = new Date(Date.UTC(2026, 3, 30));
    const customerById = new Map();
    const salesByCustomer = new Map();
    const rows = buildAudienceCsvRows(['unknown'], customerById, salesByCustomer, today);
    expect(rows).toEqual([]);
  });
});
