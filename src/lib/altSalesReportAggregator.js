// ─── Alt-sales report aggregator — pure ────────────────────────────────────
// Online + vendor sales in one report ("ยอดขายช่องทางอื่น"). Firestore-only
// data comes from listOnlineSales / listVendorSales (scopedDataLayer).
//
// Amount fields (validated shapes):
//   online sale  → `amount`       (onlineSaleValidation.js)
//   vendor sale  → `totalAmount`  (vendorSaleValidation.js)
//
// Realized revenue only counts toward totals (audit-reports-accuracy — never
// count pipeline/void as revenue):
//   online  realized ∈ {paid, completed}   (pending = not paid; cancelled = void)
//   vendor  realized ∈ {confirmed}         (draft = not confirmed; cancelled = void)
// All rows are still returned (transparency) with their status column so the UI
// can show pipeline/void rows without summing them.

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const ONLINE_REALIZED = new Set(['paid', 'completed']);
const VENDOR_REALIZED = new Set(['confirmed']);
const round2 = (n) => Math.round(n * 100) / 100;

/**
 * @param {Array<{id?:string,transferDate?:string,customerName?:string,amount?:number,status?:string}>} online
 * @param {Array<{id?:string,saleDate?:string,vendorName?:string,totalAmount?:number,status?:string}>} vendor
 * @returns {{ onlineRows:Array, vendorRows:Array, totals:{online:number,vendor:number,total:number,onlineCount:number,vendorCount:number} }}
 */
export function aggregateAltSales(online = [], vendor = []) {
  const onlineRows = (online || []).map((o) => ({
    id: o.id, date: o.transferDate || '', customer: o.customerName || '-',
    amount: num(o.amount), status: o.status || '',
  }));
  const vendorRows = (vendor || []).map((v) => ({
    id: v.id, date: v.saleDate || '', vendor: v.vendorName || '-',
    amount: num(v.totalAmount), status: v.status || '',
  }));
  const onlineTotal = onlineRows
    .filter((r) => ONLINE_REALIZED.has(r.status))
    .reduce((s, r) => s + r.amount, 0);
  const vendorTotal = vendorRows
    .filter((r) => VENDOR_REALIZED.has(r.status))
    .reduce((s, r) => s + r.amount, 0);
  return {
    onlineRows,
    vendorRows,
    totals: {
      online: round2(onlineTotal),
      vendor: round2(vendorTotal),
      total: round2(onlineTotal + vendorTotal),
      onlineCount: onlineRows.length,
      vendorCount: vendorRows.length,
    },
  };
}
