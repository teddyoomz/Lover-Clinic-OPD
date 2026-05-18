---
name: triangle-inspect
description: Deep ProClinic inspection workflow. Use whenever you replicate a ProClinic UI screen that has conditional/interactive behaviour (auto-populate dropdowns, dependent modals, wizard flows, etc.). Screenshots + form intel reveal the static shape but NOT how the page BEHAVES. This skill runs the 7-step fill+observe+inspect workflow required by Rule F-bis before you write any replica code. Invoke this instead of relying on screenshots alone. Triggers when replicating ProClinic interactive flows — DF modal, pay-split logic, treatment form sections, dependent dropdowns, edit-mode vs create-mode differences.
---

# /triangle-inspect

Forced discipline for ProClinic replication work. Rule F-bis (2026-04-24)
requires behaviour capture, not just shape. This skill walks you through
the 7 steps in order. Skipping a step = gap = V-entry.

## When to invoke

- New feature replicates a ProClinic MODAL with conditional fields
- Feature has AUTO-POPULATE behaviour (e.g. pick doctor → group auto-fills)
- Replicating a WIZARD or multi-step flow
- Edit-mode behaviour differs from create-mode and needs to match exactly
- Any time you're tempted to "just build from the screenshot"

## 7-step workflow

Run these in order. Each produces output in `docs/proclinic-scan/` named
after the feature. Do NOT write replica code until step 7 is complete.

### Step 1 — Shape: intel + forms
```bash
node F:\replicated\scraper\opd.js intel <page>     # god-mode scan (may fail on heavy pages — fallback to forms)
node F:\replicated\scraper\opd.js forms <page>     # form fields + validation
```
Artefact: `docs/proclinic-scan/intel-<page>.json` + `forms-<page>.json`

