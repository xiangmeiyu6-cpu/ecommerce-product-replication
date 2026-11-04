---
name: ecommerce-product-replication
description: Capture and analyze Taobao, Tmall, JD, Douyin, Pinduoduo, or other ecommerce product evidence for 商品分析、竞品拆解、复刻运营思路、产品定位、组品定价、主图、详情页、投放素材或种草方向。Formal work includes complete page-evidence coverage and Feishu Base retention for team collaboration by default; reading tests are preflight only. Respect explicit test-only, local-only, analysis-only, and replication scopes.
---

# Ecommerce Product Replication

## Managed releases and task versions

For a managed installation, start every new product task by running this skill's `scripts/managed-task.mjs begin --workspace <batch-directory> --receipt <batch-directory>/run-version.json`. This checks the approved stable channel, preserves the current version when offline, and pins an immutable release for the task. Reuse that receipt when resuming the same task. If `begin` returns a different `skill_path`, read its SKILL.md once and continue with that returned release; an active receipt prevents recursive reinitialization. Use the returned absolute `skill_path` for all references and scripts during the task.

After the task is handed back with its capture/delivery status recorded, run `scripts/managed-task.mjs finish --job <job_id>`. When abandoning an interrupted task, use `abandon` explicitly; do not silently clear another task's active marker. Updates and rollback defer while tasks are active. Team Base/work-directory settings are device-local in the manager's `config.local.json`; reuse a configured Base rather than searching same-name libraries again. Read `references/managed-delivery.md` for installation, updates, evidence format and quality checks. Source checkouts need installation before using this managed wrapper.

Turn a reference product into an evidence-backed analysis and an original operating system for the user's product. Reuse strategy patterns, not protected brand assets, logos, or unverifiable claims.

## Required inputs

Collect what is available:

- Reference product URL, screenshots, page export, or product name.
- User product: brand, category, formula/material, specification, cost, price, stock, and packshot.
- Target platforms and commercial goal.
- Planned SKU bundle, gifts, promotion, and target audience.
- Rights to use any supplied visual assets or reference style.

Ask only for facts that block the next irreversible step. Record missing facts and assumptions instead of repeatedly questioning the user.

## Choose content scope and delivery destination

Treat these as two independent choices. A request to analyze or capture a product normally means complete page-evidence coverage and Feishu Base delivery for durable retention and team collaboration. Minimal reading validation is a preflight, not the formal deliverable.

- **Reading test / troubleshooting only:** verify the requested interfaces and evidence, save the diagnostic result, then stop. Do not write business records unless explicitly requested.
- **Capture only:** collect all accessible product-page surfaces under the completeness contract in `references/browser-acquisition.md`. Retain source evidence, SKU records, media, and review samples in Feishu by default; do not generate competitor conclusions or a new-product strategy.
- **Analysis only:** complete capture, the competitor teardown, and the evidence ledger, then deliver them to Feishu by default. “Only analyze / 仅拆解” limits content; it does not disable Feishu retention.
- **Full replication:** complete capture, the competitor teardown, and the user's operating strategy, then deliver to Feishu by default. Generate visual artwork only when requested.

Use an explicitly chosen alternative destination, local-only instruction, deferred delivery, or narrower test scope when supplied. If the request is simply to dismantle/analyze a reference product, use analysis-only content with complete capture and Feishu delivery; do not require an unrelated user-product brief before acquiring evidence. Editing or reviewing this skill is not itself a product-capture or Feishu-write task.

Proceed from preflight to full capture and the selected delivery within the authorized formal task without asking again at each stage. Preserve the product and batch identity when resuming.

## Workflow

### 1. Initialize the delivery

When filesystem output is useful, create a batch evidence directory with the available filesystem tools. `scripts/new_delivery.ps1` is an optional helper when PowerShell is available; do not install PowerShell just to initialize folders. Resolve bundled paths relative to this skill directory, and write evidence to the task workspace. Keep analysis, strategy, evidence, source images, main images, and detail images separate. For full replication, treat the local delivery as a working copy and fallback; follow the chosen output destination for narrower scopes.

### 2. Acquire source evidence

