import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {canonical,ensure,readJson,sha256,validateBundle,versionParts,walkFiles} from '../lib/release.mjs';

export async function build(root,version) {
  const pkg=await readJson(path.join(root,'package.json'));version??=pkg.version;versionParts(version);
  const files=[];
  for(const directory of ['skill','lib','tools','contracts'])for(const relative of await walkFiles(path.join(root,directory))) {
    const name=`${directory}/${relative}`,bytes=await fs.readFile(path.join(root,...name.split('/')));
    files.push({path:name,size:bytes.length,sha256:sha256(bytes),content_base64:bytes.toString('base64')});
  }
  for(const name of ['package.json','README.md']) {const bytes=name==='package.json'?Buffer.from(JSON.stringify({...pkg,version},null,2)+'\n'):await fs.readFile(path.join(root,name));files.push({path:name,size:bytes.length,sha256:sha256(bytes),content_base64:bytes.toString('base64')});}
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  const template=await readJson(path.join(root,'skill/assets/feishu-base-template-v2/template-manifest.json'));
  const bundle={format:'epr-release/v1',version,min_node_major:22,template_version:template.template_version,quality_version:(await readJson(path.join(root,'contracts/quality.json'))).version,capabilities:['product-browser-read','selected-feishu-base-read-write'],certification:{macos:'local-tests',windows:'requires-ci-and-live-browser-check'},files,inventory_sha256:sha256(canonical(files.map(({path:name,size,sha256:digest})=>({path:name,size,sha256:digest}))))};
  validateBundle(bundle);return bundle;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bundle=await build(root,process.argv[2]);
  const relative=`dist/releases/${bundle.version}.json`,destination=path.join(root,...relative.split('/')),bytes=Buffer.from(JSON.stringify(bundle)+'\n');
  await fs.mkdir(path.dirname(destination),{recursive:true});
  if(await fs.stat(destination).catch(()=>null))ensure(sha256(await fs.readFile(destination))===sha256(bytes),'Refusing to overwrite an immutable release; increment package version');
  else await fs.writeFile(destination,bytes);
  await fs.mkdir(path.join(root,'channels'),{recursive:true});await fs.writeFile(path.join(root,'channels/stable.json'),JSON.stringify({format:'epr-channel/v1',version:bundle.version,artifact:relative,sha256:sha256(bytes)},null,2)+'\n');
  console.log(JSON.stringify({ok:true,version:bundle.version,files:bundle.files.length,artifact:relative,sha256:sha256(bytes)}));
}
