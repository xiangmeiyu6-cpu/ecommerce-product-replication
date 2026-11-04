import path from 'node:path';
import {validateEvidence} from '../../lib/quality.mjs';
const input=process.argv[2];
if(!input) {console.error('Usage: node validate-evidence.mjs <evidence.json> [--require-complete]');process.exitCode=1;}
else {
  try {const result=await validateEvidence(path.resolve(input));console.log(JSON.stringify(result,null,2));if(!result.ok||(process.argv.includes('--require-complete')&&!result.complete_acceptance))process.exitCode=2;}
  catch(e) {console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}
}
