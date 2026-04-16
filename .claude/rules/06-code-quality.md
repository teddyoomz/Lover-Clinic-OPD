<important if="writing React components or JavaScript">
## Code Quality
1. useEffect ที่ขึ้นกับ async-loaded props → ใช้ ref หรือ `loaded` flag (stale closure)
2. Course deduction: lookup by name+product (ไม่ใช่ array index — form dedup courses)
3. Purchased items deduction: AFTER assign (ไม่ใช่ก่อน)
4. Payment status map: '2'→'paid', '4'→'split', '0'→'unpaid'
5. scrollToError: ใช้ `data-field` attributes + `alert()` popup
6. Buy modal: max 50 items + "โหลดเพิ่ม" (performance)
</important>
