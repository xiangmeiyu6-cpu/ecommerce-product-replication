# Feishu Base delivery

For formal capture, analysis, and replication with the default delivery destination, retain the batch in the fixed seven-table `电商商品拆解库` template. The machine-readable template is in `assets/feishu-base-template-v2/template-manifest.json`; use its referenced schema and view JSON files rather than inventing fields at runtime.

## Template identity

- Template: `电商商品拆解库`
- Version: `3.0.0`
- Source: the previously validated seven-table production structure
- Core tables, in order: `商品总览`, `分析批次`, `深度拆解`, `证据台账`, `SKU与促销`, `页面与素材`, `用户反馈`
- Preserve the bundled schema and views. Store evidence gaps and scope in the existing batch/evidence fields; do not add or improvise fields during delivery.

Version 3 preserves the prior structure and adds a fixed template contract: exact table order, exact field order, stable select options, saved-view filters, visible-field order, sort rules, a template fingerprint, and executable initialization/validation.

## Mandatory initializer

Do not manually invent or recreate the schema from prose. From the skill root, run:

```powershell
node scripts/init_feishu_base.mjs ensure --as user
```

When a specific Base has already been resolved, run:

```powershell
node scripts/init_feishu_base.mjs ensure --base-token <BASE_TOKEN> --as user
```

The initializer uses the bundled manifest/schema files to initialize the library. Its validator checks core table order, field names/types/options/styles, default-grid display order and saved-view presence. It does not verify saved-view filters/layout/sort, batch contents, attachment files or collaborator access. Field-list response order is not a display-order contract. Compare those remaining template properties through the current supported CLI/API before treating the fixed template as fully verified. A `compatible: true` result is a basic structural check, not a product-batch acceptance result. It creates a new fixed-template Base when no compatible owned Base exists. It does not silently modify or mix records into an incompatible Base.

## Resolve or create the library

Use `lark-base` and `lark-cli` with `--as user` unless the user explicitly requests bot identity.

1. Read the current authorized identity through `lark-cli whoami --as user`. The initializer keys local bindings by identity, app, profile, brand and user open ID; switching accounts cannot reuse another account's binding.
2. With no current-account binding, create the user's own Base from the bundled seven-table template automatically. Do not search by title: a shared Base can have the same title. Users do not need to manually build tables or paste a library URL.
3. Reuse the compatible current-account binding on later tasks. An authentication, permission or compatibility failure stops with the exact stage; never treat it as permission to create a replacement library.
4. Only a Base explicitly selected by the current user may be passed with `--base-token`; validate it, then bind it for that account. This supports intentional team collaboration. Tutorial links, example libraries and a copied legacy `base_token` are not explicit selection.
5. Installation should invoke this setup after authorization; formal business writes invoke `ensure` again. Output the actual library URL so the user can find it. There is no need to ask for confirmation of the seven-table schema during an authorized setup/product task.
6. The local `config.local.json` is outside releases and is never distributed. `feishu_bindings` contains only account coordinates and Base tokens, not credentials. Keep unrelated configuration and old `base_token` intact; ignore unbound tokens instead of migrating them by guesswork. On a second device, the user may explicitly supply their existing library URL to bind it there; without a binding that device creates its own library.

For a managed installation, the config path is derived from its manager root, not the current working directory. Standalone/source use defaults to the user's `.codex/epr/config.local.json`; `--config <path>` selects a custom local file. Never write mutable configuration into the immutable release.

The initializer creates the first table and fields in one `+base-create` call, then creates the remaining six tables from schema JSON. It applies all seven saved-view filters, visible-field order and sorts, and reads back structural compatibility. The fixed template stays `3.0.0`.

A local lock prevents concurrent initialization. Before `base-create`, a pending binding is saved. An ambiguous creation response blocks another creation until inspected. Once the returned token is saved, a checkpoint under the manager's `feishu-init/` directory records the same Base. `ensure` resumes missing tables and views in it after interruption. Ambiguous table/view creation is reconciled by name in that already-bound Base; unresolved responses stop rather than blindly repeating POST. Creation requests are not automatically retried. Do not delete a binding or checkpoint to work around authentication or permission errors.

## Record model

Use stable keys so multiple products and updates coexist:

- `商品ID`: platform plus product ID, for example `TMALL-123456`.
- `分析批次ID`: product ID plus date/version, for example `TMALL-123456-20260910-A01`.
- Child record IDs: analysis batch plus module abbreviation and sequence.

Write one atomic item per record:

- `商品总览`: one record per product.
- `分析批次`: one record per analysis or recheck.
- `深度拆解`: one record per finding or recommendation.
- `证据台账`: one record per fact, screenshot, source, inference, or unknown.
- `SKU与促销`: one record per visible SKU/offer combination.
- `页面与素材`: one record per title, main image, detail screen, short-video angle, seeding angle, or livestream module.
- `用户反馈`: one record per review theme or important verbatim sample.

Do not store the complete report in one long-text cell. Connect records through `商品ID` and `分析批次ID`.

## Images and attachments

- Upload the product hero image to `商品总览.商品主图`.
- Upload source main/detail images to `页面与素材.来源图片` in page order.
- Upload screenshots supporting facts to `证据台账.证据附件`.
- Upload SKU/offer screenshots to `SKU与促销.SKU证据附件`.
- Upload review/Q&A screenshots to `用户反馈.反馈证据附件`.
- Upload generated main/detail artwork to `页面与素材.生成成品`, never to the source field.
- Preserve source URL, original order, acquisition time, and confidence alongside attachments.
- A local path or remote image URL alone does not count as an uploaded image.

If attachment upload fails, keep the local file and source URL, mark the gap in the analysis batch, and report the exact failure. Do not mark delivery as verified.

