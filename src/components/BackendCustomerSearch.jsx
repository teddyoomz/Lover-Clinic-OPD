// ─── BackendCustomerSearch ──────────────────────────────────────────────────
// Search customers from ProClinic → clone ALL data to backend → show rich cards.
// Uses fetchCustomerFull() to get patient + profile + courses + treatments.

import { useState } from 'react';
import { Search, Loader2, User, Phone, Hash, Eye, ClipboardList, AlertCircle,
         Calendar, Banknote, MapPin } from 'lucide-react';
import * as broker from '../lib/brokerClient.js';
import * as backend from '../lib/backendClient.js';
import { formatPhoneNumberDisplay } from '../utils.js';

export default function BackendCustomerSearch({ isDark, showToast, onViewDetail, onOpenTreatmentForm }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fetchingId, setFetchingId] = useState(null);
  const [fetchAction, setFetchAction] = useState(null);

  const handleSearch = async () => {
    const q = searchQuery.trim();
    if (!q) return;

    setSearching(true);
    setSearched(false);
    setResults([]);

    try {
      const data = await broker.searchCustomers(q);
      if (data.success && data.customers) {
        setResults(data.customers);
      } else {
        setResults([]);
        if (showToast) showToast(data.error || 'ไม่พบข้อมูล');
      }
    } catch (err) {
      if (showToast) showToast('ค้นหาล้มเหลว: ' + err.message);
    } finally {
      setSearching(false);
      setSearched(true);
    }
  };

  // Fetch ALL customer data → save to backend → trigger action
  const handleFetchAndAction = async (customer, action) => {
    const proClinicId = customer.id;
    setFetchingId(proClinicId);
    setFetchAction(action);

    try {
      // Use fetchCustomerFull to get everything in one call
      const data = await broker.fetchCustomerFull(proClinicId);
      if (!data.success) throw new Error(data.error || 'ดึงข้อมูลลูกค้าล้มเหลว');

      const { patient, profile, courses, expiredCourses, appointments, treatments, proClinicHN, patientName } = data;

      // Save ALL data to backend database
      await backend.saveCustomer(proClinicId, proClinicHN || customer.hn || '', {
        patientName,
        patient,
        profile,
        courses,
        expiredCourses,
        appointments,
        treatments,
      });

      const fullName = patientName || `${patient?.prefix || ''} ${patient?.firstName || ''} ${patient?.lastName || ''}`.trim();

      if (action === 'detail') {
        onViewDetail({ proClinicId, proClinicHN, patient, profile, courses, expiredCourses, appointments, treatments });
      } else if (action === 'treatment') {
        onOpenTreatmentForm({
          mode: 'create',
          customerId: proClinicId,
          patientName: fullName,
          patientData: patient,
          saveTarget: 'backend',
        });
      }
    } catch (err) {
      if (showToast) showToast(err.message);
    } finally {
      setFetchingId(null);
      setFetchAction(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--tx-muted)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="ค้นหาด้วย HN / ชื่อ / เบอร์โทร..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] text-xs placeholder:text-[var(--tx-faint)] focus:outline-none focus:border-violet-600 transition-all"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={searching || !searchQuery.trim()}
          className="px-4 py-2.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
        >
          {searching ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
          ค้นหา
        </button>
      </div>

      {/* Results */}
      {searching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 size={20} className="animate-spin text-violet-400" />
          <span className="ml-2 text-xs text-[var(--tx-muted)]">กำลังค้นหา...</span>
        </div>
      )}

      {searched && !searching && results.length === 0 && (
        <div className="text-center py-8">
          <AlertCircle size={24} className="mx-auto mb-2 text-[var(--tx-faint)]" />
          <p className="text-xs text-[var(--tx-muted)]">ไม่พบลูกค้าที่ตรงกับ "{searchQuery}"</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[10px] text-[var(--tx-muted)]">พบ {results.length} รายการ</p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {results.map(customer => {
              const isFetching = fetchingId === customer.id;
              const fullName = customer.name || '—';
              const initial = (fullName.replace(/^(นาย|นาง|นางสาว|คุณ|Mr\.|Ms\.|Mrs\.)\s*/i, '')[0] || '?').toUpperCase();

              return (
                <div key={customer.id} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4 transition-all hover:border-violet-700/40">
                  <div className="flex gap-3">
                    {/* Avatar */}
                    <div className="flex flex-col items-center gap-1 flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-[var(--bg-hover2)] flex items-center justify-center text-lg font-bold text-[var(--tx-muted)]">
                        {initial}
                      </div>
                    </div>

                    {/* Info — ห้ามใช้สีแดงกับชื่อ/HN */}
                    <div className="flex-1 min-w-0">
                      {/* HN + Branch badges */}
                      <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        {customer.hn && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-700/20 text-violet-400 font-mono font-bold">{customer.hn}</span>
                        )}
                        {customer.branch && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-700/20 text-sky-400">สาขา {customer.branch}</span>
                        )}
                      </div>

                      {/* Name */}
                      <h4 className="text-sm font-bold text-[var(--tx-heading)] truncate mb-1">{fullName}</h4>

                      {/* Details grid */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-[10px]">
                        {customer.gender && (
                          <span className="text-[var(--tx-secondary)]">
                            <span className="text-[var(--tx-muted)]">เพศ:</span> {customer.gender}
                          </span>
                        )}
                        {customer.birthday && (
                          <span className="text-[var(--tx-secondary)]">
                            <span className="text-[var(--tx-muted)]">วันเกิด:</span> {customer.birthday}
                            {customer.age && <span className="text-[var(--tx-muted)]"> (อายุ {customer.age} ปี)</span>}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-0.5 text-[var(--tx-secondary)]">
                            <Phone size={8} className="text-[var(--tx-muted)]" /> {formatPhoneNumberDisplay(customer.phone)}
                          </span>
                        )}
                        {customer.purchaseTotal && (
                          <span className="text-[var(--tx-secondary)]">
                            <span className="text-[var(--tx-muted)]">ยอดสั่งซื้อ:</span> {customer.purchaseTotal} บาท
                          </span>
                        )}
                        {customer.nextAppointment && (
                          <span className="col-span-2 flex items-center gap-0.5 text-violet-400">
                            <Calendar size={8} /> นัดหมาย: {customer.nextAppointment}
                          </span>
                        )}
                        {customer.lastOrderDate && (
                          <span className="col-span-2 text-[var(--tx-muted)]">
                            สั่งซื้อล่าสุด: {customer.lastOrderDate}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons — vertical stack */}
                    <div className="flex flex-col gap-1.5 flex-shrink-0">
                      <button
                        onClick={() => handleFetchAndAction(customer, 'detail')}
                        disabled={isFetching}
                        className="text-[10px] px-3 py-2 rounded-lg bg-violet-700 hover:bg-violet-600 text-white font-bold transition-all flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isFetching && fetchAction === 'detail' ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
                        ดูรายละเอียด
                      </button>
                      <button
                        onClick={() => handleFetchAndAction(customer, 'treatment')}
                        disabled={isFetching}
                        className="text-[10px] px-3 py-2 rounded-lg bg-emerald-700/80 hover:bg-emerald-600 text-white font-bold transition-all flex items-center gap-1 disabled:opacity-50 whitespace-nowrap"
                      >
                        {isFetching && fetchAction === 'treatment' ? <Loader2 size={10} className="animate-spin" /> : <ClipboardList size={10} />}
                        บันทึกการรักษา
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
