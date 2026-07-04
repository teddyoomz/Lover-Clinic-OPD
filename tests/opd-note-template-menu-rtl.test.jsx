// OPD Note Templates (2026-07-05) — OpdNoteTemplateMenu RTL behavior tests.
// REALTIME contract (user directive 2026-07-05: "แสดงผลการเปลี่ยนแปลงทันที
// ไม่ต้องรอ refresh หรือกดเปิด dropdown ใหม่"): the menu subscribes to a
// branch-scoped listener at MOUNT; snapshot pushes update the OPEN menu live.
// PORTAL contract (user bug: modal ซ้อน/แว๊ปสลับ): the editor modal renders
// into document.body, never inside the menu subtree.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';

let listenerRef = null;           // { onChange, onError }
let listenCalls = 0;
let unsubCalls = 0;
const mockSave = vi.fn();
const mockDelete = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToOpdNoteTemplatesByBranch: (args, onChange, onError) => {
    listenCalls += 1;
    listenerRef = { onChange, onError };
    return () => { unsubCalls += 1; };
  },
  saveOpdNoteTemplate: (...a) => mockSave(...a),
  deleteOpdNoteTemplate: (...a) => mockDelete(...a),
}));

// useBranchAwareListener imports BranchContext (needs a provider) — for RTL we
// mock the hook to a plain subscribe-on-mount effect that forwards to the
// (mocked) listener above. The REAL hook's branch semantics are covered by its
// own test bank; here we test the MENU's contract with whatever pushes arrive.
vi.mock('../src/hooks/useBranchAwareListener.js', () => ({
  useBranchAwareListener: (fn, args, onChange, onError) => {
    React.useEffect(() => (typeof fn === 'function' ? fn(args, onChange, onError) : undefined), []);
  },
}));

import OpdNoteTemplateMenu from '../src/components/OpdNoteTemplateMenu.jsx';
import { MANDATORY_OPD_NOTE_TEMPLATES } from '../src/lib/opdNoteTemplateValidation.js';
import { __escStackSize } from '../src/lib/useEscToClose.js';

const BRANCH_ITEMS = [
  { id: 'OPDT-1', name: 'ปรึกษาผมร่วง', content: 'ผมร่วง\n-ระยะเวลา : __', branchId: 'BR-A', createdAt: '2026-07-01T00:00:00.000Z', createdBy: 'u1' },
  { id: 'OPDT-2', name: 'ฮอร์โมนชาย', content: 'ฮอร์โมน\n-อาการ : __', branchId: 'BR-A', createdAt: '2026-07-02T00:00:00.000Z', createdBy: 'u1' },
];

const pushItems = (arr) => act(() => { listenerRef?.onChange?.(arr); });
const pushError = () => act(() => { listenerRef?.onError?.(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })); });

