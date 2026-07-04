// OPD Note Templates (2026-07-05) — OpdNoteTemplateMenu RTL behavior tests
// Real component + mocked scopedDataLayer. Covers: lazy load, built-in
// mandatory row, insert callback, AV78 modal discipline, create/edit/delete
// with REAL EFFECT assertions (list actually changes after mutation).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const mockList = vi.fn();
const mockSave = vi.fn();
const mockDelete = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listOpdNoteTemplates: (...a) => mockList(...a),
  saveOpdNoteTemplate: (...a) => mockSave(...a),
  deleteOpdNoteTemplate: (...a) => mockDelete(...a),
}));

import OpdNoteTemplateMenu from '../src/components/OpdNoteTemplateMenu.jsx';
import { MANDATORY_OPD_NOTE_TEMPLATES } from '../src/lib/opdNoteTemplateValidation.js';
import { __escStackSize } from '../src/lib/useEscToClose.js';

const BRANCH_ITEMS = [
  { id: 'OPDT-1', name: 'ปรึกษาผมร่วง', content: 'ผมร่วง\n-ระยะเวลา : __', branchId: 'BR-A', createdAt: '2026-07-01T00:00:00.000Z', createdBy: 'u1' },
  { id: 'OPDT-2', name: 'ฮอร์โมนชาย', content: 'ฮอร์โมน\n-อาการ : __', branchId: 'BR-A', createdAt: '2026-07-02T00:00:00.000Z', createdBy: 'u1' },
];

beforeEach(() => {
  mockList.mockReset().mockResolvedValue([...BRANCH_ITEMS]);
  mockSave.mockReset().mockResolvedValue(undefined);
  mockDelete.mockReset().mockResolvedValue(undefined);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(window, 'alert').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const openMenu = async () => {
  fireEvent.click(screen.getByTestId('opd-template-trigger'));
  await waitFor(() => expect(screen.getByTestId('opd-template-list')).toBeTruthy());
};

describe('C1-C5 — pill + menu + insert', () => {
  it('C1 render pill โดยยังไม่ fetch (lazy)', () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    expect(screen.getByTestId('opd-template-trigger').textContent).toContain('template จดประวัติ');
    expect(mockList).not.toHaveBeenCalled();
  });

  it('C2 เปิดเมนู → fetch + builtin แถวแรก + badge บังคับ + ไม่มี ✎/🗑 บน builtin', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    expect(mockList).toHaveBeenCalledTimes(1);
    const builtin = screen.getByTestId('opd-template-item-builtin-sexual-performance');
    expect(builtin.textContent).toContain('สมรรถภาพทางเพศ');
    expect(builtin.textContent).toContain('บังคับ');
    expect(builtin.querySelector('[data-testid^="opd-template-edit-"]')).toBeNull();
    expect(builtin.querySelector('[data-testid^="opd-template-delete-"]')).toBeNull();
    // builtin comes BEFORE branch items in the list
    const list = screen.getByTestId('opd-template-list');
    const ids = Array.from(list.querySelectorAll('[data-testid^="opd-template-item-"]')).map(el => el.getAttribute('data-testid'));
    expect(ids[0]).toBe('opd-template-item-builtin-sexual-performance');
  });

  it('C2-bis (Hunt R1-B1) re-open → fetch ใหม่ทุกครั้ง — เห็น template ที่เพื่อนร่วมงาน/สาขาใหม่เพิ่ง save (ไม่ lazy-once)', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    expect(mockList).toHaveBeenCalledTimes(1);
    // อีก staff เพิ่ม template / สลับสาขา → รายการเปลี่ยนบน server
    mockList.mockResolvedValue([{ id: 'OPDT-NEW', name: 'ของสาขาใหม่', content: 'x', branchId: 'BR-B' }]);
    fireEvent.click(screen.getByTestId('opd-template-trigger')); // close
    fireEvent.click(screen.getByTestId('opd-template-trigger')); // re-open
    expect(mockList).toHaveBeenCalledTimes(2); // refresh ทุกการเปิด
    await waitFor(() => expect(screen.getByTestId('opd-template-item-OPDT-NEW')).toBeTruthy());
    expect(screen.queryByTestId('opd-template-item-OPDT-1')).toBeNull(); // ของเก่าหาย (สด 100%)
  });

  it('C3 เลือก builtin → onInsert(content ตรงตาม constant) + เมนูปิด', async () => {
    const onInsert = vi.fn();
    render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-item-builtin-sexual-performance'));
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(MANDATORY_OPD_NOTE_TEMPLATES[0].content);
    expect(screen.queryByTestId('opd-template-list')).toBeNull();
  });

  it('C4 เลือก branch item → onInsert(content ของ item) + ปิด', async () => {
    const onInsert = vi.fn();
    render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-item-OPDT-1')).toBeTruthy());
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
    await openMenu();
    fireEvent.mouseDown(screen.getByTestId('outside'));
    await waitFor(() => expect(screen.queryByTestId('opd-template-list')).toBeNull());
  });
});

