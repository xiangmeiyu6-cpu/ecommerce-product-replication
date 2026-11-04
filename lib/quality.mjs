import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readJson,safePath,sha256} from './release.mjs';

export async function validateEvidence(file) {
  const document=await readJson(file), root=path.dirname(path.resolve(file));
  const contract=await readJson(fileURLToPath(new URL('../contracts/quality.json',import.meta.url)));
  const errors=[],gaps=[];const check=(condition,message)=>{if(!condition)errors.push(message);};
  check(document.format==='epr-evidence/v1','Unsupported evidence format');
  check(['capture','analysis','replication'].includes(document.scope),'Invalid content scope');
  const evidence=new Map();
  for(const item of document.evidence??[]) {
    check(typeof item.id==='string'&&!evidence.has(item.id),`Duplicate or missing evidence ID: ${item.id}`);evidence.set(item.id,item);
    try {
      safePath(item.file);const absolute=path.join(root,...item.file.split('/'));
      const stat=await fs.lstat(absolute);check(stat.isFile()&&!stat.isSymbolicLink(),`Evidence must be a regular file: ${item.id}`);
      const resolved=await fs.realpath(absolute);if(!resolved.startsWith(await fs.realpath(root)+path.sep))throw new Error(`Evidence escapes task directory: ${item.id}`);
      check(sha256(await fs.readFile(absolute))===item.sha256,`Evidence hash mismatch: ${item.id}`);
    } catch(e) {errors.push(`Evidence file ${item.id}: ${e.message}`);}
    check(typeof item.source==='string'&&item.source.length>0,`Missing source: ${item.id}`);
    check(typeof item.observed_at==='string'&&/(Z|[+-]\d{2}:\d{2})$/.test(item.observed_at)&&Number.isFinite(Date.parse(item.observed_at)),`Missing timezone-aware observation: ${item.id}`);
  }
  const references=(ids,context)=>{check(Array.isArray(ids)&&ids.length>0,`Missing evidence references: ${context}`);for(const id of ids??[])check(evidence.has(id),`Unknown evidence ${id}: ${context}`);};
  for(const surface of contract.required_surfaces) {
    const entry=document.coverage?.[surface];check(!!entry,`Missing coverage surface: ${surface}`);if(!entry)continue;
    check(['complete','blocked','not_applicable'].includes(entry.status),`Invalid coverage status: ${surface}`);
    references(entry.evidence_ids,surface);
    if(entry.status==='complete') {
      check(Number.isInteger(entry.expected)&&entry.expected>=0&&entry.observed===entry.expected,`Coverage count mismatch: ${surface}`);
      if(surface==='details')check(entry.end_verified===true,'Detail end was not verified');
    } else if(entry.status==='blocked') {check(typeof entry.reason==='string'&&entry.reason.length>0,`Missing blocker: ${surface}`);gaps.push({surface,reason:entry.reason});}
    else check(typeof entry.reason==='string'&&entry.reason.length>0,`Not-applicable needs observed reason: ${surface}`);
  }
  const skus=document.skus??[];const skuIds=new Set();
  for(const sku of skus) {
    check(sku.id&&!skuIds.has(sku.id),`Duplicate/missing SKU: ${sku.id}`);skuIds.add(sku.id);references(sku.evidence_ids,`SKU ${sku.id}`);
    check(typeof sku.label==='string'&&sku.label.length>0,`Missing SKU label: ${sku.id}`);
    check(sku.selected_verified===true,`SKU selected state not verified: ${sku.id}`);
    check(typeof sku.price?.label==='string'&&Number.isFinite(sku.price?.amount)&&sku.price.amount>=0&&typeof sku.price?.currency==='string',`Missing labelled price: ${sku.id}`);
    check(['before_discount','displayed','checkout','unknown'].includes(sku.price?.kind),`Unknown price kind: ${sku.id}`);
    if(sku.price?.kind==='checkout')check(sku.price.checkout_verified===true,`Unverified checkout price: ${sku.id}`);
  }
  if(document.coverage?.skus?.status==='complete')check(skus.length===document.coverage.skus.expected,'SKU rows do not reconcile to coverage');
  for(const role of ['main','detail']) {
    const rows=(document.media??[]).filter(m=>m.role===role).sort((a,b)=>a.order-b.order);
    rows.forEach((row,i)=>{check(row.order===i+1,`Missing/duplicate ${role} image order`);references([row.evidence_id],`${role} ${row.order}`);check(row.visually_reviewed===true,`Image not visually reviewed: ${role} ${row.order}`);});
    const surface=role==='main'?'main_images':'details';if(document.coverage?.[surface]?.status==='complete')check(rows.length===document.coverage[surface].expected,`Image rows do not reconcile: ${surface}`);
  }
  const views=document.review_sampling?.views??[];
  if(document.coverage?.reviews?.status==='complete')check(views.length>0,'Missing review sampling views');
  for(const view of views) {
    check(view.name&&Number.isInteger(view.inspected)&&view.inspected>=0&&typeof view.stop_reason==='string','Incomplete review sampling view');
    references(view.evidence_ids,`Review view ${view.name}`);
  }
  if(views.length)check(['deduplicated','overlap_unknown'].includes(document.review_sampling?.overlap),'Review overlap is not declared');
  if(document.review_sampling?.anonymous_templates_present)check(document.review_sampling.unique_buyers===null,'Anonymous templates cannot establish unique buyer counts');
  const findings=document.findings??[],findingIds=new Set();
  for(const finding of findings) {
    check(finding.id&&!findingIds.has(finding.id),`Duplicate/missing finding: ${finding.id}`);findingIds.add(finding.id);
    check(contract.claim_kinds.includes(finding.kind),`Unknown claim type: ${finding.id}`);
    check(typeof finding.statement==='string'&&finding.statement.length>0,`Empty finding: ${finding.id}`);
    if(finding.kind!=='unknown')references(finding.evidence_ids,`Finding ${finding.id}`);
    if(['inference','recommendation'].includes(finding.kind))check(typeof finding.mechanism==='string'&&finding.mechanism.length>0,`Missing reasoning: ${finding.id}`);
    if(finding.kind==='unknown')check(typeof finding.limitation==='string'&&finding.limitation.length>0,`Unknown finding needs limitation: ${finding.id}`);
    if(finding.kind==='recommendation')for(const field of ['action','placement','validation'])check(typeof finding[field]==='string'&&finding[field].length>0,`Recommendation needs ${field}: ${finding.id}`);
  }
  let contentReviewed=document.scope==='capture';
  if(document.scope!=='capture') {
    for(const module of contract.analysis_modules)check(findings.some(f=>f.module===module),`Missing analysis module: ${module}`);
    const review=document.content_review;contentReviewed=review?.status==='passed';
    check(['passed','needs_review'].includes(review?.status),'Missing content review status');
    if(contentReviewed) {
      check(typeof review.reviewer==='string'&&review.reviewer.length>0&&typeof review.method==='string'&&review.method.length>0,'Missing content review provenance');
      check([...findingIds].every(id=>review.reviewed_finding_ids?.includes(id)),'Content review does not cover all findings');
    }
  }
  return {ok:errors.length===0,quality_version:contract.version,capture_status:gaps.length?'partial':'complete',content_status:contentReviewed?'reviewed':'needs_review',complete_acceptance:errors.length===0&&gaps.length===0&&contentReviewed,errors,gaps,note:contract.limits};
}
