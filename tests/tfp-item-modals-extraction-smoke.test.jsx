// TFP extraction step 2 (2026-07-07) — execution smoke for TfpItemModals.jsx
//
// V163 lesson: a missing import / free identifier in a moved component is
// BUILD-INVISIBLE (undefined identifier → global lookup → build clean → runtime
// ReferenceError). Source-grep cannot catch it; only EXECUTION can. These tests
// mount each extracted modal DIRECTLY (real module, no mocks of the module
// under test) with minimal-but-realistic props and assert it renders + its
// primary interactions fire the threaded handlers.
//
// Behavior parity is otherwise covered by the pre-existing TFP RTL suites —
// this file's job is narrowly: "the moved code executes at its new home".

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import {
  LabItemModal, MedItemModal, MedGroupModal, RemedPanel, ConsItemModal, ConsGroupModal,
} from '../src/components/treatment-form/TfpItemModals.jsx';

afterEach(cleanup);

const cls = { labelCls: 'lbl', inputCls: 'inp', selectCls: 'sel' };

describe('SMK — TfpItemModals execution smoke (extraction step 2)', () => {
  it('SMK.1 LabItemModal renders + confirm builds item via setLabItems + closes', () => {
    const setLabItems = vi.fn();
    const setLabModalOpen = vi.fn();
    render(<LabItemModal
      isDark={false} {...cls}
      editingLabIndex={-1} labModalLoading={false}
      labProducts={[{ id: 1, name: 'CBC', price: '300', unit: 'ครั้ง' }]}
      labModalSelected={{ id: 1, name: 'CBC', unit: 'ครั้ง' }} setLabModalSelected={vi.fn()}
      labModalQty="1" setLabModalQty={vi.fn()}
      labModalPrice="300" setLabModalPrice={vi.fn()}
      labModalDiscount="0" setLabModalDiscount={vi.fn()}
      labModalDiscountType="amount" setLabModalDiscountType={vi.fn()}
      labModalVat={false} setLabModalVat={vi.fn()}
      labItems={[]} setLabItems={setLabItems} setLabModalOpen={setLabModalOpen}
    />);
    expect(screen.getByText('เพิ่ม Lab')).toBeTruthy();
    fireEvent.click(screen.getByText('ยืนยัน'));
    expect(setLabItems).toHaveBeenCalledTimes(1);
    expect(setLabModalOpen).toHaveBeenCalledWith(false);
    // the updater appends the built item with the canonical shape
    const next = setLabItems.mock.calls[0][0]([]);
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ productId: 1, productName: 'CBC', qty: '1', price: '300.00' });
  });

  it('SMK.2 MedItemModal renders + product pick + confirm handler fires', () => {
    const selectMedProduct = vi.fn();
    const confirmMedModal = vi.fn();
    render(<MedItemModal
      isDark {...cls}
      editingMedIndex={-1} medModalLoading={false}
      medFilteredProducts={[{ id: 9, name: 'Amoxicillin', price: '120', unit: 'เม็ด', category: 'ยา' }]}
      selectMedProduct={selectMedProduct}
      medModalQuery="" setMedModalQuery={vi.fn()}
      medModalSelected={null} setMedModalSelected={vi.fn()}
      medModalQty="" setMedModalQty={vi.fn()}
      medModalPrice="" setMedModalPrice={vi.fn()}
      medModalPremium={false} setMedModalPremium={vi.fn()}
      medModalDiscount="" setMedModalDiscount={vi.fn()}
      medModalDiscountType="amount" setMedModalDiscountType={vi.fn()}
      medModalVat={false} setMedModalVat={vi.fn()}
      medModalLabelOpen={false} setMedModalLabelOpen={vi.fn()}
      confirmMedModal={confirmMedModal} setMedModalOpen={vi.fn()}
    />);
    expect(screen.getByText('เพิ่มยากลับบ้าน')).toBeTruthy();
    fireEvent.click(screen.getByText('Amoxicillin'));
    expect(selectMedProduct).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    // confirm disabled while no selection (medModalSelected=null)
    expect(screen.getByText('ยืนยัน').disabled).toBe(true);
  });

  it('SMK.3 MedGroupModal renders rows + toggle + confirm enabled when checked', () => {
    const toggleMedGroupCheck = vi.fn();
    const confirmMedGroup = vi.fn();
    render(<MedGroupModal
      isDark={false} selectCls="sel"
      medGroupSelectedId="1" setMedGroupSelectedId={vi.fn()}
      medGroupData={[{ id: 1, name: 'กลุ่ม A', products: [{ id: 5, name: 'ยา X', qty: '2', unit: 'เม็ด', price: '10' }] }]}
      medGroupLoading={false}
      medGroupChecked={new Set([0])} setMedGroupChecked={vi.fn()}
      toggleMedGroupCheck={toggleMedGroupCheck}
      selectedGroupProducts={[{ id: 5, name: 'ยา X', qty: '2', unit: 'เม็ด', price: '10' }]}
      confirmMedGroup={confirmMedGroup} setMedGroupModalOpen={vi.fn()}
    />);
    expect(screen.getByText('รายการยากลับบ้าน (1 รายการ)')).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox'));
    expect(toggleMedGroupCheck).toHaveBeenCalledWith(0);
    fireEvent.click(screen.getByText('ยืนยัน'));
    expect(confirmMedGroup).toHaveBeenCalled();
  });

  it('SMK.4 RemedPanel renders history rows + click appends medication', () => {
    const setMedications = vi.fn();
    render(<RemedPanel
      isDark={false}
      options={{ remedItems: [{ productId: 'P1', name: 'ยาเดิม', qty: '3', price: '50' }] }}
      setMedications={setMedications} setRemedModalOpen={vi.fn()}
    />);
    fireEvent.click(screen.getByText('ยาเดิม'));
    expect(setMedications).toHaveBeenCalledTimes(1);
    const next = setMedications.mock.calls[0][0]([]);
    expect(next[0]).toMatchObject({ id: 'P1', name: 'ยาเดิม', qty: '3', unitPrice: '50' });
  });

  it('SMK.5 ConsItemModal renders + pick sets selected + qty=1', () => {
    const setConsModalSelected = vi.fn();
    const setConsModalQty = vi.fn();
    render(<ConsItemModal
      isDark {...cls}
      consModalLoading={false}
      consFilteredProducts={[{ id: 7, name: 'สำลี', unit: 'ห่อ' }]}
      consModalQuery="" setConsModalQuery={vi.fn()}
      consModalSelected={null} setConsModalSelected={setConsModalSelected}
      consModalQty="" setConsModalQty={setConsModalQty}
      confirmConsModal={vi.fn()} setConsModalOpen={vi.fn()}
    />);
    fireEvent.click(screen.getByText('สำลี'));
    expect(setConsModalSelected).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
    expect(setConsModalQty).toHaveBeenCalledWith('1');
  });

  it('SMK.6 ConsGroupModal renders + group switch re-checks all + confirm fires', () => {
    const setConsGroupChecked = vi.fn();
    const confirmConsGroup = vi.fn();
    render(<ConsGroupModal
      isDark={false} selectCls="sel"
      consGroupSelectedId="1" setConsGroupSelectedId={vi.fn()}
      consGroupData={[
        { id: 1, name: 'กลุ่ม 1', products: [{ id: 1, name: 'a', qty: '1', unit: 'ชิ้น' }] },
        { id: 2, name: 'กลุ่ม 2', products: [{ id: 2, name: 'b', qty: '1', unit: 'ชิ้น' }, { id: 3, name: 'c', qty: '1', unit: 'ชิ้น' }] },
      ]}
      consGroupLoading={false}
      consGroupChecked={new Set([0])} setConsGroupChecked={setConsGroupChecked}
      toggleConsGroupCheck={vi.fn()}
      selectedConsGroupProducts={[{ id: 1, name: 'a', qty: '1', unit: 'ชิ้น' }]}
      confirmConsGroup={confirmConsGroup} setConsGroupModalOpen={vi.fn()}
    />);
    fireEvent.change(screen.getByDisplayValue('กลุ่ม 1'), { target: { value: '2' } });
    // switching group pre-checks every product index of the new group
    expect(setConsGroupChecked).toHaveBeenCalled();
    const arg = setConsGroupChecked.mock.calls[0][0];
    expect([...arg]).toEqual([0, 1]);
    fireEvent.click(screen.getByText('ยืนยัน'));
    expect(confirmConsGroup).toHaveBeenCalled();
  });

  it('SMK.7 ESC closes each overlay modal (AV78 explicit-close preserved)', () => {
    const closers = {
      lab: vi.fn(), med: vi.fn(), medGroup: vi.fn(), cons: vi.fn(), consGroup: vi.fn(),
    };
    const { container: c1 } = render(<LabItemModal isDark={false} {...cls} editingLabIndex={-1} labModalLoading labProducts={[]} labModalSelected={null} setLabModalSelected={vi.fn()} labModalQty="" setLabModalQty={vi.fn()} labModalPrice="" setLabModalPrice={vi.fn()} labModalDiscount="" setLabModalDiscount={vi.fn()} labModalDiscountType="amount" setLabModalDiscountType={vi.fn()} labModalVat={false} setLabModalVat={vi.fn()} labItems={[]} setLabItems={vi.fn()} setLabModalOpen={closers.lab} />);
    fireEvent.keyDown(c1.querySelector('[role="dialog"]'), { key: 'Escape' });
    expect(closers.lab).toHaveBeenCalledWith(false);
    cleanup();

    const { container: c2 } = render(<ConsGroupModal isDark={false} selectCls="sel" consGroupSelectedId="" setConsGroupSelectedId={vi.fn()} consGroupData={[]} consGroupLoading consGroupChecked={new Set()} setConsGroupChecked={vi.fn()} toggleConsGroupCheck={vi.fn()} selectedConsGroupProducts={[]} confirmConsGroup={vi.fn()} setConsGroupModalOpen={closers.consGroup} />);
    fireEvent.keyDown(c2.querySelector('[role="dialog"]'), { key: 'Escape' });
    expect(closers.consGroup).toHaveBeenCalledWith(false);
  });

  it('SMK.8 source-grep: TFP renders every extracted modal at its original conditional', () => {
    // Locks the callsite contract: mount-conditional stays in TFP (V160) and
    // every state/handler prop is threaded from TFP scope.
    const { readFileSync } = require('node:fs');
    const tfp = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
    for (const [flag, comp] of [
      ['labModalOpen', 'LabItemModal'],
      ['medModalOpen', 'MedItemModal'],
      ['medGroupModalOpen', 'MedGroupModal'],
      ['remedModalOpen', 'RemedPanel'],
      ['consModalOpen', 'ConsItemModal'],
      ['consGroupModalOpen', 'ConsGroupModal'],
    ]) {
      expect(tfp).toMatch(new RegExp(`\\{${flag} && \\(\\s*<${comp}`));
    }
    // the moved overlay markup must NOT remain inline in TFP
    expect(tfp).not.toMatch(/aria-labelledby="modal-title-lab"/);
    expect(tfp).not.toMatch(/aria-labelledby="modal-title-med"/);
    expect(tfp).not.toMatch(/aria-labelledby="modal-title-cons"/);
  });
});
