import { useState, useEffect } from 'react';
import { Stethoscope, Loader2, RefreshCw, ChevronLeft, ChevronRight, FileText } from 'lucide-react';
import * as broker from '../lib/brokerClient.js';

function VitalBadge({ label, value, isDark }) {
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${isDark ? 'bg-[#1a1a1a] text-gray-400' : 'bg-gray-100 text-gray-600'}`}>
      <span className="font-bold">{label}</span> {value}
    </span>
  );
}

function OPDField({ label, value, isDark }) {
  return (
    <div>
      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-0.5">{label}</p>
      <p className={`text-[11px] leading-relaxed whitespace-pre-wrap ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{value}</p>
    </div>
  );
}

export default function TreatmentTimeline({ customerId, isDark }) {
  const [treatments, setTreatments] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [detailCache, setDetailCache] = useState({});
  const [detailLoading, setDetailLoading] = useState(null);

  const fetchPage = async (p) => {
    setLoading(true);
    setError('');
    try {
      const data = await broker.listTreatments(customerId, p);
      if (data.success) {
        setTreatments(data.treatments || []);
        setTotalPages(data.totalPages || 1);
        setPage(data.page || p);
      } else {
        setError(data.error || 'ไม่สามารถดึงข้อมูลได้');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchDetail = async (treatmentId) => {
    if (detailCache[treatmentId]) return;
    setDetailLoading(treatmentId);
    try {
      const data = await broker.getTreatment(treatmentId);
      if (data.success) {
        setDetailCache(prev => ({ ...prev, [treatmentId]: data.treatment }));
      }
    } catch (_) {}
    setDetailLoading(null);
  };

  const toggleExpand = (id) => {
    if (expandedId === id) {
      setExpandedId(null);
    } else {
      setExpandedId(id);
      fetchDetail(id);
    }
  };

  useEffect(() => {
    if (customerId) fetchPage(1);
  }, [customerId]);

  const accent = isDark ? '#a78bfa' : '#7c3aed';

  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ color: accent, filter: `drop-shadow(0 0 4px ${accent}60)` }}><Stethoscope size={14} /></span>
        <h3 className="text-[11px] font-black uppercase tracking-[0.15em]" style={{ color: accent }}>ประวัติการรักษา</h3>
        {!loading && treatments.length > 0 && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
            style={{ color: accent, borderColor: `${accent}40`, background: `${accent}10` }}>
            หน้า {page}/{totalPages}
          </span>
        )}
        <button onClick={() => fetchPage(page)} disabled={loading}
          className="ml-auto text-[10px] font-bold px-2 py-1 rounded-lg border transition-all disabled:opacity-50"
          style={{ color: accent, borderColor: `${accent}30`, background: `${accent}08` }}>
          {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={10} />}
        </button>
      </div>

      {error && <p className="text-xs text-red-500 font-bold mb-2">{error}</p>}

      {loading && treatments.length === 0 ? (
        <div className={`rounded-2xl border p-8 flex flex-col items-center gap-2 ${isDark ? 'border-[#1a1a1a] bg-[#0f0f0f]' : 'border-purple-100 bg-purple-50/30'}`}>
          <Loader2 size={20} className="animate-spin" style={{ color: accent }} />
          <p className="text-[10px] font-bold text-gray-600">กำลังโหลดประวัติการรักษา...</p>
        </div>
      ) : treatments.length === 0 && !loading ? (
        <div className={`rounded-2xl border p-8 text-center flex flex-col items-center gap-2 ${isDark ? 'border-[#1a1a1a] bg-[#0f0f0f]' : 'border-purple-100 bg-purple-50/30'}`}>
          <FileText size={24} className={isDark ? 'text-gray-700' : 'text-purple-300'} />
          <p className={`text-xs font-black uppercase tracking-widest ${isDark ? 'text-gray-600' : 'text-purple-400/60'}`}>ไม่พบประวัติการรักษา</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {treatments.map(t => {
            const isExpanded = expandedId === t.id;
            const detail = detailCache[t.id];
            const isLoadingDetail = detailLoading === t.id;

            return (
              <div key={t.id}
                className={`rounded-xl border overflow-hidden transition-all cursor-pointer ${isDark ? 'border-[#222] bg-[#0c0c0c] hover:border-[#333]' : 'border-purple-100 bg-white hover:border-purple-200'}`}
                onClick={() => toggleExpand(t.id)}
              >
                {/* Header row */}
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs font-bold ${isDark ? 'text-[var(--tx-heading)]' : 'text-gray-800'}`}>{t.date}</span>
                      {t.branch && <span className={`text-[10px] px-1.5 py-0.5 rounded ${isDark ? 'bg-[#1a1a1a] text-gray-500' : 'bg-gray-100 text-gray-500'}`}>{t.branch}</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {t.doctor && <span className={`text-[10px] font-bold ${isDark ? 'text-purple-400/80' : 'text-purple-600'}`}>{t.doctor}</span>}
                      {t.assistants?.length > 0 && <span className="text-[10px] text-gray-600">+ {t.assistants.join(', ')}</span>}
                    </div>
                  </div>
                  <ChevronRight size={14} className={`text-gray-600 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                </div>

                {/* Summary line */}
                {(t.cc || t.dx || t.treatmentInfo) && (
                  <div className={`px-3 pb-2 ${isExpanded ? '' : 'line-clamp-1'}`}>
                    {t.cc && <span className="text-[10px] text-gray-500">อาการ: {t.cc.substring(0, 60)}{t.cc.length > 60 ? '...' : ''} </span>}
                    {t.dx && <span className="text-[10px] text-gray-500">| DX: {t.dx.substring(0, 60)}{t.dx.length > 60 ? '...' : ''}</span>}
                  </div>
                )}

                {/* Expanded detail */}
                {isExpanded && (
                  <div className={`border-t px-3 py-3 ${isDark ? 'border-[#222] bg-[#080808]' : 'border-purple-50 bg-purple-50/20'}`} onClick={e => e.stopPropagation()}>
                    {isLoadingDetail ? (
                      <div className="flex items-center gap-2 py-4 justify-center">
                        <Loader2 size={14} className="animate-spin" style={{ color: accent }} />
                        <span className="text-[10px] text-gray-600">กำลังโหลดรายละเอียด...</span>
                      </div>
                    ) : detail ? (
                      <div className="space-y-2.5">
                        {/* Vitals */}
                        {Object.values(detail.vitals || {}).some(v => v) && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">Vital Signs</p>
                            <div className="flex flex-wrap gap-2">
                              {detail.vitals.weight && <VitalBadge label="W" value={`${detail.vitals.weight} kg`} isDark={isDark} />}
                              {detail.vitals.height && <VitalBadge label="H" value={`${detail.vitals.height} cm`} isDark={isDark} />}
                              {detail.vitals.temperature && <VitalBadge label="BT" value={`${detail.vitals.temperature}°C`} isDark={isDark} />}
                              {detail.vitals.pulseRate && <VitalBadge label="PR" value={detail.vitals.pulseRate} isDark={isDark} />}
                              {detail.vitals.respiratoryRate && <VitalBadge label="RR" value={detail.vitals.respiratoryRate} isDark={isDark} />}
                              {(detail.vitals.systolicBP || detail.vitals.diastolicBP) && <VitalBadge label="BP" value={`${detail.vitals.systolicBP || '-'}/${detail.vitals.diastolicBP || '-'}`} isDark={isDark} />}
                              {detail.vitals.oxygenSaturation && <VitalBadge label="O₂" value={`${detail.vitals.oxygenSaturation}%`} isDark={isDark} />}
                            </div>
                          </div>
                        )}

                        {/* OPD Card */}
                        {detail.symptoms && <OPDField label="CC (อาการ)" value={detail.symptoms} isDark={isDark} />}
                        {detail.physicalExam && <OPDField label="PE (ตรวจร่างกาย)" value={detail.physicalExam} isDark={isDark} />}
                        {detail.diagnosis && <OPDField label="DX (วินิจฉัย)" value={detail.diagnosis} isDark={isDark} />}
                        {detail.treatmentInfo && <OPDField label="Tx (การรักษา)" value={detail.treatmentInfo} isDark={isDark} />}
                        {detail.treatmentPlan && <OPDField label="Plan" value={detail.treatmentPlan} isDark={isDark} />}
                        {detail.treatmentNote && <OPDField label="Note" value={detail.treatmentNote} isDark={isDark} />}

                        {/* Treatment items */}
                        {detail.treatmentItems?.length > 0 && (
                          <div>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-gray-600 mb-1">รายการรักษา</p>
                            {detail.treatmentItems.map((item, i) => (
                              <div key={i} className={`flex justify-between text-[11px] py-0.5 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
                                <span>{item.name}</span>
                                <span className="font-mono text-gray-500">{item.quantity}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Health info */}
                        {(detail.healthInfo?.drugAllergy || detail.healthInfo?.congenitalDisease) && (
                          <div className={`rounded-lg p-2 text-[10px] ${isDark ? 'bg-red-950/20 border border-red-900/30 text-red-400' : 'bg-red-50 border border-red-100 text-red-600'}`}>
                            {detail.healthInfo.drugAllergy && <p>แพ้ยา: {detail.healthInfo.drugAllergy}</p>}
                            {detail.healthInfo.congenitalDisease && <p>โรคประจำตัว: {detail.healthInfo.congenitalDisease}</p>}
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-[10px] text-gray-600 text-center py-2">ไม่พบรายละเอียด</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-1">
              <button onClick={() => fetchPage(page - 1)} disabled={page <= 1 || loading}
                className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDark ? 'border-[#222] hover:bg-[#1a1a1a]' : 'border-gray-200 hover:bg-gray-50'}`}>
                <ChevronLeft size={14} className="text-gray-500" />
              </button>
              <span className="text-[10px] font-bold text-gray-500">{page} / {totalPages}</span>
              <button onClick={() => fetchPage(page + 1)} disabled={page >= totalPages || loading}
                className={`p-1.5 rounded-lg border transition-all disabled:opacity-30 ${isDark ? 'border-[#222] hover:bg-[#1a1a1a]' : 'border-gray-200 hover:bg-gray-50'}`}>
                <ChevronRight size={14} className="text-gray-500" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
