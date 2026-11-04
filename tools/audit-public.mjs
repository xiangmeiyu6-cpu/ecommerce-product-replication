import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ensure,walkFiles} from '../lib/release.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const checks=[
  ['personal absolute home',/\/Users\/[^/\s"']+\//],
  ['Windows personal home',/[A-Za-z]:\\Users\\[^\\\s"']+\\/],
  ['Feishu target URL',/https:\/\/[^\s/"']*(?:feishu|larksuite)[^\s/"']*\/base\/[A-Za-z0-9]{12,}/],
  ['GitHub credential',/(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/],
  ['private key',/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/],
  ['literal bearer credential',/Bearer [A-Za-z0-9._-]{30,}/]
];
const errors=[];let scanned=0;
for(const directory of ['skill','lib','tools','contracts','test','channels','dist','.github']) {
  if(!await fs.stat(path.join(root,directory)).catch(()=>null))continue;
  for(const relative of await walkFiles(path.join(root,directory))) {
    const name=`${directory}/${relative}`,text=await fs.readFile(path.join(root,...name.split('/')),'utf8');scanned++;
    let payload=text;
    if(name.startsWith('dist/releases/'))payload=JSON.parse(text).files.map(f=>Buffer.from(f.content_base64,'base64').toString('utf8')).join('\n');
    for(const [label,pattern] of checks)if(pattern.test(payload))errors.push({file:name,problem:label});
  }
}
for(const name of ['README.md','package.json']) {const text=await fs.readFile(path.join(root,name),'utf8');scanned++;for(const [label,pattern] of checks)if(pattern.test(text))errors.push({file:name,problem:label});}
console.log(JSON.stringify({ok:errors.length===0,files_scanned:scanned,errors},null,2));ensure(errors.length===0,'Public release audit failed');
