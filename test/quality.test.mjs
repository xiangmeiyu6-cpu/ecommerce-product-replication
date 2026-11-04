import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {atomicJson,sha256} from '../lib/release.mjs';
import {validateEvidence} from '../lib/quality.mjs';
async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'epr-quality-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const bytes=Buffer.from('Synthetic product evidence for structural tests only.');await fs.writeFile(path.join(directory,'source.txt'),bytes);
  const modules=['positioning','audience_needs','scenarios_price','page_strategy','offers','feedback','competitiveness','advertising','reuse_judgment'];
  const coverage=Object.fromEntries(['identity','parameters','skus','main_images','details','reviews','qa'].map(name=>[name,{status:'complete',expected:name==='details'?2:1,observed:name==='details'?2:1,evidence_ids:['E1'],...(name==='details'?{end_verified:true}:{})}]));
  coverage.video={status:'not_applicable',reason:'Synthetic fixture has no video',evidence_ids:['E1']};
  const data={format:'epr-evidence/v1',scope:'analysis',evidence:[{id:'E1',file:'source.txt',sha256:sha256(bytes),source:'https://example.com/product/123',observed_at:'2026-01-01T12:00:00+08:00'}],coverage,skus:[{id:'S1',label:'Synthetic single item',selected_verified:true,evidence_ids:['E1'],price:{label:'优惠前',amount:100,currency:'CNY',kind:'before_discount'}}],media:[{role:'main',order:1,evidence_id:'E1',visually_reviewed:true},{role:'detail',order:1,evidence_id:'E1',visually_reviewed:true},{role:'detail',order:2,evidence_id:'E1',visually_reviewed:true}],review_sampling:{views:[{name:'default',inspected:1,stop_reason:'Declared synthetic sample reached',evidence_ids:['E1']}],overlap:'deduplicated',anonymous_templates_present:true,unique_buyers:null},findings:modules.map((module,i)=>({id:`F${i}`,module,kind:'inference',statement:'Synthetic structure assertion',mechanism:'Synthetic rationale for validator tests',evidence_ids:['E1']})),content_review:{status:'passed',reviewer:'synthetic-fixture',method:'structure-test-only',reviewed_finding_ids:modules.map((_,i)=>`F${i}`)}};
  const file=path.join(directory,'evidence.json');const run=async()=>{await atomicJson(file,data);return validateEvidence(file);};return {directory,data,run};
}
test('valid synthetic contract passes structural complete acceptance',async t=>{const f=await fixture(t);const result=await f.run();assert.equal(result.ok,true,JSON.stringify(result.errors));assert.equal(result.complete_acceptance,true);});
test('missing detail image order is rejected',async t=>{const f=await fixture(t);f.data.media[2].order=3;assert.equal((await f.run()).ok,false);});
test('blocked source can be retained but cannot claim full capture',async t=>{const f=await fixture(t);f.data.coverage.video={status:'blocked',reason:'Observed export access failure',evidence_ids:['E1']};const r=await f.run();assert.equal(r.ok,true);assert.equal(r.capture_status,'partial');assert.equal(r.complete_acceptance,false);});
test('unknown evidence reference is rejected',async t=>{const f=await fixture(t);f.data.findings[0].evidence_ids=['MISSING'];assert.equal((await f.run()).ok,false);});
test('unverified checkout amount is rejected',async t=>{const f=await fixture(t);f.data.skus[0].price.kind='checkout';assert.equal((await f.run()).ok,false);});
test('anonymous events cannot be called unique buyers',async t=>{const f=await fixture(t);f.data.review_sampling.unique_buyers=10;assert.equal((await f.run()).ok,false);});
test('all analysis modules and content review coverage are required',async t=>{const f=await fixture(t);f.data.findings.pop();assert.equal((await f.run()).ok,false);});
test('changed evidence and timezone-free timestamps are rejected',async t=>{const f=await fixture(t);await fs.appendFile(path.join(f.directory,'source.txt'),'modified');f.data.evidence[0].observed_at='2026-01-01T12:00:00';assert.equal((await f.run()).ok,false);});
test('pending semantic review is not complete acceptance',async t=>{const f=await fixture(t);f.data.content_review.status='needs_review';const r=await f.run();assert.equal(r.ok,true);assert.equal(r.complete_acceptance,false);});
