// ─── BackendCustomerSearch ──────────────────────────────────────────────────
// Search customers from ProClinic → clone to backend → show as cards.
// Buttons: ดูรายละเอียด (view detail) / บันทึกการรักษา (create treatment).

import { useState } from 'react';
import { Search, Loader2, User, Phone, Hash, Eye, ClipboardList, AlertCircle, CheckCircle2 } from 'lucide-react';
import * as broker from '../lib/brokerClient.js';
import * as backend from '../lib/backendClient.js';
import { formatPhoneNumberDisplay } from '../utils.js';

export default function BackendCustomerSearch({ isDark, showToast, onViewDetail, onOpenTreatmentForm }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);
  const [fetchingId, setFetchingId] = useState(null); // proClinicId being fetched
  const [fetchAction, setFetchAction] = useState(null); // 'detail' | 'treatment'

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

  // Fetch full customer data → save to backend → trigger action
  const handleFetchAndAction = async (customer, action) => {
    const proClinicId = customer.id;
    setFetchingId(proClinicId);
    setFetchAction(action);

    try {
      // Fetch full patient data from ProClinic
      const [patientData, coursesData] = await Promise.all([
        broker.fetchPatientFromProClinic(proClinicId),
        broker.getCourses(proClinicId).catch(() => ({ success: false })),
      ]);

      if (!patientData.success) throw new Error(patientData.error || 'ดึงข้อมูลลูกค้าล้มเหลว');

      const patient = patientData.patient;
      const proClinicHN = patientData.proClinicHN || customer.hn || '';
      const courses = coursesData.success ? (coursesData.courses || []) : [];
      const expiredCourses = coursesData.success ? (coursesData.expiredCourses || []) : [];
      const appointments = coursesData.success ? (coursesData.appointments || []) : [];

      // Save to backend database
      await backend.saveCustomer(proClinicId, proClinicHN, patient, [...courses, ...expiredCourses], appointments);

      const fullName = `${patient.prefix || ''} ${patient.firstName || ''} ${patient.lastName || ''}`.trim();

      if (action === 'detail') {
        onViewDetail({ proClinicId, proClinicHN, patient, courses, expiredCourses, appointments });
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {results.map(customer => {
              const isFetching = fetchingId === customer.id;
              const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.name || '—';

              return (
                <div key={customer.id} className="rounded-xl border border-[var(--bd)] bg-[var(--bg-card)] p-4 transition-all hover:border-violet-700/40">
                  {/* Customer info — ห้ามใช้สีแดงกับชื่อ/HN */}
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-9 h-9 rounded-full bg-[var(--bg-hover2)] flex items-center justify-center flex-shrink-0">
                      <User size={16} className="text-[var(--tx-muted)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-bold text-[var(--tx-heading)] truncate">{fullName}</h4>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px]">
                        {customer.hn && (
                          <span className="flex items-center gap-0.5 text-[var(--tx-secondary)]">
                            <Hash size={9} /> {customer.hn}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-0.5 text-[var(--tx-secondary)]">
                            <Phone size={9} /> {formatPhoneNumberDisplay(customer.phone)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleFetchAndAction(customer, 'detail')}
                      disabled={isFetching}
                      className="flex-1 text-[10px] px-2 py-2 rounded-lg bg-[var(--bg-hover)] border border-[var(--bd)] text-[var(--tx-secondary)] hover:text-violet-400 hover:border-violet-700/40 font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {isFetching && fetchAction === 'detail' ? <Loader2 size={10} className="animate-spin" /> : <Eye size={10} />}
                      ดูรายละเอียด
                    </button>
                    <button
                      onClick={() => handleFetchAndAction(customer, 'treatment')}
                      disabled={isFetching}
                      className="flex-1 text-[10px] px-2 py-2 rounded-lg bg-violet-700/20 border border-violet-700/30 text-violet-400 hover:bg-violet-700/30 font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                    >
                      {isFetching && fetchAction === 'treatment' ? <Loader2 size={10} className="animate-spin" /> : <ClipboardList size={10} />}
                      บันทึกการรักษา
                    </button>
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
