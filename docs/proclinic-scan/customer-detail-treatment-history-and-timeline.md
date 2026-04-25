# ProClinic — Customer Detail · Treatment History Card + ดูไทม์ไลน์ Modal

> Captured 2026-04-25 via `node F:\replicated\scraper\opd.js` against trial.proclinicth.com
> Customer used: HN69000619 "Mega Smile" — `/admin/customer/13851` (3 treatments)
> Cross-checked: HN69000622 (4 treatments, `/admin/customer/13857`), HN69000618 (3 treatments, `/admin/customer/13813`)

---

## 1. Treatment History Card (left column on customer detail page)

### Visual reference
- Full viewport: `F:\replicated\output\screenshots\look-admin_customer_13851-full.png`
- Full scroll page: `F:\replicated\output\screenshots\look-admin_customer_13851-scroll.png`
- 4-treatment example: `F:\replicated\output\screenshots\look-admin_customer_13857-scroll.png`

### Card-level structure (server-rendered, NOT virtual list)

```html
<div class="card-body">
  <div class="d-flex flex-column flex-xl-row flex-grow-1 gap-2 align-items-xl-center mb-4">
    <div class="flex-grow-1">
      <h5 class="mb-0 text-primary">ประวัติการรักษา</h5>
    </div>
    <div class="d-flex flex-column flex-md-row gap-2">
      <!-- LEFT: บันทึกการรักษา (info / cyan) -->
      <a class="btn btn-info select-draft-treatment d-flex align-items-center justify-content-center px-3 w-100"
         data-customer-id="13851" style="min-width:150px;" href="#">
         บันทึกการรักษา
      </a>
      <!-- RIGHT: ดูไทม์ไลน์ (secondary / orange) — opens #treatmentTimelineModal -->
      <a class="btn btn-secondary text-nowrap d-flex align-items-center justify-content-center px-3 w-100"
         data-bs-toggle="modal" data-bs-target="#treatmentTimelineModal"
         style="min-width:150px;" href="#">
         <i class="fa-solid fa-list-timeline me-2"></i>ดูไทม์ไลน์
      </a>
    </div>
  </div>

  <div class="timeline mb-2">       <!-- one .timeline wrapper containing N treatment rows -->
    <div>                            <!-- repeat block per treatment -->
      <!-- Header row: date + action links right-aligned -->
      <div class="mb-2">
        <p class="d-inline-block strong mb-0">24 เมษายน 2026</p>
        <div class="float-end">
          <!-- "เอกสาร" dropdown (blue text, NOT a button) -->
          <div class="dropdown d-inline-block">
            <a href="#" class="link text-blue me-2" data-bs-toggle="dropdown">
              <i class="fa-regular fa-eye me-1"></i>เอกสาร<i class="fa-solid fa-caret-down ms-1 small"></i>
            </a>
            <ul class="dropdown-menu">
              <li><a class="dropdown-item treatment-ht-show" data-treatment-id="3360" href="#">ข้อมูลการซักประวัติ</a></li>
              <!-- conditional: only when OPD Card / Chart image exists -->
              <li><a class="dropdown-item" href="<imageUrl>" data-fancybox="opd-gallery-3357" data-caption="OPD Card #1">OPD Card</a></li>
              <li><a class="dropdown-item" href="<imageUrl>" data-fancybox="chart-gallery-3357" data-caption="Chart #1">Chart</a></li>
              <li><a class="dropdown-item treatment-image-gallery-show" data-treatment-id="3360" href="#">รูปภาพการรักษาอื่นๆ</a></li>
              <li><a class="dropdown-item treatment-image-show" data-treatment-id="3360" href="#">รูป Before/After</a></li>
            </ul>
          </div>
          <!-- "แก้ไข" link (primary teal text, pen icon) -->
          <a href="https://trial.proclinicth.com/admin/treatment/3360/edit" class="link text-primary me-2">
            <i class="fa-regular fa-pen me-1"></i>แก้ไข
          </a>
          <!-- "ยกเลิก" link (red text, trash icon) → opens cancelTreatmentModal -->
          <a href="#" class="text-danger text-decoration-none"
             data-bs-toggle="modal" data-bs-target="#cancelTreatmentModal" data-treatment-id="3360">
            <i class="fa-regular fa-trash me-1"></i>ยกเลิก
          </a>
        </div>
      </div>

      <!-- Meta row: branch + doctor + nurse with primary-teal icons -->
      <p class="mb-1">
        <span class="me-2"><i class="fa-regular fa-home me-2 text-primary"></i>สาขา พระราม9</span>
        <span class="me-2"><i class="fa-regular fa-user-doctor me-2 text-primary"></i>Wee 523</span>
        <span class="me-0"><i class="fa-regular fa-user-nurse me-2 text-primary"></i>-</span>
      </p>

      <!-- Optional fields: CC / ICD / Dr.Note (only render col-12 when populated) -->
      <div class="row g-2 mb-2">
        <div class="col-12"><p class="mb-0"><span class="text-gray-2">รหัสโรค (ICD) :</span><br>A000</p></div>
        <div class="col-12"><p class="mb-0"><span class="text-gray-2">รายละเอียดการรักษา (Dr. Note) :</span><br>รายละเอียด อื่นๆ</p></div>
      </div>

      <!-- Course/treatment items grey card -->
      <div class="row g-2 mb-3">
        <div class="col-12">
          <div class="card shadow-none bg-gray">
            <div class="card-body p-3">
              <ul class="list mb-0">
                <li>Pico<span class="float-end">1 ครั้ง</span></li>
              </ul>
            </div>
          </div>
        </div>
        <!-- Conditional accordions: ยากลับบ้าน / สินค้าสิ้นเปลือง / รายการสินค้าหน้าร้าน -->
        <div class="col-12">
          <div class="accordion" id="accordion-takeaway-3325">…ยากลับบ้าน items…</div>
        </div>
      </div>

      <!-- Bottom action row: 2 print dropdowns side-by-side, equal width -->
      <div class="d-flex align-items-center flex-column flex-lg-row gap-2 gap-lg-3">
        <!-- LEFT: btn-blue → ใบรับรองแพทย์ (8 sub-options) -->
        <div class="dropdown w-100">
          <a class="btn btn-blue w-100" data-bs-toggle="dropdown" href="#">
            <i class="fa-regular fa-print me-1"></i>พิมพ์ใบรับรองแพทย์<i class="fa-solid fa-caret-down ms-1 small"></i>
          </a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item medical-document-print" data-url=".../medical-opinion" data-doctor-id=… …>ใบรับรองแพทย์ลาป่วย</a></li>
            <li><a class="dropdown-item medical-certificate-print" data-url=".../medical-certificate" data-treatment-date="2026-04-24">ใบรับรองแพทย์ 5 โรค</a></li>
            <li><a class="dropdown-item" href=".../medical-certificate-for-driver-license" target="_blank">ใบรับรองแพทย์สำหรับใบอนุญาตขับรถ</a></li>
            <li><a class="dropdown-item medical-document-print" data-url=".../physical-therapy-certificate" …>ใบรับรองกายภาพบำบัด</a></li>
            <li><a class="dropdown-item" href=".../thai-traditional-medicine-medical-certificate" target="_blank">ใบรับรองแพทย์แผนไทย</a></li>
            <li><a class="dropdown-item" href=".../chinese-traditional-medicine-medical-certificate" target="_blank">ใบรับรองแพทย์แผนจีน</a></li>
            <li><a class="dropdown-item" href=".../patient-referral" target="_blank">ใบส่งตัวผู้ป่วย</a></li>
            <li><a class="dropdown-item" href=".../fit-to-fly" target="_blank">ใบรับรองแพทย์ Fit to fly</a></li>
          </ul>
        </div>
        <!-- RIGHT: btn-primary → พิมพ์การรักษา (3 sub-options) -->
        <div class="dropdown w-100">
          <a class="btn btn-primary w-100" data-bs-toggle="dropdown" href="#">
            <i class="fa-regular fa-print me-1"></i>พิมพ์การรักษา<i class="fa-solid fa-caret-down ms-1 small"></i>
          </a>
          <ul class="dropdown-menu">
            <li><a class="dropdown-item" href=".../admin/treatment/3360">ประวัติการรักษา (A4)</a></li>
            <li><a class="dropdown-item treatment-print" data-url=".../treatment-referral" data-treatment-id="3360">ใบส่งตัวทรีตเมนต์ (A5)</a></li>
            <li><a class="dropdown-item" href=".../course-usage">ใบตัดคอร์ส</a></li>
          </ul>
        </div>
      </div>
    </div>
    <!-- next treatment row repeats here -->
  </div>
</div>
```