## SKU and promotion rules

For each visible SKU record separately:

- Preserve exact SKU label and specification.
- Separate `划线价`, `页面售价`, `活动到手价`, and `成交价`.
- Calculate `折算单价` only when quantity and price are reliable.
- Record coupon, membership, threshold, region, time window, gift, and other conditions in `价格与优惠条件` and `限制条件`.
- Record `价格获取时间` and attach evidence.
- Leave an unavailable price blank; never write zero or promote a conditional price as universal.

## Review rules

- Prioritize negative and neutral evidence because competitor failures create entry opportunities.
- When accessible, inspect low-rating, latest, follow-up, image/video, and Q&A views instead of relying on default highlighted reviews.
- Store positive, neutral, negative, purchase concern, user question, inference, and unknown separately.
- Record sample count, frequency when supported, sorting/sampling method, source, confidence, screenshot, and operating opportunity.
- Retained browser text should contain product/review evidence, with unrelated account navigation removed. When parsing a DOM snapshot, exclude interface icons and reaction counters, including quoted numeric values such as `"0"`; keep anonymous automatic-review events distinct when buyer identity cannot be established. Attach the corresponding product-only source sample to feedback records so teammates can trace the quote.
- A complaint from one review is evidence of existence, not evidence of prevalence.
- If negative reviews are inaccessible, create an `未知` record describing the access gap; do not fabricate a pain point.

## Capture-only, analysis-only and replication modes

For formal capture-only, record the scope in `页面快照说明` and keep the existing task-type options (`仅拆解` for a new source-only batch, `复检更新` for a recheck); do not invent a new select option. Populate source identity, batch coverage, the evidence ledger, current SKU/offers, ordered source main/detail images, and actual review/Q&A samples. Use the existing seven-table library but leave analysis/creative sections empty when outside scope; do not manufacture records to fill every table. Test-only and explicit local-only/alternative-destination requests follow their chosen scope.

## Analysis-only and replication modes

For `仅拆解`, populate competitor facts, analysis, evidence, SKU/promotion, page/source assets, and user feedback. Do not create original product replication recommendations beyond clearly labeled optimization opportunities.

For `拆解并复刻`, also populate:

- Product/SKU/title/promotion/test strategy in `深度拆解`.
- Five main-image scripts and 10-14 detail screens in `页面与素材` with `内容归属=我方方案`.
- Short-video, product-card, livestream, and seeding angles in `页面与素材`.
- Compliance and test rules as separate `深度拆解` records.

## Views

Create and preserve the bundled saved views:

- 商品总览: `待确认与复检`
- 分析批次: `未完成批次`
- 深度拆解: `可复用打法`
- 证据台账: `待补证`
- SKU与促销: `主推与利润SKU`
- 页面与素材: `高优先级素材`
- 用户反馈: `用户痛点与顾虑`

The user-pain view includes neutral reviews, negative reviews, and purchase concerns.

## Completion contract

Verify three results separately: capture coverage, library structure, and this batch's records/attachments. Feishu retention is the team-accessible evidence and work record, not just a destination for a final prose summary.

1. Resolve the current identity and account-bound Base through `ensure` before writing. Without a binding, initialize the current user's library. Use an existing team Base only when explicitly selected by that user. Never select the first title-search match or a tutorial/example link.
2. Reuse `商品ID` and `分析批次ID` when resuming. Read existing keys before writes; update matching atomic records and append only missing ones. Preserve other products and batches. Allocate a new batch only for a distinct recheck/version, not each retry.
3. Set `飞书交付状态=写入中` while adding records and uploading attachments, using the bundled field options. The separate `状态` field uses `采集中/分析中/待确认/已完成/失败`; do not write `写入中` into it. Record content scope and capture gaps in existing fields.
4. Reconcile expected atomic record keys with all records read back for this product/batch in each populated table, including pagination. Check missing keys, duplicates, SKU counts, review sampling and main/detail order; reading one record alone is insufficient for count reconciliation. Additionally inspect at least one populated record from each table for field correctness.
5. Check every expected image/evidence attachment is present in its intended record; sample-open the hero image, main/detail sources, SKU evidence and review evidence for each populated category. Verify readable images rather than local paths or a pasted source URL. If any expected upload fails, preserve the gap and keep delivery unverified.
6. Run `node scripts/init_feishu_base.mjs validate --base-token <BASE_TOKEN> --as user` and require `compatible: true` and version `3.0.0`. Also inspect remaining template types/options and saved-view filter/layout/sort against the manifest. Do not describe this command as validating record counts or attachments; those are steps 4–5.
7. Update `写入记录数`, `图片附件数`, `未解决证据缺口数` and the existing delivery-status fields from actual readback. Preserve meaningful capture gaps for teammates. A fully read-back partial batch may have verified delivery while capture remains partial; report both statuses explicitly. Never mark the overall analysis complete while essential source coverage is still incomplete.
8. Verify the Base URL opens under the intended identity. Do not broaden permissions or send invitations merely to claim team access. If the user identifies teammates or a team library, verify the intended destination using available permission information; report unverified collaborator access instead of assuming it from the owner's access.
9. Return the Base URL, product ID, batch ID, content scope, capture status, write/readback status, record count, image count, SKU count, review sample count and unresolved gaps. Keep the fixed saved views usable so teammates can find evidence, feedback and pending work.

If source access, authorization, upload, or readback fails, retain completed evidence and the same batch resume point. Deliver accessible evidence where possible with precise partial/blocked status. Resume missing records/attachments after the blocker changes. A local package is a recovery copy when Feishu is the chosen delivery; it does not count as verified online delivery.
