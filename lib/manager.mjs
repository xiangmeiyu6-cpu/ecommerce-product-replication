import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { atomicJson, canonical, compareVersions, DEFAULT_CHANNEL, ensure, exists, loadChannel, readJson, SKILL_NAME, unpack, verifyInstalled, versionParts } from './release.mjs';

export const defaultRoot = () => path.join(os.homedir(), '.codex', 'epr');
const stateFile = root => path.join(root, 'state.json');
export async function readState(root) { return await exists(stateFile(root)) ? readJson(stateFile(root)) : null; }
export async function withLock(root, action) {
  await fs.mkdir(root, { recursive: true });
  const lock = path.join(root, '.update-lock');
  try { await fs.mkdir(lock); } catch (e) { if(e.code === 'EEXIST') throw new Error('Another manager operation is active, or its lock needs inspection'); throw e; }
  try { await atomicJson(path.join(lock, 'owner.json'), {pid:process.pid,started_at:new Date().toISOString()}); return await action(); }
  finally { await fs.rm(lock, { recursive: true, force: true }); }
}
async function jobs(root) {
  const directory = path.join(root,'jobs');
  if (!await exists(directory)) return [];
  return Promise.all((await fs.readdir(directory)).filter(f => f.endsWith('.json')).map(f => readJson(path.join(directory,f))));
}
async function requireIdle(root) { ensure((await jobs(root)).every(job => job.status !== 'active'), 'Active task pins this release; finish or explicitly abandon the task before switching'); }
function releaseDirectory(root, version) { versionParts(version); return path.join(root,'releases',version); }
async function stage(root, bundle) {
  const destination = releaseDirectory(root,bundle.version);
  if(await exists(destination)) { const stored=await verifyInstalled(destination); ensure(stored.inventory_sha256===bundle.inventory_sha256,'An immutable version was republished with different content'); return destination; }
  await fs.mkdir(path.dirname(destination), { recursive:true });
  const temporary=path.join(path.dirname(destination),`.stage-${crypto.randomUUID()}`);
  try { await unpack(bundle,temporary); await fs.rename(temporary,destination); }
  catch(e) { await fs.rm(temporary,{recursive:true,force:true}); throw e; }
  return destination;
}
async function switchLink(target,destination) {
  await fs.mkdir(path.dirname(target),{recursive:true});
  const next=`${target}.next-${crypto.randomUUID()}`, previous=`${target}.previous-${crypto.randomUUID()}`;
  await fs.symlink(destination,next,process.platform==='win32'?'junction':'dir');
  let moved=false;
  try {
    if(await exists(target)) { ensure((await fs.lstat(target)).isSymbolicLink(),'Installed Skill was replaced with an unmanaged directory'); await fs.rename(target,previous); moved=true; }
    await fs.rename(next,target);
  } catch(e) { if(moved&&!await exists(target)) await fs.rename(previous,target); await fs.rm(next,{force:true}); throw e; }
  if(moved) await fs.unlink(previous);
}
async function activate(root,state,bundle) {
  await requireIdle(root);
  const old=state.active;
  await switchLink(state.target,path.join(releaseDirectory(root,bundle.version),'skill'));
  state.previous=old; state.active=bundle.version; state.updated_at=new Date().toISOString();
  try { await atomicJson(stateFile(root),state); }
  catch(e) { if(old) await switchLink(state.target,path.join(releaseDirectory(root,old),'skill')); else if(await exists(state.target)) await fs.unlink(state.target); throw e; }
  return { status:'activated',version:state.active,previous:state.previous,skill_path:state.target };
}
async function selectTarget(options) {
  if(options.target) {ensure(path.basename(path.resolve(options.target))===SKILL_NAME,'Target must be the named Skill directory');return path.resolve(options.target);}
  const legacy=path.join(os.homedir(),'.codex','skills',SKILL_NAME), modern=path.join(os.homedir(),'.agents','skills',SKILL_NAME);
  ensure(!(await exists(legacy)&&await exists(modern)),'Two installed copies found; select --target explicitly');
  return await exists(legacy)?legacy:modern;
}
export async function install(root,options={}) {
  return withLock(root,async()=>{
    ensure(!await readState(root),'Already installed; use update');
    const source=options.source??{kind:'https',url:DEFAULT_CHANNEL};
    const {bundle}=await loadChannel(source);
    const target=await selectTarget(options);
    ensure(path.resolve(target)!==path.resolve(root)&&!path.resolve(target).startsWith(path.resolve(root)+path.sep)&&!path.resolve(root).startsWith(path.resolve(target)+path.sep),'Discovery target and manager storage must not contain one another');
    await stage(root,bundle);
    let backup=null;
    if(await exists(target)) {
      ensure(options.adoptExisting,'Existing Skill found; use --adopt-existing to back it up and migrate');
      ensure(!(await fs.lstat(target)).isSymbolicLink(),'Existing symlink needs explicit manual migration');
      backup=path.join(root,'backups',`legacy-${Date.now()}`); await fs.mkdir(path.dirname(backup),{recursive:true});
      await fs.rename(target,backup);
    }
    const state={format:'epr-state/v1',active:null,previous:null,target,source,legacy_backup:backup};
    try {
      await writeLauncher(root);
      if(!await exists(path.join(root,'config.local.json'))) await atomicJson(path.join(root,'config.local.json'),{base_token:null,work_directory:null,scope:'analysis',auto_update:true});
      const result=await activate(root,state,bundle);
      return {...result,root,legacy_backup:backup};
    } catch(e) { if(backup) {if(await exists(target)&&(await fs.lstat(target)).isSymbolicLink()) await fs.unlink(target);if(!await exists(target)) await fs.rename(backup,target);} throw e; }
  });
}
async function writeLauncher(root) {
  const source=`import fs from 'node:fs';\nimport path from 'node:path';\nimport {fileURLToPath,pathToFileURL} from 'node:url';\nconst root=path.dirname(fileURLToPath(import.meta.url));\nconst state=JSON.parse(fs.readFileSync(path.join(root,'state.json'),'utf8'));\nconst {main}=await import(pathToFileURL(path.join(root,'releases',state.active,'tools','epr.mjs')).href);\nawait main([...process.argv.slice(2),'--root',root]);\n`;
  await fs.writeFile(path.join(root,'epr.mjs'),source,{mode:0o600});
}
function compatibility(current,candidate,options) {
  const reasons=[];
  if(versionParts(current.version)[0]!==versionParts(candidate.version)[0]&&!options.allowMajor) reasons.push('major-version-change');
  if(current.template_version!==candidate.template_version&&!options.allowTemplateChange) reasons.push('feishu-template-change');
  if(canonical(current.capabilities)!==canonical(candidate.capabilities)&&!options.acceptCapabilities) reasons.push('capability-change');
  if(versionParts(current.quality_version)[0]!==versionParts(candidate.quality_version)[0]&&!options.allowQualityChange) reasons.push('quality-contract-change');
  return reasons;
}
async function checkInternal(root,state) {
  const current=await verifyInstalled(releaseDirectory(root,state.active));
  const {bundle}=await loadChannel(state.source);
  ensure(compareVersions(bundle.version,current.version)>=0,'Channel attempted a downgrade; use explicit rollback instead');
  if(bundle.version===current.version) ensure(bundle.inventory_sha256===current.inventory_sha256,'An immutable version was republished');
  return {current,bundle};
}
export async function check(root) {
  const state=await readState(root); ensure(state,'Not installed');
  const {current,bundle}=await checkInternal(root,state);
  return {status:current.version===bundle.version?'current':state.blocked_versions?.includes(bundle.version)?'blocked-after-rollback':'available',installed:current.version,available:bundle.version,requires_review:compatibility(current,bundle,{})};
}
async function updateInternal(root,state,options) {
  const {current,bundle}=await checkInternal(root,state);
  if(bundle.version===current.version) return {status:'current',version:state.active};
  if(state.blocked_versions?.includes(bundle.version)&&!options.retryRolledBack)return {status:'blocked-after-rollback',version:state.active,blocked:bundle.version};
  const reasons=compatibility(current,bundle,options);
  if(reasons.length) return {status:'review-required',installed:state.active,available:bundle.version,reasons};
  await stage(root,bundle);
  if((await jobs(root)).some(j=>j.status==='active')) return {status:'deferred-active-task',version:state.active,staged:bundle.version};
  return activate(root,state,bundle);
}
export async function update(root,options={}) { return withLock(root,async()=>{const state=await readState(root);ensure(state,'Not installed');return updateInternal(root,state,options);}); }
export async function rollback(root,version) {
  return withLock(root,async()=>{const state=await readState(root);ensure(state,'Not installed');const selected=version??state.previous;ensure(selected&&selected!==state.active,'No different rollback release selected');const bundle=await verifyInstalled(releaseDirectory(root,selected));state.blocked_versions=[...new Set([...(state.blocked_versions??[]),state.active])];return activate(root,state,bundle);});
}
export async function begin(root,options={}) {
  return withLock(root,async()=>{
    let state=await readState(root);ensure(state,'Not installed');
    if(options.receipt&&await exists(path.resolve(options.receipt))) {
      const receipt=await readJson(path.resolve(options.receipt));
      ensure(receipt.manager_root===root,'Task receipt belongs to a different installation');
      const job=await readJson(path.join(root,'jobs',`${receipt.job_id}.json`));
      ensure(job.status==='active','Task receipt is closed; choose a new task directory');
      ensure(path.resolve(options.workspace??process.cwd())===job.workspace,'Receipt belongs to a different workspace');
      const pinned=await verifyInstalled(releaseDirectory(root,job.release));
      ensure(pinned.inventory_sha256===job.inventory_sha256,'Pinned release changed');
      return {...job,resumed:true};
    }
    const local=await readJson(path.join(root,'config.local.json'));
    let updateResult={status:'disabled'};
    if(local.auto_update!==false&&!options.offline) {
      try { updateResult=await updateInternal(root,state,{}); } catch(e) { updateResult={status:'update-check-failed-using-current',reason:e.message}; }
      state=await readState(root);
    }
    const directory=releaseDirectory(root,state.active), bundle=await verifyInstalled(directory);
    const workspace=path.resolve(options.workspace??process.cwd());
    const record={job_id:crypto.randomUUID(),status:'active',release:bundle.version,inventory_sha256:bundle.inventory_sha256,skill_path:path.join(directory,'skill'),manager_root:root,workspace,started_at:new Date().toISOString(),update:updateResult};
    await atomicJson(path.join(root,'jobs',`${record.job_id}.json`),record);
    if(options.receipt) await atomicJson(path.resolve(options.receipt),record);
    return record;
  });
}
export async function finish(root,id,abandon=false) {
  ensure(/^[0-9a-f-]{36}$/.test(id??''),'Invalid job ID');
  return withLock(root,async()=>{const file=path.join(root,'jobs',`${id}.json`);const job=await readJson(file);ensure(job.status==='active','Task already closed');job.status=abandon?'abandoned':'finished';job.finished_at=new Date().toISOString();await atomicJson(file,job);return job;});
}
export async function status(root) {
  const state=await readState(root);ensure(state,'Not installed');
  const bundle=await verifyInstalled(releaseDirectory(root,state.active));
  ensure(await fs.realpath(state.target)===await fs.realpath(path.join(releaseDirectory(root,state.active),'skill')),'Discovery link does not match active release');
  return {...state,node:process.versions.node,platform:process.platform,template_version:bundle.template_version,quality_version:bundle.quality_version,certification:bundle.certification,active_tasks:(await jobs(root)).filter(j=>j.status==='active'),launcher:path.join(root,'epr.mjs')};
}