### Step 2 — Visuals: look + css
```bash
node F:\replicated\scraper\opd.js look <page>
node F:\replicated\scraper\opd.js css <page> <selector>   # computed styles of key element
```
Artefact: screenshots in `F:\replicated\output\screenshots\`

### Step 3 — Static APIs: network baseline
```bash
node F:\replicated\scraper\opd.js network <page>   # XHR/fetch log on initial render
```
Artefact: `docs/proclinic-scan/network-<page>.json` — the API calls fired
on page load (before any interaction).

### Step 4 — FILL + observe
Actually submit the form via fill, captures the real POST:
```bash
node F:\replicated\scraper\opd.js fill <page>
# or fillPlus for richer variants
node F:\replicated\scraper\opd.js fillPlus <page>
```
Artefact: `docs/proclinic-scan/fill-<page>.json` — **the real POST URL +
field names + value encoding**. Without this, we're guessing.

### Step 5 — INSPECT modal / dependent UI
For features triggered by a button (e.g. DF modal):
```bash
node F:\replicated\scraper\opd.js click <page> "<button-thai-label>"
```
- Record whether a modal opened (response.modalOpened)
- If modal opened, its `forms[]` + `selects[]` should appear in the result
- Screenshot the post-click state: `opd.js look` afterwards

For data-dependent UI (e.g. "pick doctor → group dropdown populates"):
```bash
node F:\replicated\scraper\opd.js dna <page>   # captures state mutations
```

### Step 6 — Cross-module refs
```bash
node F:\replicated\scraper\opd.js map <page>
node F:\replicated\scraper\opd.js trace <actionPath> <checkPath>
```
Documents which OTHER pages read or write the same data. Example: DF
entries on treatment edit affect DF payout report.

### Step 7 — Confirm + document
Create a brief markdown in `docs/proclinic-scan/<feature>-brief.md`
summarising:
- POST URL + payload shape (from step 4)
- Modal trigger + fields (from step 5)
- Auto-populate rules observed (from step 3 + 5)
- Cross-module reads/writes (from step 6)
- **Knowns vs unknowns** — anything still guessed goes back to step 1

Only after step 7 can you begin writing replica code. Reference the
brief in your PR description so future sessions can verify.

## Anti-patterns this skill prevents

- Building from SCREENSHOTS alone ("looks like this should work") → ignores
  auto-populate / conditional-field logic
- Relying on STATIC form intel without FILLING it → misses real POST URL
  (V3 historical: `/admin/promotion/{id}/edit` 404 because guessed)
- Skipping dna/network on PICKERS — doctor picker may call `/api/doctor/{id}`
  that returns dfGroupId; without observing, we miss the wiring
- Treating edit-mode as "same as create with extra data" — edit often has
  different endpoints AND different field names (bug V6 family)

## Integration with existing rules

- **Rule F (Triangle)**: this skill IS the procedure for Rule F's window (A).
- **Rule F-bis (Behaviour)**: this skill's 7 steps ARE the enforcement.
- **Rule D (Continuous Improvement)**: when you discover a new ProClinic
  behaviour pattern (e.g. "delete cascades into linked docs"), append a
  note to the brief + update the audit skill for that area.
- **Rule G (Dynamic capability)**: if a step needs a command that doesn't
  exist in opd.js (e.g. "observe a toast message"), extend opd.js (user
  pre-authorised armory upgrades 2026-04-24).

## Opd.js command reference (armory, 2026-04-24)

Current arsenal at `F:\replicated\scraper\opd.js`:

| Command | Purpose | Step |
|---|---|---|
| `intel` | Heavy page scan — god mode | 1 |
| `forms` | Form field enumeration | 1 |
| `peek` | Lightweight surface peek | 1 |
| `look` | Screenshot (full + mobile) | 2 |
| `source` | Raw HTML source | 2 |
| `css` | Computed styles of selector | 2 |
| `network` | XHR/fetch capture (render-time) | 3 |
| `spy` | Runtime API watch | 3 |
| `fill` | Submit form, capture POST | 4 |
| `fillPlus` | Richer fill (god-upgraded) | 4 |
| `click` | Click button, detect modal | 5 |
| `dump` | Dropdown master data | 5 |
| `xray` | Element-level inspection | 5 |
| `dna` | State mutation tracker | 5 |
| `api` | Direct API hit | 5 |
| `template` | Template extraction | 5 |
| `map` | Cross-module refs | 6 |
| `trace` | Action → check flow | 6 |
| `diff` | A vs B scan comparison | 6 |
| `compare` | Original vs replica | 6 |
| `workflow` | Saved multi-step recipe | 6 |
| `record` | Record user actions (for replay) | 6 |
| `replay` | Replay a recorded session | 6 |
| `watch` | Long-poll observer | 7 |
| `trap` | Catch unexpected errors | 7 |
| `audit` | Full-system audit | 7 |
| `verify` | Original-vs-replica verification | 7 |
| `routes` | Full sitemap | prep |
| **`flow`** | **Multi-step recipe runner with trace + API log (NEW 2026-04-24)** | **4-5** |
| **`har`** | **Full HTTP Archive export during a scripted run (NEW 2026-04-24)** | **3-4** |
| **`inspect`** | **Evaluate arbitrary JS in page context (NEW 2026-04-24)** | **5** |

## New armory: flow / har / inspect (2026-04-24)

Added to `F:\replicated\scraper\flow-commands.js` per user directive
"ใส่เครื่องมือในการช่วย inspect flow, wiring และ logic". These enable
BEHAVIOUR capture, not just shape.

### `opd.js flow <recipe.json>`

Recipe is a JSON file with `start` + `steps[]`. Each step is one of:

- `{action: 'navigate', path: '/admin/foo'}`
- `{action: 'click', selector: '...'}` or `{action: 'click', text: 'Edit'}`
- `{action: 'fill', selector: '...', value: '...'}` — fires input + change events
- `{action: 'selectOption', selector: '...', value: '...'}`
- `{action: 'wait', ms: 500}`
- `{action: 'observe', selector: '...', capture: 'value'|'text'|'attr'|'exists'|'selectText', attr?: '...'}` — reads current state without modifying
- `{action: 'snapshot', name: 'step-label'}` — saves a screenshot
- `{action: 'inspect', expr: 'JS code'}` — evaluates JS, captures result
- `{action: 'dumpForm', selector?: 'form#id'}` — enumerates form fields + values
- `{action: 'waitForResponse', urlPattern: '/admin/api/x', timeout?: 8000}` — waits for an XHR + captures response body

Each step adds to the trace. Optional steps: add `required: false`. On
failure, flow stops by default (unless step is optional). Trace writes
to `F:\replicated\output\flows\<name>-<ts>.json` with full apiLog.

Recipe example (`F:\replicated\scraper\recipes\df-doctor-select.json`):
```json
{
  "name": "df-doctor-select",
  "start": "/admin/df/doctor",
  "steps": [
    {"action": "wait", "ms": 500},
    {"action": "dumpForm"},
    {"action": "selectOption", "selector": "select[name='position']", "value": "doctor"},
    {"action": "wait", "ms": 800},
    {"action": "observe", "selector": "input[name^='user_'][name$='_df_course_1067']", "capture": "value"},
    {"action": "snapshot", "name": "doctor-selected"}
  ]
}
```

### `opd.js har <page> [--recipe=path.json | --duration=30]`

Captures every XHR + fetch request/response as a HAR file importable
into Chrome DevTools Network panel. If a recipe is provided, runs it
(reusing `flow`) while recording. Otherwise passive idle capture for
`--duration` seconds (default 20).

Output: `F:\replicated\output\har\har-<page>-<ts>.har`

### `opd.js inspect <page> "<js-expression>"`

One-shot JS evaluation in the page context. Returns the result as
JSON-safe value. Useful for:
- `"document.title"` — verify page loaded
- `"Array.from(document.querySelectorAll('[name]')).map(e => e.name)"` — enumerate all named elements
- `"JSON.stringify(window.__INITIAL_STATE__)"` — dump framework state
- `"localStorage.getItem('user')"` — read storage
- `"getComputedStyle(document.querySelector('.foo')).color"` — computed styles

## Armory wishlist (still open)

When you run into a limitation these would solve, add to this list +
open a follow-up task:

1. **`ax`** — accessibility tree dump (catches screen-reader labels)
2. **`state-diff`** — before/after JS-state snapshot (React DevTools
   component tree, localStorage, sessionStorage) with a diff
3. **`conditional-probe`** — fuzz fields to map "if A=X → B appears"
4. **`cdp-inspect`** — raw Chrome DevTools Protocol access for
   advanced runtime inspection (breakpoints, call stacks)
5. **`record`** — record real user actions in headful mode, output a
   recipe JSON automatically — `record` command partially exists in
   `power-commands.js` already; not yet wired for deep capture

## Success criteria

After `/triangle-inspect` completes for a feature:
- [ ] POST URL + payload recorded in `docs/proclinic-scan/*-brief.md`
- [ ] Auto-populate rules documented (if any)
- [ ] Modal trigger verified via `click` command
- [ ] Cross-module refs listed
- [ ] Zero "guessed" URLs or field names remain
- [ ] Brief file referenced in the phase plan + PR description

If any of these fail, do NOT write replica code — re-run the missing step.