- Read [references/browser-acquisition.md](references/browser-acquisition.md) when acquiring a live product page. Run its minimal live-acquisition check before broad capture; record results with [assets/capture-checklist.md](assets/capture-checklist.md). Only an explicit reading-test-only request stops after this check. For formal capture, analysis, or replication, continue autonomously through complete capture and the selected delivery; do not present minimal validation as completion. Use the user's already open, authenticated tab when available; keep it open. Never read cookies, passwords, local storage, or unrelated tabs.
- Treat access, page structure, image loading, and media export as separate checks. A timeout in one does not prove that the page is inaccessible. Do not ask the user for screenshots while the existing page can still be read through another supported browser view.
- If browser control is unavailable, try the provided URL with available web tools. Ask for screenshots or exported text only after relevant access paths fail.
- Capture title, price/SKU, sales cues, promotions, main images, detail-page order, shop identity, reviews, Q&A, and visible trust evidence.
- Select each relevant visible SKU and record its selected name, displayed price label, comparison price, quantity/specification, gifts, coupon/member conditions, and observation time. Distinguish page display from final checkout price. Do not collapse distinct SKUs into one price.
- Apply the full-capture completion contract in the browser reference. Scroll through the entire lazy-loaded detail sequence and verify what actually rendered. `pageAssets` is an inventory of observed assets, not proof that every detail image was captured. Preserve page order and source URL; save representative screens or images without downloading unrelated assets.
- Sample reviews by available sort/filter, including neutral, negative, and follow-up views. Record both the platform's count and the number actually inspected. A single complaint is a finding to test, not a recurring theme. Never substitute inferred complaints for observed reviews.
- Browse current official sources for laws, platform policies, ingredient eligibility, or claims that may have changed.

Do not infer inaccessible review sentiment, sales volume, conversion, advertising performance, or certification.

### 3. Build the evidence ledger

Tag every important claim as:

- `Page fact`: directly visible on the reference page.
- `User fact`: supplied by the user.
- `External fact`: supported by a cited source.
- `Inference`: reasoned conclusion, with rationale.
- `Unknown`: missing or inaccessible.

Include source URL or screenshot/file name and confidence. Resolve contradictions before final recommendations.

### 4. Produce the competitor teardown

Read `references/analysis-framework.md`. Cover positioning, audience, needs, scenarios, price band, page strategy, review language, competitiveness, advertising value, conversion barriers, and reusable patterns. Distinguish what to reuse, adapt, test, or avoid.

If the user asks for analysis only, stop strategy and visual generation after completing the teardown. Follow the output choice established under **Choose content scope and delivery destination**.

### 5. Produce the user's operating strategy

Read `references/strategy-framework.md`. Translate the analysis into:

- Product identity and one-sentence positioning.
- Target audience and scenario priorities.
- SKU ladder, pricing logic, gifts, and promotion mechanics.
- Search title and keyword hierarchy.
- Five main-image scripts.
- A 10-14 screen detail-page structure.
- Douyin ad, short-video, livestream, and seeding-content angles.
- Launch experiments, metrics, and decision rules.

Make the strategy original. Do not copy the reference brand name, packaging, proprietary text, certificates, endorsements, or distinctive trade dress unless the user owns those rights.

### 6. Run compliance review

Read `references/compliance-checklist.md`. Verify current rules from authoritative sources for regulated, health-adjacent, food, supplement, cosmetic, medical, infant, or financial categories.

Separate:

- Internal consumer insight language.
- Public product-page language.
- Paid-ad language.

Never turn a consumer pain point into an unsupported product efficacy claim.

### 7. Generate visual deliverables

When the user requests visual production and has supplied usable product imagery or approved concept rendering:

1. Create one stable product master image first.
2. Generate five square main images from that master.
3. Generate the approved detail-page sequence in vertical format.
4. Use exact Chinese copy from the strategy; keep text short and mobile-readable.
5. Check product count, price, specification, ingredient identity, Chinese text, and forbidden claims in every image.
6. Mark AI output as concept artwork until replaced by final packshots, labels, certificates, and real product photography.

If identity, packaging, offer, or legal claims are unconfirmed, generate layout concepts with explicit placeholders rather than inventing facts.

### 8. Validate the package

Before delivery:

