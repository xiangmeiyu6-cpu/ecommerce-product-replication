#!/usr/bin/env node
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {begin,check,defaultRoot,finish,install,rollback,status,update} from '../lib/manager.mjs';
import {DEFAULT_CHANNEL,ensure} from '../lib/release.mjs';

export async function main(args=process.argv.slice(2)) {
  try {
    const command=args[0]??'help';
    const values=new Map(),flags=new Set();
    const flagNames=['--adopt-existing','--offline','--allow-major','--allow-template-change','--accept-capabilities','--allow-quality-change'];
    const valueNames=['--root','--target','--source-file','--source-url','--workspace','--receipt','--job','--version'];
    for(let i=1;i<args.length;i++) {
      if(flagNames.includes(args[i])) flags.add(args[i]);
      else {ensure(valueNames.includes(args[i])&&args[i+1]&&!args[i+1].startsWith('--'),`Unknown or incomplete option: ${args[i]}`);values.set(args[i],args[++i]);}
    }
    const root=path.resolve(values.get('--root')??defaultRoot());
    const options={target:values.get('--target'),adoptExisting:flags.has('--adopt-existing'),offline:flags.has('--offline'),workspace:values.get('--workspace'),receipt:values.get('--receipt'),allowMajor:flags.has('--allow-major'),allowTemplateChange:flags.has('--allow-template-change'),acceptCapabilities:flags.has('--accept-capabilities'),allowQualityChange:flags.has('--allow-quality-change')};
    ensure(!(values.has('--source-file')&&values.has('--source-url')),'Choose one update source');
    if(command==='install') options.source=values.has('--source-file')?{kind:'local',channel_file:path.resolve(values.get('--source-file'))}:{kind:'https',url:values.get('--source-url')??DEFAULT_CHANNEL};
    else ensure(!values.has('--source-file')&&!values.has('--source-url')&&!values.has('--target'),'Source and target can only be selected at install');
    let result;
    if(command==='install') result=await install(root,options);
    else if(command==='check') result=await check(root);
    else if(command==='update') result=await update(root,options);
    else if(command==='rollback') result=await rollback(root,values.get('--version'));
    else if(command==='begin') result=await begin(root,options);
    else if(command==='finish'||command==='abandon') result=await finish(root,values.get('--job'),command==='abandon');
    else if(command==='status'||command==='doctor') result=await status(root);
    else {ensure(command==='help',`Unknown command: ${command}`);result={commands:['install','check','update','rollback','begin','finish','abandon','status','doctor'],default_source:DEFAULT_CHANNEL,notes:'Node 22+. begin checks stable updates and pins immutable task paths. doctor checks local integrity; browser and Feishu login still need live preflight.'};}
    process.stdout.write(JSON.stringify({ok:true,...result},null,2)+'\n');
    return result;
  } catch(error) {process.stderr.write(JSON.stringify({ok:false,error:error.message},null,2)+'\n');process.exitCode=1;return null;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) await main();
