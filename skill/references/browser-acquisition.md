# Live product-page acquisition

Use this when a product URL must be read from a browser, especially a login-gated marketplace page. Follow the browser tool's current documentation for exact API names and first-call rules. The goal is a coverage-checked evidence set, not a successful screenshot call.

## 1. Bind the right page and verify access

Follow the current browser tool documentation and the user's browser preference. Prefer the user's existing authenticated product tab, matching domain **and item ID**. Preserve it. Do not inspect cookies, local storage, credentials, unrelated page content, or hidden network state.

### Browser identity and recovery

- Discover available browsers/tabs through the documented inventory. Browser IDs are runtime-local: after a reset, refresh the inventory and resolve the browser again by its name, type, profile, and a stable identifier if exposed. Never reuse an old numeric ID without confirming it still identifies the intended browser.
- An extension instance identifier may help select the same Chrome profile when the current API supports it. Obtain it from the current inventory; do not hard-code values from a previous task. Chrome is a verified route in the local rehearsal, not a requirement for every environment.
- Name the session when the selected browser's documentation requires it. Match the target tab from a fresh tab list before binding it.
- If binding with automatic accessibility inspection stalls, use a documented handle-only tab binding when available, then test DOM and viewport screenshot separately. Do not guess APIs or inspect browser implementation files.
- Keep a valid browser binding across ordinary page/tab errors. Rediscover after an actual runtime reset or explicit disconnection according to current documentation; do not repeatedly reselect for an empty tab list or unchanged page.
- Recovery does not imply that prior clicks were undone. Verify the selected SKU and page state before continuing.

### Minimal live-acquisition check

Before collecting all SKUs, long detail images, or a broad review sample, record these five checks:

| Surface | Required observation |
|---|---|
| Tab list | An existing or newly opened target tab matched by domain and item ID |
| Body | Product-specific title/identity in rendered page content, beyond tab metadata |
| Screenshot | A readable viewport showing an actual main product image |
| SKU interaction | Select a different available SKU; verify its selected name/state and resulting price with the exact price label |
| Review | Read at least one actual review entry, preserving text, displayed date/variant where available, and active filter |

Save the source URL, observation time with timezone, and evidence references using `assets/capture-checklist.md`. A SKU label containing a unit-price slogan is not proof of the resulting price. A successful click alone is not proof of selection; use a selected control, changed SKU identity, or a screenshot of the selection. Equal prices across SKUs are valid if selection is independently confirmed.

Report `passed` only when all five observations are obtained. If the page genuinely has no SKU selector or no reviews, record `not_applicable` with evidence and report a limited check; do not invent an interaction or call the five-part check passed. Distinguish `failed`, `not_tested`, and `not_applicable`.

A reading-test-only request ends here. If full capture is in scope, this check is a gate to the remaining sections, not permission to stop early. Report minimal-check status separately from full-capture status and any diagnosis of the browser's underlying fault. A working Chrome route does not prove that an earlier in-app route was repaired.

### Isolate failures without retry loops

- Diagnose discovery, binding, body/DOM reading, screenshots, interactions, and media export separately. Keep the returned error and elapsed time for the failed stage. A call containing multiple operations cannot identify which operation failed unless intermediate results were recorded.
- When automatic AX fails, test an independently documented DOM snapshot and viewport screenshot if available. One failure does not establish the outcome of the other. If no independent method is supported, record that limitation.
- Separate slow diagnostic calls so a combined execution deadline does not erase successful intermediate work or reset the runtime. Save evidence after each successful stage. Do not set fixed waits or universal timeout values based on one rehearsal.
- Retry a failed method only when there is new evidence or a relevant state change. Explicit permission denial ends that route; do not bypass it. If supported routes remain unavailable, report the concrete blocker and save the resume point before using public web tools or requesting user-supplied evidence.

## 2. Read each evidence surface independently

Build a short coverage log with these columns: surface, attempted method, actually seen, saved proof, gap. Inspect:

- Product identity, store, title, visible sales and ranking cues.
- Main images in carousel order and any visible video.
- Each relevant SKU, pricing labels, promotions, gifts, and restrictions.
- Parameters and Q&A.
- Review tabs/sorts, especially follow-ups and available neutral/negative views.
- The complete detail-image narrative in page order.

Use a DOM snapshot for rendered text and controls; use screenshots or observed image assets for text embedded inside artwork. A DOM snapshot alone cannot establish the wording or layout of image-only detail sections. `pageAssets` can help save observed media but may omit lazy-loaded detail images. Treat its absence as an inventory limitation, not an absent page section.

## 3. Handle long lazy-loaded detail pages

1. Open the page's detail tab/section, then scroll through the **detail image column** in modest increments. On a page with a sticky purchase panel, scrolling over that panel may leave the detail column unchanged.
2. After each move, inspect the viewport or the images' read-only DOM position/loading state. An unrendered white strip or placeholder means the section is still pending; it is not evidence that the detail image is blank.
3. When a screenshot of the entire page times out, capture smaller viewport or document-coordinate slices **after those sections have rendered**. Record their order and any visual claim, disclaimer, diagram, or usage instruction.
4. If a keyboard scroll action stalls, use another documented UI scroll method; avoid repeatedly retrying the same hanging action. A screenshot timeout should likewise lead to smaller captures or DOM inspection, not a page-access failure claim.
5. Export representative original images only through a supported page-media capability when it succeeds. If media download stalls or navigates away, restore the product tab and continue with visual capture. Do not turn an observed image URL into an unauthenticated bulk-fetch script.

For each long-image section, record **seller claim**, **visual demonstration**, and **conditions/disclaimer** separately. A lab report thumbnail proves the page displays a report image; it does not independently validate the test or extend the result to a normal room.