### Pagination — confirmed: NONE
- `template /admin/customer/13851 ".pagination"` → `not found`
- `template /admin/customer/13857 ".btn-load-more"` → `not found`
- All N treatments render server-side as static `<div>` rows inside one `.timeline` wrapper.
- Customers tested: 13851 (3 rows), 13857 (4 rows), 13813 (3 rows). The trial dataset has no high-volume customer (>10 visits) to confirm whether Laravel adds pagination at higher counts, but the markup structure shows zero pagination scaffolding — likely "show all" is the design intent. **Plan accordingly: replicate without pagination first; add only if real-world high-volume customers exhibit the issue.**

### Color palette (computed via `opd.js css`)
| Element | Class | Computed background | Computed color |
|---|---|---|---|
| Section header "ประวัติการรักษา" | `text-primary` | — | `rgb(46, 196, 182)` (teal/mint #2EC4B6) |
| "บันทึกการรักษา" button | `btn btn-info` | `rgb(86, 204, 242)` (#56CCF2 sky blue) | white |
| "ดูไทม์ไลน์" button | `btn btn-secondary` | `rgb(255, 159, 28)` (#FF9F1C **orange**) | white |
| "เอกสาร" link | `link text-blue` | transparent | `rgb(0, 123, 255)` (#007BFF) |
| "แก้ไข" link | `link text-primary` | transparent | `rgb(46, 196, 182)` (teal) |
| "ยกเลิก" link | `text-danger` | transparent | red (Bootstrap default) |
| "พิมพ์ใบรับรองแพทย์" | `btn btn-blue` | `rgb(0, 123, 255)` blue | white |
| "พิมพ์การรักษา" | `btn btn-primary` | `rgb(46, 196, 182)` teal | white |
| Course-items card | `card shadow-none bg-gray` | light gray | default |
| Border-radius | `btn` family | — | `8px` |
| Button padding | `btn` family | — | `8px 15px` |
| Button height | `btn` family | — | `42px` |
| Font | all | — | IBM Plex Sans 16px |

> **Key correction to user's screenshot interpretation**: "ดูไทม์ไลน์" is **ORANGE** (`#FF9F1C`, btn-secondary in ProClinic's theme), NOT green. The "info" button (บันทึกการรักษา) is light cyan/sky-blue. The teal/mint accent is reserved for `text-primary` (header text + pen icon + "พิมพ์การรักษา" button).

### Action button hierarchy summary
- Card header right side: **2 wide buttons** (cyan "บันทึกการรักษา" + orange "ดูไทม์ไลน์")
- Per-row top right: **3 small text-links** (blue "เอกสาร" dropdown, teal "แก้ไข", red "ยกเลิก")
- Per-row bottom: **2 wide dropdown-buttons** (blue "พิมพ์ใบรับรองแพทย์" + teal "พิมพ์การรักษา")

### Cancel treatment modal (#cancelTreatmentModal)
```
POST /admin/treatment/cancel
fields: _token (CSRF), treatment_id (hidden, set via JS from data-treatment-id), cancel_detail (textarea)
confirmation: "ยืนยันการยกเลิกการรักษา?"
buttons: [ยกเลิก outline-primary] [ยืนยัน btn-primary teal]
```

---

## 2. ดูไทม์ไลน์ Button Behavior

### Exact button text
- `ดูไทม์ไลน์` (Thai) — verified in `peek` output `.buttons[11]`
- Icon: `fa-solid fa-list-timeline`

### What it does — confirmed via `click /admin/customer/13851 "ดูไทม์ไลน์"`
```json
{
  "action": "Clicked \"ดูไทม์ไลน์\"",
  "navigated": false,
  "modalOpened": true,
  "modal": { "title": "Timeline การรักษา", "fields": [] }
}
```
- **No URL change.** Stays on `/admin/customer/{id}`.
- **No AJAX/network request fired** (verified via `network /admin/customer/13851` — the only XHR on page-load is `/admin/api/stat`; no timeline-specific endpoint exists).
- **Opens Bootstrap modal `#treatmentTimelineModal`** (`data-bs-toggle="modal" data-bs-target="#treatmentTimelineModal"`).
- The modal **HTML is server-rendered into the initial page HTML** alongside the treatment-history card. `display:none` until clicked → Bootstrap toggles to `display:block`. **Replication: render full timeline HTML in the same parent component; no extra fetch needed.**

### Modal structure (`#treatmentTimelineModal`)

```html
<div class="modal fade" id="treatmentTimelineModal" tabindex="-1" aria-hidden="true">
  <div class="modal-dialog modal-xxl modal-dialog-centered">   <!-- modal-xxl = very wide -->
    <div class="modal-content">
      <div class="modal-body">
        <div class="mb-4">
          <h4 class="text-primary d-inline-block">Timeline การรักษา</h4>
          <button type="button" class="btn-close float-end" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>

        <div class="timeline">
          <!-- Per-treatment block: 3-col / 9-col split -->
          <div>
            <div class="row">
              <!-- LEFT (col-md-3): meta + items list -->
              <div class="col-md-3">
                <div class="mb-2">
                  <p class="d-inline-block strong mb-0">24 เมษายน 2026</p>
                  <!-- (HTML comment shows planned edit pen — currently disabled in left col) -->
                </div>
                <p class="mb-1">
                  <span class="me-3"><i class="fa-regular fa-home me-2 text-primary"></i>สาขา พระราม9</span>
                  <span class="me-3"><i class="fa-regular fa-user-doctor me-2 text-primary"></i>Wee 523</span>
                </p>
                <!-- CC / ICD / Dr.Note rows (only render when populated) -->
                <div class="row g-2 mb-2">
                  <div class="col-12"><p class="mb-0"><span class="text-gray-2">อาการ (CC) :</span><br>รายละเอียด</p></div>
                  <div class="col-12"><p class="mb-0"><span class="text-gray-2">รหัสโรค (ICD) :</span><br>A000</p></div>
                  <div class="col-12"><p class="mb-0"><span class="text-gray-2">รายละเอียดการรักษา (Dr. Note) :</span><br>-</p></div>
                </div>
                <!-- Items: course/treatment + accordions for ยากลับบ้าน, สินค้าสิ้นเปลือง, รายการสินค้าหน้าร้าน -->
                <div class="row g-2">
                  <div class="col-12">
                    <div class="card shadow-none bg-gray">
                      <div class="card-body p-3">
                        <ul class="list mb-0">
                          <li>Allergan 100 U<span class="float-end">1 U</span></li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  <div class="col-12">
                    <div class="accordion" id="accordion-takeaway-3325">
                      <div class="accordion-item">
                        <h2 class="accordion-header">
                          <button class="accordion-button bg-gray collapsed" type="button"
                                  data-bs-toggle="collapse" data-bs-target="#collapseChild-takeaway-3325">
                            ยากลับบ้าน
                          </button>
                        </h2>
                        <div id="collapseChild-takeaway-3325" class="accordion-collapse bg-gray collapse">
                          <div class="accordion-body">
                            <ul class="list mb-0">
                              <li>พาราเซตามอล<span class="float-end">10 เม็ด</span></li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <!-- accordion-consumable + accordion-product follow same pattern -->
                </div>
              </div>

              <!-- RIGHT (col-md-9): 3-image grid (OPD Card / Before / After) -->
              <div class="col-md-9">
                <div class="d-flex align-items-center mt-3 mt-md-0 mb-3">
                  <div class="ms-auto">
                    <a href=".../admin/treatment/3357/edit?tab=image" class="link text-primary">
                      <i class="fa-regular fa-pen me-1"></i>แก้ไข
                    </a>
                  </div>
                </div>
                <div class="row g-3">
                  <!-- OPD Card column (with Bootstrap carousel if multiple images) -->
                  <div class="col-md-4">
                    <h6>OPD Card (1 รูป)</h6>
                    <div id="treatmentGalleryOpd-3357" class="carousel slide carousel-fade carousel-thumbnail-left carousel-small" data-bs-interval="false">
                      <div class="carousel-inner mb-5">
                        <div class="carousel-item active">
                          <a href="<imageUrl>" class="link" data-fancybox="treatmentGalleryOpd-3357" data-caption="รูปภาพ OPD Card #1">
                            <div class="preview-image lazyload" style="background-image:url('<imageUrl>');"></div>
                          </a>
                        </div>
                      </div>
                      <div class="carousel-indicators">…thumbnail buttons…</div>
                    </div>
                  </div>
                  <!-- Before / After columns: same shape, fall back to /assets/img/blank-images.png -->
                  <div class="col-md-4">
                    <h6>Before </h6>
                    <img src="/assets/img/blank-images.png" alt="" class="w-100 mb-3">
                  </div>
                  <div class="col-md-4">
                    <h6>After </h6>
                    <img src="/assets/img/blank-images.png" alt="" class="w-100 mb-3">
                  </div>
                </div>
              </div>
            </div>
          </div>
          <!-- next treatment block repeats -->
        </div>

        <!-- Empty-state fallback (renders after .timeline if 0 treatments) -->
        <div class="text-center pt-4 pb-4">
          <img src="/assets/img/blank-document.png" class="mb-3" alt="Blank">
          <p class="text-2 mb-0">ไม่พบประวัติการรักษา</p>
        </div>
      </div>
    </div>
  </div>
</div>
```

### Modal interactive features
- **Image carousel**: when treatment has multiple OPD Card images → Bootstrap `carousel slide carousel-fade` with thumbnail indicators (`width: 56px` per thumb).
- **Fancybox lightbox**: each carousel image has `data-fancybox="treatmentGalleryOpd-{id}"` → click → fullscreen lightbox with caption "รูปภาพ OPD Card #N".
- **Lazy-loaded backgrounds**: `class="preview-image lazyload"` with `style="background-image:url(…)"`.
- **Accordions** (collapsed by default, `bg-gray` styling):
  - `#accordion-product-{id}` — รายการสินค้าหน้าร้าน
  - `#accordion-takeaway-{id}` — ยากลับบ้าน
  - `#accordion-consumable-{id}` — สินค้าสิ้นเปลือง
- **Edit link top-right of each row** (col-md-9): `…/admin/treatment/{id}/edit?tab=image` — jumps directly to image-edit tab.
- **No filters / no date range / no search inside the modal** — strictly chronological (newest first based on render order).

### Network behavior — verified
```
GET /admin/customer/13851  → returns full HTML including #treatmentTimelineModal pre-rendered
Click "ดูไทม์ไลน์"           → Bootstrap modal toggle only, ZERO network requests
```
Page-load only fires `GET /admin/api/stat` (header badge counter, unrelated to timeline). All treatment rows + image URLs + accordion data are inlined.

---

## 3. Replication Plan Hints (concrete data points)

### A. Treatment History Card structure
1. **Single column-12 card** with `<h5 class="text-primary">ประวัติการรักษา</h5>` header + 2-button right group (cyan "บันทึกการรักษา" + orange "ดูไทม์ไลน์").
2. **No virtualization, no pagination** — render all treatments as a flat list. (Add infinite scroll only if customer histories actually exceed ~30 rows in production, otherwise YAGNI.)
3. **Per-row template** is a single `<div>` block with:
   - Row 1: date (left) + 3 right-aligned mini-actions (`เอกสาร` blue dropdown, `แก้ไข` teal pen-link, `ยกเลิก` red trash-link)
   - Row 2: branch + doctor + nurse meta with teal `text-primary` icons (`fa-home`, `fa-user-doctor`, `fa-user-nurse`)
   - Row 3: optional CC / ICD / Dr.Note (only render `<div class="col-12">` when value present)
   - Row 4: gray `card shadow-none bg-gray` listing course/product items with `<li>NAME<span class="float-end">QTY UNIT</span></li>`
   - Row 4b: optional `accordion-takeaway-{id}` / `accordion-consumable-{id}` / `accordion-product-{id}` only when non-empty
   - Row 5: 2 `w-100` print-dropdown buttons side-by-side (blue "พิมพ์ใบรับรองแพทย์" with 8 sub-items + teal "พิมพ์การรักษา" with 3 sub-items)

### B. Color tokens to add to our theme (Tailwind config)
```
--proclinic-info:    #56CCF2  (rgb 86,204,242)  - บันทึกการรักษา bg
--proclinic-orange:  #FF9F1C  (rgb 255,159,28)  - ดูไทม์ไลน์ bg
--proclinic-blue:    #007BFF  (rgb 0,123,255)   - พิมพ์ใบรับรองแพทย์ bg + เอกสาร text
--proclinic-teal:    #2EC4B6  (rgb 46,196,182)  - text-primary + พิมพ์การรักษา bg + แก้ไข + brand
--proclinic-danger:  #DC3545  (Bootstrap red)   - ยกเลิก link
button-radius: 8px
button-padding: 8px 15px
button-height: 42px
font-size: 16px
font-family: IBM Plex Sans
```
> Reminder: per `.claude/rules/04-thai-ui.md` red is forbidden on names/HN — only used for action verbs like "ยกเลิก".

### C. Timeline modal (#treatmentTimelineModal)
1. **Render in same component as the card**, hidden by default. `data-bs-toggle="modal" data-bs-target="#treatmentTimelineModal"` on ดูไทม์ไลน์ button.
2. **Modal width**: `modal-xxl` — for our React+Tailwind, use `max-w-screen-xl` or `w-[90vw]`. Centered.
3. **Header**: teal `text-primary` `<h4>Timeline การรักษา</h4>` + close button (top-right).
4. **Body grid per row**: `grid-cols-12` with left-side `col-span-3` (meta+items) and right-side `col-span-9` (3-image grid).
5. **Right-side image grid**: `col-md-4` × 3 columns: OPD Card / Before / After. Each column:
   - `<h6>` header with image count: `OPD Card (3 รูป)` if multiple, `OPD Card ` (with space) if single, plain `Before` / `After` if none.
   - If multiple images: Bootstrap carousel with thumbnail indicators (we can substitute with Swiper or lightbox library — preserve structure).
   - If 0 images: `<img src="/assets/img/blank-images.png" alt="" class="w-100 mb-3">` placeholder (we have `src/assets/...` equivalent).
   - Fancybox lightbox on click — for our app, use `react-photo-view` or similar.
6. **Empty state**: `<img src="/assets/img/blank-document.png">` + `<p class="text-2">ไม่พบประวัติการรักษา</p>` shown when zero treatments.
7. **Accordions** are Bootstrap collapse-style — gray background, collapsed by default. For React, use `<details>`/`<summary>` or a controlled state.
8. **No AJAX needed** — props the parent React component already has (treatments[] with images URL, items, takeaway, consumable, products) feed both card and modal.
9. **Edit link in right column (col-md-9)** points to `/admin/treatment/{id}/edit?tab=image` — replicate as deep link to our treatment-edit page with `?tab=image` query.

### D. Sub-dropdown items to support
- "เอกสาร" dropdown (3-5 items per row depending on captured images):
  - ข้อมูลการซักประวัติ → opens HT modal via JS (`treatment-ht-show` class)
  - OPD Card / Chart (only if image exists) → fancybox lightbox
  - รูปภาพการรักษาอื่นๆ → JS modal (`treatment-image-gallery-show`)
  - รูป Before/After → JS modal (`treatment-image-show`)
- "พิมพ์ใบรับรองแพทย์" dropdown — **8 fixed items**:
  1. ใบรับรองแพทย์ลาป่วย → `data-url=.../medical-opinion` + 9 doctor data-attrs
  2. ใบรับรองแพทย์ 5 โรค → `data-url=.../medical-certificate` + `data-treatment-date`
  3. ใบรับรองแพทย์สำหรับใบอนุญาตขับรถ → direct href, `target="_blank"`
  4. ใบรับรองกายภาพบำบัด → `data-url=.../physical-therapy-certificate` + doctor attrs
  5. ใบรับรองแพทย์แผนไทย → direct href, `target="_blank"`
  6. ใบรับรองแพทย์แผนจีน → direct href, `target="_blank"`
  7. ใบส่งตัวผู้ป่วย → direct href, `target="_blank"`
  8. ใบรับรองแพทย์ Fit to fly → direct href, `target="_blank"`
- "พิมพ์การรักษา" dropdown — **3 fixed items**:
  1. ประวัติการรักษา (A4) → `href=.../admin/treatment/{id}` (full page)
  2. ใบส่งตัวทรีตเมนต์ (A5) → JS print via `data-url=.../treatment-referral`
  3. ใบตัดคอร์ส → `href=.../admin/treatment/{id}/course-usage`

### E. Date format
ProClinic uses Thai full-month: **"24 เมษายน 2026"** (พ.ศ. NOT used in this view — uses ค.ศ.). Confirmed across 24 เมษายน 2026, 20 เมษายน 2026 entries. Note this differs from our admin convention (also ค.ศ.) so no rule conflict. For our app: use existing `THAI_MONTHS` + `bangkokNow()` helpers from `src/utils.js`.

### F. Captured artifacts (for re-reference without re-running opd.js)
- Customer detail full screenshot: `F:\replicated\output\screenshots\look-admin_customer_13851-full.png`
- Customer detail scroll screenshot: `F:\replicated\output\screenshots\look-admin_customer_13851-scroll.png`
- 4-treatment scroll: `F:\replicated\output\screenshots\look-admin_customer_13857-scroll.png`
- Timeline modal raw HTML: `F:\LoverClinic-app\.tmp_scan\timeline_modal.html` (13.5 KB)
- Treatment-row HTML: `F:\LoverClinic-app\.tmp_scan\tx_row.json` (30 KB) — `outerHTML` field has full markup
- Click capture: `F:\LoverClinic-app\.tmp_scan\timeline_click.json` (modal-open confirmation)
- Network capture: `F:\LoverClinic-app\.tmp_scan\cust_network.json` (only `/admin/api/stat` fires)
- Peek structure: `F:\LoverClinic-app\.tmp_scan\cust_peek.json` (button list with classes)

### G. What I did NOT capture (gaps to fill before implementing)
1. **HT (ซักประวัติ) JS modal content** — clicking "ข้อมูลการซักประวัติ" likely opens a separate modal via `treatment-ht-show` JS handler. Run `click /admin/customer/13851 "ข้อมูลการซักประวัติ"` next time to capture.
2. **รูปภาพการรักษาอื่นๆ + รูป Before/After modal contents** — same pattern, separate JS modals.
3. **Print JS handlers** — `medical-document-print`, `medical-certificate-print`, `treatment-print` are inline JS hooks; if we replicate the print flow we'll need to capture the actual fetched HTML/PDF endpoint via `network` while clicking.
4. **High-volume customer behavior** — trial dataset maxes at 4 treatments per customer; pagination behavior at 50+ treatments unverified.
5. **Mobile layout for modal** — captured desktop only; `modal-xxl` likely degrades to full-screen on mobile.
6. **Dark theme variant** — ProClinic's trial server is light-only; our app needs dark variant of the orange/cyan palette.

---

## TL;DR for implementation

- **Card layout**: copy the structure verbatim — section header (teal text) + 2 wide buttons (cyan info, orange secondary) + flat list of treatment rows. NO pagination.
- **Per-row**: 5 stacked sections — header(date+actions), meta(branch/doctor/nurse), optional CC/ICD/DrNote, gray-card item list with optional accordions, 2 wide print-dropdowns at bottom.
- **Timeline button**: opens a server-rendered Bootstrap modal (`#treatmentTimelineModal`, `modal-xxl`) — NO API call. Same row data + a 3-image grid (OPD Card / Before / After) per treatment.
- **Colors are NOT green** — orange `#FF9F1C` for ดูไทม์ไลน์, cyan `#56CCF2` for บันทึกการรักษา, teal `#2EC4B6` for "พิมพ์การรักษา" + brand text. User's "green" perception was likely teal `#2EC4B6` from the print-button or section-header.
- **Replicate fidelity**: copy the action-link hierarchy (3 mini text-links per row + 2 wide dropdowns at bottom) — that's what makes it feel "ProClinic-like" vs our current implementation.