beforeEach(() => {
  listenerRef = null;
  listenCalls = 0;
  unsubCalls = 0;
  mockSave.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderMenu = (onInsert = () => {}) => {
  const r = render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
  pushItems([...BRANCH_ITEMS]); // first snapshot
  return r;
};

const openMenu = () => {
  fireEvent.click(screen.getByTestId('opd-template-trigger'));
  expect(screen.getByTestId('opd-template-list')).toBeTruthy();
};

describe('C1-C5 — pill + menu + insert (listener at mount)', () => {
  it('C1 subscribe ตั้งแต่ mount (ไม่ lazy) + unsubscribe ตอน unmount', () => {
    const { unmount } = render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    expect(listenCalls).toBe(1);
    unmount();
    expect(unsubCalls).toBe(1);
  });

  it('C2 เปิดเมนู → รายการพร้อมทันที (ไม่มีกำลังโหลดหลัง snapshot แรก) + builtin แถวแรก + badge บังคับ + ไม่มี ✎/🗑 บน builtin', () => {
    renderMenu();
    openMenu();
    expect(screen.queryByText('กำลังโหลด…')).toBeNull();
    const builtin = screen.getByTestId('opd-template-item-builtin-sexual-performance');
    expect(builtin.textContent).toContain('สมรรถภาพทางเพศ');
    expect(builtin.textContent).toContain('บังคับ');
    expect(builtin.querySelector('[data-testid^="opd-template-edit-"]')).toBeNull();
    expect(builtin.querySelector('[data-testid^="opd-template-delete-"]')).toBeNull();
    const list = screen.getByTestId('opd-template-list');
    const ids = Array.from(list.querySelectorAll('[data-testid^="opd-template-item-"]')).map(el => el.getAttribute('data-testid'));
    expect(ids[0]).toBe('opd-template-item-builtin-sexual-performance');
  });

  it('C2-bis REALTIME — เมนูเปิดค้างอยู่: push สร้าง/แก้/ลบ → เปลี่ยนทันทีโดยไม่ปิด/เปิดใหม่ (requirement หลัก)', async () => {
    renderMenu();
    openMenu();
    // สร้างใหม่จากเครื่องอื่น → โผล่ทันที
    pushItems([...BRANCH_ITEMS, { id: 'OPDT-NEW', name: 'ของใหม่สดๆ', content: 'x', branchId: 'BR-A' }]);
    expect(screen.getByTestId('opd-template-item-OPDT-NEW').textContent).toContain('ของใหม่สดๆ');
    // แก้ไข → ชื่อเปลี่ยนทันที
    pushItems([{ ...BRANCH_ITEMS[0], name: 'ปรึกษาผมร่วง v2' }, BRANCH_ITEMS[1]]);
    expect(screen.getByTestId('opd-template-item-OPDT-1').textContent).toContain('ปรึกษาผมร่วง v2');
    // ลบ → หายทันที
    pushItems([BRANCH_ITEMS[1]]);
    expect(screen.queryByTestId('opd-template-item-OPDT-1')).toBeNull();
    expect(screen.getByTestId('opd-template-item-OPDT-2')).toBeTruthy();
    // เมนูยังเปิดอยู่ตลอด — ไม่เคยปิด
    expect(screen.getByTestId('opd-template-list')).toBeTruthy();
    expect(listenCalls).toBe(1); // ไม่มี re-fetch — realtime ล้วน
  });

  it('C3 เลือก builtin → onInsert(content ตรงตาม constant) + เมนูปิด', () => {
    const onInsert = vi.fn();
    renderMenu(onInsert);
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-item-builtin-sexual-performance'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(MANDATORY_OPD_NOTE_TEMPLATES[0].content);
    expect(screen.queryByTestId('opd-template-list')).toBeNull();
  });

  it('C4 เลือก branch item → onInsert + ปิด', () => {
    const onInsert = vi.fn();
    renderMenu(onInsert);
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-item-OPDT-1'));
    expect(onInsert).toHaveBeenCalledWith(BRANCH_ITEMS[0].content);
    expect(screen.queryByTestId('opd-template-list')).toBeNull();
  });

  it('C5 คลิกนอก → เมนูปิด (มาตรฐาน dropdown)', async () => {
    render(
      <div>
        <button data-testid="outside">นอก</button>
        <OpdNoteTemplateMenu isDark onInsert={() => {}} />
      </div>
    );
    pushItems([...BRANCH_ITEMS]);
    openMenu();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByTestId('opd-template-list')).toBeNull());
  });
});