## 4. Price and SKU verification

For each currently selectable SKU, read the selected label and the price area **after selection**. Confirm selected state even when the price is unchanged. Parameter blocks can contain historical or unavailable variants; do not count those as selectable SKUs. Record:

| Field | What to preserve |
|---|---|
| Identity | Full selected SKU name, scent, pack quantity, specification |
| Price | Exact label such as `平台加补后`, displayed amount, `优惠前` amount |
| Offer | Coupon, member subsidy, bundle wording, gift, threshold, date if visible |
| Context | Observation time with timezone, source URL, selected-state proof and price evidence file; relevant account/location conditions without unnecessary personal identifiers |

Never call a page display the checkout price unless checkout was actually inspected. A bundle's `立省` slogan may use a different benchmark from the displayed before/after columns; calculate the displayed difference separately and do not reconcile them by assumption. If the same item shows a different starting price in another tab or session, keep both observations with their context.

## 5. Review sampling

- Record the platform's total or category label separately from the number of reviews actually visible and inspected. For example, `追评10` can show fewer than ten entries in the current view.
- Note default/time/negative/neutral sort or filter, sample size, dates where useful, and whether pagination or loading stopped. Count repeated entries across previews, filters, and pages once when reporting unique samples. If cross-view deduplication is uncertain, report per-view counts and overlap as unknown. Preserve follow-up entries with their original review when identifiable; do not assume a filter count equals the number loaded. Record unavailable negative/neutral filters as a gap, not zero negative reviews.
- Retain first-hand wording only as needed to support the finding. Separate product complaints from delivery or service complaints.
- Distinguish a single observed case, repeated theme within the visible sample, and platform-wide frequency. Do not estimate a rate from a small visible sample.
- Compare unusual uses mentioned by reviewers with the seller's instructions and supplied brand materials. A customer's use in a prohibited setting is not an endorsement of that use.

## 6. Preserve and reconcile evidence

- Save each observation as it is acquired, including SKU name, selected-state proof, exact price label/value, source, timestamp, and evidence path. Use one consistent record shape; unavailable fields are explicit unknowns, not reconstructed observations.
- Export only the relevant observed product/review media through supported page-media capabilities. Filter inventories before persisting them; exclude tracking pixels, unrelated assets, and unnecessary account identifiers. Avoid saving a full raw resource inventory as the evidence deliverable.
- Compare intended images with matched inventory entries, requested exports, successful exports, and failed or unmatched items. An intersection of two inventories can silently omit a main image or lazy-loaded detail image; `failedCount=0` only covers the requested subset.
- Preserve image order and role (main, SKU, detail, review). Check local files decode and retain source-to-local-path mapping. Copy temporary exports into the batch directory when durable delivery is needed; a temporary path alone is not a delivered attachment.
- Save the last verified URL, selected SKU/filter, completed surfaces, unresolved gaps, and next action for resuming. Preserve original observation timestamps; record missing timestamps as unknown.

## 7. Exit check

Before stating that capture is complete, verify that the coverage log includes SKU prices by selected option, visual review of the detail-page sequence, review sample limits, and source links or saved evidence. If any section remains unavailable, name the exact section and failure mode. Keep facts, seller claims, customer experiences, and strategic inferences distinct. For capture-only requests, stop content production before analysis/strategy, then retain the captured evidence and attachments in Feishu or the explicitly chosen destination. Only explicit test-only/local-only/deferred-delivery scope bypasses the default Feishu handoff.


## 8. Full-capture completion contract

For formal capture, analysis, or replication, continue after preflight until every surface below is collected or has a concrete documented blocker. A preflight pass, one review, five downloaded images, or a detail first screen is not full capture.

- **Identity and parameters:** verify title, shop identity, visible sales/trust labels, specification, ingredients/materials, storage/use instructions, parameters and Q&A where present. Store seller claims as claims.
- **SKU and offers:** enumerate all currently selectable combinations across option groups, not just the URL SKU or a parameter-text list. Account for unavailable/disabled combinations separately. Save selected-state and displayed price evidence per combination, including gifts and conditions. Do not enter checkout merely to fill an unknown final price.
- **Main media:** inspect the entire product carousel in order; save each distinct main image and account for video availability. Preserve SKU-specific images with their SKU mapping. Record an unavailable video/export as a media gap.
- **Detail sequence:** traverse the detail column from its heading to its actual end or next section. Load every lazy segment, save ordered images or readable screenshot slices, and record section claims/disclaimers. Reconcile the observed sequence with durable files. A blank placeholder or unvisited lower segment prevents full-detail completion.
- **Reviews and Q&A:** use available default, latest, low-rating/neutral, follow-up and image/video filters, and inspect Q&A. Record per-view coverage, unique sample counts, overlap and stop reasons. Full page capture means complete surface coverage plus a documented review sample, not a claim to have downloaded every platform review. Do not stop review work at the single-entry preflight threshold; use a declared sampling plan proportionate to the analysis, expanding where conflicting or new themes remain. Never invent missing filters or sentiments.

Use the coverage matrix in `assets/capture-checklist.md`. Continue accessible surfaces when one fails. If a required surface remains blocked, retain and deliver the available evidence with a partial/blocked capture status and a resume point; do not label capture complete simply because all seven Feishu tables exist. A genuine absence is `not_applicable` only when observed and recorded. Ordinary slowness or having enough evidence for preflight is not a stopping reason for formal work.

Complete the Feishu handoff using `references/feishu-base-delivery.md` when it is the selected destination. Keep source acquisition timestamps and product/batch IDs so teammates can trace a conclusion back to its SKU, image, section or review and resume the same work.