describe('C6-C10 — editor modal (AV78) + create/edit/delete effect จริง', () => {
  it('C6 "+ สร้าง" → modal เปิด; backdrop click ไม่ปิด (AV78); ยกเลิก/X/ESC ปิด', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    expect(screen.getByTestId('opd-template-editor')).toBeTruthy();

    // AV78: backdrop click must NOT close
    fireEvent.click(screen.getByTestId('opd-template-editor-backdrop'));
    expect(screen.getByTestId('opd-template-editor')).toBeTruthy();

    // ESC closes (useEscToClose LIFO)
    expect(__escStackSize()).toBeGreaterThan(0);
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('opd-template-editor')).toBeNull());

    // reopen → ยกเลิก closes
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-cancel'));
    expect(screen.queryByTestId('opd-template-editor')).toBeNull();

    // reopen → X closes
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-close'));
    expect(screen.queryByTestId('opd-template-editor')).toBeNull();
  });

  it('C7 create: บันทึก → save(OPDT- id, data) + refresh → รายการใหม่โผล่ในเมนู (effect จริง)', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.change(document.querySelector('[data-field="opdt-name"]'), { target: { value: 'เทมเพลตใหม่' } });
    fireEvent.change(document.querySelector('[data-field="opdt-content"]'), { target: { value: 'เนื้อหาใหม่ : __' } });

    // หลัง save สำเร็จ list ต้องสะท้อนรายการใหม่ (จำลอง server ตอบกลับ)
    mockList.mockResolvedValue([...BRANCH_ITEMS, { id: 'OPDT-3', name: 'เทมเพลตใหม่', content: 'เนื้อหาใหม่ : __', branchId: 'BR-A' }]);
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const [id, data] = mockSave.mock.calls[0];
    expect(id).toMatch(/^OPDT-\d+-[0-9a-f]{16}$/);
    expect(data.name).toBe('เทมเพลตใหม่');
    expect(data.content).toBe('เนื้อหาใหม่ : __');
    expect(data.createdAt).toBeUndefined(); // create → Layer 1 stamps fresh
    await waitFor(() => expect(screen.queryByTestId('opd-template-editor')).toBeNull());

    // effect จริง: เมนูเห็นรายการใหม่
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-item-OPDT-3')).toBeTruthy());
  });

  it('C8 edit: ✎ → prefill → บันทึกด้วย id เดิม + คง createdAt/branchId → เมนูแสดงชื่อใหม่ (effect จริง)', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-edit-OPDT-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('opd-template-edit-OPDT-1'));

    const nameInput = document.querySelector('[data-field="opdt-name"]');
    const contentInput = document.querySelector('[data-field="opdt-content"]');
    expect(nameInput.value).toBe('ปรึกษาผมร่วง'); // prefill
    expect(contentInput.value).toBe(BRANCH_ITEMS[0].content);

    fireEvent.change(nameInput, { target: { value: 'ปรึกษาผมร่วง v2' } });
    mockList.mockResolvedValue([{ ...BRANCH_ITEMS[0], name: 'ปรึกษาผมร่วง v2' }, BRANCH_ITEMS[1]]);
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));

    await waitFor(() => expect(mockSave).toHaveBeenCalledTimes(1));
    const [id, data] = mockSave.mock.calls[0];
    expect(id).toBe('OPDT-1'); // id เดิม — ไม่ mint ใหม่
    expect(data.name).toBe('ปรึกษาผมร่วง v2');
    expect(data.createdAt).toBe('2026-07-01T00:00:00.000Z'); // คง stamp เดิม
    expect(data.branchId).toBe('BR-A'); // คง branch เดิม

    await openMenu();
    await waitFor(() => {
      expect(screen.getByTestId('opd-template-item-OPDT-1').textContent).toContain('ปรึกษาผมร่วง v2');
    });
  });

  it('C9 delete: 🗑 → confirm → delete + refresh → หายจากเมนู (effect จริง); confirm=false → ไม่เรียก', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-delete-OPDT-1')).toBeTruthy());

    // confirm=false → no delete
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    expect(mockDelete).not.toHaveBeenCalled();

    // confirm=true → delete + refresh → row gone
    mockList.mockResolvedValue([BRANCH_ITEMS[1]]);
    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('OPDT-1'));
    await waitFor(() => expect(screen.queryByTestId('opd-template-item-OPDT-1')).toBeNull());
    expect(screen.getByTestId('opd-template-item-OPDT-2')).toBeTruthy();
  });

  it('C10 validate fail → error โชว์ + ไม่เรียก save', async () => {
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.click(screen.getByTestId('opd-template-editor-save')); // ทั้งคู่ว่าง
    expect(screen.getByTestId('opd-template-editor-error').textContent).toBe('กรุณากรอกชื่อ template');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('C10-bis (Hunt R1-B2) permission-denied ตอน save → error เป็นภาษาไทย ไม่ใช่ raw Firebase message', async () => {
    mockSave.mockRejectedValue(Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    render(<OpdNoteTemplateMenu isDark onInsert={() => {}} />);
    await openMenu();
    fireEvent.click(screen.getByTestId('opd-template-create'));
    fireEvent.change(document.querySelector('[data-field="opdt-name"]'), { target: { value: 'ก' } });
    fireEvent.change(document.querySelector('[data-field="opdt-content"]'), { target: { value: 'ข' } });
    fireEvent.click(screen.getByTestId('opd-template-editor-save'));
    await waitFor(() => expect(screen.getByTestId('opd-template-editor-error')).toBeTruthy());
    const msg = screen.getByTestId('opd-template-editor-error').textContent;
    expect(msg).toContain('ไม่มีสิทธิ์บันทึก template');
    expect(msg).not.toMatch(/Missing or insufficient/);
    // modal ยังเปิดอยู่ให้แก้/ยกเลิกเอง (ไม่เด้งปิดทิ้งงานที่พิมพ์)
    expect(screen.getByTestId('opd-template-editor')).toBeTruthy();
  });
});

describe('C11-C12 — degraded + isolation', () => {
  it('C11 load error (pre-rules-deploy permission-denied) → builtin ยังคลิกได้ + error row โชว์', async () => {
    mockList.mockRejectedValue(new Error('permission-denied'));
    const onInsert = vi.fn();
    render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-load-error')).toBeTruthy());
    fireEvent.click(screen.getByTestId('opd-template-item-builtin-sexual-performance'));
    expect(onInsert).toHaveBeenCalledWith(MANDATORY_OPD_NOTE_TEMPLATES[0].content);
  });

  it('C12 ✎/🗑 stopPropagation — ไม่ trigger insert', async () => {
    const onInsert = vi.fn();
    render(<OpdNoteTemplateMenu isDark onInsert={onInsert} />);
    await openMenu();
    await waitFor(() => expect(screen.getByTestId('opd-template-edit-OPDT-1')).toBeTruthy());
    fireEvent.click(screen.getByTestId('opd-template-edit-OPDT-1'));
    expect(onInsert).not.toHaveBeenCalled();
    // ปิด modal แล้วลอง 🗑
    fireEvent.click(screen.getByTestId('opd-template-editor-cancel'));
    await openMenu();
    window.confirm.mockReturnValueOnce(false);
    fireEvent.click(screen.getByTestId('opd-template-delete-OPDT-1'));
    expect(onInsert).not.toHaveBeenCalled();
  });
});
