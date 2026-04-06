import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, Stethoscope, Heart, Thermometer, ClipboardList,
         Pill, ShoppingCart, DollarSign, Shield, CreditCard, Check, Plus, Trash2,
         Search, Package, Edit3, RotateCcw } from 'lucide-react';
import { doc, setDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import * as broker from '../lib/brokerClient.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, title, isDark, accent, children }) {
  return (
    <div className="flex items-center flex-wrap gap-2 mb-3">
      <Icon size={14} style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }} />
      <h4 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: accent }}>{title}</h4>
      {children}
    </div>
  );
}

function FormSection({ isDark, children, className = '' }) {
  return (
    <div className={`rounded-xl border p-4 ${isDark ? 'border-[#222] bg-[#0a0a0a]' : 'border-gray-200 bg-white'} ${className}`}>
      {children}
    </div>
  );
}

function ActionBtn({ children, color, isDark, onClick, className = '' }) {
  return (
    <button onClick={onClick}
      className={`text-[10px] font-bold px-2 py-1 rounded-lg border transition-all flex items-center gap-1 ${className}`}
      style={{ color, borderColor: `${color}40`, background: `${color}0a` }}>
      {children}
    </button>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function TreatmentFormPage({ mode = 'create', customerId, treatmentId, patientName, isDark, db, appId, onClose, onSaved }) {
  const isEdit = mode === 'edit';
  const accent = isDark ? '#a78bfa' : '#7c3aed';
  const inputCls = `w-full rounded-lg px-3 py-2 text-xs outline-none border transition-all ${isDark ? 'bg-[#111] border-[#333] text-gray-200 focus:border-purple-500' : 'bg-white border-gray-200 text-gray-800 focus:border-purple-400'}`;
  const labelCls = 'text-[9px] font-bold uppercase tracking-widest text-gray-500 mb-1 block';
  const selectCls = inputCls;

  // ── Core state ──────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [options, setOptions] = useState(null);

  // Doctor & Date
  const [doctorId, setDoctorId] = useState('');
  const [assistantIds, setAssistantIds] = useState([]);
  const [treatmentDate, setTreatmentDate] = useState(new Date().toISOString().slice(0, 10));

  // Doctor fees (ค่ามือแพทย์)
  const [doctorFees, setDoctorFees] = useState([]); // [{doctorId, name, fee, groupId}]
  const [dfEditingIdx, setDfEditingIdx] = useState(-1); // -1=none, >=0=editing inline

  // Health Info
  const [bloodType, setBloodType] = useState('');
  const [congenitalDisease, setCongenitalDisease] = useState('');
  const [drugAllergy, setDrugAllergy] = useState('');
  const [treatmentHistory, setTreatmentHistory] = useState('');

  // Vitals
  const [vitals, setVitals] = useState({
    weight: '', height: '', temperature: '', pulseRate: '',
    respiratoryRate: '', systolicBP: '', diastolicBP: '', oxygenSaturation: '',
  });

  // OPD Card
  const [opd, setOpd] = useState({
    symptoms: '', physicalExam: '', diagnosis: '',
    treatmentInfo: '', treatmentPlan: '', treatmentNote: '', additionalNote: '',
  });

  // Consent & Med Cert
  const [medCertActuallyCome, setMedCertActuallyCome] = useState(false);
  const [medCertIsRest, setMedCertIsRest] = useState(false);
  const [medCertPeriod, setMedCertPeriod] = useState('');
  const [medCertIsOther, setMedCertIsOther] = useState(false);
  const [medCertOtherDetail, setMedCertOtherDetail] = useState('');

  // Take-home medications
  const [medications, setMedications] = useState([]);
  const [medModalOpen, setMedModalOpen] = useState(false);
  const [medModalQuery, setMedModalQuery] = useState('');
  const [medAllProducts, setMedAllProducts] = useState([]); // all meds loaded on open
  const [medModalLoading, setMedModalLoading] = useState(false);
  const [medModalSelected, setMedModalSelected] = useState(null); // selected product in modal
  const [medModalQty, setMedModalQty] = useState('');
  const [medModalPrice, setMedModalPrice] = useState('');
  const [medModalDiscount, setMedModalDiscount] = useState('');
  const [medModalDiscountType, setMedModalDiscountType] = useState('amount'); // amount | percent
  const [medModalVat, setMedModalVat] = useState(false);
  const [medModalPremium, setMedModalPremium] = useState(false);
  const [medModalLabelOpen, setMedModalLabelOpen] = useState(false);
  const [editingMedIndex, setEditingMedIndex] = useState(-1); // -1 = adding new, >= 0 = editing
  const [medGroupModalOpen, setMedGroupModalOpen] = useState(false);
  const [medGroupData, setMedGroupData] = useState([]); // all groups from API
  const [medGroupSelectedId, setMedGroupSelectedId] = useState('');
  const [medGroupChecked, setMedGroupChecked] = useState(new Set()); // checked product indices
  const [medGroupLoading, setMedGroupLoading] = useState(false);
  const [remedModalOpen, setRemedModalOpen] = useState(false);

  // Course items — selected rowIds
  const [selectedCourseItems, setSelectedCourseItems] = useState(new Set());

  // Treatment items — items shown in รายการรักษา panel (from courses or manual)
  const [treatmentItems, setTreatmentItems] = useState([]);

  // Consumables
  const [consumables, setConsumables] = useState([]);
  const [consModalOpen, setConsModalOpen] = useState(false);
  const [consModalQuery, setConsModalQuery] = useState('');
  const [consAllProducts, setConsAllProducts] = useState([]);
  const [consModalLoading, setConsModalLoading] = useState(false);
  const [consModalSelected, setConsModalSelected] = useState(null);
  const [consModalQty, setConsModalQty] = useState('');
  const [consGroupModalOpen, setConsGroupModalOpen] = useState(false);
  const [consGroupData, setConsGroupData] = useState([]);
  const [consGroupSelectedId, setConsGroupSelectedId] = useState('');
  const [consGroupChecked, setConsGroupChecked] = useState(new Set());
  const [consGroupLoading, setConsGroupLoading] = useState(false);

  // Buy items modal (ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน)
  const [buyModalOpen, setBuyModalOpen] = useState(false);
  const [buyModalType, setBuyModalType] = useState('course'); // course | promotion | product
  const [buyItems, setBuyItems] = useState({ course: [], promotion: [], product: [] });
  const [buyCategories, setBuyCategories] = useState({ course: [], promotion: [], product: [] });
  const [buyLoading, setBuyLoading] = useState(false);
  const [buyQuery, setBuyQuery] = useState('');
  const [buySelectedCat, setBuySelectedCat] = useState('');
  const [buyChecked, setBuyChecked] = useState(new Set()); // checked item IDs
  const [buyQtyMap, setBuyQtyMap] = useState({}); // id → qty
  const [buyDiscMap, setBuyDiscMap] = useState({}); // id → discount
  const [buyVatMap, setBuyVatMap] = useState({}); // id → boolean
  // Purchased items (displayed in grid below)
  const [purchasedItems, setPurchasedItems] = useState([]); // { id, name, price, unit, qty, discount, vat, itemType }

  // Insurance
  const [isInsuranceClaimed, setIsInsuranceClaimed] = useState(false);
  const [benefitType, setBenefitType] = useState('');
  const [insuranceCompanyId, setInsuranceCompanyId] = useState('');
  const [insuranceClaimAmount, setInsuranceClaimAmount] = useState('');

  // Discounts
  const [medDiscountOverride, setMedDiscountOverride] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [billDiscount, setBillDiscount] = useState('');
  const [billDiscountType, setBillDiscountType] = useState('amount');

  // Deposit & Wallet
  const [useDeposit, setUseDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [useWallet, setUseWallet] = useState(false);
  const [walletId, setWalletId] = useState('');
  const [walletAmount, setWalletAmount] = useState('');

  // Payment
  const [paymentStatus, setPaymentStatus] = useState('2'); // 0=ชำระภายหลัง, 2=ชำระเต็มจำนวน, 4=แบ่งชำระ
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentTime, setPaymentTime] = useState('');
  const [refNo, setRefNo] = useState('');
  const [note, setNote] = useState('');
  const [saleNote, setSaleNote] = useState('');

  // Payment channels (3 rows)
  const [pmChannels, setPmChannels] = useState([
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
    { enabled: false, method: '', amount: '' },
  ]);
  const updatePmChannel = (idx, field, val) => setPmChannels(prev => prev.map((c, i) => i === idx ? { ...c, [field]: val } : c));

  // Sellers (5 rows)
  const [pmSellers, setPmSellers] = useState([
    { enabled: false, id: '', percent: '100', total: '' },
    { enabled: false, id: '', percent: '100', total: '' },
    { enabled: false, id: '', percent: '100', total: '' },
    { enabled: false, id: '', percent: '100', total: '' },
    { enabled: false, id: '', percent: '100', total: '' },
  ]);
  const updatePmSeller = (idx, field, val) => setPmSellers(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));

  // ── BMI auto-calc ──
  const bmi = useMemo(() => {
    const w = parseFloat(vitals.weight);
    const h = parseFloat(vitals.height);
    if (w > 0 && h > 0) return (w / ((h / 100) ** 2)).toFixed(1);
    return '';
  }, [vitals.weight, vitals.height]);

  // ── Billing calculation ──
  const formatBaht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const billing = useMemo(() => {
    const lines = [];
    purchasedItems.forEach(p => {
      const net = (parseFloat(p.unitPrice) || 0) * (parseInt(p.qty) || 1);
      if (net > 0) lines.push({ name: p.name, amount: net, type: 'item' });
    });
    medications.filter(m => m.name && parseFloat(m.unitPrice) > 0 && !m.isPremium).forEach(m => {
      lines.push({ name: m.name, amount: (parseFloat(m.unitPrice) || 0) * (parseInt(m.qty) || 1), type: 'med' });
    });
    consumables.filter(c => c.name).forEach(c => {
      const net = (parseFloat(c.unitPrice) || 0) * (parseInt(c.qty) || 1);
      if (net > 0) lines.push({ name: c.name, amount: net, type: 'cons' });
    });
    const subtotal = lines.reduce((s, l) => s + l.amount, 0);
    const medSubtotal = lines.filter(l => l.type === 'med').reduce((s, l) => s + l.amount, 0);
    const medDiscPct = parseFloat(options?.medicineDiscountPercent) || 0;
    const medDisc = parseFloat(medDiscountOverride) || (medSubtotal * medDiscPct / 100);
    const afterMedDisc = Math.max(0, subtotal - medDisc);
    const billDiscAmt = billDiscountType === 'percent'
      ? afterMedDisc * (parseFloat(billDiscount) || 0) / 100
      : parseFloat(billDiscount) || 0;
    const afterDiscount = Math.max(0, afterMedDisc - billDiscAmt);
    const insDed = isInsuranceClaimed ? (parseFloat(insuranceClaimAmount) || 0) : 0;
    const depDed = useDeposit ? (parseFloat(depositAmount) || 0) : 0;
    const walDed = useWallet ? (parseFloat(walletAmount) || 0) : 0;
    const netTotal = Math.max(0, afterDiscount - insDed - depDed - walDed);
    return { lines, subtotal, medSubtotal, medDiscPct, medDisc, billDiscAmt, afterDiscount, insDed, depDed, walDed, netTotal };
  }, [purchasedItems, medications, consumables, medDiscountOverride, billDiscount, billDiscountType,
      isInsuranceClaimed, insuranceClaimAmount, useDeposit, depositAmount, useWallet, walletAmount, options]);

  // ── Load form data ──────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        // Always load form options (doctors, courses, etc.)
        const formData = await broker.getTreatmentCreateForm(customerId);
        if (!formData.success || !formData.options) {
          setError(formData.error || 'ไม่สามารถโหลดฟอร์มได้');
          setLoading(false);
          return;
        }
        setOptions(formData.options);

        if (isEdit && treatmentId) {
          // Load existing treatment data for edit
          const detail = await broker.getTreatment(treatmentId);
          if (detail.success && detail.treatment) {
            const t = detail.treatment;
            if (t.doctorId) setDoctorId(t.doctorId);
            if (t.assistants?.length) setAssistantIds(t.assistants.map(a => a.id || a).filter(Boolean));
            if (t.treatmentDate) setTreatmentDate(t.treatmentDate);
            // Health info
            if (t.healthInfo?.bloodType) setBloodType(t.healthInfo.bloodType);
            if (t.healthInfo?.congenitalDisease) setCongenitalDisease(t.healthInfo.congenitalDisease);
            if (t.healthInfo?.drugAllergy) setDrugAllergy(t.healthInfo.drugAllergy);
            // Vitals
            if (t.vitals) setVitals(v => ({ ...v, ...t.vitals }));
            // OPD
            setOpd({
              symptoms: t.symptoms || '',
              physicalExam: t.physicalExam || '',
              diagnosis: t.diagnosis || '',
              treatmentInfo: t.treatmentInfo || '',
              treatmentPlan: t.treatmentPlan || '',
              treatmentNote: t.treatmentNote || '',
              additionalNote: t.additionalNote || '',
            });
            // Treatment items from existing
            if (t.treatmentItems?.length) {
              setTreatmentItems(t.treatmentItems.map((item, i) => ({
                id: `existing-${i}`,
                name: item.name || item.product || '',
                qty: item.qty || '1',
                unit: item.unit || '',
                price: item.price || '',
              })));
            }
          }
        } else {
          // Create mode — pre-fill defaults
          const hi = formData.options.healthInfo || {};
          if (hi.doctorId) setDoctorId(hi.doctorId);
          if (hi.bloodType) setBloodType(hi.bloodType);
          if (hi.congenitalDisease) setCongenitalDisease(hi.congenitalDisease);
          if (hi.drugAllergy) setDrugAllergy(hi.drugAllergy);
          if (hi.treatmentHistory) setTreatmentHistory(hi.treatmentHistory);
          const vd = formData.options.vitalsDefaults || {};
          if (vd.weight) setVitals(v => ({ ...v, weight: vd.weight }));
          if (vd.height) setVitals(v => ({ ...v, height: vd.height }));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();
  }, [customerId, treatmentId, isEdit]);

  // ── Toggle assistant ──
  const toggleAssistant = (id) => {
    setAssistantIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 5) return prev;
      return [...prev, id];
    });
  };

  // ── Auto-populate doctor fees when doctor/assistants change ──
  useEffect(() => {
    if (!options) return;
    const allDoctors = options.doctors || [];
    const allAssistants = options.assistants || [];
    const selectedIds = [doctorId, ...assistantIds].filter(Boolean);
    setDoctorFees(prev => {
      // Keep existing entries that are still selected, add new ones
      const kept = prev.filter(f => selectedIds.includes(String(f.doctorId)));
      const newEntries = selectedIds
        .filter(id => !kept.some(f => String(f.doctorId) === String(id)))
        .map(id => {
          const doc = allDoctors.find(d => String(d.id) === String(id)) || allAssistants.find(a => String(a.id) === String(id));
          return { doctorId: id, name: doc?.name || '', fee: '0', groupId: doc?.dfGroupId || '' };
        });
      return [...kept, ...newEntries];
    });
  }, [doctorId, assistantIds, options]);

  // ── Course item toggle — also update treatment items ──
  const toggleCourseItem = (product) => {
    setSelectedCourseItems(prev => {
      const next = new Set(prev);
      if (next.has(product.rowId)) {
        next.delete(product.rowId);
        // Remove from treatment items
        setTreatmentItems(ti => ti.filter(t => t.id !== product.rowId));
      } else {
        next.add(product.rowId);
        // Add to treatment items
        setTreatmentItems(ti => [...ti, {
          id: product.rowId,
          name: product.name,
          qty: '1',
          unit: product.unit || '',
          price: '',
        }]);
      }
      return next;
    });
  };

  // ── Treatment items CRUD ──
  const updateTreatmentItem = (id, field, value) => {
    setTreatmentItems(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };
  const removeTreatmentItem = (id) => {
    setTreatmentItems(prev => prev.filter(t => t.id !== id));
    setSelectedCourseItems(prev => { const n = new Set(prev); n.delete(id); return n; });
  };

  // ── Medication modal (เพิ่มยากลับบ้าน — matching ProClinic) ──
  const openMedModal = async () => {
    setEditingMedIndex(-1); // Reset to "add new" mode
    setMedModalOpen(true);
    setMedModalQuery('');
    setMedModalSelected(null);
    setMedModalQty('');
    setMedModalPrice('');
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalVat(false);
    setMedModalPremium(false);
    setMedModalLabelOpen(false);
    if (medAllProducts.length > 0) return;
    setMedModalLoading(true);
    try {
      const data = await broker.searchProducts({ productType: 'ยา', isTakeaway: true, perPage: 200 });
      if (data.success) {
        setMedAllProducts(data.products || []);
        // Backup to Firestore
        if (db && appId && data.products?.length) {
          try {
            const items = data.products;
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              items.slice(i, i + 400).forEach(p => {
                const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'takeaway_products', 'items', String(p.id));
                batch.set(ref, { ...p, fetchedAt: new Date().toISOString() }, { merge: true });
              });
              await batch.commit();
            }
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup takeaway products', _e); }
        }
      }
    } catch (_) {}
    setMedModalLoading(false);
  };
  const medFilteredProducts = useMemo(() => {
    if (!medModalQuery) return medAllProducts;
    const q = medModalQuery.toLowerCase();
    return medAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [medAllProducts, medModalQuery]);
  const selectMedProduct = (p) => {
    setMedModalSelected(p);
    setMedModalQty(p.label?.dosageAmount || '1');
    setMedModalPrice(p.price || '0');
    setMedModalVat(!!p.isVatIncluded);
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalPremium(false);
  };
  const confirmMedModal = () => {
    if (!medModalSelected) return;
    const p = medModalSelected;
    const dosageText = p.label
      ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
      : (editingMedIndex >= 0 ? medications[editingMedIndex]?.dosage || '' : '');
    const price = parseFloat(medModalPrice) || 0;
    const disc = parseFloat(medModalDiscount) || 0;
    const discounted = medModalDiscountType === 'percent' ? price * (1 - disc / 100) : price - disc;
    const vatAmount = medModalVat ? discounted * 0.07 : 0;
    const netPrice = medModalPremium ? 0 : Math.max(0, discounted + vatAmount);
    const medItem = {
      id: p.id,
      name: p.name,
      dosage: dosageText,
      qty: medModalQty || '1',
      unitPrice: netPrice.toFixed(2),
      unit: p.unit || p.label?.dosageUnit || '',
      isPremium: medModalPremium,
    };
    if (editingMedIndex >= 0) {
      // Edit mode — update in-place
      setMedications(prev => prev.map((m, idx) => idx === editingMedIndex ? medItem : m));
      setEditingMedIndex(-1);
    } else {
      // Add mode — append
      setMedications(prev => [...prev, medItem]);
    }
    setMedModalOpen(false);
  };
  const editMedication = async (i) => {
    const med = medications[i];
    setEditingMedIndex(i);
    // Pre-fill modal with existing values
    const product = medAllProducts.find(p => p.id === med.id) || { id: med.id, name: med.name, unit: med.unit, price: med.unitPrice, label: null };
    setMedModalSelected(product);
    setMedModalQty(med.qty || '1');
    setMedModalPrice(med.isPremium ? (product.price || med.unitPrice || '0') : (med.unitPrice || '0'));
    setMedModalPremium(med.isPremium || false);
    setMedModalDiscount('');
    setMedModalDiscountType('amount');
    setMedModalVat(false);
    setMedModalLabelOpen(false);
    setMedModalQuery('');
    setMedModalOpen(true);
    // Load product list if not loaded
    if (medAllProducts.length === 0) {
      setMedModalLoading(true);
      try {
        const data = await broker.searchProducts({ productType: 'ยา', isTakeaway: true, perPage: 200 });
        if (data.success) {
          setMedAllProducts(data.products || []);
          // Re-find product with label
          const found = (data.products || []).find(p => p.id === med.id);
          if (found) setMedModalSelected(found);
        }
      } catch (_) {}
      setMedModalLoading(false);
    }
  };
  const openMedGroupModal = async () => {
    setMedGroupModalOpen(true);
    setMedGroupChecked(new Set());
    setMedGroupSelectedId('');
    if (medGroupData.length > 0) return; // already loaded
    setMedGroupLoading(true);
    try {
      const data = await broker.getMedicationGroups('ยากลับบ้าน');
      if (data.success && data.groups?.length) {
        setMedGroupData(data.groups);
        setMedGroupSelectedId(String(data.groups[0].id));
        setMedGroupChecked(new Set(data.groups[0].products.map((_, i) => i)));
        // Backup to Firestore
        if (db && appId) {
          try {
            const batch = writeBatch(db);
            for (const g of data.groups) {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'medication_groups', 'items', String(g.id));
              batch.set(ref, { ...g, fetchedAt: new Date().toISOString() }, { merge: true });
            }
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup medication groups', _e); }
        }
      }
    } catch (_) {}
    setMedGroupLoading(false);
  };
  const selectedGroupProducts = useMemo(() => {
    const g = medGroupData.find(g => String(g.id) === medGroupSelectedId);
    return g?.products || [];
  }, [medGroupData, medGroupSelectedId]);
  const toggleMedGroupCheck = (idx) => {
    setMedGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmMedGroup = () => {
    selectedGroupProducts.forEach((p, i) => {
      if (!medGroupChecked.has(i)) return;
      const dosageText = p.label
        ? [p.label.administrationTimes, p.label.administrationMethod].filter(Boolean).join(', ')
        : '';
      setMedications(prev => [...prev, {
        id: p.id,
        name: p.name,
        dosage: dosageText,
        qty: p.qty || p.label?.dosageAmount || '1',
        unitPrice: p.price || '0',
        unit: p.unit || p.label?.dosageUnit || '',
      }]);
    });
    setMedGroupModalOpen(false);
  };
  const updateMed = (i, field, value) => {
    setMedications(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  };
  const removeMed = (i) => {
    setMedications(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable modal (เพิ่มสินค้าสิ้นเปลือง — matching ProClinic) ──
  const openConsModal = async () => {
    setConsModalOpen(true);
    setConsModalQuery('');
    setConsModalSelected(null);
    setConsModalQty('');
    if (consAllProducts.length > 0) return;
    setConsModalLoading(true);
    try {
      const data = await broker.searchProducts({ productType: 'สินค้าสิ้นเปลือง', perPage: 200 });
      if (data.success) {
        setConsAllProducts(data.products || []);
        if (db && appId && data.products?.length) {
          try {
            const batch = writeBatch(db);
            data.products.forEach(p => {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'consumable_products', 'items', String(p.id));
              batch.set(ref, { ...p, fetchedAt: new Date().toISOString() }, { merge: true });
            });
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup consumable products', _e); }
        }
      }
    } catch (_) {}
    setConsModalLoading(false);
  };
  const consFilteredProducts = useMemo(() => {
    if (!consModalQuery) return consAllProducts;
    const q = consModalQuery.toLowerCase();
    return consAllProducts.filter(p => p.name.toLowerCase().includes(q));
  }, [consAllProducts, consModalQuery]);
  const confirmConsModal = () => {
    if (!consModalSelected) return;
    setConsumables(prev => [...prev, {
      id: consModalSelected.id,
      name: consModalSelected.name,
      qty: consModalQty || '1',
      unit: consModalSelected.unit || '',
    }]);
    setConsModalOpen(false);
  };
  const updateConsumable = (i, field, value) => {
    setConsumables(prev => prev.map((c, idx) => idx === i ? { ...c, [field]: value } : c));
  };
  const removeConsumable = (i) => {
    setConsumables(prev => prev.filter((_, idx) => idx !== i));
  };

  // ── Consumable group modal ──
  const openConsGroupModal = async () => {
    setConsGroupModalOpen(true);
    setConsGroupChecked(new Set());
    setConsGroupSelectedId('');
    if (consGroupData.length > 0) return;
    setConsGroupLoading(true);
    try {
      const data = await broker.getMedicationGroups('สินค้าสิ้นเปลือง');
      if (data.success && data.groups?.length) {
        setConsGroupData(data.groups);
        setConsGroupSelectedId(String(data.groups[0].id));
        setConsGroupChecked(new Set(data.groups[0].products.map((_, i) => i)));
        // Backup to Firestore
        if (db && appId) {
          try {
            const batch = writeBatch(db);
            for (const g of data.groups) {
              const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', 'consumable_groups', 'items', String(g.id));
              batch.set(ref, { ...g, fetchedAt: new Date().toISOString() }, { merge: true });
            }
            await batch.commit();
          } catch (_e) { console.warn('[TreatmentForm] Failed to backup consumable groups', _e); }
        }
      }
    } catch (_) {}
    setConsGroupLoading(false);
  };
  const selectedConsGroupProducts = useMemo(() => {
    const g = consGroupData.find(g => String(g.id) === consGroupSelectedId);
    return g?.products || [];
  }, [consGroupData, consGroupSelectedId]);
  const toggleConsGroupCheck = (idx) => {
    setConsGroupChecked(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };
  const confirmConsGroup = () => {
    selectedConsGroupProducts.forEach((p, i) => {
      if (!consGroupChecked.has(i)) return;
      setConsumables(prev => [...prev, {
        id: p.id,
        name: p.name,
        qty: p.qty || '1',
        unit: p.unit || '',
      }]);
    });
    setConsGroupModalOpen(false);
  };

  // ── Buy items modal (ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน) ──
  const openBuyModal = async (type = 'course') => {
    setBuyModalOpen(true);
    setBuyModalType(type);
    setBuyQuery('');
    setBuySelectedCat('');
    setBuyChecked(new Set());
    setBuyQtyMap({});
    setBuyDiscMap({});
    setBuyVatMap({});
    // Load data if not cached
    if (buyItems[type]?.length > 0) return;
    setBuyLoading(true);
    try {
      const data = await broker.listItems(type);
      if (data.success) {
        setBuyItems(prev => ({ ...prev, [type]: data.items || [] }));
        setBuyCategories(prev => ({ ...prev, [type]: data.categories || [] }));
        // Firestore backup
        if (db && appId && data.items?.length) {
          try {
            const items = data.items;
            for (let i = 0; i < items.length; i += 400) {
              const batch = writeBatch(db);
              items.slice(i, i + 400).forEach(p => {
                const ref = doc(db, 'artifacts', appId, 'public', 'data', 'master_data', `purchasable_${type}`, 'items', String(p.id));
                batch.set(ref, { ...p, fetchedAt: new Date().toISOString() }, { merge: true });
              });
              await batch.commit();
            }
          } catch (_e) { console.warn(`[TreatmentForm] Failed to backup ${type} items`, _e); }
        }
      }
    } catch (_) {}
    setBuyLoading(false);
  };
  const buyFilteredItems = useMemo(() => {
    let items = buyItems[buyModalType] || [];
    if (buySelectedCat) items = items.filter(i => i.category === buySelectedCat);
    if (buyQuery) {
      const q = buyQuery.toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(q));
    }
    return items;
  }, [buyItems, buyModalType, buySelectedCat, buyQuery]);
  const toggleBuyCheck = (id) => {
    setBuyChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        // Auto-set qty to 1 when checked
        setBuyQtyMap(qm => ({ ...qm, [id]: qm[id] || '1' }));
      }
      return next;
    });
  };
  const confirmBuyModal = () => {
    const items = buyItems[buyModalType] || [];
    const newItems = items.filter(i => buyChecked.has(i.id)).map(i => {
      const qty = parseInt(buyQtyMap[i.id]) || 0;
      const disc = parseFloat(buyDiscMap[i.id]) || 0;
      const vat = !!buyVatMap[i.id];
      const price = parseFloat(i.price) || 0;
      const afterDisc = price - disc;
      const vatAmt = vat ? afterDisc * 0.07 : 0;
      const net = Math.max(0, afterDisc + vatAmt);
      return { id: i.id, name: i.name, price: i.price, unitPrice: net.toFixed(2), unit: i.unit, qty: String(qty || 0), discount: String(disc), vat, itemType: i.itemType, category: i.category };
    });
    setPurchasedItems(prev => [...prev, ...newItems]);
    // Auto-add purchased courses/promotions to treatment items
    newItems.forEach(item => {
      if (item.itemType === 'course' || item.itemType === 'promotion') {
        setTreatmentItems(prev => [...prev, {
          id: `purchased-${item.id}-${Date.now()}`,
          name: item.name,
          qty: String(item.qty || 1),
          unit: item.unit || '',
          source: 'purchased',
        }]);
      }
    });
    setBuyModalOpen(false);
  };
  const removePurchasedItem = (idx) => {
    setPurchasedItems(prev => prev.filter((_, i) => i !== idx));
  };
  // Group purchased items by type for display
  const purchasedByType = useMemo(() => {
    const grouped = { course: [], promotion: [], product: [] };
    purchasedItems.forEach(item => {
      if (grouped[item.itemType]) grouped[item.itemType].push(item);
    });
    return grouped;
  }, [purchasedItems]);

  // ── Seller commission auto-calc ──
  useEffect(() => {
    if (billing.netTotal <= 0) return;
    setPmSellers(prev => prev.map(s => {
      if (!s.enabled) return s;
      const pct = parseFloat(s.percent) || 0;
      const newTotal = (billing.netTotal * pct / 100).toFixed(2);
      return newTotal !== s.total ? { ...s, total: newTotal } : s;
    }));
  }, [billing.netTotal, pmSellers.map(s => s.percent + s.enabled).join()]);

  // ── Payment auto-fill when status=2 (full payment) ──
  useEffect(() => {
    if (paymentStatus === '2' && billing.netTotal > 0) {
      setPmChannels(prev => {
        const newAmt = billing.netTotal.toFixed(2);
        if (prev[0].enabled && prev[0].amount === newAmt) return prev;
        return prev.map((c, i) => i === 0 ? { ...c, enabled: true, amount: newAmt } : c);
      });
    }
  }, [paymentStatus, billing.netTotal]);

  // ── Submit ──────────────────────────────────────────────────────────────
  const hasSale = purchasedItems.length > 0
    || medications.length > 0  // ANY medication triggers billing (even free/0 baht) — matches ProClinic
    || consumables.length > 0;

  const handleSubmit = async () => {
    if (!doctorId) { setError('กรุณาเลือกแพทย์'); return; }
    if (assistantIds.length === 0) { setError('กรุณาเลือกผู้ช่วยแพทย์'); return; }
    if (!treatmentDate) { setError('กรุณาเลือกวันที่รักษา'); return; }
    if (hasSale) {
      if (!pmSellers.some(s => s.enabled && s.id)) { setError('กรุณาเลือกพนักงานขาย'); return; }
      if (paymentStatus === '2' || paymentStatus === '4') {
        if (!pmChannels.some(c => c.enabled && c.method)) { setError('กรุณาเลือกช่องทางชำระเงิน'); return; }
        if (!pmChannels.some(c => c.enabled && parseFloat(c.amount) > 0)) { setError('กรุณากรอกจำนวนเงินที่ชำระ'); return; }
      }
    }
    setSaving(true);
    setError('');
    try {
      // Build seller entries from pmSellers array
      const sellerPayload = {};
      pmSellers.forEach((s, i) => {
        if (s.enabled && s.id) {
          sellerPayload[`seller${i + 1}Id`] = s.id;
          sellerPayload[`sellerPercent${i + 1}`] = s.percent;
          sellerPayload[`sellerTotal${i + 1}`] = s.total;
        }
      });
      const payload = {
        doctorId,
        assistantIds,
        treatmentDate,
        ...opd,
        vitals,
        bloodType,
        congenitalDisease,
        drugAllergy,
        treatmentHistory,
        medCertActuallyCome,
        medCertIsRest,
        medCertPeriod,
        medCertIsOther,
        medCertOtherDetail,
        courseItems: Array.from(selectedCourseItems).map(rowId => {
          const ti = treatmentItems.find(t => t.id === rowId);
          return { rowId, qty: ti?.qty || '1' };
        }),
        doctorFees: doctorFees.map(f => ({ doctorId: f.doctorId, fee: f.fee, groupId: f.groupId })),
        purchasedItems: purchasedItems.map(p => ({ id: p.id, name: p.name, qty: p.qty, unitPrice: p.unitPrice, unit: p.unit, itemType: p.itemType })),
        medications: medications.filter(m => m.name),
        consumables: consumables.filter(c => c.name),
        treatmentItems,
        // Billing/Payment — only include when there's an actual sale
        ...(hasSale ? {
          saleDate,
          medicineDiscountPercent: billing.medDiscPct,
          discount: String(billing.billDiscAmt || ''),
          discountType: billDiscountType,
          couponCode,
          isInsuranceClaimed,
          benefitType,
          insuranceCompanyId,
          totalClaimAmount: insuranceClaimAmount,
          useDeposit, depositAmount,
          useWallet, walletId, walletAmount,
          paymentStatus,
          paymentDate,
          paymentTime,
          paymentMethod: pmChannels[0].enabled ? pmChannels[0].method : '',
          paidAmount: pmChannels[0].enabled ? pmChannels[0].amount : '',
          paymentMethod2: pmChannels[1].enabled ? pmChannels[1].method : '',
          paidAmount2: pmChannels[1].enabled ? pmChannels[1].amount : '',
          paymentMethod3: pmChannels[2].enabled ? pmChannels[2].method : '',
          paidAmount3: pmChannels[2].enabled ? pmChannels[2].amount : '',
          refNo, note, saleNote,
          ...sellerPayload,
        } : {}),
      };

      const data = isEdit
        ? await broker.updateTreatment(treatmentId, payload)
        : await broker.createTreatment(customerId, payload);

      if (data.success) {
        // Save raw treatment data to our Firestore (backup — viewable even if ProClinic is down)
        if (db && appId) {
          try {
            const localId = data.treatmentId || treatmentId || `local-${Date.now()}`;
            const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'treatments', String(localId));
            await setDoc(docRef, {
              proClinicId: localId,
              customerId,
              patientName: patientName || '',
              mode: isEdit ? 'edit' : 'create',
              doctorId,
              doctorName: (options?.doctors || []).find(d => String(d.id) === String(doctorId))?.name || '',
              assistantIds,
              treatmentDate,
              opd: { ...opd },
              vitals: { ...vitals, bmi: bmi || '' },
              healthInfo: { bloodType, congenitalDisease, drugAllergy, treatmentHistory },
              medications: medications.filter(m => m.name).map(m => ({ id: m.id, name: m.name, dosage: m.dosage, qty: m.qty, unitPrice: m.unitPrice, unit: m.unit })),
              consumables: consumables.filter(c => c.name).map(c => ({ id: c.id, name: c.name, qty: c.qty, unit: c.unit })),
              purchasedItems: purchasedItems.map(p => ({ id: p.id, name: p.name, qty: p.qty, unitPrice: p.unitPrice, unit: p.unit, itemType: p.itemType })),
              courseItems: Array.from(selectedCourseItems),
              doctorFees: doctorFees.map(f => ({ doctorId: f.doctorId, name: f.name, fee: f.fee, groupId: f.groupId })),
              treatmentItems: treatmentItems.map(t => ({ id: t.id, name: t.name, qty: t.qty, unit: t.unit })),
              billing: { subtotal: billing.subtotal, medDisc: billing.medDisc, billDiscAmt: billing.billDiscAmt, netTotal: billing.netTotal },
              insurance: { isInsuranceClaimed, benefitType, insuranceCompanyId, claimAmount: insuranceClaimAmount },
              payment: { paymentStatus, channels: pmChannels.filter(c => c.enabled), paymentDate, paymentTime, refNo, note, saleNote },
              sellers: pmSellers.filter(s => s.enabled),
              medCert: { medCertActuallyCome, medCertIsRest, medCertPeriod, medCertIsOther, medCertOtherDetail },
              syncedToProClinic: true,
              savedAt: serverTimestamp(),
            }, { merge: true });
          } catch (e) {
            console.warn('[TreatmentForm] Failed to save local backup:', e);
          }
        }
        setSuccess(true);
        setTimeout(() => { if (onSaved) onSaved(); }, 1200);
      } else {
        setError(data.error || (isEdit ? 'บันทึกไม่สำเร็จ' : 'สร้างไม่สำเร็จ'));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // ── Loading / Success states ────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={24} className="animate-spin" style={{ color: accent }} />
          <p className="text-xs text-gray-500">กำลังโหลดฟอร์มการรักษา...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={`fixed inset-0 z-[80] flex items-center justify-center ${isDark ? 'bg-[#0a0a0a]' : 'bg-gray-50'}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={24} className="text-green-500" />
          </div>
          <p className="text-sm font-bold text-green-500">{isEdit ? 'บันทึกสำเร็จ' : 'สร้างการรักษาสำเร็จ'}</p>
        </div>
      </div>
    );
  }

  const doctors = options?.doctors || [];
  const assistants = options?.assistants || [];
  const customerCourses = options?.customerCourses || [];
  const bloodTypeOptions = options?.bloodTypeOptions || [];
  const benefitTypes = options?.benefitTypes || [];
  const insuranceCompanies = options?.insuranceCompanies || [];
  const paymentChannels = options?.paymentChannels || [];
  const wallets = options?.wallets || [];
  const sellerOptions = options?.sellers || [];
  const medicationGroups = options?.medicationGroups || [];
  const consumableGroups = options?.consumableGroups || [];

  return (
    <div className={`fixed inset-0 z-[80] overflow-y-auto ${isDark ? 'bg-[#0a0a0a] text-gray-200' : 'bg-gray-50 text-gray-800'}`}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className={`sticky top-0 z-10 border-b backdrop-blur-sm ${isDark ? 'bg-[#0a0a0a]/95 border-[#222]' : 'bg-white/95 border-gray-200'}`}>
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-all ${isDark ? 'hover:bg-[#1a1a1a]' : 'hover:bg-gray-100'}`}>
            <ArrowLeft size={16} />
          </button>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-black tracking-tight flex items-center gap-2" style={{ color: accent }}>
              {isEdit ? <Edit3 size={16} /> : <Stethoscope size={16} />}
              {isEdit ? 'แก้ไขการรักษา' : 'สร้างการรักษาใหม่'}
            </h2>
            {patientName && <p className="text-[10px] text-gray-500 truncate">{patientName}</p>}
          </div>
          <button onClick={handleSubmit} disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-bold bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-1.5">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'ยืนยันการรักษา'}
          </button>
        </div>
      </div>

      {/* ── Error ─────────────────────────────────────────────────────────── */}
      {error && (
        <div className="max-w-6xl mx-auto px-4 pt-3">
          <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-500 font-bold">{error}</div>
        </div>
      )}

      {/* ── Two-Column Layout ─────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 py-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ════ LEFT PANEL ════ */}
          <div className="space-y-4">
            {/* Doctor / Assistants / Date */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Stethoscope} title="ข้อมูลการรักษา" isDark={isDark} accent={accent} />
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>แพทย์ *</label>
                  <select value={doctorId} onChange={e => setDoctorId(e.target.value)} className={selectCls}>
                    <option value="">เลือกแพทย์</option>
                    {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>ผู้ช่วยแพทย์ (สูงสุด 5 คน)</label>
                  <div className="flex flex-wrap gap-1.5">
                    {assistants.map(a => {
                      const sel = assistantIds.includes(a.id);
                      return (
                        <button key={a.id} onClick={() => toggleAssistant(a.id)}
                          className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${sel
                            ? 'bg-purple-600/20 border-purple-500/50 text-purple-400 font-bold'
                            : isDark ? 'border-[#333] text-gray-500 hover:border-[#555]' : 'border-gray-200 text-gray-500 hover:border-gray-400'
                          }`}>
                          {a.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>วันที่รักษา</label>
                  <input type="date" value={treatmentDate} onChange={e => setTreatmentDate(e.target.value)} className={inputCls} />
                </div>
              </div>
            </FormSection>

            {/* Health Info */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Heart} title="ข้อมูลสุขภาพลูกค้า" isDark={isDark} accent="#ef4444" />
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>กรุ๊ปเลือด</label>
                  {bloodTypeOptions.length > 0
                    ? <select value={bloodType} onChange={e => setBloodType(e.target.value)} className={selectCls}>
                        <option value="">-</option>
                        {bloodTypeOptions.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    : <input value={bloodType} onChange={e => setBloodType(e.target.value)} className={inputCls} placeholder="กรุ๊ปเลือด" />
                  }
                </div>
                {[
                  ['congenitalDisease', 'โรคประจำตัว', congenitalDisease, setCongenitalDisease],
                  ['drugAllergy', 'ประวัติแพ้ยา', drugAllergy, setDrugAllergy],
                  ['treatmentHistory', 'ประวัติการรักษาอื่นๆ', treatmentHistory, setTreatmentHistory],
                ].map(([key, label, val, setter]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea value={val} onChange={e => setter(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder={label} />
                  </div>
                ))}
              </div>
            </FormSection>

            {/* Vital Signs */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={Thermometer} title="ข้อมูลซักประวัติ (Vital Signs)" isDark={isDark} accent="#f59e0b" />
              <div className="grid grid-cols-3 gap-2">
                {[['weight', 'น้ำหนัก (kg)'], ['height', 'ส่วนสูง (cm)']].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(v => ({ ...v, [key]: e.target.value }))} className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
                <div>
                  <label className={labelCls}>BMI</label>
                  <input value={bmi} readOnly className={`${inputCls} text-center opacity-60`} placeholder="-" />
                </div>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                {[['temperature', 'BT (°C)'], ['pulseRate', 'PR (bpm)'], ['respiratoryRate', 'RR'],
                  ['systolicBP', 'SBP (mmHg)'], ['diastolicBP', 'DBP (mmHg)']].map(([key, label]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <input value={vitals[key]} onChange={e => setVitals(v => ({ ...v, [key]: e.target.value }))} className={`${inputCls} text-center`} placeholder="-" />
                  </div>
                ))}
              </div>
              <div className="mt-2">
                <label className={labelCls}>O₂ Sat (%)</label>
                <input value={vitals.oxygenSaturation} onChange={e => setVitals(v => ({ ...v, oxygenSaturation: e.target.value }))} className={`${inputCls} text-center w-24`} placeholder="-" />
              </div>
            </FormSection>

            {/* Consent & Med Cert */}
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="ใบรับรองแพทย์" isDark={isDark} accent="#06b6d4" />
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertActuallyCome} onChange={e => setMedCertActuallyCome(e.target.checked)} className="rounded border-gray-400" />
                  ผู้ป่วยมารักษาวันนี้จริง
                </label>
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsRest} onChange={e => setMedCertIsRest(e.target.checked)} className="rounded border-gray-400" />
                  ให้หยุดพัก
                </label>
                {medCertIsRest && (
                  <div className="ml-6">
                    <label className={labelCls}>ระยะเวลาหยุดพัก</label>
                    <input value={medCertPeriod} onChange={e => setMedCertPeriod(e.target.value)} className={inputCls} placeholder="เช่น 3 วัน" />
                  </div>
                )}
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={medCertIsOther} onChange={e => setMedCertIsOther(e.target.checked)} className="rounded border-gray-400" />
                  อื่นๆ
                </label>
                {medCertIsOther && (
                  <div className="ml-6">
                    <textarea value={medCertOtherDetail} onChange={e => setMedCertOtherDetail(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="รายละเอียด" />
                  </div>
                )}
              </div>
            </FormSection>
          </div>

          {/* ════ RIGHT PANEL — OPD Card ════ */}
          <div className="space-y-4">
            <FormSection isDark={isDark}>
              <SectionHeader icon={ClipboardList} title="OPD Card" isDark={isDark} accent={accent} />
              <div className="space-y-3">
                {[
                  ['symptoms', 'CC — อาการ (Chief Complaint)', 3],
                  ['physicalExam', 'PE — ตรวจร่างกาย (Physical Exam)', 3],
                  ['diagnosis', 'DX — วินิจฉัยโรค (Diagnosis)', 3],
                  ['treatmentInfo', 'Tx — รักษา / Dr. Note', 3],
                  ['treatmentPlan', 'Plan — แผนการรักษา', 2],
                  ['treatmentNote', 'Note — หมายเหตุการรักษา', 2],
                  ['additionalNote', 'หมายเหตุเพิ่มเติม', 2],
                ].map(([key, label, rows]) => (
                  <div key={key}>
                    <label className={labelCls}>{label}</label>
                    <textarea value={opd[key]} onChange={e => setOpd(prev => ({ ...prev, [key]: e.target.value }))} rows={rows} className={`${inputCls} resize-none`} />
                  </div>
                ))}
              </div>
            </FormSection>
          </div>
        </div>

        {/* ════ FULL-WIDTH BOTTOM SECTIONS ════ */}
        <div className="space-y-4 mt-4">

          {/* ── Doctor Fees (ค่ามือแพทย์ & ผู้ช่วยแพทย์) ───────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="ค่ามือแพทย์ & ผู้ช่วยแพทย์" isDark={isDark} accent="#14b8a6">
              <ActionBtn color="#14b8a6" isDark={isDark} onClick={() => {
                const allPeople = [...(options?.doctors || []), ...(options?.assistants || [])];
                const available = allPeople.filter(p => !doctorFees.some(f => String(f.doctorId) === String(p.id)));
                if (available.length === 0) return;
                const name = available[0].name;
                setDoctorFees(prev => [...prev, { doctorId: available[0].id, name, fee: '0', groupId: available[0].dfGroupId || '' }]);
              }}>
                <Plus size={10} /> เพิ่ม
              </ActionBtn>
            </SectionHeader>
            {doctorFees.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-3">เลือกแพทย์และผู้ช่วยด้านบน → รายชื่อจะปรากฏที่นี่อัตโนมัติ</p>
            ) : (
              <div className="space-y-1.5">
                {doctorFees.map((df, i) => (
                  <div key={df.doctorId} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${isDark ? 'bg-[#111]' : 'bg-gray-50'}`}>
                    <span className="text-xs font-bold flex-1 min-w-0 truncate">{df.name}</span>
                    {dfEditingIdx === i ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-gray-500">ค่ามือ</span>
                        <input type="number" value={df.fee} onChange={e => setDoctorFees(prev => prev.map((f, idx) => idx === i ? { ...f, fee: e.target.value } : f))}
                          className={`${inputCls} !w-20 text-center !py-1`} min="0" step="0.01" autoFocus
                          onBlur={() => setDfEditingIdx(-1)} onKeyDown={e => e.key === 'Enter' && setDfEditingIdx(-1)} />
                        <span className="text-[10px] text-gray-500">บาท</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 shrink-0">(ค่ามือ {parseFloat(df.fee || 0).toFixed(2)} บาท)</span>
                    )}
                    <button onClick={() => setDfEditingIdx(i)} className="text-blue-400 hover:text-blue-300 transition-colors shrink-0"><Edit3 size={11} /></button>
                    <button onClick={() => setDoctorFees(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300 transition-colors shrink-0"><Trash2 size={11} /></button>
                  </div>
                ))}
                <div className={`flex justify-between pt-2 mt-1 border-t text-xs font-bold ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                  <span style={{ color: '#14b8a6' }}>ยอดรวมค่ามือ</span>
                  <span className="font-mono" style={{ color: '#14b8a6' }}>{doctorFees.reduce((s, f) => s + (parseFloat(f.fee) || 0), 0).toFixed(2)} บาท</span>
                </div>
              </div>
            )}
          </FormSection>

          {/* ── Take-Home Medications ──────────────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Pill} title="สั่งยากลับบ้าน" isDark={isDark} accent="#10b981">
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <ActionBtn color="#3b82f6" isDark={isDark} onClick={openMedGroupModal}>
                  <Plus size={10} /> กลุ่มยากลับบ้าน
                </ActionBtn>
                <ActionBtn color="#10b981" isDark={isDark} onClick={openMedModal}>
                  <Plus size={10} /> ยากลับบ้าน
                </ActionBtn>
                <ActionBtn color="#38bdf8" isDark={isDark} onClick={() => setRemedModalOpen(true)}>
                  <RotateCcw size={10} /> Remed
                </ActionBtn>
              </div>
            </SectionHeader>

            {/* เพิ่มยากลับบ้าน modal — matching ProClinic */}
            {medModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setMedModalOpen(false)}>
                <div className={`w-full max-w-xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#10b981' }}>{editingMedIndex >= 0 ? 'แก้ไขยากลับบ้าน' : 'เพิ่มยากลับบ้าน'}</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                    {/* Product select with search */}
                    <div>
                      <label className={labelCls}>ยากลับบ้าน *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={medModalSelected ? medModalSelected.name : medModalQuery}
                          onChange={e => { setMedModalQuery(e.target.value); setMedModalSelected(null); }}
                          onFocus={() => { if (medModalSelected) { setMedModalQuery(medModalSelected.name); setMedModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกยากลับบ้าน" autoFocus />
                      </div>
                      {!medModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {medModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : medFilteredProducts.length === 0 ? (
                            <p className="text-[10px] text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : medFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => selectMedProduct(p)}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <div>
                                <span className="font-bold">{p.name}</span>
                                {p.category && <span className="text-[10px] text-gray-500 ml-2">[{p.category}]</span>}
                              </div>
                              <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2">฿{p.price} / {p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {/* Qty + Unit + Price */}
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelCls}>จำนวน *</label>
                        <div className="flex">
                          <input type="number" value={medModalQty} onChange={e => setMedModalQty(e.target.value)}
                            className={`${inputCls} rounded-r-none`} placeholder="กรอกจำนวน" />
                          <span className={`flex items-center px-2 text-[10px] border border-l-0 rounded-r-lg ${isDark ? 'border-[#333] bg-[#1a1a1a] text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'}`}>
                            {medModalSelected?.unit || 'หน่วย'}
                          </span>
                        </div>
                      </div>
                      <div>
                        <label className={labelCls}>ราคาต่อหน่วย *</label>
                        <input type="number" value={medModalPrice} onChange={e => setMedModalPrice(e.target.value)}
                          className={inputCls} placeholder="กรอกราคาต่อหน่วย" />
                      </div>
                      <div className="flex items-end pb-2">
                        <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer">
                          <input type="checkbox" checked={medModalPremium} onChange={e => setMedModalPremium(e.target.checked)}
                            className="w-3.5 h-3.5 rounded accent-emerald-500" />
                          สินค้าของแถม
                        </label>
                      </div>
                    </div>
                    {/* Price summary */}
                    <div className={`rounded-lg border p-3 space-y-2 ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">สรุปราคาต่อหน่วย</p>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-500 w-24 shrink-0">ส่วนลดต่อหน่วย</span>
                        <input type="number" value={medModalDiscount} onChange={e => setMedModalDiscount(e.target.value)}
                          className={`${inputCls} !w-24`} placeholder="0" />
                        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'amount'} onChange={() => setMedModalDiscountType('amount')} className="w-3 h-3" /> บาท
                        </label>
                        <label className="flex items-center gap-1 text-[10px] text-gray-400 cursor-pointer">
                          <input type="radio" name="medDiscType" checked={medModalDiscountType === 'percent'} onChange={() => setMedModalDiscountType('percent')} className="w-3 h-3" /> %
                        </label>
                      </div>
                      {(() => {
                        const price = parseFloat(medModalPrice) || 0;
                        const disc = parseFloat(medModalDiscount) || 0;
                        const afterDisc = medModalDiscountType === 'percent' ? price * (1 - disc / 100) : price - disc;
                        const vat = medModalVat ? afterDisc * 0.07 : 0;
                        const net = medModalPremium ? 0 : Math.max(0, afterDisc + vat);
                        return (
                          <div className="space-y-1 text-[10px]">
                            <div className="flex justify-between text-gray-500"><span>ราคาหลังหักส่วนลด</span><span>{afterDisc.toFixed(2)} บาท</span></div>
                            <div className="flex items-center justify-between text-gray-500">
                              <label className="flex items-center gap-1 cursor-pointer">
                                <input type="checkbox" checked={medModalVat} onChange={e => setMedModalVat(e.target.checked)} className="w-3 h-3 rounded accent-emerald-500" />
                                คำนวนค่าสินค้าเพิ่ม (VAT 7%)
                              </label>
                              <span>{vat.toFixed(2)} บาท</span>
                            </div>
                            <div className="flex justify-between font-bold text-gray-300 pt-1 border-t border-dashed" style={{ borderColor: isDark ? '#333' : '#ddd' }}>
                              <span>ราคาสุทธิ์ต่อหน่วย</span><span>{net.toFixed(2)} บาท</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    {/* Label info (expandable) */}
                    <div>
                      <button onClick={() => setMedModalLabelOpen(!medModalLabelOpen)}
                        className={`flex items-center gap-1.5 text-[10px] font-bold text-gray-500 hover:text-gray-400 transition-colors`}>
                        <span className={`transition-transform ${medModalLabelOpen ? 'rotate-90' : ''}`}>▶</span>
                        ข้อมูลฉลากยา
                      </button>
                      {medModalLabelOpen && medModalSelected?.label && (
                        <div className={`mt-2 rounded-lg border p-3 space-y-2 text-xs ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-gray-50'}`}>
                          <div><span className="text-[10px] font-bold text-gray-500">ชื่อสามัญ:</span> <span className="text-gray-400">{medModalSelected.label.genericName || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">ข้อบ่งใช้:</span> <span className="text-gray-400">{medModalSelected.label.indications || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">รับประทานครั้งละ:</span> <span className="text-gray-400">{medModalSelected.label.dosageAmount || '-'} {medModalSelected.label.dosageUnit || ''}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">วันละ:</span> <span className="text-gray-400">{medModalSelected.label.timesPerDay || '-'} ครั้ง</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">วิธีรับประทาน:</span> <span className="text-gray-400">{medModalSelected.label.administrationMethod || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">ช่วงเวลา:</span> <span className="text-gray-400">{medModalSelected.label.administrationTimes || '-'}</span></div>
                          <div><span className="text-[10px] font-bold text-gray-500">คำแนะนำ:</span> <span className="text-gray-400">{medModalSelected.label.instructions || '-'}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Footer */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedModal} disabled={!medModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Medication group modal — full overlay matching ProClinic */}
            {medGroupModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setMedGroupModalOpen(false)}>
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#10b981' }}>เพิ่มยากลับบ้าน</h3>
                    <select value={medGroupSelectedId}
                      onChange={e => {
                        setMedGroupSelectedId(e.target.value);
                        const g = medGroupData.find(g => String(g.id) === e.target.value);
                        setMedGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {medGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
                    {medGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-emerald-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มยา...</span></div>
                    ) : selectedGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มยากลับบ้าน</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการยากลับบ้าน ({selectedGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                            <th className="text-center py-1.5 w-20">ราคาต่อหน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={medGroupChecked.has(i)} onChange={() => toggleMedGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-emerald-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                              <td className="py-2 text-center">{parseFloat(p.price).toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {medGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 mb-1.5">รายการที่เลือก ({medGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedGroupProducts.map((p, i) => medGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleMedGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setMedGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmMedGroup} disabled={medGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-emerald-500 hover:bg-emerald-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Remed modal — past medications from treatment history */}
            {remedModalOpen && (
              <div className={`rounded-lg border p-3 mb-3 ${isDark ? 'border-sky-900/30 bg-[#0a0c14]' : 'border-sky-200 bg-sky-50/30'}`}>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-[10px] font-bold text-sky-400 uppercase tracking-widest">ประวัติการสั่งยา (Remed)</p>
                  <button onClick={() => setRemedModalOpen(false)} className="ml-auto text-gray-400 hover:text-gray-300 p-1"><Trash2 size={12} /></button>
                </div>
                {(options?.remedItems || []).length === 0 ? (
                  <p className="text-[10px] text-gray-500 text-center py-4">ไม่พบประวัติการสั่งยาของผู้ป่วยรายนี้</p>
                ) : (
                  <div className={`rounded-lg border max-h-48 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                    {options.remedItems.map((item, idx) => (
                      <button key={idx} onClick={() => {
                        setMedications(prev => [...prev, {
                          id: item.productId || `remed-${idx}`,
                          name: item.name,
                          dosage: '',
                          qty: item.qty || '1',
                          unitPrice: item.price || '0',
                          unit: '',
                        }]);
                      }}
                        className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                        <span className="font-bold">{item.name}</span>
                        <span className="text-[10px] text-gray-500">
                          x{item.qty} {item.price !== '0' && item.price !== '0.00' ? `฿${item.price}` : ''}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Medication table */}
            {medications.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ยังไม่มีรายการยากลับบ้าน — กด "ยากลับบ้าน" เพื่อค้นหาและเพิ่ม</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-1">
                  <div className="col-span-4">รายการ</div>
                  <div className="col-span-3">วิธีรับประทาน</div>
                  <div className="col-span-2">จำนวน</div>
                  <div className="col-span-2">ราคาต่อหน่วย</div>
                  <div className="col-span-1"></div>
                </div>
                {medications.map((med, i) => (
                  <div key={i} className={`grid grid-cols-12 gap-2 items-center py-1 border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                    <div className="col-span-4 text-xs font-bold truncate px-1">{med.name}</div>
                    <div className="col-span-3 text-xs text-gray-400 truncate px-1">{med.dosage || '-'}</div>
                    <div className="col-span-2 text-xs text-center">{med.qty} {med.unit}</div>
                    <div className="col-span-2 text-xs text-center">{med.isPremium ? <span className="text-green-500">ของแถม</span> : med.unitPrice}</div>
                    <div className="col-span-1 flex items-center justify-center gap-1">
                      <button onClick={() => editMedication(i)} className="text-blue-400 hover:text-blue-300 transition-colors"><Edit3 size={11} /></button>
                      <button onClick={() => removeMed(i)} className="text-red-400 hover:text-red-300 transition-colors"><Trash2 size={11} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── ข้อมูลการใช้คอร์ส — matching ProClinic layout ──────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={ShoppingCart} title="ข้อมูลการใช้คอร์ส" isDark={isDark} accent="#f97316">
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <ActionBtn color="#14b8a6" isDark={isDark} onClick={() => openBuyModal('course')}>
                  <Plus size={10} /> ซื้อคอร์ส
                </ActionBtn>
                <ActionBtn color="#f59e0b" isDark={isDark} onClick={() => openBuyModal('product')}>
                  <Plus size={10} /> ซื้อสินค้าหน้าร้าน
                </ActionBtn>
                <ActionBtn color="#38bdf8" isDark={isDark} onClick={() => openBuyModal('promotion')}>
                  <Plus size={10} /> ซื้อโปรโมชัน
                </ActionBtn>
              </div>
            </SectionHeader>

            {/* Sub-label */}
            <p className="text-[10px] text-gray-500 mb-3">คอร์ส/สินค้า/โปรโมชัน</p>

            {/* 3-column grid matching ProClinic: คอร์ส | โปรโมชัน | รายการรักษา */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
              {/* ── Column 1: คอร์ส ── */}
              <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-[10px] font-bold" style={{ color: '#14b8a6' }}>คอร์ส</span>
                  <span className="text-[10px] text-gray-500">จำนวน</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                  {/* Customer courses — grouped by course with header */}
                  {customerCourses.map(course => (
                    <div key={course.courseId}>
                      {/* Course header (grouping label — not checkable) */}
                      <div className={`px-3 py-1 border-b text-[10px] font-bold ${isDark ? 'border-[#1a1a1a] bg-[#0c0c0c] text-teal-400/80' : 'border-gray-100 bg-teal-50/50 text-teal-700'}`}>
                        {course.courseName}
                      </div>
                      {/* Course products — checkable */}
                      {course.products.map(product => {
                        const isSelected = selectedCourseItems.has(product.rowId);
                        return (
                          <label key={product.rowId} className={`flex items-center justify-between px-3 py-1.5 border-b cursor-pointer transition-all ${
                            isSelected ? isDark ? 'bg-teal-500/10 border-teal-500/20' : 'bg-teal-50 border-teal-100'
                            : isDark ? 'border-[#1a1a1a] hover:bg-[#151515]' : 'border-gray-50 hover:bg-gray-50'
                          }`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <input type="checkbox" checked={isSelected} onChange={() => toggleCourseItem(product)}
                                className="w-3.5 h-3.5 rounded accent-teal-500 shrink-0" />
                              <span className={`text-xs truncate ${isSelected ? 'font-bold text-teal-400' : ''}`}>{product.name}</span>
                            </div>
                            <span className="text-[10px] text-gray-500 shrink-0 ml-2 whitespace-nowrap">{product.remaining} {product.unit}</span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                  {/* Purchased courses (ซื้อเพิ่ม) */}
                  {purchasedByType.course.map((item, idx) => (
                    <div key={`pc-${idx}`} className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#1a1a1a] bg-teal-500/5' : 'border-gray-50 bg-teal-50/50'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Check size={12} className="text-teal-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        <span className="text-[9px] text-teal-500 shrink-0">(ซื้อเพิ่ม)</span>
                        <button onClick={() => removePurchasedItem(purchasedItems.indexOf(item))} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 size={10} /></button>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0 ml-2">{item.qty} {item.unit}</span>
                    </div>
                  ))}
                  {customerCourses.length === 0 && purchasedByType.course.length === 0 && (
                    <p className="text-[10px] text-gray-500 text-center py-4">ไม่มีคอร์ส</p>
                  )}
                </div>
              </div>

              {/* ── Column 2: โปรโมชัน ── */}
              <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-[10px] font-bold" style={{ color: '#f59e0b' }}>โปรโมชัน</span>
                  <span className="text-[10px] text-gray-500">จำนวน</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                  {purchasedByType.promotion.map((item, idx) => (
                    <div key={`pp-${idx}`}>
                      {/* Promotion header with delete */}
                      <div className={`flex items-center justify-between px-3 py-1 border-b text-[10px] font-bold ${isDark ? 'border-[#1a1a1a] bg-[#0c0c0c] text-amber-400/80' : 'border-gray-100 bg-amber-50/50 text-amber-700'}`}>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{item.name}</span>
                          <span className="text-[9px] text-amber-500 shrink-0">(ซื้อเพิ่ม)</span>
                          <button onClick={() => removePurchasedItem(purchasedItems.indexOf(item))} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 size={10} /></button>
                        </div>
                        <span className="text-gray-500 font-normal shrink-0 ml-2">{item.qty} โปรโมชัน</span>
                      </div>
                    </div>
                  ))}
                  {purchasedByType.promotion.length === 0 && (
                    <p className="text-[10px] text-gray-500 text-center py-4">ไม่มีโปรโมชัน</p>
                  )}
                </div>
              </div>

              {/* ── Column 3: รายการรักษา (treatment items from checked courses/promotions) ── */}
              <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-[10px] font-bold" style={{ color: '#f97316' }}>รายการรักษา</span>
                  <span className="text-[10px] text-gray-500">จำนวน</span>
                </div>
                <div className="max-h-[300px] overflow-y-auto overflow-x-auto">
                  {treatmentItems.length === 0 ? (
                    <p className="text-[10px] text-gray-500 text-center py-4">เลือกรายการจากคอร์ส/โปรโมชันด้านซ้าย</p>
                  ) : treatmentItems.map(item => (
                    <div key={item.id} className={`flex items-center gap-2 px-3 py-1.5 border-b ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs font-medium truncate block ${item.source === 'purchased' ? 'text-amber-400' : ''}`}>
                          {item.name}
                          {item.source === 'purchased' && <span className="text-[9px] text-amber-500 ml-1">(ซื้อเพิ่ม)</span>}
                        </span>
                      </div>
                      <input type="number" value={item.qty} onChange={e => updateTreatmentItem(item.id, 'qty', e.target.value)}
                        className={`${inputCls} !w-14 text-center !py-1 shrink-0`} min="0" />
                      <span className="text-[10px] text-gray-500 shrink-0">{item.unit}</span>
                      <button onClick={() => removeTreatmentItem(item.id)} className="text-red-400 hover:text-red-300 shrink-0 ml-1"><Trash2 size={11} /></button>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Purchased retail products (สินค้าหน้าร้าน) — shown below grid */}
            {purchasedByType.product.length > 0 && (
              <div className={`mt-3 rounded-lg border overflow-hidden ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                  <span className="text-[10px] font-bold" style={{ color: '#f97316' }}>สินค้าหน้าร้าน</span>
                  <span className="text-[10px] text-gray-500">จำนวน</span>
                </div>
                <div className="max-h-[150px] overflow-y-auto">
                  {purchasedByType.product.map((item, idx) => (
                    <div key={`pr-${idx}`} className={`flex items-center justify-between px-3 py-1.5 border-b ${isDark ? 'border-[#1a1a1a] bg-orange-500/5' : 'border-gray-50 bg-orange-50/50'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <Check size={12} className="text-orange-500 shrink-0" />
                        <span className="text-xs font-medium truncate">{item.name}</span>
                        <span className="text-[9px] text-orange-500 shrink-0">(ซื้อเพิ่ม)</span>
                        <button onClick={() => removePurchasedItem(purchasedItems.indexOf(item))} className="text-red-400 hover:text-red-300 shrink-0"><Trash2 size={10} /></button>
                      </div>
                      <span className="text-[10px] text-gray-500 shrink-0 ml-2">{item.qty} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Buy modal — ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน */}
            {buyModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setBuyModalOpen(false)}>
                <div className={`w-full max-w-5xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#14b8a6' }}>ซื้อโปรโมชัน / คอร์ส / สินค้าหน้าร้าน</h3>
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={buyQuery} onChange={e => setBuyQuery(e.target.value)}
                          className={`${inputCls} !pl-8 !w-48`} placeholder="ค้นหาด้วยชื่อ" />
                      </div>
                      <select value={buyModalType} onChange={e => { setBuyModalType(e.target.value); setBuySelectedCat(''); setBuyChecked(new Set()); setBuyQtyMap({}); setBuyDiscMap({}); setBuyVatMap({}); if (!buyItems[e.target.value]?.length) openBuyModal(e.target.value); }}
                        className={`${selectCls} !w-auto !text-xs`}>
                        <option value="course">คอร์ส</option>
                        <option value="promotion">โปรโมชัน</option>
                        <option value="product">สินค้าหน้าร้าน</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-1 min-h-0 overflow-hidden">
                    {/* Left sidebar — categories */}
                    <div className={`w-48 shrink-0 border-r overflow-y-auto ${isDark ? 'border-[#222] bg-[#0a0a0a]' : 'border-gray-200 bg-gray-50'}`}>
                      {['promotion', 'course', 'product'].map(type => {
                        const cats = buyCategories[type] || [];
                        const typeLabel = type === 'promotion' ? 'โปรโมชัน' : type === 'course' ? 'คอร์ส' : 'สินค้าหน้าร้าน';
                        const isActiveType = buyModalType === type;
                        return (
                          <div key={type}>
                            <button onClick={() => { setBuyModalType(type); setBuySelectedCat(''); if (!buyItems[type]?.length) openBuyModal(type); }}
                              className={`w-full text-left px-3 py-2 text-xs font-bold border-b flex items-center justify-between ${
                                isActiveType ? 'text-teal-500' : isDark ? 'text-gray-400 border-[#1a1a1a]' : 'text-gray-600 border-gray-100'
                              } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              {typeLabel}
                              <span className="text-[10px]">{isActiveType ? '▼' : '▶'}</span>
                            </button>
                            {isActiveType && (
                              <div>
                                <button onClick={() => setBuySelectedCat('')}
                                  className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                                    !buySelectedCat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                                  } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                                  {typeLabel}ทั้งหมด
                                </button>
                                {cats.map(cat => (
                                  <button key={cat} onClick={() => setBuySelectedCat(cat)}
                                    className={`w-full text-left px-4 py-1.5 text-[11px] border-b transition-all ${
                                      buySelectedCat === cat ? 'text-teal-500 font-bold' : isDark ? 'text-gray-400 hover:bg-[#151515]' : 'text-gray-500 hover:bg-gray-100'
                                    } ${isDark ? 'border-[#1a1a1a]' : 'border-gray-50'}`}>
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Right — items table */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                      <div className="overflow-x-auto overflow-y-auto flex-1">
                        {buyLoading ? (
                          <div className="flex items-center justify-center gap-2 py-12"><Loader2 size={16} className="animate-spin text-teal-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                        ) : (
                          <table className="w-full text-xs">
                            <thead className="sticky top-0" style={{ background: isDark ? '#0e0e0e' : 'white' }}>
                              <tr className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                                <th className="text-left py-2 px-2 w-8"></th>
                                <th className="text-left py-2 px-2">รายการ ({buyFilteredItems.length} รายการ)</th>
                                <th className="text-center py-2 px-2 w-16">จำนวน</th>
                                <th className="text-center py-2 px-2 w-12">หน่วย</th>
                                <th className="text-center py-2 px-2 w-24">ราคาต่อหน่วย</th>
                                <th className="text-center py-2 px-2 w-24">ส่วนลดต่อหน่วย</th>
                                <th className="text-center py-2 px-2 w-16">VAT 7%</th>
                                <th className="text-center py-2 px-2 w-24">ราคาสุทธิต่อหน่วย</th>
                              </tr>
                            </thead>
                            <tbody>
                              {buyFilteredItems.map(item => {
                                const checked = buyChecked.has(item.id);
                                const qty = parseInt(buyQtyMap[item.id]) || 0;
                                const disc = parseFloat(buyDiscMap[item.id]) || 0;
                                const vat = !!buyVatMap[item.id];
                                const price = parseFloat(item.price) || 0;
                                const afterDisc = price - disc;
                                const vatAmt = vat ? afterDisc * 0.07 : 0;
                                const net = Math.max(0, afterDisc + vatAmt);
                                return (
                                  <tr key={item.id} className={`border-t ${checked ? isDark ? 'bg-teal-500/10' : 'bg-teal-50' : ''} ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                                    <td className="py-2 px-2">
                                      <input type="checkbox" checked={checked} onChange={() => toggleBuyCheck(item.id)}
                                        className="w-3.5 h-3.5 rounded accent-teal-500" />
                                    </td>
                                    <td className="py-2 px-2 font-medium">{item.name}</td>
                                    <td className="py-2 px-2">
                                      <input type="number" value={buyQtyMap[item.id] || ''} min="0"
                                        onChange={e => setBuyQtyMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        className={`${inputCls} text-center !py-1 !text-[10px] !w-14`} />
                                    </td>
                                    <td className="py-2 px-2 text-center text-gray-500">{item.unit}</td>
                                    <td className="py-2 px-2 text-center">{parseFloat(item.price).toFixed(2)}</td>
                                    <td className="py-2 px-2">
                                      <input type="number" value={buyDiscMap[item.id] || ''} min="0"
                                        onChange={e => setBuyDiscMap(prev => ({ ...prev, [item.id]: e.target.value }))}
                                        className={`${inputCls} text-center !py-1 !text-[10px] !w-14`} />
                                    </td>
                                    <td className="py-2 px-2 text-center">
                                      <input type="checkbox" checked={vat}
                                        onChange={e => setBuyVatMap(prev => ({ ...prev, [item.id]: e.target.checked }))}
                                        className="w-3.5 h-3.5 rounded accent-teal-500" />
                                    </td>
                                    <td className="py-2 px-2 text-center font-medium">{net.toFixed(2)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                      {/* Selected count */}
                      <div className={`px-4 py-2 border-t text-[10px] text-gray-500 ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                        รายการที่เลือก ({buyChecked.size} รายการ)
                      </div>
                    </div>
                  </div>

                  {/* Footer */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setBuyModalOpen(false)}
                      className={`px-8 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmBuyModal} disabled={buyChecked.size === 0}
                      className="px-8 py-2 rounded-lg text-xs font-bold text-white bg-teal-500 hover:bg-teal-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}
          </FormSection>

          {/* ── Consumables (สินค้าสิ้นเปลือง) ────────────────────────────── */}
          <FormSection isDark={isDark}>
            <SectionHeader icon={Package} title="สินค้าสิ้นเปลือง" isDark={isDark} accent="#eab308">
              <div className="ml-auto flex items-center gap-1.5 flex-wrap">
                <ActionBtn color="#3b82f6" isDark={isDark} onClick={openConsGroupModal}>
                  <Plus size={10} /> กลุ่มสินค้าสิ้นเปลือง
                </ActionBtn>
                <ActionBtn color="#eab308" isDark={isDark} onClick={openConsModal}>
                  <Plus size={10} /> สินค้าสิ้นเปลือง
                </ActionBtn>
              </div>
            </SectionHeader>

            {/* เพิ่มสินค้าสิ้นเปลือง modal — matching ProClinic */}
            {consModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setConsModalOpen(false)}>
                <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  <div className={`px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#eab308' }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                  </div>
                  <div className="px-5 py-4 space-y-3 flex-1 min-h-0 overflow-y-auto">
                    <div>
                      <label className={labelCls}>สินค้าสิ้นเปลือง *</label>
                      <div className="relative">
                        <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 z-10" />
                        <input value={consModalSelected ? consModalSelected.name : consModalQuery}
                          onChange={e => { setConsModalQuery(e.target.value); setConsModalSelected(null); }}
                          onFocus={() => { if (consModalSelected) { setConsModalQuery(consModalSelected.name); setConsModalSelected(null); } }}
                          className={`${inputCls} !pl-8`} placeholder="เลือกสินค้าสิ้นเปลือง" autoFocus />
                      </div>
                      {!consModalSelected && (
                        <div className={`rounded-lg border mt-1 max-h-40 overflow-y-auto ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-200 bg-white'}`}>
                          {consModalLoading ? (
                            <div className="flex items-center justify-center gap-2 py-4"><Loader2 size={14} className="animate-spin text-yellow-400" /><span className="text-xs text-gray-500">กำลังโหลด...</span></div>
                          ) : consFilteredProducts.length === 0 ? (
                            <p className="text-[10px] text-gray-500 text-center py-3">ไม่พบรายการ</p>
                          ) : consFilteredProducts.map(p => (
                            <button key={p.id} onClick={() => { setConsModalSelected(p); setConsModalQty('1'); }}
                              className={`w-full text-left px-3 py-2 text-xs border-b transition-all flex justify-between items-center ${isDark ? 'border-[#1a1a1a] hover:bg-[#1a1a1a]' : 'border-gray-100 hover:bg-gray-50'}`}>
                              <span className="font-bold">{p.name}</span>
                              <span className="text-[10px] text-gray-500">{p.unit}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className={labelCls}>จำนวน *</label>
                      <input type="number" value={consModalQty} onChange={e => setConsModalQty(e.target.value)}
                        className={inputCls} placeholder="กรอกจำนวน" />
                    </div>
                  </div>
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsModal} disabled={!consModalSelected}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable group modal — full overlay matching ProClinic */}
            {consGroupModalOpen && (
              <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50" onClick={() => setConsGroupModalOpen(false)}>
                <div className={`w-full max-w-2xl mx-4 rounded-xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col ${isDark ? 'bg-[#0e0e0e] border border-[#222]' : 'bg-white'}`}
                  onClick={e => e.stopPropagation()}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-3 border-b ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <h3 className="text-sm font-black" style={{ color: '#eab308' }}>เพิ่มสินค้าสิ้นเปลือง</h3>
                    <select value={consGroupSelectedId}
                      onChange={e => {
                        setConsGroupSelectedId(e.target.value);
                        const g = consGroupData.find(g => String(g.id) === e.target.value);
                        setConsGroupChecked(new Set((g?.products || []).map((_, i) => i)));
                      }}
                      className={`${selectCls} !w-auto !text-xs min-w-[180px]`}>
                      {consGroupData.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
                    </select>
                  </div>
                  {/* Table */}
                  <div className="px-5 py-3 flex-1 min-h-0 overflow-y-auto">
                    {consGroupLoading ? (
                      <div className="flex items-center justify-center gap-2 py-8"><Loader2 size={16} className="animate-spin text-yellow-400" /><span className="text-xs text-gray-500">กำลังโหลดกลุ่มสินค้า...</span></div>
                    ) : selectedConsGroupProducts.length === 0 ? (
                      <p className="text-xs text-gray-500 text-center py-8">กรุณาเลือกกลุ่มสินค้าสิ้นเปลือง</p>
                    ) : (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className={`text-[9px] font-bold uppercase tracking-wider ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            <th className="text-left py-1.5 pr-2 w-8"></th>
                            <th className="text-left py-1.5">รายการ ({selectedConsGroupProducts.length} รายการ)</th>
                            <th className="text-center py-1.5 w-16">จำนวน</th>
                            <th className="text-center py-1.5 w-12">หน่วย</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedConsGroupProducts.map((p, i) => (
                            <tr key={p.id} className={`border-t ${isDark ? 'border-[#1a1a1a]' : 'border-gray-100'}`}>
                              <td className="py-2 pr-2">
                                <input type="checkbox" checked={consGroupChecked.has(i)} onChange={() => toggleConsGroupCheck(i)}
                                  className="w-3.5 h-3.5 rounded accent-yellow-500" />
                              </td>
                              <td className="py-2 font-medium">{p.name}</td>
                              <td className="py-2 text-center">{parseFloat(p.qty) || 1}</td>
                              <td className="py-2 text-center text-gray-500">{p.unit}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                  {/* Selected items chips */}
                  {consGroupChecked.size > 0 && (
                    <div className={`px-5 py-2 border-t ${isDark ? 'border-[#222] bg-[#111]' : 'border-gray-100 bg-gray-50'}`}>
                      <p className="text-[10px] font-bold text-gray-500 mb-1.5">รายการที่เลือก ({consGroupChecked.size} รายการ)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedConsGroupProducts.map((p, i) => consGroupChecked.has(i) && (
                          <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">
                            {p.name} ({parseFloat(p.qty)} {p.unit})
                            <button onClick={() => toggleConsGroupCheck(i)} className="hover:text-red-400 ml-0.5">&times;</button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Footer buttons */}
                  <div className={`flex items-center justify-center gap-3 px-5 py-3 border-t ${isDark ? 'border-[#222]' : 'border-gray-200'}`}>
                    <button onClick={() => setConsGroupModalOpen(false)}
                      className={`px-6 py-2 rounded-lg text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-300 text-gray-500 hover:bg-gray-50'}`}>
                      ยกเลิก
                    </button>
                    <button onClick={confirmConsGroup} disabled={consGroupChecked.size === 0}
                      className="px-6 py-2 rounded-lg text-xs font-bold text-white bg-yellow-500 hover:bg-yellow-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                      ยืนยัน
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Consumable table */}
            {consumables.length === 0 ? (
              <p className="text-[10px] text-gray-500 text-center py-4">ยังไม่มีรายการสินค้าสิ้นเปลือง — กด "สินค้าสิ้นเปลือง" เพื่อค้นหาและเพิ่ม</p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[9px] font-bold uppercase tracking-widest text-gray-500 px-1">
                  <div className="col-span-6">รายการ</div>
                  <div className="col-span-3">จำนวน</div>
                  <div className="col-span-2">หน่วย</div>
                  <div className="col-span-1"></div>
                </div>
                {consumables.map((item, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-6 text-xs font-bold truncate px-1">{item.name}</div>
                    <input value={item.qty} onChange={e => updateConsumable(i, 'qty', e.target.value)} className={`${inputCls} col-span-3 text-center`} placeholder="1" />
                    <div className="col-span-2 text-[10px] text-gray-500 px-1">{item.unit}</div>
                    <button onClick={() => removeConsumable(i)} className="col-span-1 flex items-center justify-center text-red-400 hover:text-red-300 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </FormSection>

          {/* ── Insurance (เบิกประกัน) — only when there's a sale ─────────── */}
          {hasSale && (
          <FormSection isDark={isDark}>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isInsuranceClaimed} onChange={e => setIsInsuranceClaimed(e.target.checked)} className="w-3.5 h-3.5 accent-purple-500" />
                <span className="text-xs font-bold" style={{ color: accent }}>เบิกประกัน</span>
              </label>
              {isInsuranceClaimed && (
                <>
                  <select value={benefitType} onChange={e => setBenefitType(e.target.value)} className={`${selectCls} max-w-[200px]`}>
                    <option value="">ประเภทสิทธิ</option>
                    {benefitTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                  <select value={insuranceCompanyId} onChange={e => setInsuranceCompanyId(e.target.value)} className={`${selectCls} max-w-[200px]`}>
                    <option value="">บริษัทประกัน</option>
                    {insuranceCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </>
              )}
            </div>
          </FormSection>
          )}

          {/* ── Expense Summary (สรุปค่าใช้จ่าย) ───────────────────────────── */}
          {hasSale && (
          <FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="สรุปค่าใช้จ่าย" isDark={isDark} accent="#10b981" />
            <div className="space-y-1 text-xs">
              {billing.lines.map((l, i) => (
                <div key={i} className="flex justify-between py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-600'}>{l.name}</span>
                  <span className="font-mono">{formatBaht(l.amount)} บาท</span>
                </div>
              ))}
              <div className={`flex justify-between py-1.5 mt-1 border-t font-bold ${isDark ? 'border-[#333]' : 'border-gray-200'}`}>
                <span>ราคารวม</span>
                <span className="font-mono">{formatBaht(billing.subtotal)} บาท</span>
              </div>
              {/* Medicine discount */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ส่วนลดค่ายา ({billing.medDiscPct}%)</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={medDiscountOverride} onChange={e => setMedDiscountOverride(e.target.value)} className={`${inputCls} w-24 text-right py-1`} placeholder={billing.medDisc.toFixed(2)} min="0" step="0.01" />
                  <span className="text-[10px]">บาท</span>
                </div>
              </div>
              {/* Coupon */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>คูปองส่วนลด</span>
                <div className="flex items-center gap-1">
                  <input type="text" value={couponCode} onChange={e => setCouponCode(e.target.value)} className={`${inputCls} w-32 py-1`} placeholder="กรอกรหัสคูปอง" />
                </div>
              </div>
              {/* Bill-end discount */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ส่วนลดท้ายบิล</span>
                <div className="flex items-center gap-1">
                  <input type="number" value={billDiscount} onChange={e => setBillDiscount(e.target.value)} className={`${inputCls} w-24 text-right py-1`} placeholder="0" min="0" step="0.01" />
                  <button onClick={() => setBillDiscountType(p => p === 'amount' ? 'percent' : 'amount')}
                    className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${isDark ? 'border-[#444] text-gray-300' : 'border-gray-300 text-gray-600'}`}>
                    {billDiscountType === 'percent' ? '%' : '฿'}
                  </button>
                  <span className="text-[10px]">บาท</span>
                </div>
              </div>
              {/* After discount */}
              <div className={`flex justify-between py-1 font-semibold ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                <span>ยอดหลังหักส่วนลด</span>
                <span className="font-mono">{formatBaht(billing.afterDiscount)} บาท</span>
              </div>
              {/* Insurance deduction */}
              {isInsuranceClaimed && (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>ยอดเบิกประกัน</span>
                  <div className="flex items-center gap-1">
                    <input type="number" value={insuranceClaimAmount} onChange={e => setInsuranceClaimAmount(e.target.value)} className={`${inputCls} w-24 text-right py-1`} placeholder="0" min="0" step="0.01" />
                    <span className="text-[10px]">บาท</span>
                  </div>
                </div>
              )}
              {/* Deposit */}
              <div className="flex justify-between items-center py-0.5">
                <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>
                  ยอดนัดจำ ({formatBaht(options?.depositBalance || 0)} บาท)
                </span>
                <div className="flex items-center gap-1">
                  <input type="checkbox" checked={useDeposit} onChange={e => setUseDeposit(e.target.checked)} className="w-3 h-3 accent-purple-500" />
                  <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} disabled={!useDeposit} className={`${inputCls} w-24 text-right py-1 ${!useDeposit ? 'opacity-40' : ''}`} placeholder="0" min="0" step="0.01" />
                  <span className="text-[10px]">บาท</span>
                </div>
              </div>
              {/* Wallet */}
              {wallets.length > 0 && (
                <div className="flex justify-between items-center py-0.5">
                  <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>Wallet</span>
                  <div className="flex items-center gap-1">
                    <input type="checkbox" checked={useWallet} onChange={e => setUseWallet(e.target.checked)} className="w-3 h-3 accent-purple-500" />
                    <select value={walletId} onChange={e => setWalletId(e.target.value)} disabled={!useWallet} className={`${selectCls} w-40 py-1 text-[10px] ${!useWallet ? 'opacity-40' : ''}`}>
                      <option value="">เลือกกระเป๋า</option>
                      {wallets.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <input type="number" value={walletAmount} onChange={e => setWalletAmount(e.target.value)} disabled={!useWallet} className={`${inputCls} w-20 text-right py-1 ${!useWallet ? 'opacity-40' : ''}`} placeholder="0" min="0" step="0.01" />
                    <span className="text-[10px]">บาท</span>
                  </div>
                </div>
              )}
              {/* Net total */}
              <div className={`flex justify-between py-2 mt-1 border-t text-sm font-black ${isDark ? 'border-[#333]' : 'border-gray-200'}`} style={{ color: accent }}>
                <span>ยอดสุทธิ</span>
                <span className="font-mono">{formatBaht(billing.netTotal)} บาท</span>
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Sale Note + Date — only when there's a sale ─────────────────── */}
          {hasSale && (
          <FormSection isDark={isDark}>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>หมายเหตุการขาย</label>
                <textarea value={saleNote} onChange={e => setSaleNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="กรอกหมายเหตุการขาย" />
              </div>
              <div className="w-48">
                <label className={labelCls}>วันที่ขาย *</label>
                <input type="date" value={saleDate} onChange={e => setSaleDate(e.target.value)} className={inputCls} />
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Payment (การชำระเงิน) — only when there's a sale ────────────── */}
          {hasSale && (
          <FormSection isDark={isDark}>
            <SectionHeader icon={CreditCard} title="การชำระเงิน" isDark={isDark} accent="#ec4899" />

            {/* Payment status — radio buttons */}
            <div className="flex items-center gap-4 mb-3">
              {[['4', 'แบ่งชำระ'], ['2', 'ชำระเต็มจำนวน'], ['0', 'ชำระภายหลัง']].map(([val, label]) => (
                <label key={val} className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="paymentStatus" value={val} checked={paymentStatus === val}
                    onChange={e => setPaymentStatus(e.target.value)} className="w-3.5 h-3.5 accent-purple-500" />
                  <span className="text-xs">{label}</span>
                </label>
              ))}
            </div>

            {/* Payment date + time */}
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className={labelCls}>วันที่ชำระเงิน *</label>
                <input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>เวลา</label>
                <input type="time" value={paymentTime} onChange={e => setPaymentTime(e.target.value)} className={inputCls} />
              </div>
            </div>

            {/* Payment channels (3 rows) — visible when status is 2 or 4 */}
            {(paymentStatus === '2' || paymentStatus === '4') && (
              <div className="space-y-2 mb-3">
                <label className={labelCls}>ช่องทางชำระเงิน</label>
                {pmChannels.map((ch, idx) => (
                  <div key={idx} className={`flex items-center gap-2 flex-wrap sm:flex-nowrap ${!ch.enabled && idx > 0 ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={ch.enabled} onChange={e => updatePmChannel(idx, 'enabled', e.target.checked)} className="w-3.5 h-3.5 accent-purple-500 shrink-0" />
                    <select value={ch.method} onChange={e => updatePmChannel(idx, 'method', e.target.value)} disabled={!ch.enabled}
                      className={`${selectCls} !w-auto flex-1 min-w-[160px]`}>
                      <option value="">เลือกช่องทาง</option>
                      {paymentChannels.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="number" value={ch.amount} onChange={e => updatePmChannel(idx, 'amount', e.target.value)} disabled={!ch.enabled}
                      className={`${inputCls} !w-32 text-right shrink-0`} placeholder={`ยอดชำระ ${idx + 1}`} min="0" step="0.01" />
                  </div>
                ))}
              </div>
            )}

            {/* Ref no + Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>เลขที่อ้างอิงใบเสร็จหน้าร้าน</label>
                <input type="text" value={refNo} onChange={e => setRefNo(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>หมายเหตุ</label>
                <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="หมายเหตุ" />
              </div>
            </div>
          </FormSection>
          )}

          {/* ── Sellers (พนักงานขาย) — only when there's a sale ───────────────── */}
          {hasSale && (
          <FormSection isDark={isDark}>
            <SectionHeader icon={DollarSign} title="พนักงานขาย" isDark={isDark} accent="#f59e0b" />
            <div className="space-y-2">
              {pmSellers.map((sl, idx) => (
                <div key={idx} className={`flex items-center gap-2 flex-wrap sm:flex-nowrap ${!sl.enabled && idx > 0 ? 'opacity-40' : ''}`}>
                  <input type="checkbox" checked={sl.enabled} onChange={e => updatePmSeller(idx, 'enabled', e.target.checked)} className="w-3.5 h-3.5 accent-purple-500 shrink-0" />
                  <select value={sl.id} onChange={e => updatePmSeller(idx, 'id', e.target.value)} disabled={!sl.enabled}
                    className={`${selectCls} !w-auto flex-1 min-w-[140px]`}>
                    <option value="">เลือกพนักงานขาย</option>
                    {sellerOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <input type="number" value={sl.percent} onChange={e => updatePmSeller(idx, 'percent', e.target.value)} disabled={!sl.enabled}
                    className={`${inputCls} !w-14 text-right shrink-0`} placeholder="%" min="0" max="100" step="0.01" />
                  <span className="text-[10px] text-gray-500 shrink-0">%</span>
                  <input type="text" value={sl.total ? formatBaht(sl.total) : ''} readOnly disabled={!sl.enabled}
                    className={`${inputCls} !w-24 text-right opacity-70 shrink-0`} placeholder="คอม" />
                  <span className="text-[10px] text-gray-500 shrink-0">บาท</span>
                </div>
              ))}
            </div>
          </FormSection>
          )}

          {/* Submit (bottom) */}
          <div className="flex justify-end gap-3 pt-2 pb-8">
            <button onClick={onClose} disabled={saving}
              className={`px-6 py-2.5 rounded-xl text-xs font-bold border transition-all ${isDark ? 'border-[#333] text-gray-400 hover:bg-[#1a1a1a]' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
              ยกเลิก
            </button>
            <button onClick={handleSubmit} disabled={saving}
              className="px-8 py-2.5 rounded-xl text-sm font-black bg-purple-600 text-white hover:bg-purple-500 disabled:opacity-50 transition-all flex items-center gap-2 shadow-lg shadow-purple-600/20">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
              {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึกการแก้ไข' : 'ยืนยันการรักษา'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