describe('C6-C10 — editor modal (AV78 + PORTAL) + create/edit/delete effect จริง', () => {
  it('C6 modal เป็น child ของ document.body (portal — ไม่อยู่ใน menu subtree) + AV78 + ESC/ยกเลิก/X', async () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    const editor = screen.getByTestId('opd-template-editor');
    // PORTAL: parent คือ document.body ตรงๆ — ไม่ถูก transform ancestor ใน TFP ดูด
    expect(editor.parentElement).toBe(document.body);
    expect(screen.getByTestId('opd-template-menu').contains(editor)).toBe(false);

    // AV78: backdrop click must NOT close
    fireEvent.click(screen.getByTestId('opd-template-editor-backdrop'));
    expect(screen.getByTestId('opd-template-editor')).toBeTruthy();

    // ESC closes (useEscToClose LIFO)
    expect(__escStackSize()).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('opd-template-editor')).toBeNull());

    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-cancel'));
    expect(screen.queryByTestId('opd-template-editor')).toBeNull();

    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-close'));
    expect(screen.queryByTestId('opd-template-editor')).toBeNull();
  });

  it('C7 create: บันทึก → save(OPDT- id, data) → modal ปิด → snapshot push → รายการใหม่โผล่ (effect จริง realtime)', async () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.change(document.querySelector('[data-field="opdt-name"]'), { target: { value: 'เทมเพลตใหม่' } });
    fireEvent.change(document.querySelector('[data-field="opdt-content"]'), { target: { value: 'เนื้อหาใหม่ : __' } });
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const [id, data] = mockSave.mock.calls[0];
    expect(id).toMatch(/^OPDT-\d+-[0-9a-f]{16}$/);
    expect(data.name).toBe('เทมเพลตใหม่');
    expect(data.content).toBe('เนื้อหาใหม่ : __');
    expect(data.createdAt).toBeUndefined(); // create → Layer 1 stamps fresh
    await waitFor(() => expect(screen.queryByTestId('opd-template-editor')).toBeNull());

    // realtime: snapshot (latency compensation) นำรายการใหม่เข้าเมนู — ไม่มี refresh call
    pushItems([...BRANCH_ITEMS, { id: 'OPDT-3', name: 'เทมเพลตใหม่', content: 'เนื้อหาใหม่ : __', branchId: 'BR-A' }]);
    openMenu();
    expect(screen.getByTestId('opd-template-item-OPDT-3')).toBeTruthy();
    expect(listenCalls).toBe(1);
  });

  it('C8 edit: ✎ → prefill → save ด้วย id เดิม + คง createdAt/branchId → push → ชื่อใหม่ในเมนู', async () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-edit-OPDT-1'));

    const nameInput = document.querySelector('[data-field="opdt-name"]');
    const contentInput = document.querySelector('[data-field="opdt-content"]');
    expect(nameInput.value).toBe('ปรึกษาผมร่วง'); // prefill
    expect(contentInput.value).toBe(BRANCH_ITEMS[0].content);

    fireEvent.change(nameInput, { target: { value: 'ปรึกษาผมร่วง v2' } });
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const [id, data] = mockSave.mock.calls[0];
    expect(id).toBe('OPDT-1');
    expect(data.name).toBe('ปรึกษาผมร่วง v2');
    expect(data.createdAt).toBe('2026-07-01T00:00:00.000Z');
    expect(data.branchId).toBe('BR-A');

    pushItems([{ ...BRANCH_ITEMS[0], name: 'ปรึกษาผมร่วง v2' }, BRANCH_ITEMS[1]]);
    openMenu();
    expect(screen.getByTestId('opd-template-item-OPDT-1').textContent).toContain('ปรึกษาผมร่วง v2');
  });

  it('C9 delete: 🗑 → confirm → delete → push → หายจากเมนู; confirm=false → ไม่เรียก', async () => {
    renderMenu();
    openMenu();

    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    expect(mockDelete).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('OPDT-1'));
    pushItems([BRANCH_ITEMS[1]]);
    expect(screen.queryByTestId('opd-template-item-OPDT-1')).toBeNull();
    expect(screen.getByTestId('opd-template-item-OPDT-2')).toBeTruthy();
  });

  it('C10 validate fail → error โชว์ + ไม่เรียก save', () => {
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));
    expect(screen.getByTestId('opd-template-editor-error').textContent).toBe('กรุณากรอกชื่อ template');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('C10-bis (Hunt R1-B2) permission-denied ตอน save → error ภาษาไทย + modal ค้างให้แก้', async () => {
    mockSave.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    renderMenu();
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.change(document.querySelector('[data-field="opdt-name"]'), { target: { value: 'ก' } });
    fireEvent.change(document.querySelector('[data-field="opdt-content"]'), { target: { value: 'ข' } });
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));
    await waitFor(() => expect(screen.getByTestId('opd-template-editor-error')).toBeTruthy());
    const msg = screen.getByTestId('opd-template-editor-error').textContent;
    expect(msg).toContain('ไม่มีสิทธิ์บันทึก template');
    expect(msg).not.toMatch(/Missing or insufficient/);
    expect(screen.getByTestId('opd-template-editor')).toBeTruthy();
  });
});

describe('C11-C12 — degraded + isolation', () => {
  it('C11 listener error (pre-rules-deploy permission-denied) → builtin ยังคลิกได้ + error row', () => {
    const onInsert = vi.fn();
    render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
    pushError();
    openMenu();
    expect(screen.getByTestId('opd-template-load-error')).toBeTruthy();
    fireEvent.click(screen.getByTestId('opd-template-item-builtin-sexual-performance'));
    expect(onInsert).toHaveBeenCalledWith(MANDATORY_OPD_NOTE_TEMPLATES[0].content);
  });

  it('C11-bis error แล้ว listener ฟื้น (rules deploy แล้ว) → รายการกลับมาแทน error row', () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    pushError();
    openMenu();
    expect(screen.getByTestId('opd-template-load-error')).toBeTruthy();
    pushItems([...BRANCH_ITEMS]);
    expect(screen.queryByTestId('opd-template-load-error')).toBeNull();
    expect(screen.getByTestId('opd-template-item-OPDT-1')).toBeTruthy();
  });

  it('C12 ✎/🗑 stopPropagation — ไม่ trigger insert', () => {
    const onInsert = vi.fn();
    renderMenu(onInsert);
    openMenu();
    fireEvent.click(screen.getByTestId('opd-template-edit-OPDT-1'));
    expect(onInsert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('opd-template-editor-cancel'));
    openMenu();
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    expect(onInsert).not.toHaveBeenCalled();
  });
});