- Verify full page-surface coverage against [assets/capture-checklist.md](assets/capture-checklist.md). All selectable SKU combinations, main images, and the complete detail sequence must be accounted for; review sampling is reported separately from exhaustive page coverage. Record genuine access gaps as partial completion.
- Confirm all requested sections exist.
- Confirm facts and inferences are visibly separated.
- Confirm SKU quantities and arithmetic.
- Confirm title, main images, detail page, and ad angles tell the same positioning story.
- Confirm image files decode and use platform-appropriate dimensions.
- List unresolved evidence gaps and pre-launch replacement items.

### 9. Deliver to Feishu Base

Run this stage by default for formal capture, analysis, and replication to retain reusable evidence and support team collaboration. Use the explicitly selected alternative destination when supplied. Skip business writes for test-only, troubleshooting-only, skill-maintenance, deferred delivery, or explicit local-only requests.

Read `references/feishu-base-delivery.md` before creating or updating a Base. Load `assets/feishu-base-template-v2/template-manifest.json` and its schema/view files as the authoritative fixed template. Use the `lark-base` skill and `lark-cli` with user identity by default.

Before the first write in every environment, run `node scripts/init_feishu_base.mjs ensure --as user`. If the user supplied a Base, pass `--base-token <BASE_TOKEN>`. Never create tables or fields from memory or improvise a smaller schema. The initializer must either return a compatible Base token or stop with a precise incompatibility/authentication error.

- When Feishu delivery is in scope, reuse the user's compatible `电商商品拆解库` or create it once from the bundled seven-table template. Append products and analysis batches instead of creating one Base per product.
- Preserve the seven core tables and bundled views. Keep one record per atomic finding, SKU, review theme, page image, or recommendation so records remain sortable and reusable.
- Preserve the exact table order, field order, select options, view filters, visible-field order, and sort rules in template version `3.0.0`. Do not rename, omit, merge, or reorder template fields.
- Upload captured product-page images to attachment fields and preserve the source URL, page position, image type, and evidence confidence. Do not merely paste local paths.
- Give negative reviews their own records and distinguish observed complaints from inferred purchase concerns.
- Store SKU list price, actual/promotion price, unit price, gifts, conditions, and price observation time in separate fields.
- Write records in batches. Verify table/field creation, record counts, attachment availability, and at least one sample record from every populated table.
- Return the Base URL and a short completeness summary. A formal task with Feishu delivery is not complete until the batch records and attachments are read back under the intended identity. Report capture completeness and delivery verification separately.
- Before reporting success, run `node scripts/init_feishu_base.mjs validate --base-token <BASE_TOKEN> --as user` and require `compatible: true`. This script checks core table order, field names/types/options/styles, default-grid display order, and saved-view presence. Field-list response order is not display order. Separately inspect saved-view filters/layout/sort against the fixed template. Validate the current product/batch records and attachments using the completion contract in `references/feishu-base-delivery.md`; structural compatibility alone is insufficient.

If Feishu is unavailable, authentication is missing, permission is denied, or attachment upload fails:

1. Preserve the full local Markdown report and source images.
2. Report the exact blocked stage without claiming Base delivery succeeded.
3. Ask for authorization only when needed, then resume the existing delivery instead of rebuilding the analysis.
4. Never silently downgrade to Markdown as if it were the requested final output.

## Default output

For analysis and replication, use `assets/report-template.md` as the working structure, omitting user-strategy sections for analysis-only work. Capture-only uses `assets/capture-checklist.md` and atomic source records. Formal work delivers the following according to content scope:

1. One validated Feishu Base following `references/feishu-base-delivery.md`, with source images stored as visible attachments.
2. Complete source evidence for capture-only; a competitor teardown for analysis; and additionally the user's operating strategy for replication.
3. Evidence, SKU/promotion, reviews, page-image, main-image, detail-page, content-matrix, test-plan, and compliance records as applicable.
4. Generated images when requested and sufficiently grounded.
5. A short scope-appropriate summary with capture coverage, Base URL, product ID, batch ID, write/readback status, and unresolved gaps; include priorities and risks when analysis is in scope.
6. Maintain a local Markdown working copy only when useful for recovery. Do not present it as a parallel final deliverable when Feishu Base delivery succeeds.

Do not stop at generic advice. Tie each recommendation to evidence, a consumer mechanism, a page placement, and a measurable test.
