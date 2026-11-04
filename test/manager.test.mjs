import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {build} from '../tools/build-release.mjs';
import {begin,check,finish,install,readState,rollback,status,update,withLock} from '../lib/manager.mjs';
import {atomicJson,canonical,sha256,validateBundle} from '../lib/release.mjs';
const repository=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'epr-test-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const root=path.join(directory,'manager with spaces'),target=path.join(directory,'skills','ecommerce-product-replication'),channel=path.join(directory,'source','stable.json');
  async function publish(version,mutate) {
    const bundle=await build(repository,version);mutate?.(bundle);
    const bytes=Buffer.from(JSON.stringify(bundle)+'\n'),artifact=`releases/${version}.json`;
    await fs.mkdir(path.join(directory,'source','releases'),{recursive:true});await fs.writeFile(path.join(directory,'source',...artifact.split('/')),bytes);
    await atomicJson(channel,{format:'epr-channel/v1',version,artifact,sha256:sha256(bytes)});return bundle;
  }
  await publish('1.0.0');
  const options={source:{kind:'local',channel_file:channel},target};
  return {directory,root,target,channel,publish,options};
}
test('source package validates and every file is covered',async()=>{const bundle=await build(repository);assert.ok(validateBundle(bundle));assert.ok(bundle.files.some(f=>f.path==='skill/SKILL.md'));});
test('path traversal, Windows reserved paths and case collisions are rejected',async()=>{
  for(const bad of ['../outside','C:/outside','skill/CON.txt','skill/x.']) {const b=await build(repository);b.files[0].path=bad;assert.throws(()=>validateBundle(b));}
  const b=await build(repository);b.files.push({...b.files[0],path:b.files[0].path.toUpperCase()});assert.throws(()=>validateBundle(b));
});
test('corrupt file content is rejected before installation',async()=>{const b=await build(repository);b.files[0].content_base64=Buffer.from('corrupt').toString('base64');assert.throws(()=>validateBundle(b),/checksum/);});
test('install creates discovery link and launcher on this operating system',async t=>{
  const f=await fixture(t);await install(f.root,f.options);assert.equal((await status(f.root)).active,'1.0.0');
  const p=spawnSync(process.execPath,[path.join(f.root,'epr.mjs'),'status'],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);assert.equal(JSON.parse(p.stdout).active,'1.0.0');
});
test('existing Skill is only adopted explicitly and its contents are backed up',async t=>{
  const f=await fixture(t);await fs.mkdir(f.target,{recursive:true});await fs.writeFile(path.join(f.target,'SKILL.md'),'old private local copy');
  await assert.rejects(install(f.root,f.options),/adopt-existing/);assert.equal(await fs.readFile(path.join(f.target,'SKILL.md'),'utf8'),'old private local copy');
  const result=await install(f.root,{...f.options,adoptExisting:true});assert.equal(await fs.readFile(path.join(result.legacy_backup,'SKILL.md'),'utf8'),'old private local copy');
});
test('local configuration and business files survive update and rollback',async t=>{
  const f=await fixture(t);await install(f.root,f.options);const local={base_token:'LOCAL_ONLY',work_directory:path.join(f.directory,'business'),auto_update:true};
  await atomicJson(path.join(f.root,'config.local.json'),local);await fs.mkdir(local.work_directory);await fs.writeFile(path.join(local.work_directory,'evidence.txt'),'keep');
  await f.publish('1.0.1');await update(f.root);assert.equal((await readState(f.root)).active,'1.0.1');await rollback(f.root);
  assert.equal((await readState(f.root)).active,'1.0.0');assert.deepEqual(JSON.parse(await fs.readFile(path.join(f.root,'config.local.json'),'utf8')),local);assert.equal(await fs.readFile(path.join(local.work_directory,'evidence.txt'),'utf8'),'keep');
});
test('active task defers update, preserves receipt and blocks rollback',async t=>{
  const f=await fixture(t);await install(f.root,f.options);const receipt=path.join(f.directory,'task','run-version.json'),options={workspace:path.join(f.directory,'task'),receipt,offline:true};
  const job=await begin(f.root,options);await f.publish('1.0.1');assert.equal((await update(f.root)).status,'deferred-active-task');assert.equal((await readState(f.root)).active,'1.0.0');
  const resumed=await begin(f.root,options);assert.equal(resumed.job_id,job.job_id);assert.equal(resumed.resumed,true);
  await assert.rejects(rollback(f.root,'1.0.1'),/Active task/);await finish(f.root,job.job_id);await update(f.root);assert.equal((await readState(f.root)).active,'1.0.1');
  await assert.rejects(begin(f.root,options),/closed/);
});
test('new task automatically checks and activates compatible stable update',async t=>{const f=await fixture(t);await install(f.root,f.options);await f.publish('1.0.1');const job=await begin(f.root,{workspace:f.directory});assert.equal(job.release,'1.0.1');await finish(f.root,job.job_id);});
test('offline update check keeps a verified current release',async t=>{const f=await fixture(t);await install(f.root,f.options);await fs.rename(f.channel,`${f.channel}.offline`);const job=await begin(f.root,{workspace:f.directory});assert.equal(job.release,'1.0.0');assert.equal(job.update.status,'update-check-failed-using-current');await finish(f.root,job.job_id);});
test('damaged download cannot replace current version',async t=>{const f=await fixture(t);await install(f.root,f.options);await f.publish('1.0.1');await fs.appendFile(path.join(f.directory,'source/releases/1.0.1.json'),'broken');await assert.rejects(update(f.root),/checksum/);assert.equal((await status(f.root)).active,'1.0.0');});
test('republishing the same version with changed content is rejected',async t=>{const f=await fixture(t);await install(f.root,f.options);await f.publish('1.0.0',b=>{b.inventory_sha256='0'.repeat(64);});await assert.rejects(update(f.root));assert.equal((await status(f.root)).active,'1.0.0');});
test('major and capability changes require explicit review',async t=>{
  const f=await fixture(t);await install(f.root,f.options);await f.publish('2.0.0');assert.equal((await update(f.root)).status,'review-required');assert.equal((await readState(f.root)).active,'1.0.0');
  await f.publish('1.0.1',b=>b.capabilities.push('new-capability'));assert.equal((await check(f.root)).requires_review.includes('capability-change'),true);assert.equal((await update(f.root)).status,'review-required');
});
test('channel downgrade is rejected; explicit installed rollback is allowed',async t=>{const f=await fixture(t);await install(f.root,f.options);await f.publish('1.0.1');await update(f.root);await f.publish('1.0.0');await assert.rejects(update(f.root),/downgrade/);await rollback(f.root);assert.equal((await status(f.root)).active,'1.0.0');});
test('local immutable release modifications stop task start',async t=>{const f=await fixture(t);await install(f.root,f.options);await fs.appendFile(path.join(f.target,'SKILL.md'),'modified');await assert.rejects(begin(f.root,{workspace:f.directory,offline:true}),/changed/);});
test('concurrent management operations cannot both change state',async t=>{const f=await fixture(t);await install(f.root,f.options);let release,ready;const started=new Promise(r=>ready=r);const running=withLock(f.root,async()=>{ready();await new Promise(r=>release=r);});await started;await assert.rejects(update(f.root),/Another manager/);release();await running;});
test('local channel cannot traverse outside source directory',async t=>{const f=await fixture(t);await atomicJson(f.channel,{format:'epr-channel/v1',version:'1.0.0',artifact:'../outside',sha256:'0'.repeat(64)});await assert.rejects(install(f.root,f.options),/Unsafe/);});
test('installation target cannot contain manager storage',async t=>{const f=await fixture(t);await assert.rejects(install(path.join(f.target,'manager'),f.options),/contain one another/);});
test('managed Skill wrapper creates a pinned task from discovery link',async t=>{const f=await fixture(t);await install(f.root,f.options);const r=spawnSync(process.execPath,[path.join(f.target,'scripts/managed-task.mjs'),'begin','--offline','--workspace',f.directory],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);const job=JSON.parse(r.stdout);assert.equal(job.release,'1.0.0');await finish(f.root,job.job_id);});
test('rollback prevents automatic reinstallation of the withdrawn version',async t=>{const f=await fixture(t);await install(f.root,f.options);await f.publish('1.0.1');await update(f.root);await rollback(f.root);const job=await begin(f.root,{workspace:f.directory});assert.equal(job.release,'1.0.0');assert.equal(job.update.status,'blocked-after-rollback');await finish(f.root,job.job_id);await f.publish('1.0.2');await update(f.root);assert.equal((await status(f.root)).active,'1.0.2');});
