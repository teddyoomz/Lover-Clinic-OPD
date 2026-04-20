# Triangle Rule — 3-Source Verification

Before and DURING every feature that replicates external behavior, verify
against 3 independent sources. Gap in any one = drift = bug.

---

## The three sources

1. **External reference** — the real system you're replicating
   - API docs + live API inspection
   - Third-party SDK source code
   - Scraped HTML + network tab for web-based targets
   - Captured example requests/responses
   - Screenshot + DOM inspection of the UI you're mimicking

2. **Plan** — your project's intent
   - Phase plan documents
   - Design doc / spec
   - Previous decision log / ADRs
   - Conversation history with stakeholders

3. **Existing code** — your own codebase
   - Grep for existing helpers (Rule of 3)
   - Check for existing validators, API clients, UI patterns
   - Read any previously-implemented similar feature

## Why 3 and not 2

Two sources can agree while both being wrong.

Examples:
- External docs say field is `user_id`, but live API returns `userId`. Just
  reading docs → wrong.
- Plan says "copy the login flow from feature A", but feature A was
  refactored last week and plan wasn't updated. Just reading plan → wrong.
- Existing code has a `parseUser` helper, but it was written for a
  different API version. Just reading code → wrong.

Triangulating all three: you see the disagreement + ask.

## How to apply the rule

### Step 1: Before writing any code for a replication feature

- [ ] Capture the external behavior (whatever tooling applies to your target)
- [ ] Read the plan / spec for THIS specific feature
- [ ] Grep your codebase for any existing helper you should reuse

If all three agree: proceed.

If two agree and one disagrees: investigate the one that's out-of-band
before writing code.

If none agree: stop, ask user / team for clarification.

### Step 2: During implementation

When you find yourself guessing a field name, API path, or response shape,
**stop**. You're in an unverified zone. Go back to the external source and
capture the actual behavior.

AI will happily generate plausible-looking but wrong code. The guess
feels fine — it passes type check, your test happens to pass because your
mock matches the guess. It fails in production.

### Step 3: Commit the artifacts

Save the external-source artifacts in your repo:

```
docs/external-scan/
├── feature-X-list-phase11_9.json
├── feature-X-create-form-phase11_9.json
├── feature-X-api-response-phase11_9.json
```

Now the artifact is permanent. Next developer (or next Claude session)
sees exactly what you verified against. No re-capture needed.

### Step 4: Reference artifacts in commits

Commit message: `feat(feature-X): add CRUD — Triangle verified via
docs/external-scan/feature-X-*.json`

This ties the code back to the evidence. If later the external system
changes and something breaks, you can compare current behavior against
the captured artifact.

## Tooling for each side of the triangle

### External reference

The tool depends on your target:

- **Web UI replication**: custom scraper / Puppeteer scripts that capture
  page structure + form fields + API calls
- **API replication**: curl / httpie / Postman collections saved to repo
- **SDK replication**: read the source in node_modules/ + note version pinned
- **Database schema replication**: `pg_dump --schema-only` / equivalent

Save output as JSON/MD in `docs/external-scan/` or similar.

### Plan

Depends on your team's process:

- Simple project: `docs/phase{N}-plan.md` written before implementation
- Complex project: ADRs in `docs/decisions/`
- Remote team: Linear/Jira tickets — link from commit

### Existing code

- `Grep` tool (built into Claude Code)
- Or command-line `grep -rn`
- Before writing ANY new helper: grep for name + synonyms

## Anti-patterns (Triangle Rule violations)

### V-example 1: "URL edit with guessed PATCH pattern"

> Session wrote `handleUpdate` using `/admin/promotion/{id}/edit` +
> `_method=PUT`. Never tested against real external → production 404 because
> the real edit URL was different.
>
> Root cause: skipped Step 1 — didn't capture the actual edit URL before
> implementing.
>
> Fix: retroactive capture via scraper, found correct URL, rewrote handler.
> Rule: every new POST/PATCH URL requires an external-scan artifact
> committed BEFORE the handler code.

### V-example 2: "Assumed field name from English translation"

> External API returned product.`productName`, but our validator expected
> `product_name`. Caused silent nulls in production — field was there in
> ProClinic response as `product_name`, scraper converted to `productName`,
> mapper looked for `product_name` → null.
>
> Root cause: didn't verify the scraper's output shape against live data.
>
> Fix: added shape-assertion in scraper tests; rule: scrapers commit a
> sample response to docs/ so mappers can reference canonical shape.

### V-example 3: "Invented API endpoint that doesn't exist"

> Replicating a feature, assumed the PATCH endpoint was
> `/admin/api/product-group/{id}`. Real API: no such endpoint, use POST with
> `_method=PUT` and form data.
>
> Root cause: didn't probe the endpoint with curl before coding.
>
> Fix: every new endpoint reference must be curl-verified + saved to
> docs/external-scan/.

## How to grow this rule

Every time a bug traces back to "we didn't verify against X", add:

1. What wasn't verified (the specific source)
2. What went wrong (the bug)
3. How to prevent (the new checklist item)

The Triangle Rule is simple in principle but easy to skip when you're in
a hurry. The V-entries make it harder to skip — because "I'll just guess"
has documented consequences.
